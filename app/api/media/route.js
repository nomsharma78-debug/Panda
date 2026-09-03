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
  if (folderIdParam === 'root') folderId = null;
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

    // Auto-discover any files present in connected cloud storage if list is empty
    if (items.length === 0 && !search && mediaType === 'all') {
      try {
        const synced = await StorageManager.syncStorageMedia(authData.user.id, token);
        if (synced && synced.length > 0) {
          items = await listUserMedia(authData.user.id, {
            token,
            mediaType,
            folderId,
            search,
            limit,
            offset,
          });
        }
      } catch {}
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
