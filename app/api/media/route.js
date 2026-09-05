import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { listUserMedia } from '@/lib/db/media';
import { StorageManager } from '@/lib/storage/storage-manager';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mediaType = searchParams.get('type') || 'all';
  const search = searchParams.get('search') || '';
  const limit = parseInt(searchParams.get('limit') || '500', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    const shouldSync = searchParams.get('sync') === 'true';

    // Cloud bucket reconciliation runs when explicitly requested
    if (shouldSync) {
      try {
        await StorageManager.syncStorageMedia(authData.user.id, token);
      } catch (syncErr) {
        console.warn('[API media] Sync notice:', syncErr.message);
      }
    }

    let items = await listUserMedia(authData.user.id, {
      token,
      mediaType,
      search,
      limit,
      offset,
    });

    // Auto-discover files ONLY on initial empty library load with no filter/search
    if (mediaType === 'all' && (!items || items.length === 0) && offset === 0 && !search && !shouldSync) {
      try {
        const discovered = await StorageManager.syncStorageMedia(authData.user.id, token);
        if (discovered && discovered.length > 0) {
          items = await listUserMedia(authData.user.id, {
            token,
            mediaType,
            search,
            limit,
            offset,
          });
        }
      } catch (autoSyncErr) {
        console.warn('[API media] Auto-sync notice:', autoSyncErr.message);
      }
    }

    return NextResponse.json(
      {
        items: items || [],
        count: items ? items.length : 0,
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
