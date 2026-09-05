import path from 'path';
import {
  BLOCKED_FILE_EXTENSIONS,
  SUPPORTED_PROVIDERS,
  MAX_UPLOAD_SIZE_BYTES,
  MEDIA_CATEGORIES,
} from '../constants/index.js';

export { BLOCKED_FILE_EXTENSIONS, SUPPORTED_PROVIDERS, MAX_UPLOAD_SIZE_BYTES, MEDIA_CATEGORIES };

/**
 * Validate email address format according to RFC 5322 standard regex.
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate password strength:
 * - At least 8 characters
 * - Contains at least one number
 * - Contains at least one uppercase letter
 * - Contains at least one lowercase letter
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Sanitize filenames to prevent path traversal, null byte injection, and dangerous characters.
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') return 'unnamed_file';

  // Strip null bytes and control characters
  let clean = filename.replace(/\0/g, '').replace(/[\r\n\t]/g, '');

  // Strip directory paths (both POSIX and Windows separators)
  clean = clean.replace(/\\/g, '/');
  clean = path.basename(clean);

  // Replace non-whitelisted characters
  clean = clean.replace(/[^a-zA-Z0-9._\-\s()]/g, '_').trim();

  // Prevent hidden file dots or empty filename
  clean = clean.replace(/^\.+/, '');
  return clean || 'unnamed_file';
}

/**
 * Validate file upload safety (extension, size, and MIME).
 */
export function validateUploadFile({ filename, fileSize, mimeType, maxSizeBytes = MAX_UPLOAD_SIZE_BYTES }) {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, error: 'Filename is required' };
  }

  // Check null bytes or path traversal
  if (filename.includes('\0') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, error: 'Invalid or dangerous filename detected' };
  }

  // Check executable extension
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_FILE_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Upload of executable file type '${ext}' is prohibited for security reasons` };
  }

  // Check file size
  if (fileSize <= 0) {
    return { valid: false, error: 'File cannot be empty' };
  }
  if (fileSize > maxSizeBytes) {
    return { valid: false, error: `File size exceeds the allowed maximum limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB` };
  }

  // Check MIME format
  if (!mimeType || typeof mimeType !== 'string' || !mimeType.includes('/')) {
    return { valid: false, error: 'Valid MIME type is required' };
  }

  return { valid: true };
}

/**
 * Categorize MIME type and filename into primary media categories.
 */
export function getMediaTypeFromMime(mimeType, filename = '') {
  if (filename && filename.toLowerCase().match(/\.cdr(\.enc)?$/i)) return MEDIA_CATEGORIES.CDR;
  if (!mimeType) return MEDIA_CATEGORIES.OTHER;
  const mime = mimeType.toLowerCase();

  if (mime.includes('cdr') || mime.includes('coreldraw')) return MEDIA_CATEGORIES.CDR;
  if (mime.startsWith('image/')) return MEDIA_CATEGORIES.PHOTO;
  if (mime.startsWith('video/')) return MEDIA_CATEGORIES.VIDEO;
  if (mime === 'application/pdf') return MEDIA_CATEGORIES.PDF;
  if (
    mime.includes('document') ||
    mime.includes('word') ||
    mime.includes('text') ||
    mime.includes('presentation') ||
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('powerpoint') ||
    mime.includes('opendocument')
  ) {
    return MEDIA_CATEGORIES.DOCUMENT;
  }
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('gzip') || mime.includes('rar') || mime.includes('7z')) {
    return MEDIA_CATEGORIES.ARCHIVE;
  }
  return MEDIA_CATEGORIES.OTHER;
}

/**
 * Validate storage connection input
 */
export function validateStorageInput(input) {
  const { provider, name, bucket, endpoint, accessKey, secretKey } = input || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, message: 'Storage connection name is required' };
  }

  if (!provider || !SUPPORTED_PROVIDERS.includes(provider.toLowerCase())) {
    return { valid: false, message: `Invalid provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}` };
  }

  // Local/built-in provider is dev only
  if (provider === 'local') {
    if (process.env.NODE_ENV === 'production') {
      return { valid: false, message: 'Local sandbox storage is disabled in production. Please connect Cloudflare R2, Backblaze B2, or Amazon S3.' };
    }
    return { valid: true };
  }

  if (!bucket || typeof bucket !== 'string' || bucket.trim().length === 0) {
    return { valid: false, message: 'Bucket name is required' };
  }

  if (!accessKey || typeof accessKey !== 'string' || accessKey.trim().length === 0) {
    return { valid: false, message: 'Access Key ID is required' };
  }

  if (!secretKey || typeof secretKey !== 'string' || secretKey.trim().length === 0) {
    return { valid: false, message: 'Secret Access Key is required' };
  }

  return { valid: true };
}
