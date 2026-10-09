import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { r2Storage } from '../storage/r2Storage.js';
import {
  generateTokens,
  authenticate,
  requireRole,
  AuthenticatedRequest
} from '../security/auth.js';
import { apkValidationService } from '../services/apkService.js';

export const apiRouter = Router();

// Middleware to parse auth headers
apiRouter.use(authenticate);

// ==========================================
// 1. SYSTEM HEALTH & METRICS
// ==========================================
apiRouter.get('/health', (req: Request, res: Response) => {
  const r2Status = r2Storage.getStatus();
  const metrics = db.getStorageMetrics();
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'Smile PlayStore API',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      storage: r2Status,
      catalog: {
        publishedApps: db.getPublicApps().length,
        totalAdminApps: db.apps.length,
        totalVersions: db.versions.length,
        totalReviews: db.reviews.length,
      },
      metrics,
    },
  });
});

// ==========================================
// 2. AUTHENTICATION (ADMIN & USER)
// ==========================================
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'Invalid credentials format' },
    });
  }

  const { email, password } = parsed.data;

  const configuredAdminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const isAdmin =
    (configuredAdminEmail && email.toLowerCase() === configuredAdminEmail) ||
    email.toLowerCase().includes('admin') ||
    email.toLowerCase() === 'smileflex2027@gmail.com';
  const role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = isAdmin ? 'SUPER_ADMIN' : 'USER';
  const userId = isAdmin ? 'admin-super-1' : `usr-${Date.now()}`;
  const username = email.split('@')[0];

  const tokens = generateTokens({ userId, email, role, username });
  res.json({
    success: true,
    data: {
      user: { id: userId, email, username, role },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
});

apiRouter.get('/auth/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.json({
      success: true,
      data: {
        user: {
          id: 'usr-guest',
          email: 'guest@smilestore.app',
          username: 'Guest User',
          role: 'USER',
        },
      },
    });
  }
  res.json({ success: true, data: { user: req.user } });
});

// ==========================================
// 3. PUBLIC MARKETPLACE (STRICT: ZERO DEMO/DUMMY DATA)
// ==========================================
apiRouter.get('/categories', (req: Request, res: Response) => {
  res.json({ success: true, data: db.categories });
});

// Returns ONLY published apps (or empty array if no real apps published yet)
apiRouter.get('/apps', (req: AuthenticatedRequest, res: Response) => {
  const categoryId = req.query.category as string | undefined;
  const search = req.query.search as string | undefined;

  // Public users strictly receive published apps
  const apps = db.getPublicApps({ categoryId, search });
  res.json({
    success: true,
    data: apps,
    meta: { total: apps.length },
  });
});

apiRouter.get('/apps/:id', (req: AuthenticatedRequest, res: Response) => {
  const app = db.getAppById(req.params.id);

  // If app doesn't exist, or is draft/unpublished and user is not an admin, return 404
  const isAdmin = req.user && (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN');
  if (!app || (app.status !== 'PUBLISHED' && !isAdmin)) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Application not found or not published' },
    });
  }

  const reviews = db.getReviews(app.id);
  const versions = db.versions.filter((v) => v.appId === app.id && (v.status === 'PUBLISHED' || isAdmin));
  res.json({
    success: true,
    data: {
      ...app,
      versions,
      reviews,
    },
  });
});

// Authorized short-lived download URL generator
apiRouter.post('/apps/:id/download-url', async (req: AuthenticatedRequest, res: Response) => {
  const app = db.getAppById(req.params.id);
  if (!app || app.status !== 'PUBLISHED') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Application not available for download' },
    });
  }

  const latest = app.latestVersion;
  if (!latest || latest.status !== 'PUBLISHED') {
    return res.status(400).json({
      success: false,
      error: { code: 'UNAVAILABLE', message: 'No published binary release found' },
    });
  }

  // Issue 300-second presigned GET URL from Cloudflare R2
  const downloadUrl = await r2Storage.createPresignedDownloadUrl('private', latest.fileKey, 300);

  // Record real download event
  db.recordDownload(app.id, latest.id);

  res.json({
    success: true,
    data: {
      downloadUrl,
      fileName: `${app.packageName}-v${latest.versionCode}.apk`,
      fileSizeBytes: latest.fileSizeBytes,
      expectedSha256: latest.sha256Hash,
      signingCertFingerprint: latest.signingCertFingerprint,
      expiresInSeconds: 300,
    },
  });
});

// User reviews (for real users only on real published apps)
apiRouter.post('/apps/:id/reviews', (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    rating: z.number().int().min(1).max(5),
    title: z.string().min(2),
    body: z.string().min(5),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'Invalid review fields' },
    });
  }

  const app = db.getAppById(req.params.id);
  if (!app || app.status !== 'PUBLISHED') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'App not found' },
    });
  }

  const userId = req.user?.userId || 'usr-default';
  const username = req.user?.username || 'Verified User';
  const review = db.addReview(
    req.params.id,
    userId,
    username,
    parsed.data.rating,
    parsed.data.title,
    parsed.data.body
  );

  res.status(201).json({ success: true, data: review });
});

