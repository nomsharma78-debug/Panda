-- =============================================================================
-- PANDA DATABASE 2: VAULT CREDENTIALS, CLOUD STORAGE & METADATA SCHEMA
-- Run this script in your Vault Database (PostgreSQL)
-- =============================================================================

-- Ensure required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Identity Reference Table
-- Links strictly to Supabase Auth User ID / Auth DB User ID for foreign-key integrity
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upgrade column if existing table
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_vault_users_email ON users(email);

-- 2. Vault Items (Passwords, Credit/Debit Cards, Secure Notes, Identities)
-- Stores client-side and server-side AES-256-GCM encrypted payloads
CREATE TABLE IF NOT EXISTS vault_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL, -- 'login' | 'card' | 'note' | 'identity'
    encrypted_payload TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vault_items_user_id ON vault_items(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_items_user_type ON vault_items(user_id, type);

-- 3. Storage Connections (Encrypted Cloud Provider Configs)
-- Credentials are encrypted with AES-256-GCM and never returned in plaintext to the client
CREATE TABLE IF NOT EXISTS storage_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    provider VARCHAR(32) NOT NULL, -- 'r2' | 'b2' | 's3' | 'wasabi' | 'minio' | 'custom_s3'
    bucket VARCHAR(128) NOT NULL,
    region VARCHAR(64),
    endpoint VARCHAR(255),
    encrypted_config TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    status VARCHAR(32) DEFAULT 'connected',
    last_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_connections_user ON storage_connections(user_id);

-- 4. Storage Usage Metrics
CREATE TABLE IF NOT EXISTS storage_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_connection_id UUID REFERENCES storage_connections(id) ON DELETE CASCADE,
    used_bytes BIGINT DEFAULT 0,
    available_bytes BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_usage_user ON storage_usage(user_id);

-- 5. Media Folders (User-created folders for organizing cloud media files)
CREATE TABLE IF NOT EXISTS media_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_connection_id UUID REFERENCES storage_connections(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES media_folders(id) ON DELETE CASCADE,
    color VARCHAR(32) DEFAULT 'teal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_folders_user ON media_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_media_folders_parent ON media_folders(user_id, parent_id);

-- 6. Media Files (Metadata ONLY — binaries reside strictly in User Cloud Object Storage)
CREATE TABLE IF NOT EXISTS media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_connection_id UUID REFERENCES storage_connections(id) ON DELETE SET NULL,
    folder_id UUID REFERENCES media_folders(id) ON DELETE SET NULL,
    object_key VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size BIGINT NOT NULL,
    media_type VARCHAR(32) NOT NULL, -- 'photo' | 'video' | 'audio' | 'document' | 'other'
    encrypted BOOLEAN DEFAULT TRUE,
    encryption_metadata JSONB,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upgrade existing media_files table if needed
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES media_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_files_user ON media_files(user_id);
CREATE INDEX IF NOT EXISTS idx_media_files_folder ON media_files(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_media_files_user_type ON media_files(user_id, media_type);
CREATE INDEX IF NOT EXISTS idx_media_files_uploaded_at ON media_files(user_id, uploaded_at DESC);

-- 7. Audit Logs (Tamper-evident Security History)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL, -- 'SUCCESS' | 'FAILURE'
    ip_address VARCHAR(64),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
