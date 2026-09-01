/**
 * Client-Side Zero-Knowledge Cryptography for Panda Vault Items
 * Uses the standard Web Crypto API (SubtleCrypto) available in all modern browsers.
 */

/**
 * Derive an AES-256-GCM key from a user master passphrase and salt using PBKDF2
 */
export async function deriveClientKey(passphrase, saltHex) {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API is only available in browser contexts');
  }

  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const salt = hexToBytes(saltHex);

  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * Encrypt arbitrary JSON or text data in the browser with AES-GCM
 */
export async function encryptClientVaultItem(data, cryptoKey) {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API is only available in browser contexts');
  }

  const enc = new TextEncoder();
  const plaintext = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    cryptoKey,
    enc.encode(plaintext)
  );

  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
    version: 1,
  };
}

/**
 * Decrypt ciphertext in the browser using the derived AES-GCM key
 */
export async function decryptClientVaultItem(encryptedPayload, cryptoKey) {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API is only available in browser contexts');
  }

  const iv = hexToBytes(encryptedPayload.iv);
  const ciphertext = hexToBytes(encryptedPayload.ciphertext);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    cryptoKey,
    ciphertext
  );

  const dec = new TextDecoder();
  const plaintext = dec.decode(decrypted);

  try {
    return JSON.parse(plaintext);
  } catch {
    return plaintext;
  }
}

/**
 * Helper to generate random hex string (for salts, tokens)
 */
export function generateRandomHex(length = 16) {
  const bytes = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
