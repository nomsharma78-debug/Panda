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
  const folderIdParam = searchParams.get('folderId');
  const limit = parseInt(searchParams.get('limit') || '500', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  let folderId = undefined;
  if (folderIdParam === 'root' || folderIdParam === 'null' || !folderIdParam) folderId = null;
  else if (folderIdParam === 'all') folderId = undefined;
  else if (folderIdParam) folderId = folderIdParam;

  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    let items = await listUserMedia(authData.user.id, {
      token,
      mediaType,
      folderId,
      search,
      limit,
      offset,
    });

    // Auto-discover files in connected cloud storage ONLY when explicit sync requested by user
    const shouldSync = searchParams.get('sync') === 'true';
    if (shouldSync) {
      try {
        const synced = await StorageManager.syncStorageMedia(authData.user.id, token);
        if (synced && synced.length > 0) {
          const reloaded = await listUserMedia(authData.user.id, {
            token,
            mediaType,
            folderId,
            search,
            limit,
            offset,
          });
          items = reloaded.length > 0 ? reloaded : synced;
        }
      } catch (syncErr) {
        console.warn('[API media] sync notice:', syncErr.message);
      }
    }

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
