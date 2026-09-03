import { ProviderFactory } from './provider-factory.js';
import { S3CompatibleProvider } from './providers/s3-compatible.js';
import { LocalVaultStorageProvider } from './providers/local-vault.js';
import { decryptData, encryptData, encryptBuffer, decryptBuffer, generateSecureId } from '../crypto/encryption.js';
import { getStorageConnectionInternal, listUserStorageConnections, updateStorageUsage } from '../db/storage.js';
import { createMediaFile, getMediaFileById, deleteMediaFile, listUserMedia } from '../db/media.js';
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
    return ProviderFactory.createFromRecord(storageRecord).provider;
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

    const provider = ProviderFactory.getProvider(providerType, {
      ...config,
      provider: providerType,
    });

    return await provider.testConnection();
  }

  /**
   * Resolve an appropriate storage connection for upload.
   */
  static async resolveUploadStorage(userId, preferredStorageId = null, token = null) {
    const connections = await listUserStorageConnections(userId, token);
    if (!connections || connections.length === 0) {
      return null;
    }

    if (preferredStorageId && preferredStorageId !== 'auto') {
      const selected = connections.find((c) => c.id === preferredStorageId);
      if (!selected) {
        throw new Error('Specified storage connection was not found or unauthorized');
      }
      return await getStorageConnectionInternal(selected.id, userId, token);
    }

    // Auto selection: prefer default or first with available capacity
    const defaultConn = connections.find((c) => c.is_default);
    const chosen = defaultConn || connections[0];
    return await getStorageConnectionInternal(chosen.id, userId, token);
  }

  /**
   * Upload and encrypt media file, ensuring transactional consistency.
   */
  static async uploadMedia(userId, {
    token = null,
    fileBuffer,
    originalFilename,
    mimeType,
    mediaType,
    preferredStorageId = null,
    folderId = null,
    enableEncryption = true,
  }) {
    let storageRecord = await this.resolveUploadStorage(userId, preferredStorageId, token);

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
      storageRecord = await getStorageConnectionInternal(defaultRecord.id, userId, token);
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
        id: randomId,
        token,
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
  static async getMediaBinary(userId, mediaId, token = null) {
    const media = await getMediaFileById(mediaId, userId, token);
    if (!media) throw new Error('Media file not found or unauthorized');

    let storageRecord = null;
    if (media.storage_connection_id) {
      storageRecord = await getStorageConnectionInternal(media.storage_connection_id, userId, token);
    }
    if (!storageRecord) {
      const connections = await listUserStorageConnections(userId, token);
      if (connections && connections.length > 0) {
        storageRecord = await getStorageConnectionInternal(connections[0].id, userId, token);
      }
    }
    if (!storageRecord) throw new Error('Storage connection not found or unauthorized');

    const provider = this.getProviderFromRecord(storageRecord);
    
    // Build array of potential key variations
    const keyCandidates = [
      media.storage_object_key,
      media.object_key,
      media.object_key?.startsWith('media/') ? media.object_key.replace(/^media\//, '') : `media/${media.object_key}`,
      media.object_key?.endsWith('.enc') ? media.object_key.replace(/\.enc$/, '') : `${media.object_key}.enc`,
      `users/${userId}/${media.id}/${media.original_filename}`,
      `users/${userId}/${media.id}/${media.original_filename}.enc`,
      `users/${userId}/${media.id}/${media.object_key}`,
    ].filter(Boolean);

    let downloaded = null;
    let lastError = null;

    for (const keyToTry of keyCandidates) {
      try {
        downloaded = await provider.download(keyToTry);
        if (downloaded && downloaded.body) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!downloaded || !downloaded.body) {
      throw new Error(`Media object could not be retrieved from storage: ${lastError?.message || 'Not found'}`);
    }

    let finalBuffer = downloaded.body;

    // If encrypted, decrypt in server memory
    if (media.encrypted) {
      let iv = null;
      let authTag = null;
      if (media.encryption_metadata) {
        try {
          const meta = typeof media.encryption_metadata === 'string'
            ? JSON.parse(media.encryption_metadata)
            : media.encryption_metadata;
          iv = meta?.iv || null;
          authTag = meta?.authTag || null;
        } catch {}
      }
      try {
        finalBuffer = decryptBuffer(downloaded.body, iv, authTag);
      } catch (decErr) {
        console.warn('[Crypto] Decryption fallback notice:', decErr.message);
        finalBuffer = downloaded.body;
      }
    }

    // Auto-detect MIME type from decrypted binary magic bytes
    let detectedMime = media.mime_type || 'image/jpeg';
    if (finalBuffer && finalBuffer.length >= 4) {
      if (finalBuffer[0] === 0xff && finalBuffer[1] === 0xd8 && finalBuffer[2] === 0xff) {
        detectedMime = 'image/jpeg';
      } else if (finalBuffer[0] === 0x89 && finalBuffer[1] === 0x50 && finalBuffer[2] === 0x4e && finalBuffer[3] === 0x47) {
        detectedMime = 'image/png';
      } else if (finalBuffer[0] === 0x47 && finalBuffer[1] === 0x49 && finalBuffer[2] === 0x46) {
        detectedMime = 'image/gif';
      } else if (finalBuffer[0] === 0x25 && finalBuffer[1] === 0x50 && finalBuffer[2] === 0x44 && finalBuffer[3] === 0x46) {
        detectedMime = 'application/pdf';
      }
    }

    return {
      buffer: finalBuffer,
      mimeType: detectedMime,
      filename: media.original_filename,
      size: finalBuffer.length,
    };
  }

  /**
   * Auto-discover files present in connected cloud storage buckets and register them in DB.
   */
  static async syncStorageMedia(userId, token = null) {
    if (!userId) return [];
    try {
      const connections = await listUserStorageConnections(userId, token);
      if (!connections || connections.length === 0) return [];

      const existingMedia = await listUserMedia(userId, { token, limit: 2000 });
      const existingKeys = new Set(existingMedia.map((m) => m.object_key));
      const newlyDiscovered = [];

      for (const conn of connections) {
        try {
          const storageRecord = await getStorageConnectionInternal(conn.id, userId, token);
          if (!storageRecord) continue;

          const provider = this.getProviderFromRecord(storageRecord);
          if (typeof provider.listObjects === 'function') {
            const [objectsMedia, objectsRoot] = await Promise.all([
              provider.listObjects('media/').catch(() => []),
              provider.listObjects('').catch(() => []),
            ]);

            const allObjects = [...objectsMedia, ...objectsRoot];
            const seenKeys = new Set();
            let totalBucketBytes = 0;

            for (const obj of allObjects) {
              if (!obj.key || obj.key.endsWith('/')) continue;
              totalBucketBytes += Number(obj.size) || 0;

              if (seenKeys.has(obj.key) || existingKeys.has(obj.key)) continue;
              seenKeys.add(obj.key);

              const cleanName = obj.key.replace(/^media\//, '') || 'Cloud File';
              const fileId = generateSecureId();
              const isEnc = cleanName.endsWith('.enc');

              let mimeType = isEnc ? 'image/jpeg' : 'application/octet-stream';
              let mediaType = isEnc ? 'photo' : 'other';

              const lowerName = cleanName.toLowerCase();
              if (lowerName.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|heic|avif)$/i)) {
                const ext = lowerName.split('.').pop().toLowerCase();
                mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                mediaType = 'photo';
              } else if (lowerName.match(/\.(mp4|webm|mov|mkv|avi)$/i)) {
                const ext = lowerName.split('.').pop().toLowerCase();
                mimeType = `video/${ext === 'mov' ? 'quicktime' : ext}`;
                mediaType = 'video';
              } else if (lowerName.endsWith('.pdf')) {
                mimeType = 'application/pdf';
                mediaType = 'pdf';
              }

              try {
                const record = await createMediaFile(userId, {
                  id: fileId,
                  token,
                  storageConnectionId: conn.id,
                  objectKey: obj.key,
                  originalFilename: isEnc ? `Encrypted Photo (${cleanName.slice(0, 8)})` : cleanName,
                  mimeType,
                  fileSize: obj.size || 0,
                  mediaType,
                  encrypted: isEnc,
                  encryptionMetadata: null,
                  uploadedAt: obj.lastModified ? new Date(obj.lastModified).toISOString() : new Date().toISOString(),
                });
                existingKeys.add(obj.key);
                newlyDiscovered.push(record);
              } catch (insErr) {
                console.warn('[StorageManager] syncStorageMedia insert notice:', insErr.message);
              }
            }

            // Update real-time storage usage in DB
            if (totalBucketBytes > 0) {
              await updateStorageUsage(userId, conn.id, { usedBytes: totalBucketBytes }).catch(() => {});
            }
          }
        } catch (connErr) {
          console.warn('[StorageManager] syncStorageMedia connection notice:', connErr.message);
        }
      }
      return newlyDiscovered;
    } catch (e) {
      console.warn('syncStorageMedia notice:', e.message);
      return [];
    }
  }
}

