import { S3CompatibleProvider } from './providers/s3-compatible.js';
import { BackblazeB2Adapter } from './providers/backblaze-b2.js';
import { AwsS3Adapter } from './providers/aws-s3.js';
import { CloudflareR2Adapter } from './providers/cloudflare-r2.js';
import { WasabiAdapter } from './providers/wasabi.js';
import { MinioAdapter } from './providers/minio.js';
import { LocalVaultStorageProvider } from './providers/local-vault.js';
import { getStorageConnectionInternal, listUserStorageConnections } from '../db/storage.js';
import { decryptData } from '../crypto/encryption.js';

/**
 * Universal Storage Provider Factory
 * Decouples the application layer from specific cloud storage implementations.
 */
export class ProviderFactory {
  /**
   * Instantiate an adapter given a provider type identifier and configuration.
   * @param {string} providerType
   * @param {Object} config
   * @returns {import('./storage-provider.js').StorageProvider}
   */
  static getProvider(providerType = 's3', config = {}) {
    const norm = (providerType || 's3').toLowerCase().trim();

    switch (norm) {
      case 'b2':
      case 'backblaze':
      case 'backblaze-b2':
        return new BackblazeB2Adapter(config);

      case 's3':
      case 'aws':
      case 'aws-s3':
        return new AwsS3Adapter(config);

      case 'r2':
      case 'cloudflare':
      case 'cloudflare-r2':
        return new CloudflareR2Adapter(config);

      case 'wasabi':
        return new WasabiAdapter(config);

      case 'minio':
        return new MinioAdapter(config);

      case 'local':
        return new LocalVaultStorageProvider(config);

      default:
        return new S3CompatibleProvider({ ...config, provider: norm });
    }
  }

  /**
   * Resolve and instantiate the active StorageProvider adapter for a user.
   * @param {string} userId
   * @param {string} [storageConnectionId]
   * @param {string} [token]
   * @returns {Promise<{ provider: import('./storage-provider.js').StorageProvider, connectionId: string | null, providerName: string, bucket: string }>}
   */
  static async resolveProviderForUser(userId, storageConnectionId = null, token = null) {
    if (storageConnectionId) {
      const record = await getStorageConnectionInternal(storageConnectionId, userId, token);
      if (record) {
        return this.createFromRecord(record);
      }
    }

    // Try finding user default or first active connection
    if (userId) {
      try {
        const connections = await listUserStorageConnections(userId, token);
        if (connections && connections.length > 0) {
          const target = connections.find((c) => c.is_default) || connections[0];
          const fullRecord = await getStorageConnectionInternal(target.id, userId, token);
          if (fullRecord) {
            return this.createFromRecord(fullRecord);
          }
        }
      } catch (err) {
        console.warn('[ProviderFactory] User storage lookup notice:', err.message);
      }
    }

    // Fall back to Environment-level Cloud Storage Configuration
    const envProvider = (process.env.STORAGE_PROVIDER || (process.env.B2_KEY_ID ? 'backblaze' : process.env.AWS_ACCESS_KEY_ID ? 'aws-s3' : process.env.R2_ACCESS_KEY_ID ? 'cloudflare-r2' : 'local')).toLowerCase();

    if (envProvider !== 'local') {
      const adapter = this.getProvider(envProvider, {});
      return {
        provider: adapter,
        connectionId: null,
        providerName: adapter.providerName || envProvider,
        bucket: adapter.bucket || process.env.STORAGE_BUCKET || '',
      };
    }

    // Fall back to Local Vault Storage for offline dev
    const localAdapter = new LocalVaultStorageProvider({
      baseDir: process.env.LOCAL_STORAGE_DIR,
    });
    return {
      provider: localAdapter,
      connectionId: null,
      providerName: 'local',
      bucket: 'local-vault',
    };
  }

  /**
   * Instantiate adapter from a decrypted DB storage connection record.
   */
  static createFromRecord(storageRecord) {
    const providerType = (storageRecord.provider || 's3').toLowerCase();
    if (providerType === 'local') {
      return {
        provider: new LocalVaultStorageProvider({ baseDir: process.env.LOCAL_STORAGE_DIR }),
        connectionId: storageRecord.id,
        providerName: 'local',
        bucket: 'local-vault',
      };
    }

    const decryptedConfig = decryptData(storageRecord.encrypted_config, null, true);
    const adapter = this.getProvider(providerType, {
      ...decryptedConfig,
      provider: providerType,
    });

    return {
      provider: adapter,
      connectionId: storageRecord.id,
      providerName: adapter.providerName || providerType,
      bucket: adapter.bucket || storageRecord.bucket || '',
    };
  }
}
