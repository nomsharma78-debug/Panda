# 🚀 Panda Vercel & Production Deployment Guide

This guide details how to deploy Panda to **Vercel** with **PostgreSQL** and **Cloud Object Storage**.

---

## 1. Prerequisites
- A [Vercel](https://vercel.com) account.
- A PostgreSQL database (e.g. [Neon](https://neon.tech), [Supabase](https://supabase.com), or AWS RDS).
- Object storage bucket(s) from [Cloudflare R2](https://www.cloudflare.com/products/r2/), [Backblaze B2](https://www.backblaze.com/b2/), or [AWS S3](https://aws.amazon.com/s3/).

---

## 2. Environment Variables Configuration

Set the following environment variables in your Vercel Project Settings:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@ep-xxx.neon.tech/panda_vault?sslmode=require` |
| `AUTH_SECRET` | 32+ character random string for session signature | `e8f9a2b1c4d7e6f5a3b2c1d0e9f8a7b6...` |
| `STORAGE_ENCRYPTION_KEY` | 32-byte (64-char hex) master encryption key | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` |
| `NODE_ENV` | Environment mode | `production` |

### How to Generate a Secure `STORAGE_ENCRYPTION_KEY`:
Run this in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Database Migration on Production

Execute the database migration on your PostgreSQL instance:

```bash
psql $DATABASE_URL -f migrations/001_initial_schema.sql
```

---

## 4. Deploying to Vercel

### Option A: Using Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

### Option B: Using GitHub Integration
1. Push your repository to GitHub.
2. In Vercel, click **Add New...** -> **Project** -> Select your repo.
3. Add the environment variables from Section 2.
4. Click **Deploy**.

---

## 5. Post-Deployment Verification Checklist

1. [ ] Navigate to `https://your-domain.vercel.app/register` and create an admin user.
2. [ ] Navigate to **Storage Hub** -> **Connect Storage** -> Test and connect your Cloudflare R2 / S3 bucket.
3. [ ] Upload a test photo, video, and PDF to verify real-time gallery updates and AES-256-GCM streaming decryption.
4. [ ] In **Settings** -> **Security**, verify active sessions and password change.
