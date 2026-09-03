import { S3CompatibleProvider } from './s3-compatible.js';

/**
 * Wasabi Storage Adapter
 * Adapts Wasabi Hot Cloud Storage to the generic StorageProvider interface.
 */
export class WasabiAdapter extends S3CompatibleProvider {
  constructor(config = {}) {
    const region = config.region || (config.endpoint?.match(/s3\.([a-z0-9-]+)\.wasabisys\.com/i)?.[1]) || 'us-east-1';
    const endpoint = config.endpoint || `https://s3.${region}.wasabisys.com`;

    super({
      ...config,
      provider: 'wasabi',
      region,
      endpoint,
      accessKey: config.accessKey || process.env.WASABI_ACCESS_KEY_ID,
      secretKey: config.secretKey || process.env.WASABI_SECRET_ACCESS_KEY,
      bucket: config.bucket || process.env.WASABI_BUCKET_NAME,
    });

    this.providerName = 'wasabi';
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