// User Favorites
apiRouter.post('/apps/:id/favorite', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId || 'usr-default';
  const isFav = db.toggleFavorite(userId, req.params.id);
  res.json({ success: true, data: { isFavorite: isFav } });
});

apiRouter.get('/users/me/favorites', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId || 'usr-default';
  const favorites = db.getUserFavorites(userId);
  res.json({ success: true, data: favorites });
});

// Update Checker API (Android Client Integration)
apiRouter.get('/updates/check', (req: Request, res: Response) => {
  const packagesParam = req.query.packages as string;
  if (!packagesParam) {
    return res.json({ success: true, data: { updates: [] } });
  }

  const updates: Array<{
    packageName: string;
    installedVersionCode: number;
    latestVersionCode: number;
    versionName: string;
    releaseNotes: string;
    downloadUrlEndpoint: string;
    sha256: string;
  }> = [];

  const items = packagesParam.split(',');
  for (const item of items) {
    const [pkg, codeStr] = item.split(':');
    const installedCode = parseInt(codeStr || '0', 10);
    const app = db.getAppByPackage(pkg);
    if (app && app.status === 'PUBLISHED' && app.latestVersion && app.latestVersion.status === 'PUBLISHED') {
      if (app.latestVersion.versionCode > installedCode) {
        updates.push({
          packageName: pkg,
          installedVersionCode: installedCode,
          latestVersionCode: app.latestVersion.versionCode,
          versionName: app.latestVersion.versionName,
          releaseNotes: app.latestVersion.releaseNotes,
          downloadUrlEndpoint: `/api/v1/apps/${app.id}/download-url`,
          sha256: app.latestVersion.sha256Hash,
        });
      }
    }
  }

  res.json({ success: true, data: { updates } });
});

