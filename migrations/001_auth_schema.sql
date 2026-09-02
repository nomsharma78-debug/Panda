-- =============================================================================
-- PANDA DATABASE 1: AUTHENTICATION, SESSIONS & AUDIT SCHEMA
-- Run this script in your Auth Database (DB 1) in Supabase SQL Editor
-- =============================================================================

-- Ensure required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table (Core identity, name, password hash & preferences)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    password_hash TEXT,
    inactivity_timeout_minutes INTEGER DEFAULT 15,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upgrade columns for existing installations
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_timeout_minutes INTEGER DEFAULT 15;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Sessions Table (Multi-device tracking, device names & live activity)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upgrade columns for existing installations
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(last_active_at);

-- 3. Audit Logs Table (Security action logging)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'SUCCESS',
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- 4. Enable Row Level Security (RLS) & Grant Access Policies for Supabase REST
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all users operations" ON users;
CREATE POLICY "Allow all users operations" ON users FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all sessions operations" ON sessions;
CREATE POLICY "Allow all sessions operations" ON sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all audit_logs operations" ON audit_logs;
CREATE POLICY "Allow all audit_logs operations" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
