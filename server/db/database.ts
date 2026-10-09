import {
  AppListing,
  AppVersion,
  Category,
  Developer,
  Review,
  UploadSession,
  AuditLog,
  StorageMetrics
} from '../types.js';

class MarketplaceDatabase {
  public categories: Category[] = [
    { id: 'productivity', name: 'Productivity', iconName: 'CheckSquare', sortOrder: 1 },
    { id: 'tools', name: 'Tools & Utilities', iconName: 'Terminal', sortOrder: 2 },
    { id: 'games', name: 'Games', iconName: 'Gamepad2', sortOrder: 3 },
    { id: 'media', name: 'Media & Audio', iconName: 'Headphones', sortOrder: 4 },
    { id: 'communication', name: 'Communication', iconName: 'MessageSquare', sortOrder: 5 },
  ];

  public developers: Developer[] = [];

  // CRITICAL REQUIREMENT: Initial production catalog starts completely empty.
  // Zero seeded apps, zero demo APKs, zero placeholder download links, zero fake ratings/stats.
  public apps: AppListing[] = [];
  public versions: AppVersion[] = [];
  public reviews: Review[] = [];
  public favorites: Set<string> = new Set();
  public downloadCountMap: Map<string, number> = new Map();
  public uploadSessions: Map<string, UploadSession> = new Map();
  public auditLogs: AuditLog[] = [];

  constructor() {
    // Initial database starts completely empty.
  }

