import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { listUserMedia } from '@/lib/db/media';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mediaType = searchParams.get('type') || 'all';
  const search = searchParams.get('search') || '';
  const folderIdParam = searchParams.get('folderId');
  let folderId = undefined;
  if (folderIdParam === 'root') folderId = null;
  else if (folderIdParam) folderId = folderIdParam;

  const limit = parseInt(searchParams.get('limit') || '500', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    const items = await listUserMedia(authData.user.id, {
      mediaType,
      folderId,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      items,
      count: items.length,
    });
  } catch (err) {
    console.error('List media error:', err);
    return NextResponse.json({ error: 'Failed to retrieve media library' }, { status: 500 });
  }
}
