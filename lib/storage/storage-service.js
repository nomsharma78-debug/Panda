import { ProviderFactory } from './provider-factory.js';
import {
  getUserStorageMetrics,
  reserveUserStorageAtomic,
  releaseUserStorageReservation,
  finalizeUserStorageUpload,
  decreaseUserStorage,
  reconcileUserStorageUsage,
} from '../db/storage.js';
import {
  createMediaFile,
  getMediaFileById,
  listUserMedia,
  deleteMediaFile,
} from '../db/media.js';
import { encryptBuffer, decryptBuffer, generateSecureId } from '../crypto/encryption.js';
import { sanitizeFilename } from '../validation/schemas.js';
import { logAuditEvent } from '../security/audit.js';

/**
 * Universal Multi-Cloud Storage Service
 * Central business layer for provider-agnostic file management, atomic quota enforcement,
 * and live cloud storage reconciliation.
 */
export class StorageService {
  /**
   * Get authoritative user storage usage metrics.
   * @param {string} userId
   * @returns {Promise<{ usedBytes: number, reservedBytes: number, limitBytes: number, remainingBytes: number, percentage: number, usedGB: number, limitGB: number, remainingGB: number, lastRecalculatedAt: string | null }>}
   */
  static async getUserStorageUsage(userId) {
    if (!userId) throw new Error('User ID is required');
    return await getUserStorageMetrics(userId);
  }

  /**
   * Secure multi-cloud file upload with atomic quota reservation.
   * @param {string} userId
   * @param {Object} params
   * @param {Buffer} params.fileBuffer - Raw binary file data
   * @param {string} params.filename - Original uploaded file name
   * @param {string} [params.contentType] - MIME content type
   * @param {string} [params.storageConnectionId] - Specific cloud storage target
   * @param {string} [params.folderId] - Organizing folder ID
   * @param {boolean} [params.encrypted=true] - Whether to encrypt at rest with AES-256-GCM
   * @param {string} [params.token] - Optional user auth token
   * @param {string} [params.ipAddress] - Client IP for audit logging
   * @returns {Promise<Object>} Created file record with normalized URLs
   */
  static async uploadUserFile(userId, {
    fileBuffer,
    filename,
    contentType = 'application/octet-stream',
    storageConnectionId = null,
    folderId = null,
    encrypted = true,
    token = null,
    ipAddress = null,
  }) {
    if (!userId) throw new Error('Authentication required');
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('Valid file buffer is required');
    }

    const cleanFilename = sanitizeFilename(filename || 'uploaded-file');
    const fileSize = fileBuffer.length;

    // 1. Atomic Storage Quota Reservation
    const reservation = await reserveUserStorageAtomic(userId, fileSize);
    if (!reservation.allowed) {
      const err = new Error('Storage limit exceeded.');
      err.code = 'STORAGE_LIMIT_EXCEEDED';
      err.statusCode = 413;
      err.data = {
        usedBytes: reservation.usedBytes,
        reservedBytes: reservation.reservedBytes,
        limitBytes: reservation.limitBytes,
        remainingBytes: reservation.remainingBytes,
        requestedBytes: fileSize,
      };
      await logAuditEvent({
        userId,
        action: 'STORAGE_LIMIT_REACHED',
        status: 'FAILURE',
        ipAddress,
        metadata: { requestedBytes: fileSize, limitBytes: reservation.limitBytes },
      });
      throw err;
    }

    const fileId = generateSecureId();
    const storageObjectKey = `users/${userId}/${fileId}/${cleanFilename}${encrypted ? '.enc' : ''}`;
    let resolved = null;
    let uploadSucceeded = false;

