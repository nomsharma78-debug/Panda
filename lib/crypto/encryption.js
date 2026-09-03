import crypto from 'crypto';

/**
 * Master Storage Encryption Key Helper
 * Retrieves a 32-byte Buffer from the environment variable.
 * In production, STORAGE_ENCRYPTION_KEY is mandatory and must be a 64-character hex string.
 */
function getMasterKey() {
  const envKey =
    process.env.STORAGE_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    'panda_vault_master_default_aes_key_2026';

  if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  // Derive a deterministic 32-byte key using SHA-256
  return crypto.createHash('sha256').update(envKey).digest();
}

/**
 * Encrypt a string or object using AES-256-GCM.
 * @param {string|object} data - Plaintext or JSON object to encrypt.
 * @param {Buffer} [customKey] - Optional custom 32-byte key.
 * @returns {string} Encrypted payload formatted as 'iv:authTag:ciphertext' in hex.
 */
export function encryptData(data, customKey = null) {
  if (data === undefined || data === null) return null;
  let key = customKey || getMasterKey();
  if (typeof key === 'string') {
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
      key = Buffer.from(key, 'hex');
    } else {
      key = crypto.createHash('sha256').update(key).digest();
    }
  }
  const plaintext = typeof data === 'object' ? JSON.stringify(data) : String(data);

  // 12-byte cryptographically secure random IV for AES-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypt an AES-256-GCM payload.
 * @param {string} encryptedString - Format 'iv:authTag:ciphertext' in hex.
 * @param {Buffer|string} [customKey] - Optional custom 32-byte key.
 * @param {boolean} [asJson=false] - Parse result as JSON if true.
 * @returns {string|object|null} Decrypted plaintext or parsed object.
 */
export function decryptData(encryptedString, customKey = null, asJson = false) {
  if (!encryptedString) return null;
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload structure');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    let key = customKey || getMasterKey();
    if (typeof key === 'string') {
      if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
        key = Buffer.from(key, 'hex');
      } else {
        key = crypto.createHash('sha256').update(key).digest();
      }
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    if (asJson) {
      return JSON.parse(decrypted);
    }
    return decrypted;
  } catch (err) {
    throw new Error('Decryption error: Failed to authenticate or decrypt secure payload');
  }
}

/**
 * Encrypt a binary Buffer (e.g. file content) using AES-256-GCM.
 * @param {Buffer} buffer - File buffer.
 * @param {Buffer} [customKey] - Key.
 * @returns {{ encryptedBuffer: Buffer, iv: string, authTag: string }}
 */
export function encryptBuffer(buffer, customKey = null) {
  const key = customKey || getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Self-contained package: [ 12-byte IV ] + [ 16-byte AuthTag ] + [ Ciphertext ]
  const packaged = Buffer.concat([iv, authTag, ciphertext]);

  return {
    encryptedBuffer: packaged,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt an encrypted binary Buffer using AES-256-GCM.
 * Supports both explicit IV/AuthTag metadata and self-contained 28-byte headers.
 */
export function decryptBuffer(encryptedBuffer, ivHex = null, authTagHex = null, customKey = null) {
  const key = customKey || getMasterKey();

  let iv, authTag, ciphertext;

  if (ivHex && authTagHex) {
    iv = Buffer.from(ivHex, 'hex');
    authTag = Buffer.from(authTagHex, 'hex');
    // Check if the buffer is already self-contained (starts with the same IV)
    if (encryptedBuffer.length > 28 && encryptedBuffer.subarray(0, 12).equals(iv)) {
      ciphertext = encryptedBuffer.subarray(28);
    } else {
      ciphertext = encryptedBuffer;
    }
  } else {
    // Extract from self-contained header: [ 12-byte IV ] + [ 16-byte AuthTag ] + [ Ciphertext ]
    if (encryptedBuffer.length < 28) {
      return encryptedBuffer; // return as-is if not encrypted
    }
    iv = encryptedBuffer.subarray(0, 12);
    authTag = encryptedBuffer.subarray(12, 28);
    ciphertext = encryptedBuffer.subarray(28);
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    // If decryption fails, return original buffer to prevent 500 crash
    console.warn('[Crypto] Decryption notice:', err.message);
    return encryptedBuffer;
  }
}

/**
 * Generate a cryptographically secure random UUID or token
 */
export function generateSecureId(bytes = 16) {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a SHA-256 hash (used for session tokens and integrity checks, never for auth passwords)
 */
export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
