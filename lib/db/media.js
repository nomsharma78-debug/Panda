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
  if (process.env.VAULT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getSupabaseVaultAdminClient() || getSupabaseAdminClient();
  }
  if (isVaultSupabaseConfigured()) {
    return getSupabaseVaultAdminClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseAdminClient();
  }
  if (token) {
    return getSupabaseServerVaultClient(token) || getSupabaseServerClient(token);
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

  // 1. If folderId is provided, ensure the folder exists in both Supabase and PostgreSQL to satisfy foreign keys
  if (folderId) {
    let folderName = 'Folder';
    let folderColor = 'teal';
    let folderParentId = null;
    let folderStorageConnId = null;

    try {
      const { rows: folderRows } = await query(
        `SELECT id, user_id, storage_connection_id, name, parent_id, color, created_at, updated_at
         FROM media_folders WHERE id = $1`,
        [folderId]
      );
      if (folderRows && folderRows[0]) {
        folderName = folderRows[0].name || folderName;
        folderColor = folderRows[0].color || folderColor;
        folderParentId = folderRows[0].parent_id || null;
        folderStorageConnId = folderRows[0].storage_connection_id || null;
      }
    } catch {}

    const sbClient = getSupabaseMediaClient(token);
    if (sbClient) {
      if (folderName === 'Folder') {
        try {
          const { data: sbFld } = await sbClient
            .from('media_folders')
            .select('*')
            .eq('id', folderId)
            .single();
          if (sbFld) {
            folderName = sbFld.name || folderName;
            folderColor = sbFld.color || folderColor;
            folderParentId = sbFld.parent_id || null;
            folderStorageConnId = sbFld.storage_connection_id || null;
          }
        } catch {}
      }

      try {
        await sbClient.from('media_folders').upsert(
          {
            id: folderId,
            user_id: userId,
            storage_connection_id: null,
            name: folderName,
            parent_id: folderParentId,
            color: folderColor,
            created_at: now,
            updated_at: now,
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
      } catch (fErr) {}
    }

    try {
      await query(
        `INSERT INTO media_folders (
          id, user_id, storage_connection_id, name, parent_id, color, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          color = EXCLUDED.color,
          updated_at = EXCLUDED.updated_at`,
        [folderId, userId, folderStorageConnId || storageConnectionId || null, folderName, folderParentId, folderColor, now, now]
      );
    } catch {}
  }

  // 2. Supabase Client (authenticated with user token or admin)
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

      let { error: insErr } = await supabase.from('media_files').insert([payload]);
      if (insErr) {
        // Retry with storage_connection_id stripped, strictly PRESERVING folder_id!
        const retry1 = await supabase.from('media_files').insert([{
          ...payload,
          storage_connection_id: null,
        }]);
        if (!retry1.error) {
          supabaseInserted = true;
        } else {
          console.warn('[Panda DB] Supabase media_files insert failed, falling back to PostgreSQL:', retry1.error.message);
        }
      } else {
        supabaseInserted = true;
      }
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase media_files write notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  // 3. PostgreSQL / Local DB
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
        storage_connection_id = COALESCE(EXCLUDED.storage_connection_id, media_files.storage_connection_id),
        folder_id = COALESCE(EXCLUDED.folder_id, media_files.folder_id),
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

  const accessUrl = `/api/media/${id}/access`;
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
    filename: originalFilename,
    name: originalFilename,
    mime_type: mimeType,
    content_type: mimeType,
    file_size: fileSize,
    size_bytes: fileSize,
    media_type: mediaType,
    encrypted,
    url: accessUrl,
    previewUrl: accessUrl,
    downloadUrl: `/api/media/${id}/download`,
    uploaded_at: exactUploadedAt,
    created_at: now,
    updated_at: now,
  };
}

function formatMediaItem(item, storageMap = {}) {
  const sc = storageMap[item.storage_connection_id];
  const filename =
    item.original_filename ||
    item.originalFilename ||
    item.filename ||
    item.name ||
    (item.object_key ? item.object_key.split('/').pop().replace(/\.enc$/, '') : 'Media File');

  const accessUrl = item.url || `/api/media/${item.id}/access`;
  const fSize = Number(item.file_size || item.size_bytes || item.fileSize || 0);

  return {
    ...item,
    filename,
    original_filename: filename,
    originalFilename: filename,
    name: filename,
    file_size: fSize,
    fileSize: fSize,
    size_bytes: fSize,
    url: accessUrl,
    previewUrl: item.previewUrl || accessUrl,
    downloadUrl: item.downloadUrl || `/api/media/${item.id}/download`,
    storage_name: item.storage_name || sc?.name || null,
    storage_provider: item.storage_provider || sc?.provider || null,
  };
}

/**
 * List unified media files for a user, sorted chronologically with newest first.
 */
export async function listUserMedia(userId, { token = null, mediaType = 'all', folderId = undefined, search = '', limit = 500, offset = 0 } = {}) {
  if (!userId) return [];

  let folderNameForLookup = null;
  if (folderId && folderId !== 'all' && folderId !== 'root') {
    try {
      const { rows: fRows } = await query(`SELECT name FROM media_folders WHERE id = $1 AND user_id = $2`, [folderId, userId]);
      if (fRows && fRows[0]?.name) {
        folderNameForLookup = fRows[0].name.toLowerCase().trim();
      }
    } catch {}
  }

  const applyFolderIsolation = (items) => {
    if (folderId === undefined) return items;
    if (folderId === null) {
      return items.filter((item) => {
        if (item.folder_id) return false;
        const cleanKey = (item.object_key || '').replace(/^media\//, '');
        if (cleanKey.includes('/')) return false;
        return true;
      });
    }
    return items.filter((item) => {
      if (item.folder_id === folderId) return true;
      if (folderNameForLookup) {
        const cleanKey = (item.object_key || '').replace(/^media\//, '');
        const parts = cleanKey.split('/');
        if (parts.length > 1 && parts[0].toLowerCase().trim() === folderNameForLookup) {
          // Self-heal folder_id in background
          query(`UPDATE media_files SET folder_id = $1 WHERE id = $2`, [folderId, item.id]).catch(() => {});
          item.folder_id = folderId;
          return true;
        }
      }
      return false;
    });
  };

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

        // Merge any additional items from PostgreSQL matching the filter
        try {
          let pgSql = `
            SELECT mf.id, mf.user_id, mf.storage_connection_id, mf.folder_id, mf.object_key, mf.original_filename,
                   mf.mime_type, mf.file_size, mf.media_type, mf.encrypted, mf.encryption_metadata,
                   mf.uploaded_at, mf.created_at, mf.updated_at,
                   sc.name as storage_name, sc.provider as storage_provider
            FROM media_files mf
            LEFT JOIN storage_connections sc ON mf.storage_connection_id = sc.id AND mf.user_id = sc.user_id
            WHERE mf.user_id = $1
          `;
          const pgParams = [userId];
          let pIdx = 2;
          if (mediaType && mediaType !== 'all') {
            pgSql += ` AND mf.media_type = $${pIdx}`;
            pgParams.push(mediaType);
            pIdx++;
          }
          if (folderId !== undefined) {
            if (folderId === null) {
              pgSql += ` AND mf.folder_id IS NULL`;
            } else {
              pgSql += ` AND mf.folder_id = $${pIdx}`;
              pgParams.push(folderId);
              pIdx++;
            }
          }
          if (search && search.trim()) {
            pgSql += ` AND mf.original_filename ILIKE $${pIdx}`;
            pgParams.push(`%${search.trim()}%`);
            pIdx++;
          }
          pgSql += ` ORDER BY mf.uploaded_at DESC, mf.created_at DESC`;
          if (limit) {
            pgSql += ` LIMIT $${pIdx}`;
            pgParams.push(limit);
            pIdx++;
          }
          const { rows: pgRows } = await query(pgSql, pgParams);
          if (pgRows && pgRows.length > 0) {
            const existingIds = new Set(data.map((d) => d.id));
            for (const pr of pgRows) {
              if (!existingIds.has(pr.id)) {
                data.push(pr);
              }
            }
          }
        } catch {}

        data.sort((a, b) => new Date(b.uploaded_at || b.created_at) - new Date(a.uploaded_at || a.created_at));
        const filtered = applyFolderIsolation(data);
        return filtered.map((item) => formatMediaItem(item, storageMap));
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
      sql += ` AND (mf.folder_id = $${pIdx}${folderNameForLookup ? ` OR mf.object_key LIKE 'media/' || $${pIdx + 1} || '/%'` : ''})`;
      params.push(folderId);
      pIdx++;
      if (folderNameForLookup) {
        params.push(folderNameForLookup);
        pIdx++;
      }
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
    const filtered = applyFolderIsolation(rows || []);
    return filtered.map((item) => formatMediaItem(item));
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

      // 3. Partial key match with limit(1)
      const { data: byLike, error: errLike } = await supabase
        .from('media_files')
        .select(`
          id, user_id, storage_connection_id, folder_id, object_key, original_filename,
          mime_type, file_size, media_type, encrypted, encryption_metadata,
          uploaded_at, created_at, updated_at
        `)
        .ilike('object_key', `%${id}%`)
        .eq('user_id', userId)
        .limit(1);

      if (!errLike && byLike && byLike.length > 0) return byLike[0];
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
       WHERE (mf.id = $1 OR mf.object_key = $1 OR mf.object_key ILIKE '%' || $1 || '%') AND mf.user_id = $2
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

  let deleted = false;
  const supabase = getSupabaseMediaClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('media_files')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) deleted = true;
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase deleteMediaFile notice:', sbErr.message);
    }
  }

  try {
    const result = await query(
      `DELETE FROM media_files WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (result && (result.rowCount > 0 || result.affectedRows > 0)) {
      deleted = true;
    }
  } catch (pgErr) {
    console.warn('[Panda DB] Postgres deleteMediaFile notice:', pgErr.message);
  }

  return deleted;
}

/**
 * Move a media file to a different folder.
 */
export async function moveMediaFile(id, userId, targetFolderId) {
  if (!id || !userId) return false;
  const now = new Date().toISOString();

  let supabaseMoved = false;
  const supabase = getSupabaseMediaClient();
  if (supabase) {
    if (targetFolderId) {
      try {
        const { rows: fldRows } = await query(`SELECT id, name, color, parent_id FROM media_folders WHERE id = $1`, [targetFolderId]);
        if (fldRows && fldRows[0]) {
          await supabase.from('media_folders').upsert({
            id: targetFolderId,
            user_id: userId,
            name: fldRows[0].name || 'Folder',
            color: fldRows[0].color || 'teal',
            parent_id: fldRows[0].parent_id || null,
          }, { onConflict: 'id', ignoreDuplicates: true });
        }
      } catch {}
    }

    try {
      const { error } = await supabase
        .from('media_files')
        .update({
          folder_id: targetFolderId || null,
          updated_at: now,
        })
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) supabaseMoved = true;
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase moveMediaFile notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  let pgMoved = false;
  try {
    const result = await query(
      `UPDATE media_files
       SET folder_id = $1, updated_at = $2
       WHERE id = $3 AND user_id = $4`,
      [targetFolderId || null, now, id, userId]
    );
    if (result && (result.rowCount > 0 || result.affectedRows > 0)) {
      pgMoved = true;
    }
  } catch (pgErr) {
    console.warn('[Panda DB] PostgreSQL moveMediaFile notice:', pgErr.message);
  }

  return supabaseMoved || pgMoved;
}

/**
 * Rename a media file.
 */
export async function renameMediaFile(id, userId, newFilename, token = null) {
  if (!id || !userId || !newFilename) return null;
  const now = new Date().toISOString();
  const cleanName = newFilename.trim();

  const supabase = getSupabaseMediaClient(token);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('media_files')
        .update({
          original_filename: cleanName,
          updated_at: now,
        })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (!error && data) return formatMediaItem(data);
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase renameMediaFile notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  try {
    const { rows } = await query(
      `UPDATE media_files
       SET original_filename = $1, updated_at = $2
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [cleanName, now, id, userId]
    );

    return (rows && rows[0]) ? formatMediaItem(rows[0]) : null;
  } catch {
    return null;
  }
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
