# 🐼 Panda — Secure Personal Digital Vault

> **Your private digital space.**  
> A production-ready, secure, modern personal digital vault web application built with **Next.js (App Router)**, **JavaScript/JSX**, **Tailwind CSS**, a **PostgreSQL** database layer, and a pluggable **multi-provider object storage architecture** (Cloudflare R2, Backblaze B2, Amazon S3, MinIO, Wasabi).

---

## ✨ Features

- **🗄️ Canonical PostgreSQL Database & Migration System**:
  - Migration tracking via `schema_migrations` table preventing duplicate execution.
  - Commands: `npm run db:migrate` and `npm run db:status`.
  - Non-sequential UUID primary keys, foreign-key cascades, UTC timestamps (`TIMESTAMP WITH TIME ZONE`), and performance indexes.
  - **Zero Media Binaries in Database**: PostgreSQL stores media metadata only (`media_files`), while binary payloads reside securely in cloud object storage.
- **🔐 Strict Server-Side Authorization & IDOR Defense**:
  - Authenticated user ID is derived strictly from server-side HTTP-only session cookies.
  - Every database query enforces strict user isolation (`WHERE id = $1 AND user_id = $2`).
  - Cryptographically random opaque UUIDs for all resources (`media/550e8400-e29b-...enc`).
- **🛡️ Authenticated Cryptography**:
  - **Argon2id** password hashing with OWASP-compliant memory-hard parameters.
  - **AES-256-GCM** authenticated encryption for external cloud storage credentials and encrypted file payloads.
  - Client-side Web Crypto API encryption for passwords, cards, and secure notes.
- **🎬 Unified Media Library**:
  - One unified media view for photos, videos, PDFs, and documents sorted chronologically (`uploaded_at DESC`).
  - Date-grouped headers ("Today", "Yesterday", exact dates).
  - Responsive grid layout, thumbnail previews, video play indicators, PDF/document badges.
  - Multi-select mode for bulk download and bulk delete.
  - Fullscreen lightbox with zoom/pan, HTML5 video player with range streaming, and metadata inspector.
- **☁️ Multi-Provider Object Storage Hub**:
  - Connect multiple external cloud storage providers per user: **Cloudflare R2**, **Backblaze B2**, **Amazon S3**, **MinIO**, **Wasabi**, and **Custom S3**.
  - Combined storage usage progress bar without fake/invented quota ceilings.
  - **Pre-save Live Verification**: Mandatory test upload, read, and delete of a temporary test object (`panda-storage-test/<uuid>`) before credentials can be saved.
  - Safe disconnection workflows: "Keep files in storage" or "Delete files permanently".
- **🛡️ Strict SSRF & CSRF Defense**:
  - Validates storage endpoints and resolves DNS to verify IP addresses.
  - Blocks loopback (`127.0.0.0/8`, `localhost`), link-local/cloud metadata (`169.254.169.254`), and private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fe80::/10`, `fc00::/7`).
  - Same-origin CSRF validation for mutating requests.

---

## 🏗️ Architecture

```
User Browser
    ↓
Next.js Frontend (React 19 / Tailwind CSS / Lucide)
    ↓
HTTPS + HTTP-only Session Cookie (SameSite=Lax) + CSRF Origin Check
    ↓
Next.js Server Route Handlers (/api/*)
    ↓
Authentication & Authorization (Argon2id + Strict IDOR Scoping)
    ↓
Database Layer + Storage Manager + Crypto Layer
    ↓
PostgreSQL Database + Cloud Object Storage (R2 / B2 / S3 / MinIO)
```

---

## 🚀 Step-by-Step Setup & Verification Guide

Follow these exact steps to set up and verify Panda with PostgreSQL:

### Step 1: Create a PostgreSQL Database
Create a new database on your PostgreSQL server or cloud provider (e.g. Neon, Supabase, AWS RDS, local Postgres):
```sql
CREATE DATABASE panda_vault;
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Add your `DATABASE_URL`, `AUTH_SECRET`, and `STORAGE_ENCRYPTION_KEY`:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/panda_vault
AUTH_SECRET=panda_super_secret_auth_key_replace_in_production_32chars_min
STORAGE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### Step 3: Run Database Migrations
Execute canonical schema migrations against your PostgreSQL database:
```bash
npm run db:migrate
```

### Step 4: Verify Migration Status & Tables
Verify all migrations have been applied:
```bash
npm run db:status
```
Expected output:
```text
STATUS      VERSION         MIGRATION FILE                      APPLIED AT
----------------------------------------------------------------------------------------
✓ APPLIED   001             001_initial_schema.sql              2026-09-01T...
```

Verified tables in database:
- `schema_migrations` (migration history)
- `users` (accounts & Argon2id hashes)
- `sessions` (server sessions & SHA-256 token hashes)
- `vault_items` (encrypted passwords, cards, notes)
- `storage_connections` (AES-256-GCM encrypted cloud credentials)
- `storage_usage` (storage metrics)
- `media_files` (media metadata ONLY)
- `audit_logs` (sanitized activity history)

### Step 5: Start Panda
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 6: Register a User
Navigate to [http://localhost:3000/register](http://localhost:3000/register) and create an account with email and master password.

### Step 7: Verify User in Database
Query your PostgreSQL database:
```sql
SELECT id, email, password_hash, created_at FROM users;
```
Verify:
- `id` is a unique UUID.
- `password_hash` is a standard Argon2id PHC hash (`$argon2id$v=19$m=65536,t=3,p=4$...`).

### Step 8: Login & Verify Session
Login at [http://localhost:3000/login](http://localhost:3000/login) and check the `sessions` table:
```sql
SELECT id, user_id, session_token_hash, expires_at FROM sessions;
```
Verify:
- `session_token_hash` stores the SHA-256 hash of the session token.
- Raw session token exists only in the browser's HTTP-only `panda_session` cookie.

### Step 9: Connect Storage & Verify Storage Connections
Navigate to **Storage Hub** (`/storage`) -> **Connect Storage** -> Test and save your Cloudflare R2 / S3 / B2 connection.
Query your database:
```sql
SELECT id, user_id, provider, name, encrypted_config, is_default FROM storage_connections;
```
Verify:
- `encrypted_config` is encrypted with AES-256-GCM (`iv:authTag:ciphertext`). Plaintext access keys are never present in the database.

### Step 10: Upload Media & Verify Metadata Isolation
Upload a photo, video, PDF, or document in the **Media Library** (`/media`).
Query your database:
```sql
SELECT id, user_id, storage_connection_id, object_key, original_filename, mime_type, file_size, uploaded_at FROM media_files;
```
Verify:
- `media_files` contains **metadata only** (`original_filename`, `file_size`, `mime_type`, `uploaded_at`).
- `object_key` points to the encrypted object (`media/<uuid>.enc`).
- The actual binary file is stored in your cloud object storage, not in PostgreSQL.

---

## 🧪 Automated Test Suite

Run the full security and integration test suite:
```bash
npm test
```

---

## 📄 License

MIT License. Built for secure, private digital asset management.
