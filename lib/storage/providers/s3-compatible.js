import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider } from '../storage-provider.js';
import { generateSecureId } from '../../crypto/encryption.js';

export class S3CompatibleProvider extends StorageProvider {
  constructor(config = {}) {
    super(config);
    const { provider, endpoint, accessKey, secretKey, bucket, region } = config;

    this.provider = provider || 's3';
    this.bucket = bucket ? bucket.trim() : '';
    this.region = (region ? region.trim() : '') || (provider === 'r2' ? 'auto' : 'us-east-1');
    
    let rawEndpoint = endpoint ? endpoint.trim() : this.deriveDefaultEndpoint(provider, this.region, config.accountId);
    if (rawEndpoint && !rawEndpoint.startsWith('http://') && !rawEndpoint.startsWith('https://')) {
      rawEndpoint = `https://${rawEndpoint}`;
    }
    this.endpoint = rawEndpoint;

    // Initialize AWS S3 Client with custom endpoint
    const clientConfig = {
      region: this.region,
      credentials: {
        accessKeyId: accessKey ? accessKey.trim() : '',
        secretAccessKey: secretKey ? secretKey.trim() : '',
      },
      forcePathStyle: provider === 'minio' || provider === 'custom_s3' || !this.endpoint?.includes('amazonaws.com'),
    };

    if (this.endpoint) {
      clientConfig.endpoint = this.endpoint;
    }

    this.client = new S3Client(clientConfig);
  }

  deriveDefaultEndpoint(provider, region, accountId) {
    if (provider === 'r2' && accountId) {
      return `https://${accountId}.r2.cloudflarestorage.com`;
    }
    if (provider === 'b2') {
      return `https://s3.${region || 'us-west-004'}.backblazeb2.com`;
    }
    if (provider === 'wasabi') {
      return `https://s3.${region || 'us-east-1'}.wasabisys.com`;
    }
    return undefined;
  }

  async upload(key, body, contentType = 'application/octet-stream') {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    const response = await this.client.send(command);
    return {
      key,
      size: body.length,
      eTag: response.ETag,
    };
  }

  async download(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    // Convert stream to Buffer
    const streamToBuffer = async (stream) => {
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks);
    };

    const buffer = await streamToBuffer(response.Body);
    return {
      body: buffer,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || buffer.length,
    };
  }

  async delete(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
    return true;
  }

  async exists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async getSignedUrl(key, expiresInSeconds = 900) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getUsage() {
    try {
      // Calculate used bytes by querying object list if feasible
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1000,
      });

      const response = await this.client.send(command);
      let usedBytes = 0;
      if (response.Contents) {
        for (const item of response.Contents) {
          usedBytes += item.Size || 0;
        }
      }

      // Object storage providers (S3, R2, B2) do not expose an arbitrary quota ceiling unless user configured
      return {
        usedBytes,
        availableBytes: null,
        totalBytes: null,
      };
    } catch {
      return null;
    }
  }

  async testConnection() {
    const checks = {
      endpoint: false,
      credentials: false,
      bucket: false,
      write: false,
      read: false,
      delete: false,
    };

    const testId = generateSecureId();
    const testKey = `panda-storage-test/${testId}.txt`;
    const testContent = `Panda Storage Test Verification - ${testId} - ${new Date().toISOString()}`;

    try {
      // 1. Verify Bucket & Endpoint
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        checks.endpoint = true;
        checks.credentials = true;
        checks.bucket = true;
      } catch (headErr) {
        // Some providers restrict HeadBucket, try listing
        await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: 1 }));
        checks.endpoint = true;
        checks.credentials = true;
        checks.bucket = true;
      }

      // 2. Test Write Permission
      await this.upload(testKey, Buffer.from(testContent), 'text/plain');
      checks.write = true;

      // 3. Test Read Permission & Verify Integrity
      const downloaded = await this.download(testKey);
      if (downloaded.body.toString() !== testContent) {
        throw new Error('Read verification failed: Content mismatch');
      }
      checks.read = true;

      // 4. Test Delete Permission & Cleanup
      await this.delete(testKey);
      checks.delete = true;

      return {
        success: true,
        checks,
      };
    } catch (err) {
      // Attempt cleanup even on failure
      try {
        await this.delete(testKey);
      } catch {}

      return {
        success: false,
        checks,
        error: err.message || 'Storage connection test failed',
      };
    }
  }
}
