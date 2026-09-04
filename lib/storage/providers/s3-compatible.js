import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider } from '../storage-provider.js';
import { generateSecureId } from '../../crypto/encryption.js';

export class S3CompatibleProvider extends StorageProvider {
  constructor(config = {}) {
    super(config);
    const { provider, endpoint, accessKey, secretKey, bucket, region } = config;

    this.provider = (provider || 's3').toLowerCase();
    this.bucket = (bucket || '').trim();

    // Clean and normalize endpoint
    let rawEndpoint = (endpoint || '').trim();
    if (rawEndpoint) {
      if (!rawEndpoint.startsWith('http://') && !rawEndpoint.startsWith('https://')) {
        rawEndpoint = `https://${rawEndpoint}`;
      }
      try {
        const parsed = new URL(rawEndpoint);
        rawEndpoint = `${parsed.protocol}//${parsed.host}`;
      } catch {}
    }

    // Auto-derive region from endpoint or provider defaults if not explicitly set
    let derivedRegion = (region || '').trim();
    if (!derivedRegion && rawEndpoint) {
      const b2Match = rawEndpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
      if (b2Match) derivedRegion = b2Match[1];
      const awsMatch = rawEndpoint.match(/s3[.-]([a-z0-9-]+)\.amazonaws\.com/i);
      if (awsMatch) derivedRegion = awsMatch[1];
      const wasabiMatch = rawEndpoint.match(/s3\.([a-z0-9-]+)\.wasabisys\.com/i);
      if (wasabiMatch) derivedRegion = wasabiMatch[1];
    }

    if (!derivedRegion) {
      derivedRegion = this.provider === 'r2' ? 'auto' : this.provider === 'b2' ? 'us-west-004' : 'us-east-1';
    }

    this.region = derivedRegion;
    this.endpoint = rawEndpoint || this.deriveDefaultEndpoint(this.provider, this.region, config.accountId);

    // Initialize AWS S3 Client
    const clientConfig = {
      region: this.region,
      credentials: {
        accessKeyId: (accessKey || '').trim(),
        secretAccessKey: (secretKey || '').trim(),
      },
      forcePathStyle: this.provider === 'minio' || this.provider === 'custom_s3' || !this.endpoint?.includes('amazonaws.com'),
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

  async upload(key, body, contentType = 'application/octet-stream', metadata = {}) {
    const s3Metadata = {};
    if (metadata && typeof metadata === 'object') {
      for (const [k, v] of Object.entries(metadata)) {
        if (v !== undefined && v !== null) {
          s3Metadata[k.toLowerCase()] = encodeURIComponent(String(v));
        }
      }
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: Object.keys(s3Metadata).length > 0 ? s3Metadata : undefined,
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
    let buffer;
    if (response.Body && typeof response.Body.transformToByteArray === 'function') {
      const byteArray = await response.Body.transformToByteArray();
      buffer = Buffer.from(byteArray);
    } else if (response.Body) {
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      buffer = Buffer.concat(chunks);
    } else {
      throw new Error('Empty response body received from object storage provider');
    }

    const rawMeta = response.Metadata || {};
    const metadata = {};
    for (const [k, v] of Object.entries(rawMeta)) {
      try {
        metadata[k] = decodeURIComponent(v);
      } catch {
        metadata[k] = v;
      }
    }

    return {
      body: buffer,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || buffer.length,
      metadata,
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

  async headObject({ key }) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const res = await this.client.send(command);
      return {
        exists: true,
        sizeBytes: Number(res.ContentLength) || 0,
        contentType: res.ContentType || 'application/octet-stream',
        lastModified: res.LastModified,
        eTag: res.ETag,
        metadata: res.Metadata || {},
      };
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return { exists: false };
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

  async getSignedUploadUrl({ key, expiresInSeconds = 900, contentType = 'application/octet-stream' }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getUsage() {
    try {
      let usedBytes = 0;
      let isTruncated = true;
      let continuationToken = undefined;

      while (isTruncated) {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        });

        const response = await this.client.send(command);
        if (response.Contents) {
          for (const item of response.Contents) {
            usedBytes += Number(item.Size) || 0;
          }
        }
        isTruncated = Boolean(response.IsTruncated);
        continuationToken = response.NextContinuationToken;
        if (!continuationToken) break;
      }

      return {
        usedBytes,
        availableBytes: null,
        totalBytes: null,
      };
    } catch (err) {
      console.warn('[S3 getUsage notice]:', err.message);
      return null;
    }
  }

  async listObjects(prefix = '') {
    try {
      let results = [];
      let isTruncated = true;
      let continuationToken = undefined;

      while (isTruncated) {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix || undefined,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        });

        const response = await this.client.send(command);
        if (response.Contents) {
          for (const item of response.Contents) {
            results.push({
              key: item.Key,
              size: item.Size,
              lastModified: item.LastModified,
              eTag: item.ETag,
            });
          }
        }
        isTruncated = Boolean(response.IsTruncated);
        continuationToken = response.NextContinuationToken;
        if (!continuationToken) break;
      }

      return results;
    } catch (e) {
      console.warn('S3 listObjects notice:', e.message);
      return [];
    }
  }

  async autoApplyCorsPolicy() {
    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag', 'Content-Type', 'Content-Length'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        })
      );
      return true;
    } catch {
      return false;
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
      cors: false,
    };

    const testId = generateSecureId();
    const testKey = `panda-storage-test/${testId}.txt`;
    const testContent = `Panda Storage Test Verification - ${testId} - ${new Date().toISOString()}`;

    try {
      // 1. Direct Live Write Permission & Bucket Access Test
      await this.upload(testKey, Buffer.from(testContent), 'text/plain');
      checks.endpoint = true;
      checks.credentials = true;
      checks.bucket = true;
      checks.write = true;

      // 2. Test Read Permission & Verify Data Integrity
      const downloaded = await this.download(testKey);
      if (downloaded.body.toString() !== testContent) {
        throw new Error('Read verification failed: Content mismatch');
      }
      checks.read = true;

      // 3. Test Delete Permission & Cleanup
      await this.delete(testKey);
      checks.delete = true;

      // 4. Test & Auto-Apply CORS configuration
      let corsConfigured = false;
      try {
        const corsRes = await this.client.send(new GetBucketCorsCommand({ Bucket: this.bucket }));
        if (corsRes.CORSRules && corsRes.CORSRules.length > 0) {
          corsConfigured = true;
          checks.cors = true;
        }
      } catch {
        // Attempt automatic CORS setup via API
        const autoApplied = await this.autoApplyCorsPolicy();
        if (autoApplied) {
          corsConfigured = true;
          checks.cors = true;
        } else {
          checks.cors = false;
        }
      }

      return {
        success: true,
        checks,
        corsConfigured,
        message: corsConfigured
          ? 'Storage connection verified successfully! Live write, read, delete, and CORS rules configured.'
          : 'Storage connection verified! Live write, read, and delete tests passed.',
      };
    } catch (err) {
      try {
        await this.delete(testKey);
      } catch {}

      let friendlyError = err.message || 'Storage connection test failed';
      const name = err.name || '';
      const code = err.code || err.$metadata?.httpStatusCode;

      if (name === 'InvalidAccessKeyId' || friendlyError.includes('InvalidAccessKeyId') || friendlyError.includes('key does not exist')) {
        friendlyError = `Invalid Access Key (keyID): Backblaze did not recognize this Key ID. Please verify: (1) You created a key under 'Application Keys' (not your Account ID or Master Key), (2) The keyID string is complete, and (3) The Endpoint URL matches your bucket's region (e.g. s3.us-west-004.backblazeb2.com).`;
      } else if (name === 'SignatureDoesNotMatch' || friendlyError.includes('SignatureDoesNotMatch') || friendlyError.includes('secret')) {
        friendlyError = 'Invalid Secret Key (applicationKey): The secret access key is incorrect. Note that Backblaze only shows applicationKey once when created.';
      } else if (name === 'NoSuchBucket' || friendlyError.includes('NoSuchBucket') || friendlyError.includes('bucket does not exist')) {
        friendlyError = `Bucket '${this.bucket}' not found. Please verify the exact bucket name in your Backblaze console.`;
      } else if (name === 'AccessDenied' || code === 403 || friendlyError.includes('AccessDenied') || friendlyError.includes('forbidden')) {
        friendlyError = `Access Denied (403): Please ensure your Application Key was created with 'Read and Write' permissions for bucket '${this.bucket}'.`;
      } else if (friendlyError.includes('getaddrinfo') || friendlyError.includes('ENOTFOUND') || friendlyError.includes('EBUSY')) {
        friendlyError = `Could not reach endpoint '${this.endpoint}'. Please verify your Endpoint URL (e.g. s3.us-west-004.backblazeb2.com).`;
      }

      return {
        success: false,
        checks,
        error: friendlyError,
      };
    }
  }
}
