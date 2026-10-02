import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageManager } from '@/lib/storage/storage-manager';
import { sanitizeFilename, getMediaTypeFromMime } from '@/lib/validation/schemas';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { logAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow 60s for reassembly and encryption

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);

  // Rate limit
  const rateLimit = checkRateLimit(authData.user.id, 'media:upload:chunk', 200, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Upload rate limit reached. Please wait ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();
    const chunkFile = formData.get('chunk');
    const uploadId = formData.get('uploadId');
    const chunkIndex = parseInt(formData.get('chunkIndex') || '0', 10);
    const totalChunks = parseInt(formData.get('totalChunks') || '1', 10);
    const originalFilenameRaw = formData.get('filename') || 'file.bin';
    const rawMimeType = formData.get('mimeType') || 'application/octet-stream';
    const preferredStorageId = formData.get('storageId') || null;
    const folderId = formData.get('folderId') || null;
    const enableEncryption = formData.get('encrypt') !== 'false';

    if (!chunkFile || !uploadId) {
      return NextResponse.json({ error: 'Missing chunk file or uploadId' }, { status: 400 });
    }

    const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');
    const cleanFilename = sanitizeFilename(originalFilenameRaw);
    const mediaType = getMediaTypeFromMime(rawMimeType, cleanFilename);

    // Get chunk buffer
    const chunkArrayBuffer = await chunkFile.arrayBuffer();
    const chunkBuffer = Buffer.from(chunkArrayBuffer);

    // Resolve storage connection for temporary chunk storage
    const storageRecord = await StorageManager.resolveUploadStorage(
      authData.user.id,
      preferredStorageId === 'auto' ? null : preferredStorageId,
      token,
      0
    );

    if (!storageRecord) {
      return NextResponse.json({ error: 'No active storage connection available.' }, { status: 400 });
    }

    const provider = StorageManager.getProviderFromRecord(storageRecord);
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const chunkKey = `tmp_chunks/${authData.user.id}/${safeUploadId}/${chunkIndex}`;

    // 1. Upload this chunk to temporary storage
    await provider.upload(chunkKey, chunkBuffer, 'application/octet-stream');

    // 2. If not yet the last chunk, acknowledge success
    if (chunkIndex < totalChunks - 1) {
      return NextResponse.json({
        success: true,
        chunkIndex,
        totalChunks,
        isComplete: false,
      });
    }

    // 3. Last chunk received: Reassemble all chunks into the complete file!
    const chunkBuffers = [];
    for (let i = 0; i < totalChunks; i++) {
      const keyToFetch = `tmp_chunks/${authData.user.id}/${safeUploadId}/${i}`;
      if (i === chunkIndex) {
        chunkBuffers.push(chunkBuffer);
      } else {
        const downloaded = await provider.download(keyToFetch);
        if (!downloaded || !downloaded.body) {
          throw new Error(`Failed to retrieve chunk ${i} for assembly`);
        }
        chunkBuffers.push(downloaded.body);
      }
    }

    const fullFileBuffer = Buffer.concat(chunkBuffers);

    if (fullFileBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds maximum allowed limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`);
    }

    // 4. Upload assembled & encrypted file through StorageManager
    const mediaRecord = await StorageManager.uploadMedia(authData.user.id, {
      token,
      fileBuffer: fullFileBuffer,
      originalFilename: cleanFilename,
      mimeType: rawMimeType,
      mediaType,
      preferredStorageId: preferredStorageId === 'auto' ? null : preferredStorageId,
      folderId: folderId || null,
      enableEncryption,
    });

    // 5. Clean up temporary chunk objects in background
    Promise.all(
      Array.from({ length: totalChunks }).map((_, idx) =>
        provider.delete(`tmp_chunks/${authData.user.id}/${safeUploadId}/${idx}`).catch(() => {})
      )
    ).catch(() => {});

    await logAuditEvent({
      userId: authData.user.id,
      action: 'media:uploaded:chunked',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: {
        mediaId: mediaRecord.id,
        filename: cleanFilename,
        mediaType,
        size: fullFileBuffer.length,
        totalChunks,
        encrypted: enableEncryption,
      },
    });

    return NextResponse.json({
      success: true,
      isComplete: true,
      media: mediaRecord,
      message: 'Chunked file assembled, encrypted, and saved successfully.',
    }, { status: 201 });
  } catch (err) {
    console.error('[Chunk Upload Error]:', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to process upload chunk. Please try again.' },
      { status: 500 }
    );
  }
}
