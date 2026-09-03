import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageService } from '@/lib/storage/storage-service';
import { getMediaFileById } from '@/lib/db/media';
import { ProviderFactory } from '@/lib/storage/provider-factory';
import { decryptBuffer } from '@/lib/crypto/encryption';

export async function GET(request, { params }) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');
  const asJson = new URL(request.url).searchParams.get('json') === 'true';

  try {
    const file = await getMediaFileById(id, authData.user.id, token);
    if (!file || file.user_id !== authData.user.id) {
      return NextResponse.json({ success: false, error: 'FILE_NOT_FOUND', message: 'File not found' }, { status: 404 });
    }

    if (asJson) {
      const urlInfo = await StorageService.getSignedDownloadUrl(authData.user.id, id, 900, token);
      return NextResponse.json({ success: true, data: urlInfo });
    }

    // Stream/download decrypted binary directly
    const resolved = await ProviderFactory.resolveProviderForUser(authData.user.id, file.storage_connection_id, token);
    const downloaded = await resolved.provider.downloadObject({ key: file.storage_object_key || file.object_key });

    let finalBuffer = downloaded.body;
    if (file.encrypted && file.encryption_metadata) {
      const meta = typeof file.encryption_metadata === 'string' ? JSON.parse(file.encryption_metadata) : file.encryption_metadata;
      finalBuffer = decryptBuffer(downloaded.body, meta.iv, meta.authTag);
    }

    const safeFilename = encodeURIComponent(file.original_filename || 'download');
    return new Response(finalBuffer, {
      status: 200,
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Length': String(finalBuffer.length),
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    console.error('File download error:', err);
    return NextResponse.json(
      { success: false, error: err.code || 'DOWNLOAD_FAILED', message: err.message },
      { status: err.statusCode || 500 }
    );
  }
}
