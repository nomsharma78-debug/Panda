import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getSafeStorageConnection, getStorageConnectionInternal, deleteStorageConnection, listUserStorageConnections } from '@/lib/db/storage';
import { listUserMedia, deleteMediaFile, updateMediaStorageConnection } from '@/lib/db/media';
import { StorageManager } from '@/lib/storage/storage-manager';
import { logAuditEvent } from '@/lib/security/audit';
import { getClientIp } from '@/lib/security/rate-limit';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Strict ownership check
  const connection = await getSafeStorageConnection(id, authData.user.id);
  if (!connection) {
    return NextResponse.json({ error: 'Storage connection not found' }, { status: 404 });
  }

  return NextResponse.json({ connection });
}

export async function DELETE(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const handlingMode = body.handlingMode || 'keep'; // 'keep' | 'move' | 'delete_files'
    const targetStorageId = body.targetStorageId || null;

    const storageRecord = await getStorageConnectionInternal(id, authData.user.id);
    if (!storageRecord) {
      return NextResponse.json({ error: 'Storage connection not found' }, { status: 404 });
    }

    // Get all media associated with this storage
    const allMedia = await listUserMedia(authData.user.id, { limit: 10000 });
    const affectedMedia = allMedia.filter((m) => m.storage_connection_id === id);

    if (handlingMode === 'delete_files') {
      // Delete objects from provider and remove from DB
      const provider = StorageManager.getProviderFromRecord(storageRecord);
      for (const item of affectedMedia) {
        try {
          await provider.delete(item.object_key);
        } catch (e) {
          console.warn('Storage deletion error during disconnect:', e.message);
        }
        await deleteMediaFile(item.id, authData.user.id);
      }
    } else if (handlingMode === 'move' && targetStorageId) {
      // Move files to target storage
      const targetStorage = await getStorageConnectionInternal(targetStorageId, authData.user.id);
      if (targetStorage) {
        const sourceProvider = StorageManager.getProviderFromRecord(storageRecord);
        const targetProvider = StorageManager.getProviderFromRecord(targetStorage);

        for (const item of affectedMedia) {
          try {
            const downloaded = await sourceProvider.download(item.object_key);
            await targetProvider.upload(item.object_key, downloaded.body, item.mime_type);
            await sourceProvider.delete(item.object_key);
            await updateMediaStorageConnection(item.id, authData.user.id, targetStorageId);
          } catch (moveErr) {
            console.error('File move failed for', item.id, moveErr.message);
          }
        }
      }
    } else {
      // Default: 'keep' - detach storage connection ID from media files or keep reference
      for (const item of affectedMedia) {
        await updateMediaStorageConnection(item.id, authData.user.id, null);
      }
    }

    // Delete storage connection record
    await deleteStorageConnection(id, authData.user.id);

    const ip = getClientIp(request);
    await logAuditEvent({
      userId: authData.user.id,
      action: 'storage:disconnected',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: {
        connectionId: id,
        provider: storageRecord.provider,
        handlingMode,
        affectedFiles: affectedMedia.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Storage connection disconnected successfully.',
    });
  } catch (err) {
    console.error('Disconnect storage error:', err);
    return NextResponse.json({ error: 'Failed to disconnect storage' }, { status: 500 });
  }
}
