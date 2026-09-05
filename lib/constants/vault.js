/**
 * Vault Constants, Category Definitions, and Defaults
 */

export const VAULT_TYPES = Object.freeze({
  ALL: 'all',
  LOGIN: 'login',
  CARD: 'card',
  NOTE: 'note',
  IDENTITY: 'identity',
});

export const VAULT_CATEGORIES = Object.freeze([
  { id: VAULT_TYPES.LOGIN, label: 'Passwords', description: 'Web credentials & master keys' },
  { id: VAULT_TYPES.CARD, label: 'Payment Cards', description: 'Credit, debit, and bank cards' },
  { id: VAULT_TYPES.NOTE, label: 'Secure Notes', description: 'Recovery seeds & private notes' },
  { id: VAULT_TYPES.IDENTITY, label: 'Identities', description: 'Passports, IDs, and personal records' },
]);