    try {
      // 2. Resolve Multi-Cloud Provider Adapter
      resolved = await ProviderFactory.resolveProviderForUser(userId, storageConnectionId, token);
      const { provider, connectionId, providerName, bucket } = resolved;

      // 3. Encrypt payload with AES-256-GCM if enabled
      let payloadToUpload = fileBuffer;
      let encryptionMetadata = null;

      if (encrypted) {
        const encResult = encryptBuffer(fileBuffer);
        payloadToUpload = encResult.encryptedBuffer;
        encryptionMetadata = {
          algorithm: 'AES-256-GCM',
          iv: encResult.iv,
          authTag: encResult.authTag,
          version: '1.0',
        };
      }

      // 4. Stream Object to Cloud Storage Provider
      const uploadResult = await provider.uploadObject({
        key: storageObjectKey,
        body: payloadToUpload,
        contentType: encrypted ? 'application/octet-stream' : contentType,
        metadata: {
          originalFilename: cleanFilename,
          userId,
          fileId,
        },
      });

      uploadSucceeded = true;

      // Determine media type
      let mediaType = 'other';
      if (contentType.startsWith('image/')) mediaType = 'photo';
      else if (contentType.startsWith('video/')) mediaType = 'video';
      else if (contentType.startsWith('audio/')) mediaType = 'audio';
      else if (contentType === 'application/pdf') mediaType = 'pdf';
      else if (contentType.includes('document') || contentType.includes('text')) mediaType = 'document';

      // 5. Persist File Metadata to Database
      const fileRecord = await createMediaFile(userId, {
        id: fileId,
        token,
        storageConnectionId: connectionId,
        folderId,
        storageProvider: providerName,
        storageObjectId: uploadResult.objectId || fileId,
        storageObjectKey,
        storageBucket: bucket,
        storageVersionId: uploadResult.versionId || null,
        status: 'ACTIVE',
        objectKey: storageObjectKey,
        originalFilename: cleanFilename,
        mimeType: contentType,
        fileSize,
        mediaType,
        encrypted,
        encryptionMetadata,
      });

      // 6. Commit Storage Reservation into Used Bytes
      await finalizeUserStorageUpload(userId, fileSize);

      await logAuditEvent({
        userId,
        action: 'USER_UPLOAD_SUCCESS',
        status: 'SUCCESS',
        ipAddress,
        metadata: {
          fileId,
          filename: cleanFilename,
          fileSize,
          provider: providerName,
          objectKey: storageObjectKey,
        },
      });

      return fileRecord;
    } catch (err) {
      // 7. Rollback Compensation on Upload or DB Failure
      await releaseUserStorageReservation(userId, fileSize);

      if (uploadSucceeded && resolved?.provider) {
        try {
          await resolved.provider.deleteObject({ key: storageObjectKey });
        } catch (cleanupErr) {
          console.warn('[StorageService] Cleanup failed on rollback:', cleanupErr.message);
        }
      }

      await logAuditEvent({
        userId,
        action: 'USER_UPLOAD_FAILED',
        status: 'FAILURE',
        ipAddress,
        metadata: { filename: cleanFilename, fileSize, error: err.message },
      });

      throw err;
    }
  }

  /**
   * Delete user file with verified ownership across cloud provider and database.
   * @param {string} userId
   * @param {string} fileId
   * @param {Object} [opts]
   * @returns {Promise<{ success: boolean, fileId: string }>}
   */
  static async deleteUserFile(userId, fileId, { token = null, ipAddress = null } = {}) {
    if (!userId || !fileId) throw new Error('User ID and File ID are required');

    const file = await getMediaFileById(fileId, userId, token);
    if (!file || file.user_id !== userId) {
      const err = new Error('File not found or ownership validation failed.');
      err.code = 'FILE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const objectKey = file.storage_object_key || file.object_key;
    const fileSize = Number(file.file_size || file.size_bytes) || 0;

    // 1. Resolve Provider Adapter
    const resolved = await ProviderFactory.resolveProviderForUser(userId, file.storage_connection_id, token);
    const { provider, providerName } = resolved;

    // 2. Delete Object from Cloud Storage First
    try {
      await provider.deleteObject({ key: objectKey });
    } catch (cloudErr) {
      console.warn(`[StorageService] Cloud deletion notice for ${objectKey}:`, cloudErr.message);
    }

    // 3. Mark/Delete Database Record
    await deleteMediaFile(file.id, userId);

    // 4. Decrement Used Storage
    await decreaseUserStorage(userId, fileSize);

    await logAuditEvent({
      userId,
      action: 'USER_FILE_DELETED',
      status: 'SUCCESS',
      ipAddress,
      metadata: { fileId, objectKey, fileSize, provider: providerName },
    });

    return { success: true, fileId: file.id };
  }

  /**
   * Retrieve secure temporary signed download URL or proxy stream.
   * @param {string} userId
   * @param {string} fileId
   * @param {number} [expiresInSeconds=900]
   * @param {string} [token]
   * @returns {Promise<{ url: string, signed: boolean, filename: string, mimeType: string, fileSize: number }>}
   */
  static async getSignedDownloadUrl(userId, fileId, expiresInSeconds = 900, token = null) {
    if (!userId || !fileId) throw new Error('User ID and File ID are required');

    const file = await getMediaFileById(fileId, userId, token);
    if (!file || file.user_id !== userId) {
      const err = new Error('File not found or ownership validation failed.');
      err.code = 'FILE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const objectKey = file.storage_object_key || file.object_key;
    const resolved = await ProviderFactory.resolveProviderForUser(userId, file.storage_connection_id, token);
    const { provider } = resolved;

    // If file is unencrypted and provider supports signed URLs, generate direct signed URL
    if (!file.encrypted && provider.capabilities?.signedUrls) {
      try {
        const signedUrl = await provider.getSignedDownloadUrl({ key: objectKey, expiresInSeconds });
        return {
          url: signedUrl,
          signed: true,
          filename: file.original_filename,
          mimeType: file.mime_type,
          fileSize: Number(file.file_size || file.size_bytes) || 0,
        };
      } catch {}
    }

    // Fall back to server-side authenticated decryption & streaming endpoint
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return {
      url: `/api/media/${file.id}/download${tokenParam}`,
      signed: false,
      filename: file.original_filename,
      mimeType: file.mime_type,
      fileSize: Number(file.file_size || file.size_bytes) || 0,
    };
  }

  /**
   * Reconcile actual cloud object storage against database file records.
   * @param {string} userId
   * @param {string} [token]
   * @returns {Promise<{ dbTotalBytes: number, cloudTotalBytes: number, discrepancyBytes: number, fileCount: number, reconciledUsage: Object }>}
   */
  static async recalculateUserStorage(userId, token = null) {
    if (!userId) throw new Error('User ID is required');

    const resolved = await ProviderFactory.resolveProviderForUser(userId, null, token);
    const { provider, providerName } = resolved;

    // 1. Scan actual cloud objects
    let cloudObjects = [];
    try {
      cloudObjects = await provider.listObjects({ prefix: `users/${userId}/` });
    } catch (e) {
      console.warn('[StorageService] Cloud scan notice:', e.message);
    }

    const cloudTotalBytes = cloudObjects.reduce((sum, obj) => sum + (Number(obj.size || obj.sizeBytes) || 0), 0);

    // 2. Query database active files
    const dbFiles = await listUserMedia(userId, { token, limit: 5000 });
    const dbTotalBytes = dbFiles.reduce((sum, f) => sum + (Number(f.file_size || f.size_bytes) || 0), 0);

    // 3. Source of truth priority: Actual Cloud Objects > Database Files
    const authoritativeUsedBytes = cloudTotalBytes > 0 ? cloudTotalBytes : dbTotalBytes;
    const discrepancyBytes = Math.abs(cloudTotalBytes - dbTotalBytes);

    // 4. Update cached user_storage record
    await reconcileUserStorageUsage(userId, authoritativeUsedBytes);
    const updatedMetrics = await getUserStorageMetrics(userId);

    if (discrepancyBytes > 0 && cloudTotalBytes > 0 && dbTotalBytes > 0) {
      await logAuditEvent({
        userId,
        action: 'STORAGE_MISMATCH_DETECTED',
        status: 'SUCCESS',
        metadata: {
          cloudTotalBytes,
          dbTotalBytes,
          discrepancyBytes,
          provider: providerName,
        },
      });
    }

    await logAuditEvent({
      userId,
      action: 'STORAGE_RECALCULATED',
      status: 'SUCCESS',
      metadata: {
        usedBytes: authoritativeUsedBytes,
        fileCount: dbFiles.length,
        provider: providerName,
      },
    });

    return {
      dbTotalBytes,
      cloudTotalBytes,
      discrepancyBytes,
      fileCount: dbFiles.length,
      provider: providerName,
      reconciledUsage: updatedMetrics,
    };
  }
}