  // Public Marketplace Queries (STRICT: Returns ONLY PUBLISHED apps)
  getPublicApps(query?: { categoryId?: string; search?: string }): AppListing[] {
    return this.apps.filter((app) => {
      if (app.status !== 'PUBLISHED') return false;
      if (query?.categoryId && app.categoryId !== query.categoryId) return false;
      if (query?.search) {
        const q = query.search.toLowerCase().trim();
        const matches =
          app.name.toLowerCase().includes(q) ||
          app.tagline.toLowerCase().includes(q) ||
          app.packageName.toLowerCase().includes(q) ||
          app.description.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }

  // Admin CMS Query (Returns all apps including drafts, under review, unpublished)
  getAllAppsForAdmin(): AppListing[] {
    return this.apps;
  }

  getAppById(id: string): AppListing | undefined {
    return this.apps.find((a) => a.id === id);
  }

  getAppByPackage(packageName: string): AppListing | undefined {
    return this.apps.find((a) => a.packageName.toLowerCase() === packageName.toLowerCase());
  }

  getReviews(appId: string): Review[] {
    return this.reviews.filter((r) => r.appId === appId);
  }

  addReview(appId: string, userId: string, username: string, rating: number, title: string, body: string): Review {
    const existingIndex = this.reviews.findIndex((r) => r.appId === appId && r.userId === userId);
    const newRev: Review = {
      id: `rev-${Date.now()}`,
      appId,
      userId,
      username,
      rating,
      title,
      body,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      this.reviews[existingIndex] = newRev;
    } else {
      this.reviews.unshift(newRev);
    }

    const appReviews = this.reviews.filter((r) => r.appId === appId);
    const app = this.getAppById(appId);
    if (app) {
      const sum = appReviews.reduce((acc, r) => acc + r.rating, 0);
      app.averageRating = Number((sum / appReviews.length).toFixed(2));
      app.reviewCount = appReviews.length;
    }

    return newRev;
  }

  recordDownload(appId: string, versionId: string): number {
    const app = this.getAppById(appId);
    if (app) {
      app.downloadCount += 1;
    }
    const current = (this.downloadCountMap.get(appId) || 0) + 1;
    this.downloadCountMap.set(appId, current);
    return current;
  }

  toggleFavorite(userId: string, appId: string): boolean {
    const key = `${userId}:${appId}`;
    if (this.favorites.has(key)) {
      this.favorites.delete(key);
      return false;
    } else {
      this.favorites.add(key);
      return true;
    }
  }

  isFavorite(userId: string, appId: string): boolean {
    return this.favorites.has(`${userId}:${appId}`);
  }

  getUserFavorites(userId: string): AppListing[] {
    const prefix = `${userId}:`;
    const appIds = Array.from(this.favorites)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.replace(prefix, ''));
    return this.apps.filter((a) => a.status === 'PUBLISHED' && appIds.includes(a.id));
  }

  // Admin CMS Workflows
  createUploadSession(session: UploadSession) {
    this.uploadSessions.set(session.id, session);
  }

  getUploadSession(id: string): UploadSession | undefined {
    return this.uploadSessions.get(id);
  }

  completeUploadSession(id: string, hash: string) {
    const s = this.uploadSessions.get(id);
    if (s) {
      s.status = 'VERIFIED';
      s.sha256Hash = hash;
    }
  }

  createAppByAdmin(adminId: string, adminEmail: string, data: Partial<AppListing>): AppListing {
    const id = `app-${Date.now()}`;
    const category = this.categories.find((c) => c.id === data.categoryId) || this.categories[0];
    const newApp: AppListing = {
      id,
      developerId: adminId,
      developerName: data.developerName || 'Verified Publisher',
      packageName: data.packageName!,
      name: data.name!,
      tagline: data.tagline || '',
      description: data.description || '',
      iconKey: data.iconKey || '',
      iconUrl: data.iconUrl || '',
      bannerKey: data.bannerKey || '',
      bannerUrl: data.bannerUrl || '',
      categoryId: category.id,
      categoryName: category.name,
      status: 'DRAFT', // Starts as draft until published by admin
      isFeatured: false,
      averageRating: 0.0,
      reviewCount: 0,
      downloadCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      screenshots: data.screenshots || [],
    };
    this.apps.unshift(newApp);
    this.logAudit(adminId, adminEmail, 'CREATE_APP_DRAFT', 'app', id, { packageName: newApp.packageName, name: newApp.name });
    return newApp;
  }

  updateAppByAdmin(appId: string, adminId: string, adminEmail: string, data: Partial<AppListing>): AppListing {
    const app = this.getAppById(appId);
    if (!app) throw new Error('App not found');

    if (data.name) app.name = data.name;
    if (data.tagline !== undefined) app.tagline = data.tagline;
    if (data.description !== undefined) app.description = data.description;
    if (data.developerName !== undefined) app.developerName = data.developerName;
    if (data.iconUrl) app.iconUrl = data.iconUrl;
    if (data.bannerUrl !== undefined) app.bannerUrl = data.bannerUrl;
    if (data.screenshots) app.screenshots = data.screenshots;
    if (data.categoryId) {
      const cat = this.categories.find((c) => c.id === data.categoryId);
      if (cat) {
        app.categoryId = cat.id;
        app.categoryName = cat.name;
      }
    }
    app.updatedAt = new Date().toISOString();

    this.logAudit(adminId, adminEmail, 'UPDATE_APP', 'app', appId, { name: app.name });
    return app;
  }

  createAppVersionByAdmin(appId: string, adminId: string, adminEmail: string, versionData: Partial<AppVersion>): AppVersion {
    const app = this.getAppById(appId);
    if (!app) throw new Error('App not found');

    const id = `ver-${Date.now()}`;
    const newVer: AppVersion = {
      id,
      appId,
      versionCode: versionData.versionCode || 1,
      versionName: versionData.versionName || '1.0.0',
      minSdkVersion: versionData.minSdkVersion || 26,
      targetSdkVersion: versionData.targetSdkVersion || 34,
      fileKey: versionData.fileKey!,
      fileSizeBytes: versionData.fileSizeBytes || 0,
      sha256Hash: versionData.sha256Hash || '',
      signingCertFingerprint: versionData.signingCertFingerprint || '',
      releaseNotes: versionData.releaseNotes || 'Initial release.',
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
      permissions: versionData.permissions || ['android.permission.INTERNET'],
    };

    this.versions.unshift(newVer);
    app.latestVersion = newVer;
    app.updatedAt = new Date().toISOString();

    this.logAudit(adminId, adminEmail, 'UPLOAD_APK_VERSION', 'app_version', id, {
      appId,
      versionCode: newVer.versionCode,
      sha256: newVer.sha256Hash,
    });
    return newVer;
  }

  publishApp(appId: string, adminId: string, adminEmail: string): AppListing {
    const app = this.getAppById(appId);
    if (!app) throw new Error('App not found');
    if (!app.latestVersion) throw new Error('Cannot publish app without an uploaded APK version');

    app.status = 'PUBLISHED';
    app.latestVersion.status = 'PUBLISHED';
    app.latestVersion.publishedAt = new Date().toISOString();
    app.updatedAt = new Date().toISOString();

    this.logAudit(adminId, adminEmail, 'PUBLISH_APP', 'app', appId, {
      name: app.name,
      packageName: app.packageName,
      versionCode: app.latestVersion.versionCode,
    });
    return app;
  }

  unpublishApp(appId: string, adminId: string, adminEmail: string): AppListing {
    const app = this.getAppById(appId);
    if (!app) throw new Error('App not found');

    app.status = 'DRAFT';
    if (app.latestVersion) {
      app.latestVersion.status = 'APPROVED';
    }
    app.updatedAt = new Date().toISOString();

    this.logAudit(adminId, adminEmail, 'UNPUBLISH_APP', 'app', appId, {
      name: app.name,
    });
    return app;
  }

  deleteApp(appId: string, adminId: string, adminEmail: string): boolean {
    const index = this.apps.findIndex((a) => a.id === appId);
    if (index === -1) throw new Error('App not found');
    const [deleted] = this.apps.splice(index, 1);
    this.versions = this.versions.filter((v) => v.appId !== appId);
    this.reviews = this.reviews.filter((r) => r.appId !== appId);

    this.logAudit(adminId, adminEmail, 'DELETE_APP', 'app', appId, {
      name: deleted.name,
      packageName: deleted.packageName,
    });
    return true;
  }

  toggleFeatured(appId: string, adminId: string, adminEmail: string): boolean {
    const app = this.getAppById(appId);
    if (!app) throw new Error('App not found');
    app.isFeatured = !app.isFeatured;
    this.logAudit(adminId, adminEmail, 'TOGGLE_FEATURED', 'app', appId, {
      isFeatured: app.isFeatured,
      name: app.name,
    });
    return app.isFeatured;
  }

  logAudit(actorId: string, actorEmail: string, action: string, entityType: string, entityId: string, details: Record<string, unknown>) {
    this.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actorId,
      actorEmail,
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    });
  }

  getAuditLogs(limit = 50): AuditLog[] {
    return this.auditLogs.slice(0, limit);
  }

  getStorageMetrics(): StorageMetrics {
    let totalApkStorageBytes = 0;
    let apkCount = 0;
    for (const v of this.versions) {
      totalApkStorageBytes += v.fileSizeBytes;
      apkCount++;
    }

    let mediaBytes = 0;
    let mediaCount = 0;
    for (const a of this.apps) {
      mediaCount += a.screenshots.length + (a.iconUrl ? 1 : 0);
      mediaBytes += mediaCount * 500 * 1024;
    }

    const totalStorageGb = (totalApkStorageBytes + mediaBytes) / (1024 * 1024 * 1024);
    const billableGb = Math.max(0, totalStorageGb - 10);
    const estimatedCost = Number((billableGb * 0.015).toFixed(2));

    return {
      totalApkStorageBytes,
      totalMediaStorageBytes: mediaBytes,
      totalApkCount: apkCount,
      totalMediaCount: mediaCount,
      estimatedMonthlyCostUSD: estimatedCost,
      egressCostUSD: 0.0,
    };
  }
}

export const db = new MarketplaceDatabase();
