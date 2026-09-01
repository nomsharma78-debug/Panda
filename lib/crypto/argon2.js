import { argon2id } from 'hash-wasm';
import crypto from 'crypto';

/**
 * Argon2id parameters adhering to OWASP recommendations:
 * Memory: 64MB (65536 KB)
 * Iterations (Time): 3
 * Parallelism: 4
 * Hash length: 32 bytes
 * Salt length: 16 bytes
 */
const ARGON2_CONFIG = {
  memorySize: 65536,
  iterations: 3,
  parallelism: 4,
  hashLength: 32,
  outputType: 'encoded', // Generates standard PHC format: $argon2id$v=19$m=65536,t=3,p=4$...
};

/**
 * Hash a user authentication password using Argon2id.
 * @param {string} password - Raw user password.
 * @returns {Promise<string>} Encoded Argon2id hash.
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  // Generate 16 bytes cryptographically secure random salt
  const salt = crypto.randomBytes(16);

  const encodedHash = await argon2id({
    password,
    salt,
    parallelism: ARGON2_CONFIG.parallelism,
    iterations: ARGON2_CONFIG.iterations,
    memorySize: ARGON2_CONFIG.memorySize,
    hashLength: ARGON2_CONFIG.hashLength,
    outputType: 'encoded',
  });

  return encodedHash;
}

/**
 * Verify a user password against an Argon2id hash.
 * @param {string} password - Plaintext password attempt.
 * @param {string} encodedHash - Stored Argon2id PHC encoded hash.
 * @returns {Promise<boolean>} True if password matches.
 */
export async function verifyPassword(password, encodedHash) {
  if (!password || !encodedHash) {
    return false;
  }

  try {
    // Parse PHC string: $argon2id$v=19$m=65536,t=3,p=4$<salt_b64>$<hash_b64>
    const parts = encodedHash.split('$');
    if (parts.length < 6 || parts[1] !== 'argon2id') {
      return false;
    }

    const versionStr = parts[2]; // v=19
    const paramsStr = parts[3]; // m=65536,t=3,p=4
    const saltBase64 = parts[4];
    const expectedHashBase64 = parts[5];

    // Parse parameters
    const params = {};
    paramsStr.split(',').forEach((item) => {
      const [k, v] = item.split('=');
      params[k] = parseInt(v, 10);
    });

    const memorySize = params.m || ARGON2_CONFIG.memorySize;
    const iterations = params.t || ARGON2_CONFIG.iterations;
    const parallelism = params.p || ARGON2_CONFIG.parallelism;

    // Decode salt from standard base64 (or b64 without padding)
    const saltBuffer = Buffer.from(saltBase64, 'base64');

    // Compute hash with same parameters
    const computedEncoded = await argon2id({
      password,
      salt: saltBuffer,
      parallelism,
      iterations,
      memorySize,
      hashLength: ARGON2_CONFIG.hashLength,
      outputType: 'encoded',
    });

    // Constant-time comparison
    const computedParts = computedEncoded.split('$');
    const computedHashBase64 = computedParts[5];

    if (!computedHashBase64 || !expectedHashBase64) {
      return false;
    }

    const computedBuf = Buffer.from(computedHashBase64);
    const expectedBuf = Buffer.from(expectedHashBase64);

    if (computedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuf, expectedBuf);
  } catch (err) {
    console.error('Argon2id verification error:', err.message);
    return false;
  }
}
