import { S3CompatibleProvider } from './s3-compatible.js';

/**
 * Cloudflare R2 Storage Adapter
 * Adapts Cloudflare R2 S3-Compatible API to the generic StorageProvider interface.
 */
export class CloudflareR2Adapter extends S3CompatibleProvider {
  constructor(config = {}) {
    const accountId = config.accountId || process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const endpoint = config.endpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

    super({
      ...config,
      provider: 'r2',
      region: config.region || 'auto',
      endpoint,
      accessKey: config.accessKey || config.accessKeyId || process.env.R2_ACCESS_KEY_ID,
      secretKey: config.secretKey || config.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY,
      bucket: config.bucket || process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET,
      accountId,
    });

    this.providerName = 'cloudflare-r2';
    this.capabilities = {
      signedUrls: true,
      multipartUpload: true,
      objectListing: true,
      objectMetadata: true,
      versioning: false,
      resumableUploads: false,
    };
  }
}
