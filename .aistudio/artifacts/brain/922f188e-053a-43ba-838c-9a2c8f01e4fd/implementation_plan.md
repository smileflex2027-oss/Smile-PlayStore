# Smile PlayStore — Architecture Blueprint & Implementation Plan

> **Tagline:** “Your independent Android app marketplace.”  
> **Status:** Phase 1 Architecture Proposal — Awaiting User Approval  

---

## User Review & Critical Decisions

> [!IMPORTANT]
> This document delivers the complete Phase 1 architectural blueprint for **Smile PlayStore** per requirements A through L. **No application code or backend files will be written until this architecture is formally approved.** Please review the key architecture decision gates below:

- **Object Storage**: Cloudflare R2 (S3-compatible API, \$0.00 egress, \$0.015/GB/mo storage) partitioned into two buckets: `smile-store-private` (APKs, upload staging, scan artifacts) and `smile-store-public` (app icons, screenshots, banners cached via Cloudflare CDN).
- **Core Stack**: Node.js 22 LTS + Express + TypeScript for API (`/api/v1`), PostgreSQL 16 with Prisma ORM, Jetpack Compose Material 3 for Android, and React 19 + Vite + Tailwind CSS for the 3 web portals (Public Store, Developer Portal, Admin Portal).
- **Security Posture**: Zero direct binary transfer through API servers; short-lived (300s) presigned URLs for R2 direct uploads and downloads; server-side SHA-256 & signing certificate verification; Argon2id password hashing; HTTP-only rotating refresh tokens; RBAC with strict audit logging.
- **Open Decision 1 (Container Hosting)**: Recommended **Render** (Web Service, \$7/mo) or **Fly.io** for simplicity and low cold-start latency, or **AWS App Runner / Cloud Run** for scale.
- **Open Decision 2 (Managed PostgreSQL)**: Recommended **Neon** (serverless Postgres with branching & 0.5 GB free tier) or **Render Managed Postgres** (\$7/mo for persistent dedicated compute).
- **Open Decision 3 (APK Worker Tooling)**: Run APK parsing (AAPT2 / `apk-parser`) in an isolated Node.js child process or standalone background worker queue with strict CPU/memory limits.

---

## A. Complete Cloud Architecture & Request/Data Flows

### 1. High-Level System Architecture Diagram

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT TIERS                                         │
├─────────────────────────┬─────────────────────────┬────────────────────────────────────┤
│   Android Client        │    Public Web Store     │  Developer & Admin Portals         │
│   (Kotlin / Compose)    │    (React 19 / Vite)    │  (React 19 / Vite + Role RBAC)     │
└────────────┬────────────┴────────────┬────────────┴─────────────────┬──────────────────┘
             │                         │                              │
             │ HTTPS / JSON            │ HTTPS / Static               │ HTTPS / JSON
             ▼                         ▼                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           EDGE & ROUTING LAYER (Cloudflare)                            │
