import { S3CompatibleProvider } from './s3-compatible.js';

/**
 * Backblaze B2 Storage Adapter
 * Adapts Backblaze B2 S3-Compatible API to the generic StorageProvider interface.
 */
export class BackblazeB2Adapter extends S3CompatibleProvider {
  constructor(config = {}) {
    const region = config.region || (config.endpoint?.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i)?.[1]) || 'us-west-004';
    const endpoint = config.endpoint || `https://s3.${region}.backblazeb2.com`;

    super({
      ...config,
      provider: 'b2',
      region,
      endpoint,
      accessKey: config.accessKey || config.keyId || process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID,
      secretKey: config.secretKey || config.applicationKey || process.env.B2_APPLICATION_KEY || process.env.B2_APP_KEY,
      bucket: config.bucket || process.env.B2_BUCKET_NAME || process.env.B2_BUCKET_ID,
    });

    this.providerName = 'backblaze';
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
