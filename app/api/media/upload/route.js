import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { StorageManager } from '@/lib/storage/storage-manager';
import { sanitizeFilename, getMediaTypeFromMime, validateUploadFile } from '@/lib/validation/schemas';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { logAuditEvent } from '@/lib/security/audit';

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export async function POST(request) {
  const authData = await getAuthenticatedUser(request);
  if (!authData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);

  // Rate limit on uploads
  const rateLimit = checkRateLimit(authData.user.id, 'media:upload', 60, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Upload rate limit reached. Please wait ${rateLimit.resetInSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const preferredStorageId = formData.get('storageId') || null;
    const folderId = formData.get('folderId') || null;
    const enableEncryption = formData.get('encrypt') !== 'false';

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided for upload' }, { status: 400 });
    }

    const validation = validateUploadFile({
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
    });

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const originalFilename = sanitizeFilename(file.name);
    const mimeType = file.type || 'application/octet-stream';
    const mediaType = getMediaTypeFromMime(mimeType, originalFilename);

    // Convert file arrayBuffer to Node Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const token = request.headers.get('authorization')?.slice(7)?.trim() || new URL(request.url).searchParams.get('token');

    // Upload and encrypt through StorageManager
    const mediaRecord = await StorageManager.uploadMedia(authData.user.id, {
      token,
      fileBuffer: buffer,
      originalFilename,
      mimeType,
      mediaType,
      preferredStorageId: preferredStorageId === 'auto' ? null : preferredStorageId,
      folderId: folderId && folderId !== 'null' && folderId !== 'undefined' ? folderId : null,
      enableEncryption,
    });

    await logAuditEvent({
      userId: authData.user.id,
      action: 'media:uploaded',
      status: 'SUCCESS',
      ipAddress: ip,
      metadata: {
        mediaId: mediaRecord.id,
        filename: originalFilename,
        mediaType,
        size: file.size,
        encrypted: enableEncryption,
      },
    });

    return NextResponse.json({
      success: true,
      media: mediaRecord,
      message: 'File uploaded and encrypted successfully.',
    }, { status: 201 });
  } catch (err) {
    console.error('Media upload error:', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to upload media file. Please try again.' },
      { status: 500 }
    );
  }
}
