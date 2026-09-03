import { S3CompatibleProvider } from './s3-compatible.js';

/**
 * MinIO Storage Adapter
 * Adapts self-hosted or cluster MinIO S3-Compatible API to the generic StorageProvider interface.
 */
export class MinioAdapter extends S3CompatibleProvider {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'minio',
      region: config.region || 'us-east-1',
      endpoint: config.endpoint || process.env.MINIO_ENDPOINT || 'http://127.0.0.1:9000',
      accessKey: config.accessKey || process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY,
      secretKey: config.secretKey || process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY,
      bucket: config.bucket || process.env.MINIO_BUCKET_NAME,
    });

    this.providerName = 'minio';
    this.capabilities = {
      signedUrls: true,
      multipartUpload: true,
      objectListing: true,
      objectMetadata: true,
      versioning: true,
      resumableUploads: false,
    };
  }
}
