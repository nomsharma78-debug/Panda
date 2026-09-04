import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { listUserMedia } from '@/lib/db/media';
import { StorageManager } from '@/lib/storage/storage-manager';

// In-memory auto-sync throttling map to prevent excessive cloud bucket requests on rapid UI polling
const lastAutoSyncByUser = new Map();
const AUTO_SYNC_INTERVAL_MS = 6000; // Auto-reconcile bucket every 6 seconds on active use

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mediaType = searchParams.get('type') || 'all';
  const search = searchParams.get('search') || '';
  const folderIdParam = searchParams.get('folderId');
  const limit = parseInt(searchParams.get('limit') || '500', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  let folderId = undefined;
  if (folderIdParam === 'root' || folderIdParam === 'null' || !folderIdParam) folderId = null;
  else if (folderIdParam === 'all') folderId = undefined;
  else if (folderIdParam) folderId = folderIdParam;

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    const shouldSync = searchParams.get('sync') === 'true';
    const lastSync = lastAutoSyncByUser.get(authData.user.id) || 0;
    const now = Date.now();

    // Automatic silent cloud bucket reconciliation: runs if explicitly requested OR automatically in background
    if (shouldSync || (now - lastSync > AUTO_SYNC_INTERVAL_MS)) {
      lastAutoSyncByUser.set(authData.user.id, now);
      try {
        await StorageManager.syncStorageMedia(authData.user.id, token);
      } catch (syncErr) {
        console.warn('[API media] Auto-sync notice:', syncErr.message);
      }
    }

    const items = await listUserMedia(authData.user.id, {
      token,
      mediaType,
      folderId,
      search,
      limit,
      offset,
    });

    return NextResponse.json(
      {
        items,
        count: items.length,
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (err) {
    console.error('List media error:', err);
    return NextResponse.json({ error: 'Failed to retrieve media library' }, { status: 500 });
  }
}