│  - Cloudflare DNS + Automated SSL/TLS (Strict)                                         │
│  - Cloudflare Edge Caching & WAF (Rate Limiting, Bot Mitigation, DDoS Shield)          │
│  - Static Asset Delivery for Web Portals (Cloudflare Pages or CDN-fronted Storage)     │
└────────────┬────────────────────────────────────────────────────────┬──────────────────┘
             │                                                        │
             │ API Requests (/api/v1/*)                               │ Direct Presigned I/O
             ▼                                                        │ (PUT upload / GET apk)
┌──────────────────────────────────────────────────────────────┐      │
│                 BACKEND SERVICE LAYER (Node.js/Express)      │      │
│  - Express REST API (/api/v1) on Linux Container             │      │
│  - Helmet (CSP, HSTS), CORS Whitelist, Zod Validation        │      │
│  - Auth Engine: Argon2id + JWT (Access) + Refresh Tokens     │      │
│  - Storage Adapter: S3-Compatible Client (@aws-sdk/client-s3)│      │
│  - APK Pipeline Service & Isolated Parser Tool               │      │
│  - Audit Logger & Health Probe (/api/v1/health)              │      │
└────────────┬──────────────────────────────────┬──────────────┘      │
             │                                  │                     │
             │ SQL (Prisma ORM)                 │ S3 Presign Calls    │
             ▼                                  ▼                     │
┌─────────────────────────────┐   ┌─────────────────────────────┐     │
│   MANAGED POSTGRESQL 16     │   │      CLOUDFLARE R2          │     │
│  - Metadata Only (No Blobs) │   │  - smile-store-private      │◄────┘
│  - ACID Transactions        │   │    (Encrypted APK binaries) │
│  - Immutable App Versions   │   │  - smile-store-public       │
│  - Audit Trail & Logs       │   │    (Icons, Screenshots)     │
│  - Foreign Keys & Indexes   │   │  - 0 egress cost globally   │
└─────────────────────────────┘   └─────────────────────────────┘
```

### 2. End-to-End Data Flows

#### Flow 1: Developer APK Upload & Release Pipeline
```text
[Developer Portal]               [API Server]                  [Cloudflare R2]          [Postgres DB]
       │                              │                              │                        │
  1.   ├─── POST /uploads/initiate ──►│                              │                        │
       │    (appId, version, bytes)   │─── Validate ownership ───────┼───────────────────────►│
       │                              │─── Generate presigned PUT ──►│                        │
  2.   │◄── 201 Created (uploadUrl) ──┤    (300s TTL, exact key)     │                        │
       │                              │                              │                        │
  3.   ├─────────── Direct HTTP PUT (APK binary) ───────────────────►│                        │
       │                              │                              │                        │
  4.   ├─── POST /uploads/complete ──►│                              │                        │
       │    (uploadSessionId)         │─── HeadObject (verify size) ─►│                        │
       │                              │─── Compute & match SHA-256 ──┼───────────────────────►│
       │                              │─── Parse APK metadata ───────│ (AAPT2 isolated run)   │
       │                              │─── Check signing cert hash ──┼───────────────────────►│
  5.   │◄── 200 OK (Verified) ────────┤                              │                        │
       │                              │                              │                        │
  6.   ├─── POST /releases/submit ───►│─── State: UNDER_REVIEW ──────┼───────────────────────►│
       │                              │                              │                        │
  7.   [Admin Portal approves] ──────►│─── State: PUBLISHED ─────────┼─── Transaction write ──►│
```

#### Flow 2: Android Client Discovery, Download & Safe Install
```text
[Android App]                    [API Server]                  [Cloudflare R2]          [Android OS]
       │                              │                              │                        │
  1.   ├─── GET /apps/com.smile.app ─►│                              │                        │
       │                              │─── Query metadata & version ─┼───────────────────────►│
  2.   │◄── 200 OK (app details, ─────┤                              │                        │
       │        sha256, versionCode)  │                              │                        │
       │                              │                              │                        │
  3.   ├─── POST /apps/:id/download ─►│─── Check published status ───┼───────────────────────►│
       │                              │─── Increment download stats ─┼───────────────────────►│
       │                              │─── Presign GET URL (300s) ───►│                        │
  4.   │◄── 200 OK (downloadUrl, ─────┤                              │                        │
       │        expectedSha256)       │                              │                        │
       │                              │                              │                        │
  5.   ├─────────── Direct HTTP GET (resumable stream) ─────────────►│                        │
  6.   ├── Local stream download to app cache storage                │                        │
  7.   ├── Compute local SHA-256 hash vs expectedSha256              │                        │
       │   (Hash mismatch? Abort file immediately)                   │                        │
  8.   ├── Request ACTION_VIEW / PackageInstaller Intent ────────────┼───────────────────────►│
  9.   │                                                             │    System displays     │
       │                                                             │    "Install unknown    │
       │                                                             │    app" dialog         │
```

---

## B. Recommended Open-Source Stack & Technology Rationale

| Layer | Component | Choice | Rationale & Trade-off Justification |
| :--- | :--- | :--- | :--- |
| **Android Client** | UI & Architecture | **Kotlin + Jetpack Compose + Material 3** | Modern declarative UI, native performance, idiomatic Coroutines/Flow for asynchronous network calls, Material You theming. |
| **Android Client** | Networking | **Retrofit 2 + OkHttp 4** | Industry-standard HTTP stack with resumable download interceptors, connection pooling, and disk cache. |
| **Android Client** | Package Management | **Android PackageInstaller API** | Safe native installation intent without bypassing system security or device integrity safeguards. |
| **Web Tier** | Portals & Store | **React 19 + TypeScript + Vite + Tailwind CSS** | Unified client codebase sharing types with backend; zero unnecessary runtime overhead; instant HMR in dev; mobile-first layout. |
| **Backend Runtime** | Service Engine | **Node.js 22 LTS + Express** | High concurrency for I/O; massive ecosystem; native ES modules support; low operational complexity compared to microservices. |
| **Language** | Backend & Frontends | **TypeScript 5.x** | End-to-end type safety between database schema, API request/response contracts, and UI components. |
| **Database ORM** | Data Access | **Prisma ORM** | Type-safe queries, automated declarative schema migrations (`prisma migrate`), robust transaction API, and connection pooling support. |
| **Relational DB** | Storage Engine | **PostgreSQL 16** | Strict ACID guarantees, JSONB support for app permissions/attributes, full-text search indexes (`tsvector`), foreign keys, constraints. |
| **Object Storage** | Binary & Media Store | **Cloudflare R2 via AWS SDK v3** (`@aws-sdk/client-s3`) | Zero egress fees, standard S3 compatibility, globally distributed edge endpoints, presigned URLs. |
| **Validation** | Schema Validation | **Zod** | Runtime request body, query parameter, and environment variable schema validation with automatic TypeScript inference. |
| **Password Security**| Cryptography | **Argon2id (`argon2`)** | Winner of Password Hashing Competition; resistant to GPU and ASIC brute-force attacks (superior to legacy bcrypt/scrypt). |
| **Auth Tokens** | Session Management | **`jose` / `jsonwebtoken`** | Stateless short-lived JWT access tokens (15m) + cryptographic random refresh tokens stored in PostgreSQL with rotation and revocation. |
| **HTTP Security** | Hardening Middleware | **Helmet + express-rate-limit + cors** | Automated security headers (HSTS, CSP, X-Frame-Options), strict origin checks, and IP-based rate limiting on sensitive routes. |

---

## C. Cloud Provider Comparison & S3-Compatible Storage Analysis

### 1. Object Storage Provider Comparison (Primary Requirement: Cloudflare R2)

| Provider | Storage Cost / GB-mo | Egress Cost / GB | Class A Operations (PUT/POST/List) | Class B Operations (GET/HEAD) | Evaluation & Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cloudflare R2** *(Primary)* | **\$0.015 / GB** (10 GB free) | **\$0.00** (Zero egress) | **\$4.50 / Million** (1M/mo free) | **\$0.36 / Million** (10M/mo free) | **SELECTED:** Completely eliminates egress risk from large APK downloads. Native S3 API compatibility. |
| **AWS S3 Standard** | \$0.023 / GB (5 GB free yr 1) | \$0.09 / GB (First 100 GB free) | \$5.00 / Million | \$0.40 / Million | *Rejected:* High egress costs (\$90 per TB) make public APK downloads financially unsustainable at scale. |
| **Backblaze B2** | \$0.006 / GB (10 GB free) | \$0.01 / GB (3x storage free) | \$5.00 / Million | \$0.40 / Million | *Portability Fallback:* Cheap storage, but egress fees apply after bandwidth caps. |
| **Wasabi** | \$0.0069 / GB | \$0.00 (Conditional egress) | Included | Included | *Rejected:* Strict minimum 90-day storage retention policy penalizes temporary or deleted upload drafts. |

*Official Reference:* [Cloudflare R2 Pricing Documentation](https://developers.cloudflare.com/r2/pricing/) (Verified: \$0.015/GB/mo, \$0 egress, 10 GB free storage, 1M Class A & 10M Class B free/month).

### 2. Compute, Database, Domain, and Observability Providers

| Component | Recommended Choice | Viable Alternative | Free Tier Limits / Cost Structure | Trade-off Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Backend API** | **Render Web Service** (Docker) | **Fly.io** or **AWS App Runner** | \$7/mo for 512MB RAM 0.5 CPU; Free tier has spin-down | Zero DevOps maintenance; native health checks and SSL. |
| **Database** | **Neon PostgreSQL** | **Render Managed Postgres** | 0.5 GB storage free tier, scale-to-zero; paid starts at \$19/mo | Instant branching for staging; standard connection pooling (PgBouncer). |
| **Frontend Web** | **Cloudflare Pages** | **Vercel** / **Netlify** | Unlimited bandwidth, 500 builds/mo on Free Tier | Zero cost, co-located with R2 buckets on Cloudflare edge. |
| **DNS / SSL / CDN** | **Cloudflare DNS** | **AWS Route 53** | Free tier includes DDoS, DNSSEC, universal SSL | Best integration with R2 and custom domain caching. |
| **Monitoring** | **Sentry + BetterStack** | **Datadog** | Sentry: 5,000 errors/mo free; BetterStack: 10 monitors free | Real-time crash diagnostics for Node.js API and Android app. |
| **Transactional Email**| **Resend** | **Postmark** / **SendGrid** | 3,000 emails/mo free (100/day) | Modern developer experience with React Email templates. |

---

## D. Cloudflare R2 Bucket Strategy, Policies & Lifecycle

### 1. Bucket Partitioning Strategy

1. **`smile-store-private` (Private Bucket)**:
   - **Contents**: Production APK binaries, release candidates, temporary upload chunks, quarantined files.
   - **Access Control**: STRICTLY PRIVATE. No public bucket domain or read access.
   - **Access Vector**: Solely accessed through server-generated presigned S3 URLs (`PutObjectCommand` with 300s TTL for uploads, `GetObjectCommand` with 300s TTL for authorized downloads).
   - **Encryption**: AES-256 server-side encryption enabled.
2. **`smile-store-public` (Public Bucket)**:
   - **Contents**: App icons (`icon_512.png`), feature banners (`banner_1024x500.png`), device screenshots.
   - **Access Control**: Read-only public access mapped to a custom domain (e.g., `cdn.smilestore.app`).
   - **Caching Policy**: Cloudflare Edge Cache-Control headers set to `public, max-age=604800, immutable` for versioned media assets.

### 2. Object Key Naming Conventions (Immutable Paths)

- **APK Binaries**:  
  `private/apks/{appId}/{versionCode}_{sha256HashPrefix}.apk`  
  *(Never overwritten; every new build produces an immutable key)*.
- **Temporary Upload Staging**:  
  `private/uploads/{uploadSessionId}/{filename}.tmp`  
  *(Auto-expired via lifecycle rule if not confirmed within 24 hours)*.
- **Public Media Assets**:  
  `public/apps/{appId}/icons/{assetId}.webp`  
  `public/apps/{appId}/screenshots/{sortOrder}_{assetId}.webp`  
  `public/developers/{devId}/avatar_{assetId}.webp`

### 3. R2 CORS Configuration
```json
[
  {
    "AllowedOrigins": [
      "https://store.smilestore.app",
      "https://developer.smilestore.app",
      "https://admin.smilestore.app"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length",
      "x-amz-content-sha256",
      "x-amz-date",
      "Authorization"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## E. Storage and Bandwidth Financial Estimates

### Assumption Baseline:
- Average APK size: **35 MB**
- Average screenshots + icon per app: **4 MB** (WebP optimized)
- Active published apps: 500 apps with an average of 3 retained versions each = 1,500 APKs.
- R2 Free Tier: **10 GB Storage**, **1,000,000 Class A**, **10,000,000 Class B**, **\$0 Egress**.

| Metric | Stage 1: Launch (50 Apps) | Stage 2: Growth (500 Apps) | Stage 3: Scale (2,500 Apps) |
| :--- | :--- | :--- | :--- |
| **Published APKs** | 100 files (3.5 GB) | 1,500 files (52.5 GB) | 10,000 files (350 GB) |
| **Media Assets** | 300 files (0.3 GB) | 3,500 files (3.5 GB) | 20,000 files (20 GB) |
| **Total R2 Storage** | **3.8 GB** (Within Free Tier) | **56.0 GB** | **370.0 GB** |
| **Monthly Downloads** | 2,000 downloads | 50,000 downloads | 500,000 downloads |
| **Monthly Egress** | 70 GB | 1,750 GB (1.75 TB) | 17,500 GB (17.5 TB) |
| **R2 Egress Cost** | **\$0.00** | **\$0.00** | **\$0.00** |
| **R2 Storage Cost** | **\$0.00** (Free) | (56 - 10) * \$0.015 = **\$0.69** | (370 - 10) * \$0.015 = **\$5.40** |
| **Class A Ops Cost** | **\$0.00** (< 1M ops) | **\$0.00** (< 1M ops) | ~150,000 ops = **\$0.00** |
| **Class B Ops Cost** | **\$0.00** (< 10M ops) | ~100,000 ops = **\$0.00** | ~1,200,000 ops = **\$0.00** |
| **Total Monthly Storage Cost** | **\$0.00 / mo** | **\$0.69 / mo** | **\$5.40 / mo** |

*Key Insight:* On traditional AWS S3, Stage 3 (17.5 TB egress) would cost **\$1,575/month** in bandwidth alone. Cloudflare R2 reduces this cost to **\$5.40/month**, validating the architecture requirement.

---

## F. Security, Privacy & Threat Model

| Threat Vector | Attack Scenario | Architectural Mitigation |
| :--- | :--- | :--- |
| **Malicious APK Injection** | Attacker tampers with APK between upload and client download. | Mandatory SHA-256 calculation upon upload completion; hash recorded in immutable database row; Android client verifies hash bit-for-bit before launching installer intent. |
| **Unauthorized Binary Access** | Public scrapers dump APK database or hotlink binaries. | APK bucket is strictly private; downloads require authenticated/metered API token yielding a 300-second presigned single-use URL. |
| **Package Hijacking & Replay** | Rogue developer uploads trojaned update to an existing package. | Strict uniqueness on `package_name`; app update endpoint enforces `developer_id == app.developer_id` AND verifies developer signing certificate matches the original release. |
| **Secret Exfiltration** | Attacker decompiles Android APK or scrapes frontend bundle. | Zero server secrets, R2 credentials, or database connection strings compiled in Android or web code; all privileged I/O mediated via server-side API. |
| **Credential Stuffing & Brute Force**| Automated password guessing attacks. | Argon2id hashing with memory/time parameters; IP & account rate-limiting (max 5 failed attempts per 15 mins) via Redis-less Express memory/DB store. |
| **Session Hijacking** | XSS steals refresh tokens. | Access tokens expire in 15 mins; refresh tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies with family rotation and automatic revocation on reuse detection. |
| **Privacy Compliance (GDPR/CCPA)**| User demands account & personal data erasure. | Dedicated `/users/me/delete` endpoint triggering database transaction anonymizing or cascading user personal records, reviews, and favorites. |

---

## G. Database Entities, Relationships & Schema (PostgreSQL)

```sql
-- Core User & Auth Entities
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'USER' CHECK (role IN ('USER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN')),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Developer Entities
CREATE TABLE developers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    website_url VARCHAR(255),
    support_email VARCHAR(255) NOT NULL,
    verified_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories & Taxonomy
CREATE TABLE categories (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'productivity', 'games-arcade'
    name VARCHAR(100) NOT NULL,
    icon_name VARCHAR(50) NOT NULL,
    sort_order INT DEFAULT 0
);

-- Applications & App Versions
CREATE TABLE apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE RESTRICT,
    package_name VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    tagline VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    icon_key VARCHAR(255) NOT NULL,
    banner_key VARCHAR(255),
    category_id VARCHAR(50) NOT NULL REFERENCES categories(id),
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'SUSPENDED')),
    is_featured BOOLEAN DEFAULT FALSE,
    average_rating DECIMAL(3,2) DEFAULT 0.00,
    review_count INT DEFAULT 0,
    download_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    version_code INT NOT NULL,
    version_name VARCHAR(50) NOT NULL,
    min_sdk_version INT NOT NULL DEFAULT 24,
    target_sdk_version INT NOT NULL DEFAULT 34,
    file_key VARCHAR(255) NOT NULL, -- R2 object key
    file_size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    signing_cert_fingerprint VARCHAR(64) NOT NULL,
    release_notes TEXT,
    status VARCHAR(20) DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'APPROVED', 'PUBLISHED', 'REJECTED', 'SUPERSEDED')),
    rejection_reason TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_app_version_code UNIQUE (app_id, version_code)
);

-- App Media & Screenshots
CREATE TABLE screenshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    storage_key VARCHAR(255) NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Upload Sessions (Two-Phase Upload Tracking)
CREATE TABLE upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id),
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('APK', 'ICON', 'SCREENSHOT', 'BANNER')),
    target_app_id UUID REFERENCES apps(id),
    expected_bytes BIGINT NOT NULL,
    expected_mime VARCHAR(100) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'UPLOADED', 'VERIFIED', 'FAILED', 'EXPIRED')),
    sha256_hash VARCHAR(64),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Interactions & Discovery
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(120),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_app_review UNIQUE (app_id, user_id)
);

CREATE TABLE favorites (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, app_id)
);

CREATE TABLE download_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES app_versions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_hash VARCHAR(64) NOT NULL,
    user_agent VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Critical Indexes for Performance & Search
CREATE INDEX idx_apps_category_status ON apps(category_id, status);
CREATE INDEX idx_apps_featured ON apps(is_featured) WHERE status = 'PUBLISHED';
CREATE INDEX idx_app_versions_lookup ON app_versions(app_id, version_code);
CREATE INDEX idx_reviews_app_id ON reviews(app_id);
CREATE INDEX idx_download_logs_app_time ON download_logs(app_id, created_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at);
```

---

## H. API Boundaries & Contract Definitions (`/api/v1`)

### 1. Standard Response Schemas

#### Success Envelope:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142
  }
}
```

#### Error Envelope:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid APK metadata",
    "details": [
      { "field": "versionCode", "message": "versionCode must be greater than 102" }
    ]
  }
}
```

### 2. Primary Endpoint Matrix

| Method | Endpoint | Auth Level | Purpose | Key Parameters / Body |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register new user | `{ email, username, password }` |
| `POST` | `/api/v1/auth/login` | Public | Sign in & acquire tokens | `{ email, password }` (Returns JWT + HttpOnly cookie) |
| `POST` | `/api/v1/auth/refresh` | Cookie | Rotate access token | Reads HttpOnly refresh cookie |
| `GET` | `/api/v1/apps` | Public | Browse/filter marketplace | `?category=&search=&sort=&page=&limit=` |
| `GET` | `/api/v1/apps/:id` | Public | Full app details | Includes screenshots, latest version, stats |
| `POST` | `/api/v1/apps/:id/download-url` | Public/User | Issue short-lived presigned R2 download URL | Returns `{ downloadUrl, sha256, expiresAt }` |
| `GET` | `/api/v1/updates/check` | Public | Android client update check | `?packages=com.foo.app:10,com.bar.app:4` |
| `POST` | `/api/v1/uploads/initiate` | Developer | Create upload session & get presigned PUT URL | `{ targetType, appId, expectedBytes, mimeType }` |
| `POST` | `/api/v1/uploads/:id/complete` | Developer | Verify uploaded R2 object & trigger parsing | `{ uploadSessionId }` |
| `POST` | `/api/v1/developer/apps` | Developer | Create new application profile | `{ name, packageName, categoryId, description }` |
| `POST` | `/api/v1/developer/apps/:id/submit`| Developer | Submit version for admin review | `{ versionId, releaseNotes }` |
| `GET` | `/api/v1/admin/queue` | Admin | Pending review queue | Moderation list of `UNDER_REVIEW` apps |
| `POST` | `/api/v1/admin/reviews/:id/decision`| Admin | Approve/reject release | `{ decision: 'APPROVE'|'REJECT', reason }` |
| `DELETE`| `/api/v1/users/me` | User | Account deletion (GDPR/Privacy)| Requires password re-entry |

---

## I. APK Validation, Review, Publication & Android Installation

### 1. Backend APK Validation Pipeline

```text
[R2 Upload Complete]
         │
         ▼
[Step 1: Size & Object Verification]
Check R2 HeadObject: ContentLength matches expectedBytes exactly.
         │
         ▼
[Step 2: Stream SHA-256 Digest Computation]
Stream object from R2 to crypto pipeline; compute SHA-256 checksum; match with record.
         │
         ▼
[Step 3: Isolated Parsing Environment]
Execute child worker invoking APK manifest reader:
- Extract AndroidManifest.xml: package name, versionCode, versionName, minSdk, targetSdk.
- Enforce package name matches targetApp.packageName.
- Enforce versionCode > current highest published versionCode for this app.
         │
         ▼
[Step 4: Signing Certificate Validation]
Extract public key certificate fingerprint (SHA-256):
- If version 1: Store certificate fingerprint in database as app signing anchor.
- If version > 1: Match certificate fingerprint with anchor. If mismatch, REJECT immediately.
         │
         ▼
[Step 5: Security Policy & Static Checks]
- Check targetSdk >= 33 (Android platform modern policy).
- Extract declared permissions; flag dangerous permissions (`RECEIVE_BOOT_COMPLETED`, `SYSTEM_ALERT_WINDOW`, etc.) for admin review.
         │
         ▼
[Step 6: Release Ready]
Record status as SUBMITTED; notify developer; populate admin moderation queue.
```

### 2. Android Client Safe Installation Protocol

```kotlin
// Android Client Download & Installation Sequence
class AppInstallerService(private val context: Context) {

    suspend fun verifyAndInstall(downloadedFile: File, expectedSha256: String) {
        // 1. Verify SHA-256 integrity
        val actualHash = computeSha256(downloadedFile)
        if (!actualHash.equals(expectedSha256, ignoreCase = true)) {
            downloadedFile.delete()
            throw SecurityException("APK integrity check failed! Expected: $expectedSha256, got: $actualHash")
        }

        // 2. Check Android Unknown Sources Consent
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!context.packageManager.canRequestPackageInstalls()) {
                val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
                return
            }
        }

        // 3. Launch System Package Installer Intent
        val apkUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            downloadedFile
        )

        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }

        context.startActivity(installIntent)
    }
}
```

---

## J. Complete Proposed Project Tree

```text
SmileStore/
├── .github/
│   └── workflows/
│       ├── backend-ci.yml              # Lint, test, Prisma validation, Docker build
│       ├── web-ci.yml                  # Build checks for Store, Dev & Admin
│       └── android-ci.yml              # Gradle lint & assembleRelease APK
├── android/
│   └── SmileStore/
│       ├── app/
│       │   ├── src/main/
│       │   │   ├── java/com/smilestore/
│       │   │   │   ├── data/           # Retrofit services, DTOs, room cache
│       │   │   │   ├── domain/         # Use cases (DownloadApp, CheckUpdates)
│       │   │   │   ├── ui/             # Jetpack Compose screens & theme
│       │   │   │   │   ├── home/
│       │   │   │   │   ├── detail/
│       │   │   │   │   ├── categories/
│       │   │   │   │   └── theme/
│       │   │   │   └── installer/      # FileProvider & PackageInstaller handlers
│       │   │   ├── AndroidManifest.xml
│       │   │   └── res/
│       │   └── build.gradle.kts
│       └── build.gradle.kts
├── backend/
│   ├── src/
│   │   ├── config/                     # Environment validation (Zod)
│   │   ├── controllers/                # Auth, Apps, Uploads, Admin, Updates
│   │   ├── middleware/                 # Auth guard, RBAC, Rate limiter, Error handler
│   │   ├── routes/                     # /api/v1 router endpoints
│   │   ├── services/                   # Business logic, APK parsing, auth logic
│   │   ├── storage/                    # S3/R2 StorageProvider implementation
│   │   ├── security/                   # Argon2id, JWT, cert validator
│   │   └── utils/                      # Hashes, pagination, logger
│   ├── prisma/
│   │   ├── schema.prisma               # PostgreSQL relational schema
│   │   └── migrations/                 # Committed SQL migrations
│   ├── tests/
│   │   ├── unit/                       # Storage adapter, token, hash tests
│   │   └── integration/                # API integration test suite (Supertest)
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── web/                                # Public Web Store (React 19 / Vite / Tailwind)
│   ├── src/
│   │   ├── components/                 # AppCard, CategoryRow, SearchBar, Header
│   │   ├── pages/                      # Home, AppDetail, CategoryView, DownloadModal
│   │   └── api/                        # Typed API client
│   └── package.json
├── developer/                          # Developer Portal (React 19 / Vite)
│   ├── src/
│   │   ├── pages/                      # Dashboard, AppEditor, ReleaseUpload, Analytics
│   │   └── components/                 # PresignedUploader, ReleaseTimeline
│   └── package.json
├── admin/                              # Admin Governance Portal (React 19 / Vite)
│   ├── src/
│   │   ├── pages/                      # ModerationQueue, AppReviewDetail, AuditLogs
│   │   └── components/                 # DiffViewer, CertInspector, MetricsOverview
│   └── package.json
├── infrastructure/
│   ├── docker-compose.yml              # Local dev stack (Postgres + MinIO/R2 mock)
│   └── r2-cors.json                    # Cloudflare R2 CORS definition
├── .env.example
├── .gitignore
└── README.md
```

---

## K. Roadmap, Test Strategy, Disaster Recovery & Cost Drivers

### 1. Phased Development Roadmap

1. **Phase 1: Architecture & Model Approval** *(Current step — awaiting user approval)*
2. **Phase 2: Backend Foundation**  
   - TypeScript/Express setup, Prisma PostgreSQL configuration, Zod validation, `/health` endpoint, error-handling middleware, unit tests.
3. **Phase 3: Authentication & Authorization**  
   - Argon2id password hashing, JWT access/refresh token rotation with HttpOnly cookies, RBAC (`USER`, `DEVELOPER`, `ADMIN`, `SUPER_ADMIN`).
4. **Phase 4: Cloudflare R2 Storage Adapter**  
   - `StorageProvider` abstraction with AWS SDK v3 against R2 endpoints, upload session lifecycle, presigned PUT/GET URLs, and integration tests.
5. **Phase 5: Marketplace Core APIs**  
   - Categories, search with full-text indexing, app metadata, reviews, ratings, favorites.
6. **Phase 6: APK Validation & Moderation Pipeline**  
   - Isolated APK parsing, SHA-256 calculation, signing certificate checks, admin review/approval state machine.
7. **Phase 7: Public Web Store (React 19 + Tailwind CSS)**  
   - Responsive marketplace catalog, mobile-first design, detail modal, live search, download modal.
8. **Phase 8: Android Client (Jetpack Compose)**  
   - Material 3 client, Retrofit API integration, resumable APK downloader, SHA-256 verifier, PackageInstaller bridge.
9. **Phase 9: Developer & Admin Portals**  
   - App submission wizard with direct R2 upload progress, moderation approval dashboard, audit log browser.
10. **Phase 10: Production Deployment, Monitoring & Runbooks**  
    - Docker containerization, CI/CD pipeline, backups, restore drills, and security audits.

### 2. Testing Strategy

- **Unit Testing (Vitest / Jest)**: 100% coverage on security critical utilities (Argon2id hashing, token signing/verification, SHA-256 computation, R2 key generation).
- **Integration Testing (Supertest + Testcontainers Postgres)**: Validates complete HTTP flows including `/auth`, `/uploads/initiate`, `/uploads/complete`, and download URL issuance.
- **Android Instrumentation / Unit Tests (JUnit5 / MockWebServer)**: Tests download integrity failures, network retry resilience, and intent dispatch.

### 3. Backup, Disaster Recovery & Cost Drivers

- **PostgreSQL Backups**: Daily automated pg_dump snapshots stored in an isolated cold bucket with 30-day point-in-time recovery (PITR).
- **R2 Disaster Recovery**: Object versioning and retention rules preventing accidental deletion. Secondary replication to Backblaze B2 can be activated if multi-cloud redundancy is required.
- **Primary Cost Drivers**:
  1. *Database compute* as user reviews and metrics expand (mitigated by read indexes and connection pooling).
  2. *API Container memory* during burst traffic (mitigated by delegating all heavy binary transfers directly to Cloudflare R2).

---

## L. Open Questions & Decision Gates Requiring User Approval

Please review and confirm your preferences for these three operational decisions:

1. **Backend Hosting Environment**:
   - *(Recommended)* **Render / Fly.io Container**: Managed Linux container deployment with native zero-downtime rollouts and automated SSL.
   - *Alternative*: Standard Docker deployment on dedicated VPS (Hetzner / DigitalOcean) or AWS App Runner.
2. **Managed Database Provider**:
   - *(Recommended)* **Neon PostgreSQL**: Serverless Postgres with branching, automated backups, and 0.5 GB free tier.
   - *Alternative*: Render Managed PostgreSQL (\$7/mo) or Supabase.
3. **APK Tooling Strategy**:
   - *(Recommended)* **In-Process Stream Parser (`apk-parser` / Node.js native streaming)**: Zero external binary dependencies, parses APK zip central directory to extract manifest and certificates quickly.
   - *Alternative*: Native Linux `aapt2` binary invoked via isolated child process (requires `aapt2` installed in Docker container).

---

> [!NOTE]
> **Action Required**: Click **Proceed** to approve this Phase 1 Architecture Blueprint and begin Phase 2 (Backend Foundation, PostgreSQL Prisma Setup, and Health Testing), or share any specific adjustments you would like made to the architecture.
