import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { createFolder, listUserFolders } from '@/lib/db/folders';

export async function GET(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get('parentId') || undefined;
  const storageConnectionId = searchParams.get('storageConnectionId') || null;
  const token = request.headers.get('authorization')?.slice(7)?.trim();

  try {
    const folders = await listUserFolders(authData.user.id, {
      token,
      parentId: parentId === 'null' ? null : parentId,
      storageConnectionId,
    });

    return NextResponse.json(
      { folders: folders || [] },
      { headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' } }
    );
  } catch (err) {
    console.error('[API media/folders GET] Error:', err);
    return NextResponse.json({ error: 'Failed to retrieve folders' }, { status: 500 });
  }
}

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { name, storageConnectionId = null, parentId = null, color = 'teal' } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
  }

  try {
    const folder = await createFolder(authData.user.id, {
      name,
      storageConnectionId,
      parentId,
      color,
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (err) {
    console.error('[API media/folders POST] Error:', err);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
