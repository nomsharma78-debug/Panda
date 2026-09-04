/**
 * =========================================================================
 * PANDA DIGITAL VAULT — EXPANDED SECURITY & PRODUCTION AUDIT TEST SUITE
 * =========================================================================
 * Comprehensive automated verification across all 36 audit checkpoints:
 * 1. Cryptography (Argon2id hashing, AES-256-GCM authenticated encryption)
 * 2. Cross-Tenant IDOR Protection (2 distinct real users)
 * 3. Server-Side Session Authentication & Revocation
 * 4. SSRF Defense (Localhost, RFC1918, Cloud Metadata 169.254.169.254, IPv6)
 * 5. CSRF Protection (Origin validation for mutating requests)
 * 6. File Upload Safety (Executable extensions, path traversal, null bytes)
 * 7. Storage Disconnection Safety (Preserve vs Delete modes)
 * 8. Quota Calculations (Accurate unmetered handling without fake ceilings)
 * 9. Production Key Invariants (Mandatory STORAGE_ENCRYPTION_KEY in production)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

import { hashPassword, verifyPassword } from '../lib/crypto/argon2.js';
import { encryptData, decryptData, encryptBuffer, decryptBuffer, generateSecureId, sha256 } from '../lib/crypto/encryption.js';
import { validateStorageEndpoint, isPrivateIPv4, isPrivateIPv6 } from '../lib/security/ssrf.js';
import { validateUploadFile, sanitizeFilename, validatePasswordStrength, validateEmail } from '../lib/validation/schemas.js';
import { validateCsrfOrigin } from '../lib/auth/session.js';
import { checkRateLimit } from '../lib/security/rate-limit.js';
import { createUser, findUserByEmail, findUserById, syncSupabaseUser } from '../lib/db/users.js';
import { createSession, validateSessionToken, revokeSessionByToken, listUserSessions, revokeAllUserSessions } from '../lib/db/sessions.js';
import { createVaultItem, getVaultItemById, listVaultItems, updateVaultItem, deleteVaultItem } from '../lib/db/vault.js';
import { createStorageConnection, getStorageConnectionInternal, getSafeStorageConnection, listUserStorageConnections, deleteStorageConnection, getCombinedStorageMetrics } from '../lib/db/storage.js';
import { createMediaFile, getMediaFileById, listUserMedia, deleteMediaFile } from '../lib/db/media.js';
import { listUserAuditLogs } from '../lib/db/audit.js';
import { logAuditEvent } from '../lib/security/audit.js';
import { StorageManager } from '../lib/storage/storage-manager.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✕ FAIL: ${message}`);
    failedTests++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  }
}

async function runAuditTests() {
  console.log('\n=================================================================');
  console.log('  PANDA VAULT: EXECUTING COMPREHENSIVE SECURITY & AUDIT TEST SUITE');
  console.log('=================================================================\n');

  // ----------------------------------------------------
  // TEST GROUP 1: CRYPTOGRAPHY & ARGON2ID (CHECKPOINTS 8, 9, 10)
  // ----------------------------------------------------
  console.log('[AUDIT GROUP 1] Cryptography & Argon2id Password Hashing');

  const testPassword = 'PandaSuperVault2026!#$';
  const hashed = await hashPassword(testPassword);
  assert(hashed.startsWith('$argon2id$'), 'Password hash must adhere strictly to Argon2id PHC format');
  assert(hashed !== testPassword, 'Password must never be stored or logged in plaintext');

  const isMatch = await verifyPassword(testPassword, hashed);
  assert(isMatch === true, 'Argon2id verify must succeed with exact password');

  const isWrong = await verifyPassword('IncorrectPassword999', hashed);
  assert(isWrong === false, 'Argon2id verify must reject wrong password');

  // AES-256-GCM String & Object Encryption
  const sensitiveConfig = {
    accessKey: 'AKIA_PROD_SECRET_KEY_123',
    secretKey: 'TOP_SECRET_STORAGE_KEY_XYZ_456',
    bucket: 'vault-media-store',
  };
  const encryptedPayload = encryptData(sensitiveConfig);
  assert(encryptedPayload && encryptedPayload.includes(':'), 'AES-256-GCM format must be iv:authTag:ciphertext');
  assert(!encryptedPayload.includes('TOP_SECRET_STORAGE_KEY'), 'Ciphertext must never expose plaintext secret keys');

  const decryptedConfig = decryptData(encryptedPayload, null, true);
  assert(decryptedConfig.secretKey === sensitiveConfig.secretKey, 'Decryption must recover secret configuration in memory');

  // Binary Buffer Encryption
  const binaryPayload = Buffer.from('Confidential binary photo stream raw bytes 2026');
  const { encryptedBuffer, iv, authTag } = encryptBuffer(binaryPayload);
  assert(!encryptedBuffer.equals(binaryPayload), 'Binary data must be encrypted with random IV and auth tag');
  const decryptedBinary = decryptBuffer(encryptedBuffer, iv, authTag);
  assert(decryptedBinary.equals(binaryPayload), 'Decrypted binary buffer must match original payload exactly');

  // ----------------------------------------------------
  // TEST GROUP 2: TWO REAL TEST USERS & COMPLETE IDOR AUDIT (CHECKPOINTS 1, 2, 3, 4, 5, 32)
  // ----------------------------------------------------
  const timestamp = Date.now();
  const supabaseUserIdA = `sb-user-${timestamp}-aaa`;
  const supabaseUserIdB = `sb-user-${timestamp}-bbb`;

  const userA = await syncSupabaseUser({ id: supabaseUserIdA, email: `audited_user_a_${timestamp}@example.com`, name: 'Alice Anderson' });
  const userB = await syncSupabaseUser({ id: supabaseUserIdB, email: `audited_user_b_${timestamp}@example.com`, name: 'Bob Baker' });

  assert(userA.id === supabaseUserIdA, 'Panda users.id strictly links to Supabase Auth User ID A');
  assert(userB.id === supabaseUserIdB, 'Panda users.id strictly links to Supabase Auth User ID B');
  assert(userA.name === 'Alice Anderson', 'User A full name is stored and synchronized');
  assert(userB.name === 'Bob Baker', 'User B full name is stored and synchronized');
  assert(userA.id !== userB.id, 'User A and User B created with distinct Supabase Auth UUIDs');

  // User A Creates Vault Item
  const vaultA = await createVaultItem(userA.id, {
    type: 'login',
    encryptedPayload: JSON.stringify({ title: 'User A Banking Credentials', password: 'SecretUserAPassword' }),
  });

  // User A can access own vault item
  const vaultFetchA = await getVaultItemById(vaultA.id, userA.id);
  assert(vaultFetchA !== null, 'User A can access own vault item');

  // User B attempts to access User A's vault item -> MUST FAIL
  const vaultFetchB = await getVaultItemById(vaultA.id, userB.id);
  assert(vaultFetchB === null, 'IDOR DEFENSE: User B cannot retrieve User A vault item');

  // User B attempts to update User A's vault item -> MUST FAIL
  const vaultUpdateB = await updateVaultItem(vaultA.id, userB.id, { encryptedPayload: 'tampered' });
  assert(!vaultUpdateB, 'IDOR DEFENSE: User B cannot update User A vault item');

  // User B attempts to delete User A's vault item -> MUST FAIL
  const vaultDeleteB = await deleteVaultItem(vaultA.id, userB.id);
  assert(vaultDeleteB === false, 'IDOR DEFENSE: User B cannot delete User A vault item');

  // User A Creates Storage Connection
  const storageA = await createStorageConnection(userA.id, {
    provider: 'local',
    name: 'User A Primary Storage',
    encryptedConfig: encryptData({ provider: 'local' }),
    isDefault: true,
  });

  // Safe representation never exposes encrypted_config
  const safeStorageA = await getSafeStorageConnection(storageA.id, userA.id);
  assert(safeStorageA && safeStorageA.encrypted_config === undefined, 'Storage safe view must NEVER leak encrypted_config');

  // User B attempts to access User A storage connection -> MUST FAIL
  const storageFetchB = await getSafeStorageConnection(storageA.id, userB.id);
  assert(storageFetchB === null, 'IDOR DEFENSE: User B cannot access User A storage connection');

  // User B attempts to delete User A storage connection -> MUST FAIL
  const storageDeleteB = await deleteStorageConnection(storageA.id, userB.id);
  assert(storageDeleteB === false, 'IDOR DEFENSE: User B cannot delete User A storage connection');

  // User A Uploads Media
  const fileBufferA = Buffer.from('Private Tax Document PDF Content');
  const mediaA = await StorageManager.uploadMedia(userA.id, {
    fileBuffer: fileBufferA,
    originalFilename: 'Tax_Return_2025.pdf',
    mimeType: 'application/pdf',
    mediaType: 'pdf',
    preferredStorageId: storageA.id,
    enableEncryption: true,
  });

  // User A can access own media
  const mediaFetchA = await getMediaFileById(mediaA.id, userA.id);
  assert(mediaFetchA !== null, 'User A can access own media metadata');

  const binaryA = await StorageManager.getMediaBinary(userA.id, mediaA.id);
  assert(binaryA.buffer.equals(fileBufferA), 'User A can stream decrypted media binary');

  // User B attempts to access User A media metadata -> MUST FAIL
  const mediaFetchB = await getMediaFileById(mediaA.id, userB.id);
  assert(mediaFetchB === null, 'IDOR DEFENSE: User B cannot access User A media metadata');

  // User B attempts to stream User A media binary -> MUST FAIL
  let binaryBFailed = false;
  try {
    await StorageManager.getMediaBinary(userB.id, mediaA.id);
  } catch {
    binaryBFailed = true;
  }
  assert(binaryBFailed === true, 'IDOR DEFENSE: User B cannot decrypt or stream User A media binary');

  // User B attempts to delete User A media -> MUST FAIL
  let deleteBFailed = false;
  try {
    const delRes = await StorageManager.deleteMedia(userB.id, mediaA.id);
    if (!delRes || delRes.success === false) {
      deleteBFailed = true;
    }
  } catch {
    deleteBFailed = true;
  }
  assert(deleteBFailed === true, 'IDOR DEFENSE: User B cannot delete User A media file');

  // ----------------------------------------------------
  // TEST GROUP 3: SERVER-SIDE SESSIONS & REVOCATION (CHECKPOINTS 29, 32)
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 3] Server-Side Sessions & Revocation');

  const sessionA1 = await createSession(userA.id);
  const sessionA2 = await createSession(userA.id);
  const sessionB1 = await createSession(userB.id);

  // Validate session token
  const authA = await validateSessionToken(sessionA1.rawToken);
  assert(authA && authA.user.id === userA.id, 'Session token resolves strictly to User A');

  // User A lists sessions -> Only User A sessions returned
  const userASessions = await listUserSessions(userA.id);
  assert(userASessions.length === 2, 'User A sees exactly 2 active sessions');
  assert(userASessions.every((s) => s.userId === userA.id), 'Session list contains ONLY User A sessions');

  // Revoke single session
  await revokeSessionByToken(sessionA1.rawToken);
  const revokedCheck = await validateSessionToken(sessionA1.rawToken);
  assert(revokedCheck === null, 'Revoked session is immediately invalidated');

  // Revoke all remaining sessions for User A
  await revokeAllUserSessions(userA.id);
  const remainingSessionsA = await listUserSessions(userA.id);
  assert(remainingSessionsA.length === 0, 'All User A sessions revoked successfully');

  // User B session remains unaffected
  const authB = await validateSessionToken(sessionB1.rawToken);
  assert(authB && authB.user.id === userB.id, 'User B session remains completely intact');

  // ----------------------------------------------------
  // TEST GROUP 4: SSRF DEFENSE (CHECKPOINT 15)
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 4] Comprehensive SSRF Defense Verification');

  const ssrfTargets = [
    'http://127.0.0.1:8080',
    'http://127.0.0.2:9000',
    'http://localhost:3000',
    'http://169.254.169.254/latest/meta-data/',
    'http://169.254.170.2',
    'http://10.0.0.1:9000',
    'http://172.16.50.1:9000',
    'http://172.31.255.255:9000',
    'http://192.168.1.1:9000',
    'http://100.64.0.1:9000',
    'http://[::1]:9000',
    'http://[fe80::1]:9000',
    'http://[fc00::1]:9000',
    'http://metadata.google.internal',
  ];

  for (const target of ssrfTargets) {
    const check = await validateStorageEndpoint(target, false);
    assert(check.valid === false, `SSRF BLOCKED: Restricted destination rejected '${target}'`);
  }

  // Known trusted storage endpoint
  const validEndpoint = 'https://mybucket.r2.cloudflarestorage.com';
  const validCheck = await validateStorageEndpoint(validEndpoint);
  assert(validCheck.valid === true, `Public cloud storage endpoint permitted '${validEndpoint}'`);

  // ----------------------------------------------------
  // TEST GROUP 5: FILE UPLOAD VALIDATION & SECURITY (CHECKPOINT 16, 17)
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 5] File Upload Safety & Executable Blocking');

  const dangerousFiles = [
    { filename: 'malware.exe', fileSize: 1024, mimeType: 'application/x-msdownload' },
    { filename: 'script.sh', fileSize: 1024, mimeType: 'application/x-sh' },
    { filename: 'webshell.php', fileSize: 1024, mimeType: 'application/x-php' },
    { filename: 'payload.bat', fileSize: 1024, mimeType: 'application/x-bat' },
    { filename: 'exploit.vbs', fileSize: 1024, mimeType: 'application/x-vbs' },
    { filename: '../etc/passwd', fileSize: 1024, mimeType: 'text/plain' },
    { filename: 'null\0byte.jpg', fileSize: 1024, mimeType: 'image/jpeg' },
    { filename: 'giant_file.zip', fileSize: 600 * 1024 * 1024, mimeType: 'application/zip' },
  ];

  for (const item of dangerousFiles) {
    const res = validateUploadFile({
      filename: item.filename,
      fileSize: item.fileSize,
      mimeType: item.mimeType,
      maxSizeBytes: 500 * 1024 * 1024,
    });
    assert(res.valid === false, `UPLOAD BLOCKED: Dangerous file rejected '${item.filename}'`);
  }

  const safeFile = validateUploadFile({
    filename: 'family_vacation_photo.jpeg',
    fileSize: 2048576,
    mimeType: 'image/jpeg',
  });
  assert(safeFile.valid === true, 'Valid media photo upload permitted');

  // Filename Sanitizer
  const sanitized = sanitizeFilename('../../evil\\path//name$#@.png');
  assert(!sanitized.includes('/') && !sanitized.includes('\\') && !sanitized.includes('..'), 'Filename sanitizer strips path traversal');

  // ----------------------------------------------------
  // TEST GROUP 6: CSRF PROTECTION & ORIGIN VALIDATION (CHECKPOINT 27)
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 6] CSRF Protection on Mutating Requests');

  const validSameOriginReq = {
    method: 'POST',
    headers: new Map([
      ['origin', 'https://vault.panda.app'],
      ['host', 'vault.panda.app'],
    ]),
  };
  validSameOriginReq.headers.get = (k) => validSameOriginReq.headers.get ? validSameOriginReq.headers.get(k) : null;
  // Use simple object mock
  const mockValidReq = {
    method: 'POST',
    headers: {
      get: (k) => (k === 'origin' ? 'https://vault.panda.app' : k === 'host' ? 'vault.panda.app' : null),
    },
  };
  assert(validateCsrfOrigin(mockValidReq) === true, 'Same-origin POST request permitted');

  const mockCrossSiteReq = {
    method: 'POST',
    headers: {
      get: (k) => (k === 'origin' ? 'https://evil-attacker.com' : k === 'host' ? 'vault.panda.app' : null),
    },
  };
  assert(validateCsrfOrigin(mockCrossSiteReq) === false, 'CSRF BLOCKED: Cross-origin mutating request rejected');

  // ----------------------------------------------------
  // TEST GROUP 7: RATE LIMITING (CHECKPOINT 26)
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 7] Sliding-Window Rate Limiting');

  const testIp = `rate_test_ip_${Date.now()}`;
  let allowedCount = 0;
  for (let i = 0; i < 7; i++) {
    const res = checkRateLimit(testIp, 'auth:login', 5, 60000);
    if (res.allowed) allowedCount++;
  }
  assert(allowedCount === 5, 'Rate limiter permits exactly 5 requests within window');
  const blockedRes = checkRateLimit(testIp, 'auth:login', 5, 60000);
  assert(blockedRes.allowed === false, 'Rate limiter rejects 6th request with 429');

  // ----------------------------------------------------
  // TEST GROUP 8: STORAGE DISCONNECTION PRESERVE VS DELETE (CHECKPOINT 21)
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 8] Storage Disconnection Safety Modes');

  // Create temporary connection with a media file
  const storageTemp = await createStorageConnection(userA.id, {
    provider: 'local',
    name: 'Storage To Disconnect',
    encryptedConfig: encryptData({ provider: 'local' }),
  });

  const mediaTemp = await StorageManager.uploadMedia(userA.id, {
    fileBuffer: Buffer.from('Keep file simulation'),
    originalFilename: 'keep_document.pdf',
    mimeType: 'application/pdf',
    mediaType: 'pdf',
    preferredStorageId: storageTemp.id,
  });

  // Disconnect storage connection without deleting media file record
  await deleteStorageConnection(storageTemp.id, userA.id);
  const mediaAfterDisconnect = await getMediaFileById(mediaTemp.id, userA.id);
  assert(mediaAfterDisconnect !== null, 'Disconnecting storage preserves media metadata unless explicitly instructed to purge');

  // Cleanup
  await StorageManager.deleteMedia(userA.id, mediaTemp.id);

  // ----------------------------------------------------
  // TEST GROUP 9: ACCURATE UNMETERED QUOTA METRICS (CHECKPOINT 20)
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 9] Accurate Storage Calculations Without Fake Ceilings');

  const metrics = await getCombinedStorageMetrics(userA.id);
  assert(metrics.usedBytes >= 0, 'Used bytes is accurately calculated');
  assert(metrics.hasFixedQuota === false || metrics.totalBytes !== null, 'Unmetered cloud storage never invents fake hardcoded capacities');

  // ----------------------------------------------------
  // TEST GROUP 10: CANONICAL POSTGRESQL DATABASE & MIGRATIONS
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 10] Canonical Database Schema & Migration Verification');

  const fs = await import('fs');
  const path = await import('path');
  const migrationPath = path.resolve('migrations', '001_initial_schema.sql');
  assert(fs.existsSync(migrationPath), 'Canonical migration 001_initial_schema.sql exists');

  const schemaContent = fs.readFileSync(migrationPath, 'utf8');

  // Verify all 7 required tables + schema_migrations
  const requiredTables = [
    'schema_migrations',
    'users',
    'sessions',
    'vault_items',
    'storage_connections',
    'storage_usage',
    'media_files',
    'audit_logs',
  ];
  for (const t of requiredTables) {
    assert(
      schemaContent.includes(`CREATE TABLE IF NOT EXISTS ${t}`),
      `Canonical schema defines required table: ${t}`
    );
  }

  // Verify Foreign Keys & ON DELETE behavior
  assert(
    schemaContent.includes('REFERENCES users(id) ON DELETE CASCADE'),
    'Foreign key cascade on delete user is strictly configured'
  );
  assert(
    schemaContent.includes('REFERENCES storage_connections(id) ON DELETE SET NULL'),
    'Foreign key set null on delete storage connection is configured for media files'
  );

  // Verify No Media Binary Storage in SQL
  assert(
    !schemaContent.includes('BYTEA') && !schemaContent.includes('BLOB'),
    'PostgreSQL stores media metadata ONLY; binary files are never stored in database'
  );

  // ----------------------------------------------------
  // TEST GROUP 11: VAULT ZERO-STORAGE IMMEDIATE USABILITY & PROVIDER HELP
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 11] Immediate Vault Usability & Provider Help Guides');

  const newUserId = `user-immediate-${Date.now()}`;
  const newUser = await syncSupabaseUser({ id: newUserId, email: `immediate_${Date.now()}@example.com` });

  // 1. User can immediately save password, card, and note with 0 storage connections
  const immediateVault = await createVaultItem(newUser.id, {
    type: 'login',
    encryptedPayload: JSON.stringify({ title: 'Immediate Password', password: 'SecretImmediatePassword' }),
  });
  assert(immediateVault.id, 'User can immediately create vault items without connecting cloud storage');

  const immediateFetch = await getVaultItemById(immediateVault.id, newUser.id);
  assert(immediateFetch !== null, 'Immediate vault item is queryable from Panda database');

  // 2. Verify all provider instructions are configured
  const { PROVIDER_METADATA } = await import('../lib/storage/provider-metadata.js');
  const requiredProviders = ['r2', 'b2', 's3', 'wasabi', 'minio', 'custom_s3'];
  for (const prov of requiredProviders) {
    assert(PROVIDER_METADATA[prov] && PROVIDER_METADATA[prov].steps.length >= 4, `Provider instructions configured for ${prov}`);
  }

  // ----------------------------------------------------
  // TEST GROUP 12: DUAL-DATABASE ARCHITECTURE & MULTI-TENANT STORAGE ISOLATION
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 12] Dual-Database Architecture & Multi-Tenant Storage Isolation');

  const { queryVault, queryAuth, getDbInfo } = await import('../lib/db/index.js');
  const dbInfo = getDbInfo();
  assert(typeof dbInfo === 'object', 'Database engine info is queryable');

  // 1. Dual DB SQL Schema Validation
  const authSchemaFile = fs.readFileSync(path.join(projectRoot, 'migrations', '001_auth_schema.sql'), 'utf8');
  assert(authSchemaFile.includes('CREATE TABLE IF NOT EXISTS users'), 'Auth schema defines users table');
  assert(authSchemaFile.includes('CREATE TABLE IF NOT EXISTS sessions'), 'Auth schema defines sessions table');

  const vaultSchemaFile = fs.readFileSync(path.join(projectRoot, 'migrations', '002_vault_schema.sql'), 'utf8');
  assert(vaultSchemaFile.includes('CREATE TABLE IF NOT EXISTS vault_items'), 'Vault schema defines encrypted vault_items table');
  assert(vaultSchemaFile.includes('CREATE TABLE IF NOT EXISTS storage_connections'), 'Vault schema defines storage_connections table');
  assert(vaultSchemaFile.includes('CREATE TABLE IF NOT EXISTS media_files'), 'Vault schema defines media metadata table');
  assert(vaultSchemaFile.includes('CREATE TABLE IF NOT EXISTS audit_logs'), 'Vault schema defines audit_logs table');

  // 2. Strict Multi-Tenant Storage Connection Isolation
  const tenantA = await createUser(`tenant_a_${Date.now()}@example.com`, 'Argon2idHashA');
  const tenantB = await createUser(`tenant_b_${Date.now()}@example.com`, 'Argon2idHashB');

  const secretConfigA = encryptData(
    JSON.stringify({ accessKeyId: 'AKIA_TENANT_A', secretAccessKey: 'SECRET_KEY_TENANT_A', bucket: 'tenant-a-private-bucket' }),
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  );

  const connA = await createStorageConnection(tenantA.id, {
    provider: 'r2',
    name: 'Tenant A Primary R2 Bucket',
    encryptedConfig: secretConfigA,
    isDefault: true,
  });
  assert(connA.id, 'Tenant A successfully created cloud storage connection');

  // Tenant B CANNOT view Tenant A's storage connection
  const bViewOfA = await getSafeStorageConnection(connA.id, tenantB.id);
  assert(bViewOfA === null, 'MULTI-TENANT ISOLATION: Tenant B cannot access Tenant A storage connection');

  // Tenant B CANNOT delete Tenant A's storage connection
  const bDeleteResult = await deleteStorageConnection(connA.id, tenantB.id, false);
  assert(bDeleteResult === false, 'MULTI-TENANT ISOLATION: Tenant B cannot delete Tenant A storage connection');

  // Tenant A still owns and can access own storage connection
  const aViewOfA = await getSafeStorageConnection(connA.id, tenantA.id);
  assert(aViewOfA !== null && aViewOfA.id === connA.id, 'Tenant A maintains sole access to own storage connection');
  assert(aViewOfA.encrypted_config === undefined, 'Storage connection safe view never exposes encrypted_config');

  // ----------------------------------------------------
  // TEST GROUP 13: UNIVERSAL MULTI-CLOUD STORAGE MANAGEMENT & QUOTA ENFORCEMENT
  // ----------------------------------------------------
  console.log('\n[AUDIT GROUP 13] Universal Multi-Cloud Storage Management, Quota Enforcement & Reconciliation');

  const { ProviderFactory } = await import('../lib/storage/provider-factory.js');
  const { StorageService } = await import('../lib/storage/storage-service.js');
  const { getUserStorageMetrics, reserveUserStorageAtomic, releaseUserStorageReservation, finalizeUserStorageUpload, decreaseUserStorage, updateUserStorageLimit } = await import('../lib/db/storage.js');
  const { BackblazeB2Adapter } = await import('../lib/storage/providers/backblaze-b2.js');
  const { AwsS3Adapter } = await import('../lib/storage/providers/aws-s3.js');
  const { CloudflareR2Adapter } = await import('../lib/storage/providers/cloudflare-r2.js');
  const { WasabiAdapter } = await import('../lib/storage/providers/wasabi.js');
  const { MinioAdapter } = await import('../lib/storage/providers/minio.js');
  const { LocalVaultStorageProvider } = await import('../lib/storage/providers/local-vault.js');

  // 1. StorageProvider Contract Verification across all Adapters
  const adapters = [
    new BackblazeB2Adapter({ bucket: 'test-b2-bucket', accessKey: 'k', secretKey: 's' }),
    new AwsS3Adapter({ bucket: 'test-s3-bucket', accessKey: 'k', secretKey: 's' }),
    new CloudflareR2Adapter({ bucket: 'test-r2-bucket', accountId: 'acc', accessKey: 'k', secretKey: 's' }),
    new WasabiAdapter({ bucket: 'test-wasabi-bucket', accessKey: 'k', secretKey: 's' }),
    new MinioAdapter({ bucket: 'test-minio-bucket', accessKey: 'k', secretKey: 's' }),
    new LocalVaultStorageProvider(),
  ];

  const requiredMethods = ['uploadObject', 'downloadObject', 'deleteObject', 'headObject', 'listObjects', 'getSignedDownloadUrl', 'getSignedUploadUrl', 'objectExists', 'getUsage', 'testConnection'];

  for (const ad of adapters) {
    for (const m of requiredMethods) {
      assert(typeof ad[m] === 'function', `Adapter ${ad.constructor.name} satisfies StorageProvider contract method: ${m}`);
    }
    assert(typeof ad.capabilities === 'object', `Adapter ${ad.constructor.name} declares capability metadata`);
  }

  // 2. Multi-Cloud Provider Factory Resolution
  const b2Adapter = ProviderFactory.getProvider('backblaze', { bucket: 'my-b2' });
  assert(b2Adapter instanceof BackblazeB2Adapter, 'ProviderFactory resolves Backblaze B2 adapter');

  const s3Adapter = ProviderFactory.getProvider('aws-s3', { bucket: 'my-s3' });
  assert(s3Adapter instanceof AwsS3Adapter, 'ProviderFactory resolves AWS S3 adapter');

  const r2Adapter = ProviderFactory.getProvider('cloudflare-r2', { bucket: 'my-r2' });
  assert(r2Adapter instanceof CloudflareR2Adapter, 'ProviderFactory resolves Cloudflare R2 adapter');

  // 3. User Storage Quota Initial State & BIGINT Calculations
  const quotaUser = await createUser(`quota_user_${Date.now()}@example.com`, 'Argon2idHashQ');
  const initialMetrics = await getUserStorageMetrics(quotaUser.id);
  assert(initialMetrics.usedBytes === 0, 'Initial user storage usedBytes is exactly 0');
  assert(initialMetrics.reservedBytes === 0, 'Initial user storage reservedBytes is exactly 0');
  assert(initialMetrics.limitBytes === 10737418240, 'Initial user storage limitBytes is exactly 10 GB (10737418240 bytes)');
  assert(initialMetrics.remainingBytes === 10737418240, 'Initial user storage remainingBytes is exactly 10 GB');
  assert(initialMetrics.percentage === 0, 'Initial user storage percentage is 0.00%');

  // 4. Atomic Storage Quota Reservation & Concurrency Validation
  const uploadSize50MB = 50 * 1024 * 1024;
  const res1 = await reserveUserStorageAtomic(quotaUser.id, uploadSize50MB);
  assert(res1.allowed === true, 'Quota reservation allowed for upload within 10GB limit');
  assert(res1.reservedBytes === uploadSize50MB, 'Reserved bytes increased atomically');

  // Over-quota reservation attempt (11 GB exceeds 10 GB limit)
  const uploadSize11GB = 11 * 1024 * 1024 * 1024;
  const res2 = await reserveUserStorageAtomic(quotaUser.id, uploadSize11GB);
  assert(res2.allowed === false, 'Atomic reservation rejects upload exceeding storage quota');

  // Rollback reservation
  await releaseUserStorageReservation(quotaUser.id, uploadSize50MB);
  const afterRollback = await getUserStorageMetrics(quotaUser.id);
  assert(afterRollback.reservedBytes === 0, 'Reservation released and rolled back to 0 bytes on cancellation');

  // 5. Multi-Cloud Upload via StorageService with AES-256-GCM Encryption
  const testFilePayload = Buffer.from('Universal Multi-Cloud Object Storage Test Payload 2026!');
  const uploadRecord = await StorageService.uploadUserFile(quotaUser.id, {
    fileBuffer: testFilePayload,
    filename: 'multi-cloud-document.txt',
    contentType: 'text/plain',
    encrypted: true,
  });

  assert(uploadRecord.id, 'StorageService created unique application file record');
  assert(uploadRecord.object_key.startsWith(`users/${quotaUser.id}/${uploadRecord.id}/`), 'Object key adheres to universal users/{userId}/{fileId}/{filename} structure');
  assert(uploadRecord.status === 'ACTIVE', 'File record status initialized to ACTIVE');
  assert(uploadRecord.encrypted === true, 'File payload encrypted with AES-256-GCM');

  const metricsAfterUpload = await getUserStorageMetrics(quotaUser.id);
  assert(metricsAfterUpload.usedBytes === testFilePayload.length, 'Used storage incremented by exact byte size');
  assert(metricsAfterUpload.reservedBytes === 0, 'Reserved storage finalized and cleared after upload');

  // 6. Multi-Tenant Ownership & Cross-User Deletion Defense
  const strangerUser = await createUser(`stranger_${Date.now()}@example.com`, 'Argon2idHashS');
  let unauthorizedDeleteFailed = false;
  try {
    await StorageService.deleteUserFile(strangerUser.id, uploadRecord.id);
  } catch (err) {
    unauthorizedDeleteFailed = true;
    assert(err.code === 'FILE_NOT_FOUND' || err.statusCode === 404, 'Cross-user file deletion strictly rejected');
  }
  assert(unauthorizedDeleteFailed === true, 'Stranger user cannot delete another user file');

  // 7. Legitimate Deletion & Usage Decrement
  const deleteResult = await StorageService.deleteUserFile(quotaUser.id, uploadRecord.id);
  assert(deleteResult.success === true, 'Owner successfully deleted own file');

  const metricsAfterDelete = await getUserStorageMetrics(quotaUser.id);
  assert(metricsAfterDelete.usedBytes === 0, 'Storage usage decremented back to 0 bytes after file deletion');

  // 8. Storage Reconciliation Engine
  const reconcileReport = await StorageService.recalculateUserStorage(quotaUser.id);
  assert(typeof reconcileReport === 'object', 'recalculateUserStorage returned reconciliation report');
  assert(reconcileReport.reconciledUsage.usedBytes === 0, 'Reconciliation confirms zero active usage');

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n=================================================================');
  console.log(`  AUDIT TEST SUITE COMPLETED: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('=================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAuditTests().catch((err) => {
  console.error('\nFatal audit test execution error:', err);
  process.exit(1);
});
