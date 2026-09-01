# 🔒 Panda Security & Cryptographic Architecture

This document provides a technical audit of the security model, cryptographic protocols, data flows, and defense mechanisms implemented in Panda.

---

## 1. Authentication & Session Security

### Password Hashing (Argon2id)
- Passwords are never stored in plaintext and never logged.
- Hashing is performed using **Argon2id** (OWASP recommended memory-hard hashing algorithm):
  - Memory Cost: 64 MB (65,536 KB)
  - Time Cost (Iterations): 3
  - Parallelism: 4
  - Salt: 16 cryptographically secure pseudo-random bytes (`crypto.randomBytes`)
  - Output Format: Standard PHC string (`$argon2id$v=19$m=65536,t=3,p=4$...`)
- Verification uses `crypto.timingSafeEqual` to eliminate timing attack side-channels.

### Session Management
- Sessions are stored server-side in the `sessions` database table.
- Raw session tokens (256-bit cryptographically secure random identifiers) are transmitted to the browser **only** via `HttpOnly`, `SameSite=Lax`, and `Secure` (in production) cookies.
- In the database, only the **SHA-256 hash** of the token is stored (`session_token_hash`). If the database is dumped or compromised, active session tokens cannot be derived.
- Expired sessions are automatically rejected and cleaned up.

---

## 2. Cryptographic Classification & Honest Zero-Knowledge Assessment

### What data is encrypted in the browser?
- When saving vault entries with an active browser session key, JSON vault items (passwords, card details, secure notes) are encrypted using AES-GCM via the Web Crypto API before transmission over HTTPS.

### What data reaches the server in transit?
- Authentication credentials during login/registration (`email`, `password`) reach the server over TLS/HTTPS so that the server can execute Argon2id verification and issue the HTTP-only cookie.
- Uploaded media files reach the server memory buffer over TLS/HTTPS before being encrypted and streamed to object storage.
- Storage connection keys (AWS Access Key ID, S3 Secret Key) reach the server over TLS/HTTPS so the server can test, encrypt, and store them.

### What data is encrypted server-side?
- Cloud storage credentials (encrypted with AES-256-GCM using `STORAGE_ENCRYPTION_KEY` derived from server environment).
- Media file streams (encrypted with authenticated AES-256-GCM before object storage upload; decrypted in server memory upon streaming to the verified owner).

### Zero-Knowledge Assessment:
- While Panda provides strong client-side encryption primitives and server-side authenticated encryption, authentication password verification is handled by server-side Argon2id (rather than client-side SRP-6a / WebAuthn zero-knowledge).
- **Audit Decision**: In compliance with security honesty standards, all claims of "Zero-Knowledge" have been removed from the UI and documentation. The architecture is accurately classified as **"Client-Side & Server-Side Authenticated AES-256-GCM Encryption"**.

---

## 3. Media Encryption Pipeline

```
[UPLOAD FLOW]
1. User Browser: Selects photo/video/PDF/document.
2. Transport: Streamed over TLS/HTTPS to /api/media/upload with session cookie.
3. Panda Server:
   - Validates session user ID and CSRF origin.
   - Enforces upload safety (blocks executables .exe, .sh, .bat, .php; validates size <= 500MB).
   - Generates random 12-byte IV.
   - Encrypts binary buffer in memory using AES-256-GCM with STORAGE_ENCRYPTION_KEY.
   - Generates 16-byte authentication tag and random UUID object key (media/<uuid>.enc).
4. Cloud Object Storage: Stores ciphertext object (never stores original filename).
5. PostgreSQL: Records metadata (id, user_id, original_filename, mime_type, uploaded_at UTC, iv, authTag).

[STREAMING & PLAYBACK FLOW]
1. User Browser: Requests /api/media/[id]/access.
2. Panda Server:
   - Verifies session user ID.
   - Authorizes ownership: SELECT ... WHERE id = $1 AND user_id = $2.
   - Fetches ciphertext binary from Cloud Object Storage.
   - Decrypts AES-256-GCM ciphertext using IV and auth tag in temporary server memory.
   - Streams decrypted bytes with Cache-Control: private, no-store.
3. User Browser: Plays video or views photo/PDF in memory.
```

---

## 4. Server-Side Authorization & Strict IDOR Defense

- The authenticated user identity is derived **strictly from the server-side session cookie**.
- **Every SQL query involving user-owned data is scoped**:
  - `media_files`: `WHERE id = $1 AND user_id = $2`
  - `storage_connections`: `WHERE id = $1 AND user_id = $2`
  - `vault_items`: `WHERE id = $1 AND user_id = $2`
  - `sessions`: `WHERE user_id = $1`
  - `audit_logs`: `WHERE user_id = $1`
- Any cross-tenant access attempt returns `404 Not Found` or `403 Forbidden` without leaking resource existence.

---

## 5. SSRF (Server-Side Request Forgery) Defense

Outbound storage connection URLs are strictly validated:
1. Protocol Enforcement: Only `https:` in production (`http:` allowed only in dev).
2. Hostname Blocklist: `localhost`, `metadata.google.internal`, `169.254.169.254`, `*.local`, `*.internal`.
3. Unconditional DNS Resolution: Resolves hostname and validates all resolved IP addresses:
   - Loopback (`127.0.0.0/8`, `::1`)
   - AWS / GCP / Azure Cloud Metadata (`169.254.169.254`, `169.254.170.2`)
   - RFC 1918 Private Ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
   - Shared / Carrier-Grade NAT (`100.64.0.0/10`)
   - IPv6 Link-Local & Unique Local (`fe80::/10`, `fc00::/7`)

---

## 6. CSRF & Security Headers

- **CSRF Defense**: Mutating requests (`POST`, `PATCH`, `DELETE`, `PUT`) validate the `Origin` / `Host` match before executing handlers.
- **Security Headers**:
  - `Content-Security-Policy`: Restricts scripts, frames, styles, and data origins.
  - `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options`: `nosniff`
  - `X-Frame-Options`: `DENY`
  - `X-XSS-Protection`: `1; mode=block`
  - `Referrer-Policy`: `strict-origin-when-cross-origin`
  - `Permissions-Policy`: `camera=(), microphone=(), geolocation=(), browsing-topics=()`
