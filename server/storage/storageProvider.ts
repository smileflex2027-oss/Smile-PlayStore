export interface StorageProvider {
  name: string;
  createPresignedUploadUrl(
    bucketType: 'private' | 'public',
    key: string,
    mimeType: string,
    expiresInSeconds?: number
  ): Promise<string>;

  createPresignedDownloadUrl(
    bucketType: 'private' | 'public',
    key: string,
    expiresInSeconds?: number
  ): Promise<string>;

  headObject(
    bucketType: 'private' | 'public',
    key: string
  ): Promise<{ contentLength: number; eTag?: string } | null>;

  deleteObject(
    bucketType: 'private' | 'public',
    key: string
  ): Promise<boolean>;

  getPublicUrl(key: string): string;
}
