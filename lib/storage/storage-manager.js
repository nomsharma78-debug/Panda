import { S3CompatibleProvider } from './providers/s3-compatible.js';
import { LocalVaultStorageProvider } from './providers/local-vault.js';
import { decryptData, encryptData, encryptBuffer, decryptBuffer, generateSecureId } from '../crypto/encryption.js';
import { getStorageConnectionInternal, listUserStorageConnections, updateStorageUsage } from '../db/storage.js';
import { createMediaFile, getMediaFileById, deleteMediaFile } from '../db/media.js';
import { validateStorageEndpoint } from '../security/ssrf.js';

/**
 * Storage Manager coordinates provider instances, credential decryption, and operations.
 */
export class StorageManager {
  /**
   * Instantiate a provider from a stored database record.
   * Credentials decrypted only in server memory.
   */
  static getProviderFromRecord(storageRecord) {
    if (!storageRecord) throw new Error('Storage record is missing');

    const providerType = storageRecord.provider.toLowerCase();

    if (providerType === 'local') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Local filesystem storage is disabled in production. Please use an external object storage provider (R2, B2, S3).');
      }
      return new LocalVaultStorageProvider({
        baseDir: process.env.LOCAL_STORAGE_DIR,
      });
    }

    // Decrypt credentials
    const decryptedConfig = decryptData(storageRecord.encrypted_config, null, true);
    return new S3CompatibleProvider({
      ...decryptedConfig,
      provider: providerType,
    });
  }

  /**
   * Test candidate storage credentials before saving.
   * Performs SSRF check and live write/read/delete tests.
   */
  static async testCandidateConfig(config) {
    const providerType = (config.provider || 's3').toLowerCase();

    if (providerType === 'local') {
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          checks: { endpoint: false },
          error: 'Local sandbox storage cannot be used in production.',
        };
      }
      const provider = new LocalVaultStorageProvider();
      return await provider.testConnection();
    }

    // SSRF validation if an endpoint is provided
    if (config.endpoint) {
      const ssrfCheck = await validateStorageEndpoint(config.endpoint);
      if (!ssrfCheck.valid) {
        return {
          success: false,
          checks: { endpoint: false },
          error: ssrfCheck.error || 'Invalid storage endpoint URL',
        };
      }
    }

    const provider = new S3CompatibleProvider({
      provider: providerType,
      endpoint: config.endpoint,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      bucket: config.bucket,
      region: config.region,
      accountId: config.accountId,
    });

    return await provider.testConnection();
  }

  /**
   * Resolve an appropriate storage connection for upload.
   */
  static async resolveUploadStorage(userId, preferredStorageId = null) {
    const connections = await listUserStorageConnections(userId);
    if (!connections || connections.length === 0) {
      return null;
    }

    if (preferredStorageId && preferredStorageId !== 'auto') {
      const selected = connections.find((c) => c.id === preferredStorageId);
      if (!selected) {
        throw new Error('Specified storage connection was not found or unauthorized');
      }
      return await getStorageConnectionInternal(selected.id, userId);
    }

    // Auto selection: prefer default or first with available capacity
    const defaultConn = connections.find((c) => c.is_default);
    const chosen = defaultConn || connections[0];
    return await getStorageConnectionInternal(chosen.id, userId);
  }

  /**
   * Upload and encrypt media file, ensuring transactional consistency.
   */
  static async uploadMedia(userId, {
    fileBuffer,
    originalFilename,
    mimeType,
    mediaType,
    preferredStorageId = null,
    folderId = null,
    enableEncryption = true,
  }) {
    let storageRecord = await this.resolveUploadStorage(userId, preferredStorageId);

    // If user has zero connections, create an initial default storage connection in development only
    if (!storageRecord) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('No storage connection available. Please connect your Cloudflare R2, Backblaze B2, or Amazon S3 storage provider in Storage Hub before uploading.');
      }
      const { createStorageConnection } = await import('../db/storage.js');
      const defaultRecord = await createStorageConnection(userId, {
        provider: 'local',
        name: 'Panda Vault Storage',
        encryptedConfig: encryptData({ provider: 'local' }),
        isDefault: true,
      });
      storageRecord = await getStorageConnectionInternal(defaultRecord.id, userId);
    }

    const provider = this.getProviderFromRecord(storageRecord);
    const randomId = generateSecureId();
    const objectKey = `media/${randomId}.enc`;
    const exactUploadedAt = new Date().toISOString();

    let uploadPayload = fileBuffer;
    let encryptionMeta = null;

    if (enableEncryption) {
      const { encryptedBuffer, iv, authTag } = encryptBuffer(fileBuffer);
      uploadPayload = encryptedBuffer;
      encryptionMeta = {
        algorithm: 'AES-256-GCM',
        iv,
        authTag,
        originalSize: fileBuffer.length,
      };
    }

    // 1. Upload to Object Storage
    try {
      await provider.upload(objectKey, uploadPayload, enableEncryption ? 'application/octet-stream' : mimeType);
    } catch (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    // 2. Insert metadata into Database
    let mediaRecord = null;
    try {
      mediaRecord = await createMediaFile(userId, {
        storageConnectionId: storageRecord.id,
        folderId: folderId || null,
        objectKey,
        originalFilename,
        mimeType,
        fileSize: fileBuffer.length,
        mediaType,
        encrypted: enableEncryption,
        encryptionMetadata: encryptionMeta,
        uploadedAt: exactUploadedAt,
      });
    } catch (dbErr) {
      // Rollback: Clean up uploaded storage object if DB insertion fails!
      console.error('Database insertion failed during upload. Cleaning up orphaned object:', objectKey);
      try {
        await provider.delete(objectKey);
      } catch (cleanupErr) {
        console.error('Failed to cleanup orphaned object:', cleanupErr.message);
      }
      throw new Error(`Database error saving media metadata: ${dbErr.message}`);
    }

    // 3. Update storage usage
    try {
      const usage = await provider.getUsage();
      if (usage) {
        await updateStorageUsage(userId, storageRecord.id, usage);
      }
    } catch {}

    return mediaRecord;
  }

  /**
   * Delete media file and cleanup from storage.
   */
  static async deleteMedia(userId, mediaId) {
    const media = await getMediaFileById(mediaId, userId);
    if (!media) {
      return { success: false, error: 'Media not found or unauthorized' };
    }

    if (media.storage_connection_id) {
      const storageRecord = await getStorageConnectionInternal(media.storage_connection_id, userId);
      if (storageRecord) {
        try {
          const provider = this.getProviderFromRecord(storageRecord);
          await provider.delete(media.object_key);
          // Refresh usage
          const usage = await provider.getUsage();
          if (usage) {
            await updateStorageUsage(userId, storageRecord.id, usage);
          }
        } catch (e) {
          console.warn('Storage deletion warning:', e.message);
        }
      }
    }

    await deleteMediaFile(mediaId, userId);
    return { success: true };
  }

  /**
   * Retrieve decrypted binary media buffer for secure streaming or download.
   */
  static async getMediaBinary(userId, mediaId) {
    const media = await getMediaFileById(mediaId, userId);
    if (!media) throw new Error('Media file not found or unauthorized');

    if (!media.storage_connection_id) {
      throw new Error('No storage connection associated with this media file');
    }

    const storageRecord = await getStorageConnectionInternal(media.storage_connection_id, userId);
    if (!storageRecord) throw new Error('Storage connection not found or unauthorized');

    const provider = this.getProviderFromRecord(storageRecord);
    const downloaded = await provider.download(media.object_key);

    let finalBuffer = downloaded.body;

    // If encrypted, decrypt in server memory
    if (media.encrypted && media.encryption_metadata) {
      const meta = typeof media.encryption_metadata === 'string'
        ? JSON.parse(media.encryption_metadata)
        : media.encryption_metadata;

      finalBuffer = decryptBuffer(downloaded.body, meta.iv, meta.authTag);
    }

    return {
      buffer: finalBuffer,
      mimeType: media.mime_type,
      filename: media.original_filename,
      size: finalBuffer.length,
    };
  }
}
