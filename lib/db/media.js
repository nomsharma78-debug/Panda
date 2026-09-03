import { query } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import {
  isVaultSupabaseConfigured,
  getSupabaseVaultAdminClient,
  isSupabaseConfigured,
  getSupabaseAdminClient,
  getSupabaseServerVaultClient,
  getSupabaseServerClient,
} from '../auth/supabase.js';

function getSupabaseMediaClient(token = null) {
  if (token) {
    return getSupabaseServerVaultClient(token) || getSupabaseServerClient(token);
  }
  if (isVaultSupabaseConfigured()) {
    return getSupabaseVaultAdminClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseAdminClient();
  }
  return null;
}

/**
 * Record a new uploaded media item in the database.
 */
export async function createMediaFile(userId, {
  id: customId,
  token = null,
  storageConnectionId = null,
  folderId = null,
  storageProvider = 's3',
  storageObjectId = null,
  storageObjectKey = null,
  storageBucket = null,
  storageVersionId = null,
  status = 'ACTIVE',
  objectKey,
  originalFilename,
  mimeType,
  fileSize,
  mediaType,
  encrypted = true,
  encryptionMetadata = null,
  uploadedAt = null,
}) {
  const finalObjectKey = storageObjectKey || objectKey;
  if (!userId || !finalObjectKey || !originalFilename) {
    throw new Error('User ID, object key, and original filename are required');
  }

  const id = customId || generateSecureId();
  const now = new Date().toISOString();
  const exactUploadedAt = uploadedAt || now;

  // Ensure user reference exists in database (to satisfy foreign key if present)
  try {
    const supabase = getSupabaseMediaClient(token);
    if (supabase) {
      await supabase.from('users').upsert(
        { id: userId, email: `${userId}@vault.user`, updated_at: now },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    }
  } catch {}

  try {
    await query(
      `INSERT INTO users (id, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `${userId}@vault.user`, now, now]
    );
  } catch {}

  // 1. Supabase Client (authenticated with user token or admin)
  const supabase = getSupabaseMediaClient(token);
  let supabaseInserted = false;
  if (supabase) {
    try {
      const payload = {
        id,
        user_id: userId,
        storage_connection_id: storageConnectionId || null,
        folder_id: folderId || null,
        storage_provider: storageProvider || 's3',
        storage_object_id: storageObjectId || null,
        storage_object_key: finalObjectKey,
        storage_bucket: storageBucket || null,
        storage_version_id: storageVersionId || null,
        status: status || 'ACTIVE',
        object_key: finalObjectKey,
        original_filename: originalFilename,
        mime_type: mimeType || 'application/octet-stream',
        file_size: fileSize || 0,
        media_type: mediaType || 'other',
        encrypted,
        encryption_metadata: encryptionMetadata || null,
        uploaded_at: exactUploadedAt,
        created_at: now,
        updated_at: now,
      };

      const { error: insErr } = await supabase.from('media_files').insert([payload]);
      if (insErr) {
        if (insErr.message?.includes('foreign key') || insErr.message?.includes('storage_connections')) {
          payload.storage_connection_id = null;
          payload.folder_id = null;
          const { error: retryErr } = await supabase.from('media_files').insert([payload]);
          if (retryErr) throw new Error(retryErr.message);
        } else {
          throw new Error(insErr.message);
        }
      }
      supabaseInserted = true;
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase media_files write notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  // 2. PostgreSQL / Local DB
  try {
    await query(
      `INSERT INTO media_files (
        id, user_id, storage_connection_id, folder_id, storage_provider,
        storage_object_id, storage_object_key, storage_bucket, storage_version_id,
        status, object_key, original_filename, mime_type, file_size, media_type,
        encrypted, encryption_metadata, uploaded_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        storage_connection_id = EXCLUDED.storage_connection_id,
        folder_id = EXCLUDED.folder_id,
        storage_provider = EXCLUDED.storage_provider,
        storage_object_id = EXCLUDED.storage_object_id,
        storage_object_key = EXCLUDED.storage_object_key,
        storage_bucket = EXCLUDED.storage_bucket,
        storage_version_id = EXCLUDED.storage_version_id,
        status = EXCLUDED.status,
        object_key = EXCLUDED.object_key,
        original_filename = EXCLUDED.original_filename,
        mime_type = EXCLUDED.mime_type,
        file_size = EXCLUDED.file_size,
        media_type = EXCLUDED.media_type,
        encrypted = EXCLUDED.encrypted,
        encryption_metadata = EXCLUDED.encryption_metadata,
        uploaded_at = EXCLUDED.uploaded_at,
        updated_at = EXCLUDED.updated_at`,
      [
        id,
        userId,
        storageConnectionId || null,
        folderId || null,
        storageProvider || 's3',
        storageObjectId || null,
        finalObjectKey,
        storageBucket || null,
        storageVersionId || null,
        status || 'ACTIVE',
        finalObjectKey,
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
  } catch (pgErr) {
    if (!supabaseInserted) {
      console.error('[Panda DB] Media insert failed in database:', pgErr.message);
      throw new Error(`Failed to save media record: ${pgErr.message}`);
    }
  }

  return {
    id,
    user_id: userId,
    storage_connection_id: storageConnectionId,
    storage_provider: storageProvider,
    storage_object_id: storageObjectId,
    storage_object_key: finalObjectKey,
    storage_bucket: storageBucket,
    status: status || 'ACTIVE',
    folder_id: folderId,
    object_key: finalObjectKey,
    original_filename: originalFilename,
    original_file_name: originalFilename,
    mime_type: mimeType,
    content_type: mimeType,
    file_size: fileSize,
    size_bytes: fileSize,
    media_type: mediaType,
    encrypted,
    url: `/api/media/${id}/access`,
    previewUrl: `/api/media/${id}/access`,
    downloadUrl: `/api/media/${id}/download`,
    uploaded_at: exactUploadedAt,
    created_at: now,
    updated_at: now,
  };
}

function formatMediaItem(item, storageMap = {}) {
  const sc = storageMap[item.storage_connection_id];
  return {
    ...item,
    url: `/api/media/${item.id}/access`,
    previewUrl: `/api/media/${item.id}/access`,
    downloadUrl: `/api/media/${item.id}/download`,
    storage_name: item.storage_name || sc?.name || null,
    storage_provider: item.storage_provider || sc?.provider || null,
  };
}

/**
 * List unified media files for a user, sorted chronologically with newest first.
 */
export async function listUserMedia(userId, { token = null, mediaType = 'all', folderId = undefined, search = '', limit = 500, offset = 0 } = {}) {
  if (!userId) return [];

  const supabase = getSupabaseMediaClient(token);
  if (supabase) {
    try {
      let queryBuilder = supabase
        .from('media_files')
        .select(`
          id, user_id, storage_connection_id, folder_id, object_key, original_filename,
          mime_type, file_size, media_type, encrypted, encryption_metadata,
          uploaded_at, created_at, updated_at
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

      if (error) throw new Error(error.message);

      if (data && data.length > 0) {
        let storageMap = {};
        try {
          const { data: conns } = await supabase
            .from('storage_connections')
            .select('id, name, provider')
            .eq('user_id', userId);
          if (conns) {
            conns.forEach((c) => {
              storageMap[c.id] = c;
            });
          }
        } catch {}

        return data.map((item) => formatMediaItem(item, storageMap));
      }
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase listUserMedia notice, falling back to PostgreSQL:', sbErr.message);
    }
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

  try {
    const { rows } = await query(sql, params);
    return (rows || []).map((item) => formatMediaItem(item));
  } catch (pgErr) {
    console.warn('[Panda DB] PostgreSQL listUserMedia notice:', pgErr.message);
    return [];
  }
}

/**
 * Get single media file with strict user ownership verification.
 */
export async function getMediaFileById(id, userId, token = null) {
  if (!id || !userId) return null;

  const supabase = getSupabaseMediaClient(token);
  if (supabase) {
    try {
      // 1. Direct ID query with limit(1)
      const { data: byId, error: errId } = await supabase
        .from('media_files')
        .select(`
          id, user_id, storage_connection_id, folder_id, object_key, original_filename,
          mime_type, file_size, media_type, encrypted, encryption_metadata,
          uploaded_at, created_at, updated_at
        `)
        .eq('id', id)
        .eq('user_id', userId)
        .limit(1);

      if (!errId && byId && byId.length > 0) return byId[0];

      // 2. Object key query with limit(1)
      const { data: byKey, error: errKey } = await supabase
        .from('media_files')
        .select(`
          id, user_id, storage_connection_id, folder_id, object_key, original_filename,
          mime_type, file_size, media_type, encrypted, encryption_metadata,
          uploaded_at, created_at, updated_at
        `)
        .eq('object_key', id)
        .eq('user_id', userId)
        .limit(1);

      if (!errKey && byKey && byKey.length > 0) return byKey[0];
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase getMediaFileById notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  try {
    const { rows } = await query(
      `SELECT mf.id, mf.user_id, mf.storage_connection_id, mf.folder_id, mf.object_key, mf.original_filename,
              mf.mime_type, mf.file_size, mf.media_type, mf.encrypted, mf.encryption_metadata,
              mf.uploaded_at, mf.created_at, mf.updated_at,
              sc.name as storage_name, sc.provider as storage_provider
       FROM media_files mf
       LEFT JOIN storage_connections sc ON mf.storage_connection_id = sc.id AND mf.user_id = sc.user_id
       WHERE (mf.id = $1 OR mf.object_key = $1) AND mf.user_id = $2
       LIMIT 1`,
      [id, userId]
    );

    return (rows && rows[0]) || null;
  } catch {
    return null;
  }
}

/**
 * Delete a media file record from the database.
 */
export async function deleteMediaFile(id, userId) {
  if (!id || !userId) return false;

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('media_files')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) return true;
      throw new Error(error.message);
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase deleteMediaFile notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  const result = await query(
    `DELETE FROM media_files WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  return result && result.rowCount > 0;
}

/**
 * Move a media file to a different folder.
 */
export async function moveMediaFile(id, userId, targetFolderId) {
  if (!id || !userId) return false;
  const now = new Date().toISOString();

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('media_files')
        .update({
          folder_id: targetFolderId || null,
          updated_at: now,
        })
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) return true;
      throw new Error(error.message);
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase moveMediaFile notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  const result = await query(
    `UPDATE media_files
     SET folder_id = $1, updated_at = $2
     WHERE id = $3 AND user_id = $4`,
    [targetFolderId || null, now, id, userId]
  );

  return result && result.rowCount > 0;
}

/**
 * Count total media files and aggregate size for a user.
 */
export async function countUserMedia(userId) {
  if (!userId) return { count: 0, totalBytes: 0 };

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('media_files')
        .select('file_size')
        .eq('user_id', userId);

      if (!error && data) {
        const count = data.length;
        const totalBytes = data.reduce((acc, row) => acc + (Number(row.file_size) || 0), 0);
        return { count, totalBytes };
      }
    } catch {}
  }

  const { rows } = await query(
    `SELECT COUNT(id) as count, COALESCE(SUM(file_size), 0) as total_bytes
     FROM media_files
     WHERE user_id = $1`,
    [userId]
  );

  return {
    count: parseInt(rows[0]?.count || '0', 10),
    totalBytes: parseInt(rows[0]?.total_bytes || '0', 10),
  };
}

/**
 * Get media breakdown stats for dashboard.
 */
export async function getMediaStats(userId) {
  if (!userId) return { images: 0, videos: 0, audio: 0, documents: 0, total: 0, totalBytes: 0 };

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('media_files')
        .select('media_type, file_size')
        .eq('user_id', userId);

      if (!error && data) {
        const stats = { images: 0, videos: 0, audio: 0, documents: 0, total: data.length, totalBytes: 0 };
        data.forEach((item) => {
          const type = (item.media_type || 'other').toLowerCase();
          const size = Number(item.file_size) || 0;
          stats.totalBytes += size;
          if (type === 'image') stats.images++;
          else if (type === 'video') stats.videos++;
          else if (type === 'audio') stats.audio++;
          else stats.documents++;
        });
        return stats;
      }
    } catch {}
  }

  const { rows } = await query(
    `SELECT media_type, COUNT(id) as count, COALESCE(SUM(file_size), 0) as size
     FROM media_files
     WHERE user_id = $1
     GROUP BY media_type`,
    [userId]
  );

  const stats = { images: 0, videos: 0, audio: 0, documents: 0, total: 0, totalBytes: 0 };
  (rows || []).forEach((r) => {
    const type = (r.media_type || 'other').toLowerCase();
    const count = parseInt(r.count || '0', 10);
    const size = parseInt(r.size || '0', 10);
    stats.total += count;
    stats.totalBytes += size;
    if (type === 'image') stats.images += count;
    else if (type === 'video') stats.videos += count;
    else if (type === 'audio') stats.audio += count;
    else stats.documents += count;
  });

  return stats;
}

/**
 * Get recent media files for dashboard preview.
 */
export async function getRecentMedia(userId, limit = 6) {
  return listUserMedia(userId, { limit });
}

/**
 * Update media files storage connection ID (used during migration / disconnection).
 */
export async function updateMediaStorageConnection(userId, oldStorageId, newStorageId) {
  if (!userId || !oldStorageId) return false;
  const now = new Date().toISOString();

  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('media_files')
        .update({
          storage_connection_id: newStorageId || null,
          updated_at: now,
        })
        .eq('user_id', userId)
        .eq('storage_connection_id', oldStorageId);

      if (!error) return true;
    } catch {}
  }

  const result = await query(
    `UPDATE media_files
     SET storage_connection_id = $1, updated_at = $2
     WHERE user_id = $3 AND storage_connection_id = $4`,
    [newStorageId || null, now, userId, oldStorageId]
  );

  return result && result.rowCount > 0;
}
