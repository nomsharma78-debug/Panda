import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getMediaFileById } from '@/lib/db/media';
import { StorageManager } from '@/lib/storage/storage-manager';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  // Strict ownership check
  const media = await getMediaFileById(id, authData.user.id, token);
  if (!media) {
    return NextResponse.json({ error: 'Media file not found' }, { status: 404 });
  }

  const normalized = {
    id: media.id,
    filename: media.original_filename,
    originalFilename: media.original_filename,
    mimeType: media.mime_type,
    fileSize: media.file_size,
    sizeBytes: media.file_size,
    url: `/api/media/${media.id}/access`,
    previewUrl: `/api/media/${media.id}/access`,
    downloadUrl: `/api/media/${media.id}/download`,
    encrypted: Boolean(media.encrypted),
    storageProvider: media.storage_provider || 's3',
    uploadedAt: media.uploaded_at,
    createdAt: media.created_at,
    updatedAt: media.updated_at,
  };

  return NextResponse.json({ success: true, media: normalized, ...normalized });
}

export async function DELETE(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    const result = await StorageManager.deleteMedia(authData.user.id, id, token);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Media file not found' }, { status: 404 });
    }

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'media:deleted',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: { mediaId: id },
    });

    return NextResponse.json({ success: true, message: 'Media file deleted successfully' });
  } catch (err) {
    console.error('Delete media error:', err);
    return NextResponse.json({ error: 'Failed to delete media file' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

  try {
    const body = await request.json();
    const { filename, folderId } = body;

    let updated = null;
    if (filename) {
      const { renameMediaFile } = await import('@/lib/db/media');
      updated = await renameMediaFile(id, authData.user.id, filename, token);
    }
    if (folderId !== undefined) {
      const { moveMediaFile } = await import('@/lib/db/media');
      await moveMediaFile(id, authData.user.id, folderId);
      if (!updated) {
        const { getMediaFileById } = await import('@/lib/db/media');
        updated = await getMediaFileById(id, authData.user.id, token);
      }
    }

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update media file' }, { status: 400 });
    }

    return NextResponse.json({ success: true, media: updated });
  } catch (err) {
    console.error('Update media error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update media file' }, { status: 500 });
  }
}
