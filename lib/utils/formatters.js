/**
 * Centralized formatting utilities for Panda
 */

/**
 * Format bytes into human-readable strings (e.g., "12.4 MB", "1.5 GB")
 * @param {number|string} bytes
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 1) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  const safeIndex = Math.min(i, sizes.length - 1);

  return `${parseFloat((num / Math.pow(k, safeIndex)).toFixed(dm))} ${sizes[safeIndex]}`;
}

/**
 * Format a date timestamp into a localized short date (e.g. "Sep 5, 2026")
 * @param {string|Date|number} dateValue
 * @returns {string}
 */
export function formatDate(dateValue) {
  if (!dateValue) return '';
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Format a date timestamp into relative time string (e.g. "2 hours ago", "Yesterday")
 * @param {string|Date|number} dateValue
 * @returns {string}
 */
export function formatRelativeTime(dateValue) {
  if (!dateValue) return '';
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return '';
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 30) return `${diffDay}d ago`;
    return formatDate(dateValue);
  } catch {
    return '';
  }
}

/**
 * Truncate a string with an ellipsis if it exceeds maxLength
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateString(str, maxLength = 30) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
}

/**
 * Mask sensitive strings such as card numbers or API keys
 * @param {string} str
 * @param {number} visibleTrailingChars
 * @returns {string}
 */
export function maskSensitive(str, visibleTrailingChars = 4) {
  if (!str || typeof str !== 'string') return '••••';
  if (str.length <= visibleTrailingChars) return '••••';
  const visible = str.slice(-visibleTrailingChars);
  return `•••• •••• •••• ${visible}`;
}
