/**
 * Centralized Application Event Names
 * Used across components, hooks, and pages for decoupled reactive updates.
 */

export const PANDA_EVENTS = Object.freeze({
  /** Triggered when storage connections or quota metrics change */
  STORAGE_UPDATED: 'panda:storage:updated',
  /** Triggered when vault items are created, edited, or deleted */
  VAULT_UPDATED: 'panda:vault:updated',
  /** Triggered when media files are uploaded, modified, or deleted */
  MEDIA_UPLOADED: 'panda:media:uploaded',
  /** Triggered when a user logs out to purge sensitive volatile memory */
  USER_LOGOUT: 'panda:user:logout',
});

/**
 * Dispatch a strongly-typed custom window event safely across SSR and browser environments.
 * @param {string} eventName
 * @param {object} [detail={}]
 */
export function dispatchPandaEvent(eventName, detail = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}
