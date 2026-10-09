import { AppListing, Category, StorageMetrics, AuditLog, Review } from '../types';

const API_BASE = '/api/v1';

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const headers = new Headers(options?.headers || {});
  headers.set('Content-Type', 'application/json');

  if (options?.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error?.message || `HTTP error ${res.status}`);
  }

  return json.data as T;
}

export const api = {
  // Public
  getHealth: () => apiRequest<any>('/health'),

  login: (email: string, password = 'password123') =>
    apiRequest<{
      user: { id: string; email: string; username: string; role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' };
      accessToken: string;
      refreshToken: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getCategories: () => apiRequest<Category[]>('/categories'),

  // Public Marketplace (returns only published apps)
  getApps: (params?: { category?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    return apiRequest<AppListing[]>(`/apps?${query.toString()}`);
  },

  getApp: (id: string, token?: string) =>
    apiRequest<AppListing>(`/apps/${id}`, { token }),

  getDownloadUrl: (appId: string, token?: string) =>
    apiRequest<{
      downloadUrl: string;
      fileName: string;
      fileSizeBytes: number;
      expectedSha256: string;
      signingCertFingerprint: string;
      expiresInSeconds: number;
    }>(`/apps/${appId}/download-url`, { method: 'POST', token }),

  postReview: (appId: string, data: { rating: number; title: string; body: string }, token?: string) =>
    apiRequest<Review>(`/apps/${appId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  toggleFavorite: (appId: string, token?: string) =>
    apiRequest<{ isFavorite: boolean }>(`/apps/${appId}/favorite`, {
      method: 'POST',
      token,
    }),

  getFavorites: (token?: string) =>
    apiRequest<AppListing[]>('/users/me/favorites', { token }),

  checkUpdates: (packagesParam: string) =>
    apiRequest<{ updates: any[] }>(`/updates/check?packages=${encodeURIComponent(packagesParam)}`),

  // Admin CMS Operations (strictly protected by backend token)
  adminGetApps: (token: string) =>
    apiRequest<AppListing[]>('/admin/apps', { token }),

  adminCreateApp: (data: {
    name: string;
    packageName: string;
    tagline: string;
    description: string;
    categoryId: string;
    developerName?: string;
    iconUrl?: string;
    bannerUrl?: string;
  }, token: string) =>
    apiRequest<AppListing>('/admin/apps', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  adminUpdateApp: (id: string, data: Partial<AppListing>, token: string) =>
    apiRequest<AppListing>(`/admin/apps/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      token,
    }),

  adminUploadVersion: (appId: string, data: {
    versionCode: number;
    versionName: string;
    releaseNotes: string;
    fileKey: string;
    fileSizeBytes: number;
    sha256Hash: string;
    signingCertFingerprint: string;
    permissions?: string[];
  }, token: string) =>
    apiRequest<any>(`/admin/apps/${appId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  adminPublishApp: (id: string, token: string) =>
    apiRequest<AppListing>(`/admin/apps/${id}/publish`, {
      method: 'POST',
      token,
    }),

  adminUnpublishApp: (id: string, token: string) =>
    apiRequest<AppListing>(`/admin/apps/${id}/unpublish`, {
      method: 'POST',
      token,
    }),

  adminDeleteApp: (id: string, token: string) =>
    apiRequest<{ deleted: boolean }>(`/admin/apps/${id}`, {
      method: 'DELETE',
      token,
    }),

  adminToggleFeatured: (id: string, token: string) =>
    apiRequest<{ isFeatured: boolean }>(`/admin/apps/${id}/toggle-featured`, {
      method: 'POST',
      token,
    }),

  adminInitiateUpload: (data: {
    targetType: 'APK' | 'ICON' | 'SCREENSHOT' | 'BANNER';
    appId?: string;
    expectedBytes: number;
    expectedMime: string;
    filename: string;
  }, token: string) =>
    apiRequest<{
      uploadSessionId: string;
      presignedUploadUrl: string;
      storageKey: string;
      expiresInSeconds: number;
    }>('/uploads/initiate', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  adminCompleteUpload: (sessionId: string, data: { sha256?: string; targetPackageName?: string }, token: string) =>
    apiRequest<{
      verified: boolean;
      storageKey: string;
      fileSizeBytes: number;
      sha256: string;
      apkMetadata?: any;
    }>(`/uploads/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  adminGetMetrics: (token: string) =>
    apiRequest<StorageMetrics>('/admin/metrics', { token }),

  adminGetAuditLogs: (token: string) =>
    apiRequest<AuditLog[]>('/admin/audit-logs', { token }),
};
