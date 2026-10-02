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
   * Resolve an appropriate storage connection for upload with automatic capacity rollover.
   */
  static async resolveUploadStorage(userId, preferredStorageId = null, token = null, requiredBytes = 0) {
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

    // Auto selection: rank default connection first, followed by other connections
    const sorted = [...connections].sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      return 0;
    });

    // 1. Pick first connection that has sufficient available space for this upload
    const withCapacity = sorted.find((c) => (Number(c.available_bytes) || 0) >= requiredBytes && (Number(c.available_bytes) || 0) > 0);
    if (withCapacity) {
      return await getStorageConnectionInternal(withCapacity.id, userId, token);
    }

    // 2. If none have enough explicit space, pick the one with the most remaining available bytes
    const sortedBySpace = [...sorted].sort((a, b) => (Number(b.available_bytes) || 0) - (Number(a.available_bytes) || 0));
    const chosen = sortedBySpace[0] || sorted[0];
    return await getStorageConnectionInternal(chosen.id, userId, token);
  }

  /**
   * Upload and encrypt media file, ensuring transactional consistency and multi-storage fallback.
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
    const fileSize = fileBuffer ? fileBuffer.length : 0;
    let storageRecord = await this.resolveUploadStorage(userId, preferredStorageId, token, fileSize);

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

    const randomId = generateSecureId();
    const safeFilename = (originalFilename || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');

    // If a folderId is given, resolve the folder name so files land in the correct
    // cloud bucket prefix (media/{folderName}/...) rather than always at root (media/...).
    let folderPrefix = '';
    if (folderId) {
      try {
        const { listUserFolders } = await import('../db/folders.js');
        const userFolders = await listUserFolders(userId, { token });
        const matchedFolder = userFolders.find((f) => f.id === folderId);
        if (matchedFolder?.name) {
          folderPrefix = `${matchedFolder.name.replace(/[\\/\\\\]/g, '_')}/`;
        }
      } catch {}
    }

    const objectKey = `media/${folderPrefix}${randomId}_${safeFilename}${enableEncryption ? '.enc' : ''}`;
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

    // 1. Upload to Object Storage with metadata (and rollover to secondary storage if primary fails due to quota)
    let uploadSuccess = false;
    let activeRecord = storageRecord;
    let activeProvider = this.getProviderFromRecord(activeRecord);

    try {
      await activeProvider.upload(
        objectKey,
        uploadPayload,
        enableEncryption ? 'application/octet-stream' : mimeType,
        {
          'original-filename': originalFilename,
          'media-type': mediaType,
          'uploaded-at': exactUploadedAt,
        }
      );
      uploadSuccess = true;
    } catch (uploadErr) {
      // If upload failed and user did not strictly force a specific storage, try rolling over to other storage connections
      if (!preferredStorageId || preferredStorageId === 'auto') {
        const allConnections = await listUserStorageConnections(userId, token);
        const alternativeConns = (allConnections || []).filter((c) => c.id !== activeRecord.id);

        for (const alt of alternativeConns) {
          try {
            const altRecord = await getStorageConnectionInternal(alt.id, userId, token);
            const altProvider = this.getProviderFromRecord(altRecord);
            await altProvider.upload(
              objectKey,
              uploadPayload,
              enableEncryption ? 'application/octet-stream' : mimeType,
              {
                'original-filename': originalFilename,
                'media-type': mediaType,
                'uploaded-at': exactUploadedAt,
              }
            );
            activeRecord = altRecord;
            activeProvider = altProvider;
            uploadSuccess = true;
            break;
          } catch (altErr) {
            console.warn(`[storageManager] Fallback upload to ${alt.name} failed:`, altErr.message);
          }
        }
      }

      if (!uploadSuccess) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`);
      }
    }

    // 2. Insert metadata into Database with the winning storage connection
    let mediaRecord = null;
    try {
      mediaRecord = await createMediaFile(userId, {
        id: randomId,
        token,
        storageConnectionId: activeRecord.id,
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
        await activeProvider.delete(objectKey);
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
  static async deleteMedia(userId, mediaId, token = null) {
    const media = await getMediaFileById(mediaId, userId, token);
    if (!media) {
      // Clean up from database just in case ID/key mismatch
      await deleteMediaFile(mediaId, userId);
      return { success: true };
    }

    const connections = await listUserStorageConnections(userId, token).catch(() => []);
    let storageRecord = null;
    if (media.storage_connection_id) {
      storageRecord = await getStorageConnectionInternal(media.storage_connection_id, userId, token);
    }
    if (!storageRecord && connections && connections.length > 0) {
      storageRecord = await getStorageConnectionInternal(connections[0].id, userId, token);
    }

    // Comprehensive list of possible cloud object keys to delete
    const rawKey = media.storage_object_key || media.object_key || '';
    const cleanKey = rawKey.replace(/^media\//, '').replace(/\.enc$/, '');
    const keysToDelete = new Set([
      rawKey,
      media.storage_object_key,
      media.object_key,
      rawKey ? (rawKey.endsWith('.enc') ? rawKey : `${rawKey}.enc`) : null,
      rawKey ? rawKey.replace(/\.enc$/, '') : null,
      cleanKey,
      `media/${cleanKey}`,
      `media/${cleanKey}.enc`,
      `${media.id}_${media.original_filename}`,
      `${media.id}_${media.original_filename}.enc`,
      `users/${userId}/${media.id}/${media.original_filename}`,
      `users/${userId}/${media.id}/${media.original_filename}.enc`,
      `users/${userId}/${media.id}/${cleanKey}`,
      `users/${userId}/${media.id}`,
    ].filter(Boolean));

    // Delete across target storage connection (and all candidate connections)
    const targetConns = storageRecord ? [storageRecord] : connections;
    for (const conn of targetConns) {
      try {
        const fullConn = conn.encrypted_config ? conn : await getStorageConnectionInternal(conn.id, userId, token);
        if (!fullConn) continue;
        const provider = this.getProviderFromRecord(fullConn);

        for (const k of keysToDelete) {
          try {
            if (typeof provider.deleteObject === 'function') {
              await provider.deleteObject({ key: k });
            }
          } catch {}
          try {
            if (typeof provider.delete === 'function') {
              await provider.delete(k);
            }
          } catch {}
        }

        const usage = await provider.getUsage().catch(() => null);
        if (usage) {
          await updateStorageUsage(userId, fullConn.id, usage).catch(() => {});
        }
      } catch (e) {
        console.warn('Storage deletion warning:', e.message);
      }
    }

    await deleteMediaFile(mediaId, userId);
    return { success: true };
  }

  /**
   * Retrieve decrypted binary media buffer for secure streaming or download.
   */
  static async getMediaBinary(userId, mediaId, token = null) {
    console.log('[MEDIA ACCESS] Checking media record:', { mediaId, userId });
    let media = await getMediaFileById(mediaId, userId, token);
    
    // If not found by exact ID, search in user media files list by partial key/filename
    if (!media) {
      try {
        const allUserMedia = await listUserMedia(userId, { token, limit: 1000 });
        media = allUserMedia.find(
          (m) =>
            m.id === mediaId ||
            m.object_key === mediaId ||
            m.object_key?.includes(mediaId) ||
            m.original_filename?.includes(mediaId) ||
            mediaId.includes(m.object_key?.replace(/^media\//, '')?.replace(/\.enc$/, ''))
        );
      } catch {}
    }

    let storageRecord = null;
    const connections = await listUserStorageConnections(userId, token).catch(() => []);
    if (media?.storage_connection_id) {
      storageRecord = await getStorageConnectionInternal(media.storage_connection_id, userId, token);
    }
    if (!storageRecord && connections && connections.length > 0) {
      storageRecord = await getStorageConnectionInternal(connections[0].id, userId, token);
    }

    if (!storageRecord) {
      console.warn('[MEDIA ACCESS] No storage connection found for user:', userId);
      throw new Error('Storage connection not found or not configured for user');
    }

    const provider = this.getProviderFromRecord(storageRecord);
    
    // Build array of potential key variations
    const keyCandidates = [
      media?.storage_object_key,
      media?.object_key,
      media?.object_key?.startsWith('media/') ? media.object_key.replace(/^media\//, '') : (media?.object_key ? `media/${media.object_key}` : null),
      media?.object_key?.endsWith('.enc') ? media.object_key.replace(/\.enc$/, '') : (media?.object_key ? `${media.object_key}.enc` : null),
      `media/${mediaId}`,
      `media/${mediaId}.enc`,
      `${mediaId}.enc`,
      mediaId,
      media ? `users/${userId}/${media.id}/${media.original_filename}` : null,
      media ? `users/${userId}/${media.id}/${media.original_filename}.enc` : null,
      media ? `users/${userId}/${media.id}/${media.object_key}` : null,
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

    // Try other user storage connections if not found on primary
    if (!downloaded || !downloaded.body) {
      for (const altConn of connections) {
        if (altConn.id === storageRecord.id) continue;
        try {
          const altRecord = await getStorageConnectionInternal(altConn.id, userId, token);
          if (!altRecord) continue;
          const altProvider = this.getProviderFromRecord(altRecord);
          for (const keyToTry of keyCandidates) {
            try {
              downloaded = await altProvider.download(keyToTry);
              if (downloaded && downloaded.body) {
                storageRecord = altRecord;
                break;
              }
            } catch {}
          }
          if (downloaded && downloaded.body) break;
        } catch {}
      }
    }

    // Dynamic self-healing fallback: scan bucket to match object
    if (!downloaded || !downloaded.body) {
      try {
        const [objectsMedia, objectsRoot] = await Promise.all([
          provider.listObjects('media/').catch(() => []),
          provider.listObjects('').catch(() => []),
        ]);
        const allObjects = [...objectsMedia, ...objectsRoot];
        for (const obj of allObjects) {
          if (!obj.key || obj.key.endsWith('/')) continue;
          if (
            obj.key === mediaId ||
            obj.key.includes(mediaId) ||
            mediaId.includes(obj.key.replace(/^media\//, '')?.replace(/\.enc$/, ''))
          ) {
            try {
              downloaded = await provider.download(obj.key);
              if (downloaded && downloaded.body) {
                if (!media) {
                  const cleanName = obj.key.replace(/^media\//, '');
                  const isEnc = cleanName.endsWith('.enc');
                  media = await createMediaFile(userId, {
                    id: mediaId,
                    token,
                    storageConnectionId: storageRecord.id,
                    objectKey: obj.key,
                    originalFilename: isEnc ? `Photo_${cleanName.replace(/\.enc$/, '').slice(0, 8)}.jpg` : cleanName,
                    mimeType: isEnc ? 'image/jpeg' : 'application/octet-stream',
                    fileSize: obj.size || downloaded.body.length,
                    mediaType: isEnc ? 'photo' : 'other',
                    encrypted: isEnc,
                  }).catch(() => null);
                }
                break;
              }
            } catch {}
          }
        }
      } catch {}
    }

    if (!downloaded || !downloaded.body) {
      throw new Error(`Media object could not be retrieved from storage: ${lastError?.message || 'Not found'}`);
    }

    let finalBuffer = downloaded.body;

    // If encrypted, decrypt in server memory
    const isEncrypted = media ? Boolean(media.encrypted || media.encryption_iv || media.object_key?.endsWith('.enc')) : true;
    if (isEncrypted) {
      let iv = media?.encryption_iv || null;
      let authTag = media?.encryption_auth_tag || null;
      if (!iv && media?.encryption_metadata) {
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
    let detectedMime = media?.mime_type;
    if (finalBuffer && finalBuffer.length >= 8) {
      if (finalBuffer[0] === 0xff && finalBuffer[1] === 0xd8 && finalBuffer[2] === 0xff) {
        detectedMime = 'image/jpeg';
      } else if (finalBuffer[0] === 0x89 && finalBuffer[1] === 0x50 && finalBuffer[2] === 0x4e && finalBuffer[3] === 0x47) {
        detectedMime = 'image/png';
      } else if (finalBuffer[0] === 0x47 && finalBuffer[1] === 0x49 && finalBuffer[2] === 0x46) {
        detectedMime = 'image/gif';
      } else if (finalBuffer[0] === 0x25 && finalBuffer[1] === 0x50 && finalBuffer[2] === 0x44 && finalBuffer[3] === 0x46) {
        detectedMime = 'application/pdf';
      } else if (finalBuffer[0] === 0x52 && finalBuffer[1] === 0x49 && finalBuffer[2] === 0x46 && finalBuffer[3] === 0x46) {
        detectedMime = 'image/webp';
      } else if (
        finalBuffer.toString('utf8', 4, 8) === 'ftyp' ||
        finalBuffer.toString('utf8', 0, 4) === 'ftyp' ||
        (finalBuffer.length > 12 && finalBuffer.toString('utf8', 4, 12).includes('ftyp'))
      ) {
        const brand = finalBuffer.length > 12 ? finalBuffer.toString('utf8', 8, 12).toLowerCase() : '';
        detectedMime = (brand.includes('qt') || brand.includes('moov')) ? 'video/quicktime' : 'video/mp4';
      } else if (finalBuffer[0] === 0x1a && finalBuffer[1] === 0x45 && finalBuffer[2] === 0xdf && finalBuffer[3] === 0xa3) {
        detectedMime = 'video/webm';
      } else if (
        finalBuffer[0] === 0x00 &&
        finalBuffer[1] === 0x00 &&
        finalBuffer[2] === 0x00 &&
        (finalBuffer[3] === 0x14 || finalBuffer[3] === 0x18 || finalBuffer[3] === 0x1c || finalBuffer[3] === 0x20)
      ) {
        detectedMime = 'video/mp4';
      }
    }

    if (!detectedMime) {
      detectedMime = media?.mime_type || 'application/octet-stream';
    }

    // If binary is a video but database categorized it as photo, dynamically correct DB record
    if (detectedMime && detectedMime.startsWith('video/') && media?.id && media?.media_type !== 'video') {
      try {
        const { query } = await import('../db/index.js');
        await query(
          `UPDATE media_files SET media_type = 'video', mime_type = $1 WHERE id = $2`,
          [detectedMime, media.id]
        );
      } catch {}
    }

    return {
      buffer: finalBuffer,
      mimeType: detectedMime,
      filename: media?.original_filename || media?.filename || 'media_file',
      size: finalBuffer ? finalBuffer.length : 0,
    };
  }

  /**
   * Fast parallel auto-discovery of files present in connected cloud storage buckets and register them in DB.
   */
  static async syncStorageMedia(userId, token = null) {
    if (!userId) return [];
    try {
      const connections = await listUserStorageConnections(userId, token);
      if (!connections || connections.length === 0) return [];

      const existingMedia = await listUserMedia(userId, { token, limit: 2000 });
      const existingKeys = new Set(existingMedia.map((m) => m.object_key));
      const existingIds = new Set(existingMedia.map((m) => m.id));
      const newlyDiscovered = [];

      // Process all cloud storage connections concurrently in parallel
      await Promise.all(
        connections.map(async (conn) => {
          try {
            const storageRecord = await getStorageConnectionInternal(conn.id, userId, token);
            if (!storageRecord) return;

            const provider = this.getProviderFromRecord(storageRecord);
            if (typeof provider.listObjects !== 'function') return;

            // Single listObjects call per bucket (lists all objects recursively)
            const allObjects = await provider.listObjects('').catch(() => []);
            if (!Array.isArray(allObjects) || allObjects.length === 0) {
              return;
            }

            const currentBucketKeys = new Set();
            const currentBucketIds = new Set();
            let totalBucketBytes = 0;
            const validObjects = [];

            for (const o of allObjects) {
              if (
                o.key &&
                !o.key.endsWith('/.keep') &&
                !o.key.endsWith('.keep') &&
                !o.key.endsWith('/') &&
                (Number(o.size) > 0 || o.size === undefined)
              ) {
                currentBucketKeys.add(o.key);
                const baseName = o.key.split('/').pop() || o.key;
                const uuidMatch = baseName.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                if (uuidMatch) currentBucketIds.add(uuidMatch[0]);

                totalBucketBytes += Number(o.size) || 0;
                validObjects.push(o);
              }
            }

            // Discover new objects not yet in DB
            const itemsToCreate = [];
            const seenKeys = new Set();
            let allFolders = [];
            try {
              const { listUserFolders } = await import('../db/folders.js');
              allFolders = await listUserFolders(userId, { token }).catch(() => []);
            } catch {}

            for (const obj of validObjects) {
              const cleanKey = obj.key.replace(/^media\//, '');
              const parts = cleanKey.split('/');
              const fileBaseName = parts[parts.length - 1] || cleanKey;
              const uuidMatch = fileBaseName.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
              const fileId = uuidMatch ? uuidMatch[0] : generateSecureId();

              if (seenKeys.has(obj.key) || existingKeys.has(obj.key) || (fileId && existingIds.has(fileId))) continue;
              seenKeys.add(obj.key);
              if (fileId) existingIds.add(fileId);

              // Detect folder if key has prefix like media/FolderName/file.jpg
              let discoveredFolderId = null;
              if (parts.length > 1) {
                const folderName = parts[0].toLowerCase().trim();
                const matchedFld = (allFolders || []).find((f) => f.name && f.name.toLowerCase().trim() === folderName);
                if (matchedFld) {
                  discoveredFolderId = matchedFld.id;
                }
              }

              const isEnc = fileBaseName.endsWith('.enc');
              let realFilename = fileBaseName.replace(/\.enc$/, '');
              if (uuidMatch && realFilename.startsWith(uuidMatch[0] + '_')) {
                realFilename = realFilename.slice(uuidMatch[0].length + 1);
              } else if (uuidMatch && realFilename.startsWith(uuidMatch[0])) {
                realFilename = `Photo_${realFilename.slice(0, 8)}.jpg`;
              }

              let mimeType = isEnc ? 'image/jpeg' : 'application/octet-stream';
              let mediaType = isEnc ? 'photo' : 'other';

              const lowerName = (realFilename || fileBaseName).toLowerCase();
              if (lowerName.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|heic|avif)$/i)) {
                const ext = lowerName.split('.').pop().toLowerCase();
                mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                mediaType = 'photo';
              } else if (lowerName.match(/\.(mp4|webm|mov|mkv|avi|m4v|3gp|flv|wmv)$/i)) {
                const ext = lowerName.split('.').pop().toLowerCase();
                mimeType = `video/${ext === 'mov' ? 'quicktime' : ext}`;
                mediaType = 'video';
              } else if (lowerName.endsWith('.pdf')) {
                mimeType = 'application/pdf';
                mediaType = 'pdf';
              }

              itemsToCreate.push({
                id: fileId,
                token,
                storageConnectionId: conn.id,
                folderId: discoveredFolderId,
                objectKey: obj.key,
                originalFilename: realFilename || fileBaseName,
                mimeType,
                fileSize: obj.size || 0,
                mediaType,
                encrypted: isEnc,
                encryptionMetadata: null,
                uploadedAt: obj.lastModified ? new Date(obj.lastModified).toISOString() : new Date().toISOString(),
              });
            }

            // 3. Fast parallel insertion of new items
            if (itemsToCreate.length > 0) {
              const { createMediaFile } = await import('../db/media.js');
              const results = await Promise.allSettled(
                itemsToCreate.map((item) => createMediaFile(userId, item))
              );
              for (const r of results) {
                if (r.status === 'fulfilled' && r.value) {
                  newlyDiscovered.push(r.value);
                }
              }
            }

            // 4. Update real-time storage usage in DB
            await updateStorageUsage(userId, conn.id, { usedBytes: totalBucketBytes }).catch(() => {});
          } catch (connErr) {
            console.warn('[StorageManager] syncStorageMedia connection notice:', connErr.message);
          }
        })
      );

      return newlyDiscovered;
    } catch (e) {
      console.warn('syncStorageMedia notice:', e.message);
      return [];
    }
  }
}

