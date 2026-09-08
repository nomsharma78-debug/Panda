import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { deleteFolder, updateFolder } from '@/lib/db/folders';

export async function DELETE(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
  }

  try {
    const success = await deleteFolder(id, authData.user.id);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete folder or folder not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Folder deleted successfully' });
  } catch (err) {
    console.error('[API media/folders/[id] DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { name, color } = body;

  try {
    const updated = await updateFolder(id, authData.user.id, { name, color });
    if (!updated) {
      return NextResponse.json({ error: 'Folder not found or update failed' }, { status: 404 });
    }
    return NextResponse.json({ folder: updated });
  } catch (err) {
    console.error('[API media/folders/[id] PATCH] Error:', err);
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
}
