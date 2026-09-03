import { S3CompatibleProvider } from './s3-compatible.js';

/**
 * AWS S3 Storage Adapter
 * Adapts Amazon S3 to the generic StorageProvider interface.
 */
export class AwsS3Adapter extends S3CompatibleProvider {
  constructor(config = {}) {
    const region = config.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const endpoint = config.endpoint || (region === 'us-east-1' ? 'https://s3.us-east-1.amazonaws.com' : `https://s3.${region}.amazonaws.com`);

    super({
      ...config,
      provider: 's3',
      region,
      endpoint: config.endpoint || undefined, // S3Client derives correctly
      accessKey: config.accessKey || config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretKey: config.secretKey || config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      bucket: config.bucket || process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME,
    });

    this.providerName = 'aws-s3';
    this.capabilities = {
      signedUrls: true,
      multipartUpload: true,
      objectListing: true,
      objectMetadata: true,
      versioning: true,
      resumableUploads: true,
    };
  }
}