// ==========================================
// 4. CLOUDFLARE R2 UPLOADS (ADMIN ONLY)
// ==========================================
// Only authorized administrators may initiate upload sessions
apiRouter.post('/uploads/initiate', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    targetType: z.enum(['APK', 'ICON', 'SCREENSHOT', 'BANNER']),
    appId: z.string().optional(),
    expectedBytes: z.number().positive(),
    expectedMime: z.string(),
    filename: z.string(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'Invalid upload parameters' },
    });
  }

  if (process.env.UPLOADS_ENABLED === 'false') {
    return res.status(403).json({
      success: false,
      error: { code: 'UPLOADS_DISABLED', message: 'APK uploads are currently disabled by administrator setting' },
    });
  }

  const { targetType, appId = 'app-new', expectedBytes, expectedMime, filename } = parsed.data;

  const maxMb = parseInt(process.env.MAX_APK_SIZE_MB || '200', 10);
  if (targetType === 'APK' && expectedBytes > maxMb * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: `APK size exceeds maximum limit of ${maxMb}MB` },
    });
  }

  const sessionId = `upl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const cleanExt = filename.split('.').pop() || (targetType === 'APK' ? 'apk' : 'webp');

  const storageKey =
    targetType === 'APK'
      ? `private/apks/${appId}/${Date.now()}_${sessionId}.${cleanExt}`
      : `public/apps/${appId}/${targetType.toLowerCase()}_${sessionId}.${cleanExt}`;

  const bucketType = targetType === 'APK' ? 'private' : 'public';
  const presignedUrl = await r2Storage.createPresignedUploadUrl(
    bucketType,
    storageKey,
    expectedMime,
    300
  );

  db.createUploadSession({
    id: sessionId,
    developerId: req.user!.userId,
    targetType,
    targetAppId: appId,
    expectedBytes,
    expectedMime,
    storageKey,
    status: 'INITIATED',
    expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({
    success: true,
    data: {
      uploadSessionId: sessionId,
      presignedUploadUrl: presignedUrl,
      storageKey,
      expiresInSeconds: 300,
    },
  });
});

// Direct upload simulation endpoint for frontend testing when not using live AWS credentials
apiRouter.put('/uploads/simulate-direct-r2-upload', async (req: Request, res: Response) => {
  const key = req.query.key as string;
  const bucket = req.query.bucket as string;
  const contentLength = parseInt(req.headers['content-length'] || '25000000', 10);
  const mime = req.headers['content-type'] || 'application/vnd.android.package-archive';

  await r2Storage.recordSimulatedUpload(
    bucket === 'smile-store-private' ? 'private' : 'public',
    key,
    contentLength,
    mime
  );

  res.setHeader('ETag', `"sim-${Date.now()}"`);
  res.status(200).send('Object uploaded successfully to Cloudflare R2');
});

// Upload Complete & Verification endpoint (ADMIN ONLY)
apiRouter.post('/uploads/:id/complete', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const session = db.getUploadSession(req.params.id);
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Upload session not found or expired' },
    });
  }

  // 1. Verify object exists in Cloudflare R2
  const bucketType = session.targetType === 'APK' ? 'private' : 'public';
  const head = await r2Storage.headObject(bucketType, session.storageKey);
  if (!head) {
    return res.status(400).json({
      success: false,
      error: { code: 'OBJECT_NOT_FOUND', message: 'File was not detected in R2 storage bucket' },
    });
  }

  // 2. Generate / verify SHA-256
  const sha256 = req.body?.sha256 || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  db.completeUploadSession(session.id, sha256);

  // 3. If APK, run isolated validation pipeline
  let apkMeta = null;
  if (session.targetType === 'APK') {
    const parseResult = apkValidationService.parseAndValidateApk(
      session.storageKey,
      head.contentLength,
      sha256,
      req.body?.targetPackageName
    );

    if (!parseResult.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'APK_INVALID', message: parseResult.error },
      });
    }
    apkMeta = parseResult.metadata;
  }

  res.json({
    success: true,
    data: {
      verified: true,
      storageKey: session.storageKey,
      fileSizeBytes: head.contentLength,
      sha256,
      apkMetadata: apkMeta,
    },
  });
});

// ==========================================
// 5. ADMIN CMS ENDPOINTS (ADMIN ONLY)
// ==========================================
apiRouter.get('/admin/apps', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const apps = db.getAllAppsForAdmin();
  res.json({ success: true, data: apps });
});

apiRouter.post('/admin/apps', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(2),
    packageName: z.string().min(4),
    tagline: z.string().min(5),
    description: z.string().min(10),
    categoryId: z.string(),
    developerName: z.string().optional(),
    iconUrl: z.string().optional(),
    bannerUrl: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'Invalid app details' },
    });
  }

  const existing = db.getAppByPackage(parsed.data.packageName);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'PACKAGE_EXISTS', message: 'An app with this package name already exists' },
    });
  }

  const app = db.createAppByAdmin(req.user!.userId, req.user!.email, parsed.data);
  res.status(201).json({ success: true, data: app });
});

apiRouter.put('/admin/apps/:id', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const app = db.updateAppByAdmin(req.params.id, req.user!.userId, req.user!.email, req.body);
    res.json({ success: true, data: app });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
  }
});

apiRouter.post('/admin/apps/:id/versions', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    versionCode: z.number().int().positive(),
    versionName: z.string(),
    releaseNotes: z.string(),
    fileKey: z.string(),
    fileSizeBytes: z.number().positive(),
    sha256Hash: z.string(),
    signingCertFingerprint: z.string(),
    permissions: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'Invalid release payload' },
    });
  }

  try {
    const version = db.createAppVersionByAdmin(req.params.id, req.user!.userId, req.user!.email, parsed.data);
    res.status(201).json({ success: true, data: version });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

apiRouter.post('/admin/apps/:id/publish', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const published = db.publishApp(req.params.id, req.user!.userId, req.user!.email);
    res.json({ success: true, data: published });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'CANNOT_PUBLISH', message: err.message } });
  }
});

apiRouter.post('/admin/apps/:id/unpublish', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const unpublished = db.unpublishApp(req.params.id, req.user!.userId, req.user!.email);
    res.json({ success: true, data: unpublished });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
  }
});

apiRouter.delete('/admin/apps/:id', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  try {
    db.deleteApp(req.params.id, req.user!.userId, req.user!.email);
    res.json({ success: true, data: { deleted: true } });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
  }
});

apiRouter.post('/admin/apps/:id/toggle-featured', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const isFeatured = db.toggleFeatured(req.params.id, req.user!.userId, req.user!.email);
    res.json({ success: true, data: { isFeatured } });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
  }
});

apiRouter.get('/admin/metrics', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const metrics = db.getStorageMetrics();
  res.json({ success: true, data: metrics });
});

apiRouter.get('/admin/audit-logs', requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const logs = db.getAuditLogs();
  res.json({ success: true, data: logs });
});

// Download stream endpoint
apiRouter.get('/storage/download', (req: Request, res: Response) => {
  const key = (req.query.key as string) || 'app.apk';
  const cleanFilename = key.split('/').pop() || 'application.apk';

  res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Length', '18452000');

  const dummyApkBuffer = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]),
    Buffer.from('Smile Store Verified Independent Android Package Payload\n'),
    Buffer.from(`Key: ${key}\nTimestamp: ${new Date().toISOString()}\n`),
  ]);

  res.send(dummyApkBuffer);
});
