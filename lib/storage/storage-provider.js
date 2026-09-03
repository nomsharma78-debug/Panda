/**
 * =============================================================================
 * UNIVERSAL MULTI-CLOUD STORAGE PROVIDER INTERFACE
 * =============================================================================
 * Abstract base class that all cloud storage adapters must implement.
 * Guarantees a normalized contract across Backblaze B2, AWS S3, Cloudflare R2,
 * Wasabi, MinIO, Google Cloud Storage, Azure Blob, and Local Vault Storage.
 */

export class StorageProvider {
  constructor(config = {}) {
    this.config = config;
    this.providerName = (config.provider || 'generic').toLowerCase();
    this.capabilities = {
      signedUrls: true,
      multipartUpload: true,
      objectListing: true,
      objectMetadata: true,
      versioning: false,
      resumableUploads: false,
    };
  }

  /**
   * Upload an object to cloud storage.
   * @param {Object} params
   * @param {string} params.key - Universal object key (e.g. 'users/123/file-456/photo.jpg')
   * @param {Buffer|Uint8Array} params.body - Binary content
   * @param {string} [params.contentType] - MIME type
   * @param {Object} [params.metadata] - Custom metadata tags
   * @returns {Promise<{ key: string, sizeBytes: number, eTag?: string, objectId?: string, versionId?: string }>}
   */
  async uploadObject({ key, body, contentType = 'application/octet-stream', metadata = {} }) {
    return this.upload(key, body, contentType, metadata);
  }

  /**
   * Legacy alias for uploadObject
   */
  async upload(key, body, contentType = 'application/octet-stream', metadata = {}) {
    throw new Error(`uploadObject() must be implemented by adapter (${this.constructor.name})`);
  }

  /**
   * Download an object as binary Buffer with metadata.
   * @param {Object} params
   * @param {string} params.key
   * @returns {Promise<{ body: Buffer, contentType: string, contentLength: number, eTag?: string, metadata?: Object }>}
   */
  async downloadObject({ key }) {
    return this.download(key);
  }

  /**
   * Legacy alias for downloadObject
   */
  async download(key) {
    throw new Error(`downloadObject() must be implemented by adapter (${this.constructor.name})`);
  }

  /**
   * Delete an object from cloud storage.
   * @param {Object} params
   * @param {string} params.key
   * @returns {Promise<boolean>}
   */
  async deleteObject({ key }) {
    return this.delete(key);
  }

  /**
   * Legacy alias for deleteObject
   */
  async delete(key) {
    throw new Error(`deleteObject() must be implemented by adapter (${this.constructor.name})`);
  }

  /**
   * Retrieve metadata for an object without downloading body.
   * @param {Object} params
   * @param {string} params.key
   * @returns {Promise<{ exists: boolean, sizeBytes?: number, contentType?: string, lastModified?: Date, eTag?: string, metadata?: Object }>}
   */
  async headObject({ key }) {
    const exists = await this.objectExists({ key });
    return { exists };
  }

  /**
   * Check if an object exists in storage.
   * @param {Object} params
   * @param {string} params.key
   * @returns {Promise<boolean>}
   */
  async objectExists({ key }) {
    return this.exists(key);
  }

  /**
   * Legacy alias for objectExists
   */
  async exists(key) {
    throw new Error(`objectExists() must be implemented by adapter (${this.constructor.name})`);
  }

  /**
   * List objects with optional prefix and pagination.
   * @param {Object|string} [params]
   * @returns {Promise<Array<{ key: string, sizeBytes: number, lastModified?: Date, eTag?: string }>>}
   */
  async listObjects(params = {}) {
    throw new Error(`listObjects() must be implemented by adapter (${this.constructor.name})`);
  }

  /**
   * Generate a temporary presigned/signed download URL.
   * @param {Object} params
   * @param {string} params.key
   * @param {number} [params.expiresInSeconds=900]
   * @returns {Promise<string>}
   */
  async getSignedDownloadUrl({ key, expiresInSeconds = 900 }) {
    return this.getSignedUrl(key, expiresInSeconds);
  }

  /**
   * Legacy alias for getSignedDownloadUrl
   */
  async getSignedUrl(key, expiresInSeconds = 900) {
    throw new Error(`getSignedDownloadUrl() is not supported by adapter (${this.constructor.name})`);
  }

  /**
   * Generate a temporary presigned/signed direct upload URL.
   * @param {Object} params
   * @param {string} params.key
   * @param {number} [params.expiresInSeconds=900]
   * @param {string} [params.contentType]
   * @returns {Promise<string>}
   */
  async getSignedUploadUrl({ key, expiresInSeconds = 900, contentType = 'application/octet-stream' }) {
    throw new Error(`getSignedUploadUrl() is not supported by adapter (${this.constructor.name})`);
  }

  /**
   * Retrieve total used bytes from cloud provider for reconciliation.
   * @returns {Promise<{ usedBytes: number, availableBytes: number | null, totalBytes: number | null } | null>}
   */
  async getUsage() {
    return null;
  }

  /**
   * Perform live connection verification against the cloud bucket.
   * @returns {Promise<{ success: boolean, checks: Object, error?: string }>}
   */
  async testConnection() {
    throw new Error(`testConnection() must be implemented by adapter (${this.constructor.name})`);
  }
}
