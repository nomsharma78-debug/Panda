import { query } from './index.js';
import { generateSecureId } from '../crypto/encryption.js';
import {
  isVaultSupabaseConfigured,
  getSupabaseVaultAdminClient,
  isSupabaseConfigured,
  getSupabaseAdminClient,
} from '../auth/supabase.js';

function getSupabaseFolderClient() {
  if (isVaultSupabaseConfigured()) {
    return getSupabaseVaultAdminClient();
  }
  if (isSupabaseConfigured()) {
    return getSupabaseAdminClient();
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

  // Ensure user reference exists in database (to satisfy foreign key if present)
  try {
    const supabase = getSupabaseFolderClient();
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

      if (error) {
        // Fallback without storage_connection_id if constraint error
        const { data: d2, error: err2 } = await supabase.from('media_folders').insert([
          {
            id,
            user_id: userId,
            storage_connection_id: null,
            name: cleanName,
            parent_id: parentId || null,
            color: color || 'teal',
            created_at: now,
            updated_at: now,
          },
        ]).select().single();
        if (!err2 && d2) return d2;
      } else if (data) {
        return data;
      }
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase media_folders insert note, falling back to PostgreSQL:', sbErr.message);
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
export async function listUserFolders(userId, { parentId = undefined, storageConnectionId = null } = {}) {
  if (!userId) return [];

  const supabase = getSupabaseFolderClient();
  if (supabase) {
    try {
      let q = supabase
        .from('media_folders')
        .select('id, user_id, storage_connection_id, name, parent_id, color, created_at, updated_at')
        .eq('user_id', userId);

      if (parentId !== undefined) {
        if (parentId === null) {
          q = q.is('parent_id', null);
        } else {
          q = q.eq('parent_id', parentId);
        }
      }

      if (storageConnectionId) {
        q = q.eq('storage_connection_id', storageConnectionId);
      }

      q = q.order('name', { ascending: true });

      const { data, error } = await q;

      if (error) throw new Error(error.message);

      if (data) {
        let fileCounts = {};
        try {
          const { data: mediaRows } = await supabase
            .from('media_files')
            .select('folder_id, file_size')
            .eq('user_id', userId);
          if (mediaRows) {
            mediaRows.forEach((m) => {
              if (m.folder_id) {
                if (!fileCounts[m.folder_id]) {
                  fileCounts[m.folder_id] = { count: 0, size: 0 };
                }
                fileCounts[m.folder_id].count += 1;
                fileCounts[m.folder_id].size += Number(m.file_size) || 0;
              }
            });
          }
        } catch {}

        return data.map((f) => {
          const meta = fileCounts[f.id] || { count: 0, size: 0 };
          return {
            id: f.id,
            user_id: f.user_id,
            storage_connection_id: f.storage_connection_id,
            name: f.name,
            parent_id: f.parent_id,
            color: f.color || 'teal',
            file_count: meta.count,
            total_bytes: meta.size,
            created_at: f.created_at,
            updated_at: f.updated_at,
          };
        });
      }
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase listUserFolders notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  let sql = `
    SELECT mf.id, mf.user_id, mf.storage_connection_id, mf.name, mf.parent_id, mf.color,
           mf.created_at, mf.updated_at,
           COUNT(m.id) as file_count,
           COALESCE(SUM(m.file_size), 0) as total_bytes
    FROM media_folders mf
    LEFT JOIN media_files m ON mf.id = m.folder_id AND mf.user_id = m.user_id
    WHERE mf.user_id = $1
  `;
  const params = [userId];
  let pIdx = 2;

  if (parentId !== undefined) {
    if (parentId === null) {
      sql += ` AND mf.parent_id IS NULL`;
    } else {
      sql += ` AND mf.parent_id = $${pIdx}`;
      params.push(parentId);
      pIdx++;
    }
  }

  if (storageConnectionId) {
    sql += ` AND mf.storage_connection_id = $${pIdx}`;
    params.push(storageConnectionId);
    pIdx++;
  }

  sql += ` GROUP BY mf.id, mf.user_id, mf.storage_connection_id, mf.name, mf.parent_id, mf.color, mf.created_at, mf.updated_at`;
  sql += ` ORDER BY mf.name ASC`;

  const { rows } = await query(sql, params);
  return (rows || []).map((r) => ({
    ...r,
    file_count: parseInt(r.file_count || '0', 10),
    total_bytes: parseInt(r.total_bytes || '0', 10),
  }));
}

/**
 * Delete a media folder and unassign its files to root.
 */
export async function deleteFolder(id, userId) {
  if (!id || !userId) return false;

  const supabase = getSupabaseFolderClient();
  if (supabase) {
    try {
      await supabase
        .from('media_files')
        .update({ folder_id: null })
        .eq('folder_id', id)
        .eq('user_id', userId);

      const { error } = await supabase
        .from('media_folders')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) return true;
      throw new Error(error.message);
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase deleteFolder notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  await query(
    `UPDATE media_files SET folder_id = NULL WHERE folder_id = $1 AND user_id = $2`,
    [id, userId]
  );

  const result = await query(
    `DELETE FROM media_folders WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  return result && result.rowCount > 0;
}

/**
 * Rename or change color of a media folder.
 */
export async function updateFolder(id, userId, { name, color }) {
  if (!id || !userId) return null;
  const now = new Date().toISOString();

  const supabase = getSupabaseFolderClient();
  if (supabase) {
    try {
      const updates = { updated_at: now };
      if (name && name.trim()) updates.name = name.trim();
      if (color) updates.color = color;

      const { data, error } = await supabase
        .from('media_folders')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      if (data) return data;
    } catch (sbErr) {
      console.warn('[Panda DB] Supabase updateFolder notice, falling back to PostgreSQL:', sbErr.message);
    }
  }

  const { rows } = await query(
    `UPDATE media_folders
     SET name = COALESCE($1, name), color = COALESCE($2, color), updated_at = $3
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [name ? name.trim() : null, color || null, now, id, userId]
  );

  return (rows && rows[0]) || null;
}

/**
 * Rename folder helper function.
 */
export async function renameFolder(id, userId, name) {
  return updateFolder(id, userId, { name });
}
