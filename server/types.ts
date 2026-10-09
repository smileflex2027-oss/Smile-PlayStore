export type UserRole = 'USER' | 'DEVELOPER' | 'ADMIN' | 'SUPER_ADMIN';

export type AppStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED';

export type VersionStatus = 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'SUPERSEDED';

export type UploadTargetType = 'APK' | 'ICON' | 'SCREENSHOT' | 'BANNER';

export type UploadSessionStatus = 'INITIATED' | 'UPLOADED' | 'VERIFIED' | 'FAILED' | 'EXPIRED';

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
}

export interface Developer {
  id: string;
  userId: string;
  displayName: string;
  websiteUrl?: string;
  supportEmail: string;
  verifiedAt?: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  iconName: string;
  sortOrder: number;
}

export interface AppVersion {
  id: string;
  appId: string;
  versionCode: number;
  versionName: string;
  minSdkVersion: number;
  targetSdkVersion: number;
  fileKey: string;
  fileSizeBytes: number;
  sha256Hash: string;
  signingCertFingerprint: string;
  releaseNotes: string;
  status: VersionStatus;
  rejectionReason?: string;
  publishedAt?: string;
  createdAt: string;
  permissions: string[];
}

export interface AppScreenshot {
  id: string;
  appId: string;
  storageKey: string;
  url: string;
  width: number;
  height: number;
  sortOrder: number;
}

export interface AppListing {
  id: string;
  developerId: string;
  developerName: string;
  packageName: string;
  name: string;
  tagline: string;
  description: string;
  iconKey: string;
  iconUrl: string;
  bannerKey?: string;
  bannerUrl?: string;
  categoryId: string;
  categoryName: string;
  status: AppStatus;
  isFeatured: boolean;
  averageRating: number;
  reviewCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  latestVersion?: AppVersion;
  screenshots: AppScreenshot[];
}

export interface Review {
  id: string;
  appId: string;
  userId: string;
  username: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
}

export interface UploadSession {
  id: string;
  developerId: string;
  targetType: UploadTargetType;
  targetAppId?: string;
  expectedBytes: number;
  expectedMime: string;
  storageKey: string;
  status: UploadSessionStatus;
  sha256Hash?: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface StorageMetrics {
  totalApkStorageBytes: number;
  totalMediaStorageBytes: number;
  totalApkCount: number;
  totalMediaCount: number;
  estimatedMonthlyCostUSD: number;
  egressCostUSD: number;
}
