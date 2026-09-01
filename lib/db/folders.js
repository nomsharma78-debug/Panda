import { query } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import {
  isVaultSupabaseConfigured,
  getSupabaseServerVaultClient,
  isSupabaseConfigured,
  getSupabaseServerClient,
} from '../auth/supabase.js';

function getSupabaseFolderClient() {
  if (isVaultSupabaseConfigured()) {
    return getSupabaseServerVaultClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseServerClient();
  }
  return null;
}

/**
 * Create a new media folder in the user's connected storage.
 */
export async function createFolder(userId, { name, storageConnectionId = null, parentId = null, color = 'teal' }) {
  if (!userId || !name || !name.trim()) {
    throw new Error('User ID and folder name are required');
  }

  const id = generateSecureId();
  const now = new Date().toISOString();
  const cleanName = name.trim();

  // 1. Supabase REST
  const supabase = getSupabaseFolderClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('media_folders').insert([
        {
          id,
          user_id: userId,
          storage_connection_id: storageConnectionId || null,
          name: cleanName,
          parent_id: parentId || null,
          color: color || 'teal',
          created_at: now,
          updated_at: now,
        },
      ]).select().single();

      if (!error && data) {
        return data;
      }
    } catch (sbErr) {
      console.warn('Supabase media_folders insert note:', sbErr.message);
    }
  }

  // 2. PostgreSQL
  await query(
    `INSERT INTO media_folders (
      id, user_id, storage_connection_id, name, parent_id, color, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, storageConnectionId || null, cleanName, parentId || null, color || 'teal', now, now]
  );

  return {
    id,
    user_id: userId,
    storage_connection_id: storageConnectionId,
    name: cleanName,
    parent_id: parentId,
    color,
    created_at: now,
    updated_at: now,
  };
}

/**
 * List folders for a user (optionally filtered by parent_id or storage_connection_id) with item counts.
 */
export async function listUserFolders(userId, { parentId = null, storageConnectionId = null } = {}) {
  if (!userId) return [];

  const supabase = getSupabaseFolderClient();
  if (supabase) {
    try {
      let q = supabase
        .from('media_folders')
        .select(`
          id, user_id, storage_connection_id, name, parent_id, color, created_at, updated_at,
          media_files ( id, file_size )
        `)
        .eq('user_id', userId);

      if (parentId !== undefined && parentId !== null) {
        q = q.eq('parent_id', parentId);
      }

      if (storageConnectionId) {
        q = q.eq('storage_connection_id', storageConnectionId);
      }

      q = q.order('name', { ascending: true });

      const { data, error } = await q;

      if (!error && data) {
        return data.map((f) => {
          const files = f.media_files || [];
          const totalBytes = files.reduce((acc, curr) => acc + (Number(curr.file_size) || 0), 0);
          return {
            id: f.id,
            user_id: f.user_id,
            storage_connection_id: f.storage_connection_id,
            name: f.name,
            parent_id: f.parent_id,
            color: f.color || 'teal',
            file_count: files.length,
            total_bytes: totalBytes,
            created_at: f.created_at,
            updated_at: f.updated_at,
          };
        });
      }
    } catch {}
  }

  // 2. PostgreSQL
  let sql = `
    SELECT mf.id, mf.user_id, mf.storage_connection_id, mf.name, mf.parent_id, mf.color,
           mf.created_at, mf.updated_at,
           COUNT(f.id)::int as file_count,
           COALESCE(SUM(f.file_size), 0)::bigint as total_bytes
    FROM media_folders mf
    LEFT JOIN media_files f ON f.folder_id = mf.id AND f.user_id = mf.user_id
    WHERE mf.user_id = $1
  `;
  const params = [userId];
  let pIdx = 2;

  if (parentId !== undefined && parentId !== null) {
    sql += ` AND mf.parent_id = $${pIdx}`;
    params.push(parentId);
    pIdx++;
  }

  if (storageConnectionId) {
    sql += ` AND mf.storage_connection_id = $${pIdx}`;
    params.push(storageConnectionId);
    pIdx++;
  }

  sql += ` GROUP BY mf.id ORDER BY mf.name ASC`;

  const { rows } = await query(sql, params);
  return rows;
}

/**
 * Rename a folder.
 */
export async function renameFolder(userId, folderId, newName) {
  if (!userId || !folderId || !newName?.trim()) {
    throw new Error('User ID, folder ID, and new name are required');
  }

  const now = new Date().toISOString();
  const cleanName = newName.trim();

  const supabase = getSupabaseFolderClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('media_folders')
        .update({ name: cleanName, updated_at: now })
        .eq('id', folderId)
        .eq('user_id', userId)
        .select()
        .single();

      if (!error && data) return data;
    } catch {}
  }

  const { rows } = await query(
    `UPDATE media_folders SET name = $1, updated_at = $2 WHERE id = $3 AND user_id = $4 RETURNING *`,
    [cleanName, now, folderId, userId]
  );
  return rows[0] || null;
}

/**
 * Delete a folder (unassigns or deletes contained files).
 */
export async function deleteFolder(userId, folderId) {
  if (!userId || !folderId) return false;

  const supabase = getSupabaseFolderClient();
  if (supabase) {
    try {
      // 1. Unassign contained media files
      await supabase
        .from('media_files')
        .update({ folder_id: null })
        .eq('folder_id', folderId)
        .eq('user_id', userId);

      // 2. Delete folder
      const { error } = await supabase
        .from('media_folders')
        .delete()
        .eq('id', folderId)
        .eq('user_id', userId);

      if (!error) return true;
    } catch {}
  }

  // 2. PostgreSQL
  await query(`UPDATE media_files SET folder_id = NULL WHERE folder_id = $1 AND user_id = $2`, [folderId, userId]);
  await query(`DELETE FROM media_folders WHERE id = $1 AND user_id = $2`, [folderId, userId]);
  return true;
}
