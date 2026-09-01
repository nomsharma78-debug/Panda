-- =========================================================================
-- PANDA DIGITAL VAULT — CANONICAL POSTGRESQL DATABASE SCHEMA (MIGRATION 001)
-- =========================================================================
-- This is the single source of truth for the Panda PostgreSQL database.
-- Compatible with PostgreSQL 14+, Neon, Supabase, AWS RDS, GCP Cloud SQL, etc.
-- =========================================================================

-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. USERS TABLE
-- Stores Panda user profile metadata linked to Supabase Auth User ID (UUID).
-- Supabase Auth handles email OTP, verification, and authentication.
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY, -- Linked to Supabase Auth user id (UUID)
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) DEFAULT NULL,
    password_hash TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. SESSIONS TABLE
-- Stores active server-side sessions with SHA-256 hashed session tokens.
-- Raw tokens are only stored in HTTP-only cookies and never in the database.
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 3. VAULT ITEMS TABLE
-- Stores encrypted passwords, payment cards, secure notes, and identities.
CREATE TABLE IF NOT EXISTS vault_items (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL, -- 'login', 'card', 'note', 'identity'
    encrypted_payload TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vault_items_user_id ON vault_items(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_items_type ON vault_items(type);
CREATE INDEX IF NOT EXISTS idx_vault_items_created ON vault_items(user_id, created_at DESC);

-- 4. STORAGE CONNECTIONS TABLE
-- Stores encrypted external object storage credentials (R2, B2, S3, MinIO, Wasabi).
-- Credentials are encrypted with AES-256-GCM server-side using STORAGE_ENCRYPTION_KEY.
CREATE TABLE IF NOT EXISTS storage_connections (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL, -- 'r2', 'b2', 's3', 'minio', 'wasabi', 'custom_s3', 'local'
    name VARCHAR(255) NOT NULL,
    encrypted_config TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_conn_user_id ON storage_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_conn_default ON storage_connections(user_id, is_default);

-- 5. STORAGE USAGE TABLE
-- Stores synchronized usage and capacity statistics per storage connection.
CREATE TABLE IF NOT EXISTS storage_usage (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_connection_id VARCHAR(36) NOT NULL REFERENCES storage_connections(id) ON DELETE CASCADE,
    used_bytes BIGINT NOT NULL DEFAULT 0,
    available_bytes BIGINT DEFAULT NULL,
    total_bytes BIGINT DEFAULT NULL,
    last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_usage_user_id ON storage_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_usage_conn_id ON storage_usage(storage_connection_id);

-- 6. MEDIA FOLDERS TABLE
-- Stores user-created folders for organizing cloud media files
CREATE TABLE IF NOT EXISTS media_folders (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_connection_id VARCHAR(36) REFERENCES storage_connections(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id VARCHAR(36) REFERENCES media_folders(id) ON DELETE CASCADE,
    color VARCHAR(32) DEFAULT 'teal',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_folders_user ON media_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_media_folders_parent ON media_folders(user_id, parent_id);

-- 7. MEDIA FILES TABLE
-- Stores media metadata ONLY. Actual binary files reside in external object storage.
CREATE TABLE IF NOT EXISTS media_files (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_connection_id VARCHAR(36) REFERENCES storage_connections(id) ON DELETE SET NULL,
    folder_id VARCHAR(36) REFERENCES media_folders(id) ON DELETE SET NULL,
    object_key VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size BIGINT NOT NULL,
    media_type VARCHAR(32) NOT NULL, -- 'photo', 'video', 'pdf', 'document', 'archive', 'other'
    encrypted BOOLEAN NOT NULL DEFAULT TRUE,
    encryption_metadata JSONB DEFAULT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE media_files ADD COLUMN IF NOT EXISTS folder_id VARCHAR(36) REFERENCES media_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_files_user_uploaded ON media_files(user_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_files_folder ON media_files(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_media_files_type ON media_files(user_id, media_type);
CREATE INDEX IF NOT EXISTS idx_media_files_storage ON media_files(storage_connection_id);

-- 8. AUDIT LOGS TABLE
-- Stores sanitized immutable security event history. Passwords/keys are never logged.
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
