import fs from 'fs';
import path from 'path';
import { StorageProvider } from '../storage-provider.js';
import { generateSecureId } from '../../crypto/encryption.js';

export class LocalVaultStorageProvider extends StorageProvider {
  constructor(config = {}) {
    super(config);
    this.baseDir = config.baseDir || path.join(process.cwd(), 'data', 'vault_storage');
    this.ensureBaseDir();
  }

  ensureBaseDir() {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
    } catch (e) {}
  }

  getFilePath(key) {
    // Sanitize key to prevent path traversal
    const safeKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    const fullPath = path.join(this.baseDir, safeKey);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return fullPath;
  }

  async upload(key, body, contentType = 'application/octet-stream') {
    this.ensureBaseDir();
    const filePath = this.getFilePath(key);
    await fs.promises.writeFile(filePath, body);
    return {
      key,
      size: body.length,
    };
  }

  async download(key) {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    const buffer = await fs.promises.readFile(filePath);
    return {
      body: buffer,
      contentType: 'application/octet-stream',
      contentLength: buffer.length,
    };
  }

  async delete(key) {
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    return true;
  }

  async headObject({ key }) {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      return { exists: false };
    }
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      sizeBytes: stat.size,
      contentType: 'application/octet-stream',
      lastModified: stat.mtime,
    };
  }

  async listObjects(params = {}) {
    this.ensureBaseDir();
    const prefix = typeof params === 'string' ? params : (params?.prefix || '');
    const results = [];

    const scanDir = (dir, relPath = '') => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          scanDir(full, rel);
        } else {
          if (!prefix || rel.startsWith(prefix)) {
            const stat = fs.statSync(full);
            results.push({
              key: rel,
              size: stat.size,
              sizeBytes: stat.size,
              lastModified: stat.mtime,
            });
          }
        }
      }
    };

    try {
      scanDir(this.baseDir);
    } catch {}

    return results;
  }

  async getSignedUrl(key, expiresInSeconds = 900) {
    // Local provider streams through the API access endpoint
    return `/api/media/stream?key=${encodeURIComponent(key)}`;
  }

  async getUsage() {
    this.ensureBaseDir();
    let usedBytes = 0;

    const calculateSize = (dir) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          calculateSize(full);
        } else {
          usedBytes += stat.size;
        }
      }
    };

    try {
      calculateSize(this.baseDir);
    } catch {}

    const totalBytes = 10 * 1024 * 1024 * 1024; // 10 GB
    const availableBytes = Math.max(0, totalBytes - usedBytes);

    return {
      usedBytes,
      availableBytes,
      totalBytes,
    };
  }

  async testConnection() {
    const checks = {
      endpoint: true,
      credentials: true,
      bucket: true,
      write: false,
      read: false,
      delete: false,
    };

    const testId = generateSecureId();
    const testKey = `panda-storage-test/${testId}.txt`;
    const testContent = `Panda Local Storage Test Verification - ${testId}`;

    try {
      // Test write
      await this.upload(testKey, Buffer.from(testContent), 'text/plain');
      checks.write = true;

      // Test read
      const downloaded = await this.download(testKey);
      if (downloaded.body.toString() !== testContent) {
        throw new Error('Local storage test read mismatch');
      }
      checks.read = true;

      // Test delete
      await this.delete(testKey);
      checks.delete = true;

      return {
        success: true,
        checks,
      };
    } catch (err) {
      try {
        await this.delete(testKey);
      } catch {}

      return {
        success: false,
        checks,
        error: err.message,
      };
    }
  }
}
