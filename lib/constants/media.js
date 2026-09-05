/**
 * Media Constants, MIME Mapping & Security Restrictions
 */

export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Dangerous executable file extensions list to prevent malicious binary execution.
 */
export const BLOCKED_FILE_EXTENSIONS = Object.freeze([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.php', '.phtml', '.php3', '.php4', '.php5',
  '.js', '.mjs', '.cjs', '.vbs', '.vbe', '.wsf', '.wsh', '.ps1', '.dll', '.scr',
  '.msi', '.msp', '.com', '.hta', '.cpl', '.jar', '.apk', '.iso', '.img',
]);

/**
 * Primary Media Category identifiers
 */
export const MEDIA_CATEGORIES = Object.freeze({
  ALL: 'all',
  PHOTO: 'photo',
  PHOTOS: 'photo',
  VIDEO: 'video',
  VIDEOS: 'video',
  AUDIO: 'audio',
  PDF: 'pdf',
  PDFS: 'pdf',
  DOCUMENT: 'document',
  DOCUMENTS: 'document',
  CDR: 'cdr',
  ARCHIVE: 'archive',
  ARCHIVES: 'archive',
  OTHER: 'other',
});

/**
 * Category tab definitions for the Media Gallery
 */
export const MEDIA_TABS = Object.freeze([
  { id: MEDIA_CATEGORIES.ALL, label: 'All Files' },
  { id: MEDIA_CATEGORIES.PHOTO, label: 'Photos' },
  { id: MEDIA_CATEGORIES.VIDEO, label: 'Videos' },
  { id: MEDIA_CATEGORIES.PDF, label: 'PDFs' },
  { id: MEDIA_CATEGORIES.DOCUMENT, label: 'Documents' },
  { id: MEDIA_CATEGORIES.CDR, label: 'CorelDRAW' },
  { id: MEDIA_CATEGORIES.ARCHIVE, label: 'Archives' },
]);
