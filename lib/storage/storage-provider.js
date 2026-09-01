/**
 * Base Abstract Storage Provider Interface
 */
export class StorageProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Upload an object to storage
   * @param {string} key - Unique object key (e.g. 'media/<uuid>.enc')
   * @param {Buffer|Uint8Array} body - File binary data
   * @param {string} contentType - MIME type
   * @returns {Promise<{ key: string, size: number, eTag?: string }>}
   */
  async upload(key, body, contentType) {
    throw new Error('upload() must be implemented by provider');
  }

  /**
   * Download an object from storage as Buffer
   * @param {string} key - Object key
   * @returns {Promise<{ body: Buffer, contentType: string, contentLength: number }>}
   */
  async download(key) {
    throw new Error('download() must be implemented by provider');
  }

  /**
   * Delete an object from storage
   * @param {string} key - Object key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    throw new Error('delete() must be implemented by provider');
  }

  /**
   * Check if an object exists
   * @param {string} key - Object key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    throw new Error('exists() must be implemented by provider');
  }

  /**
   * Generate a short-lived presigned/signed download URL
   * @param {string} key - Object key
   * @param {number} expiresInSeconds - Expiration time (default 900 = 15m)
   * @returns {Promise<string>}
   */
  async getSignedUrl(key, expiresInSeconds = 900) {
    throw new Error('getSignedUrl() must be implemented by provider');
  }

  /**
   * Retrieve storage usage quota/bytes if supported
   * @returns {Promise<{ usedBytes: number, availableBytes: number, totalBytes: number } | null>}
   */
  async getUsage() {
    return null;
  }

  /**
   * Perform comprehensive live connection test:
   * 1. Validate endpoint & credentials
   * 2. Validate bucket exists
   * 3. Test write temporary object (panda-storage-test/<uuid>)
   * 4. Test read temporary object & verify integrity
   * 5. Test delete temporary object & cleanup
   * @returns {Promise<{ success: boolean, checks: object, error?: string }>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by provider');
  }
}
