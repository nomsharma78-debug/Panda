import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { createFolder, listUserFolders, renameFolder, deleteFolder } from '@/lib/db/folders';
import { logAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const authData = await getAuthenticatedUser(request);
    if (!authData || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parentId') || null;
    const storageConnectionId = searchParams.get('storageConnectionId') || null;

    const folders = await listUserFolders(authData.user.id, {
      parentId: parentId || undefined,
      storageConnectionId: storageConnectionId || undefined,
    });

    return NextResponse.json({ folders });
  } catch (err) {
    console.error('List folders error:', err);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authData = await getAuthenticatedUser(request);
    if (!authData || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, storageConnectionId, parentId, color } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const folder = await createFolder(authData.user.id, {
      name: name.trim(),
      storageConnectionId: storageConnectionId || null,
      parentId: parentId || null,
      color: color || 'teal',
    });

    await logAuditEvent({
      userId: authData.user.id,
      action: 'media:folder_created',
      status: 'SUCCESS',
      metadata: { folderId: folder.id, name: folder.name },
    });

    return NextResponse.json({ success: true, folder }, { status: 201 });
  } catch (err) {
    console.error('Create folder error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create folder' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const authData = await getAuthenticatedUser(request);
    if (!authData || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name } = body;

    if (!id || !name || !name.trim()) {
      return NextResponse.json({ error: 'Folder ID and new name are required' }, { status: 400 });
    }

    const updated = await renameFolder(authData.user.id, id, name.trim());

    return NextResponse.json({ success: true, folder: updated });
  } catch (err) {
    console.error('Rename folder error:', err);
    return NextResponse.json({ error: err.message || 'Failed to rename folder' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const authData = await getAuthenticatedUser(request);
    if (!authData || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    await deleteFolder(authData.user.id, id);

    await logAuditEvent({
      userId: authData.user.id,
      action: 'media:folder_deleted',
      status: 'SUCCESS',
      metadata: { folderId: id },
    });

    return NextResponse.json({ success: true, message: 'Folder deleted successfully' });
  } catch (err) {
    console.error('Delete folder error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete folder' }, { status: 500 });
  }
}
