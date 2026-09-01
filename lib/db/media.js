import { query } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import {
  isVaultSupabaseConfigured,
  getSupabaseServerVaultClient,
  isSupabaseConfigured,
  getSupabaseServerClient,
} from '../auth/supabase.js';

function getSupabaseMediaClient() {
  if (isVaultSupabaseConfigured()) {
    return getSupabaseServerVaultClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseServerClient();
  }
  return null;
}

/**
 * Record a new uploaded media item in the database.
 */
export async function createMediaFile(userId, {
  storageConnectionId,
  folderId = null,
  objectKey,
  originalFilename,
  mimeType,
  fileSize,
  mediaType,
  encrypted = true,
  encryptionMetadata = null,
  uploadedAt = null,
}) {
  if (!userId || !objectKey || !originalFilename) {
    throw new Error('User ID, object key, and original filename are required');
  }

  const id = generateSecureId();
  const now = new Date().toISOString();
  const exactUploadedAt = uploadedAt || now;

  // 1. Supabase REST
  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      await supabase.from('media_files').insert([
        {
          id,
          user_id: userId,
          storage_connection_id: storageConnectionId || null,
          folder_id: folderId || null,
          object_key: objectKey,
          original_filename: originalFilename,
          mime_type: mimeType || 'application/octet-stream',
          file_size: fileSize || 0,
          media_type: mediaType || 'other',
          encrypted,
          encryption_metadata: encryptionMetadata || null,
          uploaded_at: exactUploadedAt,
          created_at: now,
          updated_at: now,
        },
      ]);

      return {
        id,
        user_id: userId,
        storage_connection_id: storageConnectionId,
        folder_id: folderId,
        object_key: objectKey,
        original_filename: originalFilename,
        mime_type: mimeType,
        file_size: fileSize,
        media_type: mediaType,
        encrypted,
        uploaded_at: exactUploadedAt,
        created_at: now,
        updated_at: now,
      };
    } catch (sbErr) {
      console.warn('Supabase media_files write notice:', sbErr.message);
    }
  }

  // 2. PostgreSQL / Local DB
  await query(
    `INSERT INTO media_files (
      id, user_id, storage_connection_id, folder_id, object_key, original_filename,
      mime_type, file_size, media_type, encrypted, encryption_metadata,
      uploaded_at, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      userId,
      storageConnectionId || null,
      folderId || null,
      objectKey,
      originalFilename,
      mimeType || 'application/octet-stream',
      fileSize || 0,
      mediaType || 'other',
      encrypted,
      encryptionMetadata ? JSON.stringify(encryptionMetadata) : null,
      exactUploadedAt,
      now,
      now,
    ]
  );

  return {
    id,
    user_id: userId,
    storage_connection_id: storageConnectionId,
    folder_id: folderId,
    object_key: objectKey,
    original_filename: originalFilename,
    mime_type: mimeType,
    file_size: fileSize,
    media_type: mediaType,
    encrypted,
    uploaded_at: exactUploadedAt,
    created_at: now,
    updated_at: now,
  };
}

/**
 * List unified media files for a user, sorted chronologically with newest first.
 */
export async function listUserMedia(userId, { mediaType = 'all', folderId = undefined, search = '', limit = 200, offset = 0 } = {}) {
  if (!userId) return [];

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      let queryBuilder = supabase
        .from('media_files')
        .select(`
          id, user_id, storage_connection_id, folder_id, object_key, original_filename,
          mime_type, file_size, media_type, encrypted, encryption_metadata,
          uploaded_at, created_at, updated_at,
          storage_connections ( name, provider )
        `)
        .eq('user_id', userId);

      if (mediaType && mediaType !== 'all') {
        queryBuilder = queryBuilder.eq('media_type', mediaType);
      }

      if (folderId !== undefined) {
        if (folderId === null) {
          queryBuilder = queryBuilder.is('folder_id', null);
        } else {
          queryBuilder = queryBuilder.eq('folder_id', folderId);
        }
      }

      if (search && search.trim()) {
        queryBuilder = queryBuilder.ilike('original_filename', `%${search.trim()}%`);
      }

      queryBuilder = queryBuilder
        .order('uploaded_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error } = await queryBuilder;

      if (!error && data) {
        return data.map((item) => {
          const sc = Array.isArray(item.storage_connections) ? item.storage_connections[0] : item.storage_connections;
          return {
            ...item,
            storage_name: sc?.name || null,
            storage_provider: sc?.provider || null,
          };
        });
      }
    } catch {}
  }

  let sql = `
    SELECT mf.id, mf.user_id, mf.storage_connection_id, mf.folder_id, mf.object_key, mf.original_filename,
           mf.mime_type, mf.file_size, mf.media_type, mf.encrypted, mf.encryption_metadata,
           mf.uploaded_at, mf.created_at, mf.updated_at,
           sc.name as storage_name, sc.provider as storage_provider
    FROM media_files mf
    LEFT JOIN storage_connections sc ON mf.storage_connection_id = sc.id AND mf.user_id = sc.user_id
    WHERE mf.user_id = $1
  `;
  const params = [userId];
  let pIdx = 2;

  if (mediaType && mediaType !== 'all') {
    sql += ` AND mf.media_type = $${pIdx}`;
    params.push(mediaType);
    pIdx++;
  }

  if (folderId !== undefined) {
    if (folderId === null) {
      sql += ` AND mf.folder_id IS NULL`;
    } else {
      sql += ` AND mf.folder_id = $${pIdx}`;
      params.push(folderId);
      pIdx++;
    }
  }

  if (search && search.trim()) {
    sql += ` AND mf.original_filename ILIKE $${pIdx}`;
    params.push(`%${search.trim()}%`);
    pIdx++;
  }

  sql += ` ORDER BY mf.uploaded_at DESC, mf.created_at DESC`;

  if (limit) {
    sql += ` LIMIT $${pIdx}`;
    params.push(limit);
    pIdx++;
  }

  const { rows } = await query(sql, params);
  return rows;
}

/**
 * Get single media file with strict user ownership verification.
 */
export async function getMediaFileById(id, userId) {
  if (!id || !userId) return null;

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('media_files')
        .select(`
          id, user_id, storage_connection_id, folder_id, object_key, original_filename,
          mime_type, file_size, media_type, encrypted, encryption_metadata,
          uploaded_at, created_at, updated_at,
          storage_connections ( name, provider )
        `)
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        const sc = Array.isArray(data.storage_connections) ? data.storage_connections[0] : data.storage_connections;
        return {
          ...data,
          storage_name: sc?.name || null,
          storage_provider: sc?.provider || null,
        };
      }
    } catch {}
  }

  const { rows } = await query(
    `SELECT mf.id, mf.user_id, mf.storage_connection_id, mf.folder_id, mf.object_key, mf.original_filename,
            mf.mime_type, mf.file_size, mf.media_type, mf.encrypted, mf.encryption_metadata,
            mf.uploaded_at, mf.created_at, mf.updated_at,
            sc.name as storage_name, sc.provider as storage_provider
     FROM media_files mf
     LEFT JOIN storage_connections sc ON mf.storage_connection_id = sc.id
     WHERE mf.id = $1 AND mf.user_id = $2
     LIMIT 1`,
    [id, userId]
  );

  return rows[0] || null;
}

/**
 * Move media files into a folder (or unassign from folder if folderId is null).
 */
export async function moveMediaToFolder(userId, fileIds, folderId = null) {
  if (!userId || !fileIds || !fileIds.length) return false;

  const now = new Date().toISOString();
  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      await supabase
        .from('media_files')
        .update({ folder_id: folderId, updated_at: now })
        .in('id', fileIds)
        .eq('user_id', userId);
      return true;
    } catch {}
  }

  await query(
    `UPDATE media_files SET folder_id = $1, updated_at = $2 WHERE id = ANY($3) AND user_id = $4`,
    [folderId, now, fileIds, userId]
  );
  return true;
}

/**
 * Delete media file record from the database.
 */
export async function deleteMediaFileRecord(id, userId) {
  if (!id || !userId) return false;

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      await supabase.from('media_files').delete().eq('id', id).eq('user_id', userId);
      return true;
    } catch {}
  }

  const result = await query(`DELETE FROM media_files WHERE id = $1 AND user_id = $2`, [id, userId]);
  return result.rowCount > 0;
}

/**
 * Batch delete multiple media files by ID.
 */
export async function batchDeleteMediaRecords(ids, userId) {
  if (!ids || !ids.length || !userId) return 0;

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      await supabase.from('media_files').delete().in('id', ids).eq('user_id', userId);
      return ids.length;
    } catch {}
  }

  const result = await query(`DELETE FROM media_files WHERE id = ANY($1) AND user_id = $2`, [ids, userId]);
  return result.rowCount;
}

/**
 * Calculate total media file count and storage bytes per user.
 */
export async function getMediaUsageStats(userId) {
  if (!userId) return { count: 0, totalBytes: 0, byType: {} };

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('media_files')
        .select('media_type, file_size')
        .eq('user_id', userId);

      if (!error && data) {
        let totalBytes = 0;
        const byType = {};
        for (const item of data) {
          const sz = Number(item.file_size) || 0;
          totalBytes += sz;
          byType[item.media_type] = (byType[item.media_type] || 0) + sz;
        }
        return { count: data.length, totalBytes, byType };
      }
    } catch {}
  }

  const { rows } = await query(
    `SELECT media_type, COUNT(*) as count, SUM(file_size) as total_bytes
     FROM media_files
     WHERE user_id = $1
     GROUP BY media_type`,
    [userId]
  );

  let totalBytes = 0;
  let count = 0;
  const byType = {};

  for (const row of rows) {
    const bytes = Number(row.total_bytes) || 0;
    const c = Number(row.count) || 0;
    totalBytes += bytes;
    count += c;
    byType[row.media_type] = bytes;
  }

  return { count, totalBytes, byType };
}

/**
 * Get recent media files for dashboard preview.
 */
export async function getRecentMedia(userId, limit = 5) {
  return listUserMedia(userId, { limit });
}

export const getMediaStats = getMediaUsageStats;
export const deleteMediaFile = deleteMediaFileRecord;

export async function updateMediaStorageConnection(mediaId, userId, newStorageId) {
  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      await supabase
        .from('media_files')
        .update({ storage_connection_id: newStorageId, updated_at: new Date().toISOString() })
        .eq('id', mediaId)
        .eq('user_id', userId);
      return true;
    } catch {}
  }

  await query(
    `UPDATE media_files SET storage_connection_id = $1, updated_at = $2 WHERE id = $3 AND user_id = $4`,
    [newStorageId, new Date().toISOString(), mediaId, userId]
  );
  return true;
}

