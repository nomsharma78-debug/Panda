/**
 * Storage Provider Constants and Quota Configurations
 */

export const SUPPORTED_PROVIDERS = Object.freeze([
  'r2',
  'b2',
  's3',
  'minio',
  'wasabi',
  'custom_s3',
  'local',
]);

/**
 * Default tier quotas in bytes allocated for various storage providers
 */
export const PROVIDER_TIER_QUOTAS = Object.freeze({
  r2: 10 * 1024 * 1024 * 1024,      // 10 GB
  b2: 10 * 1024 * 1024 * 1024,      // 10 GB
  s3: 5 * 1024 * 1024 * 1024,       // 5 GB
  minio: 100 * 1024 * 1024 * 1024,  // 100 GB
  wasabi: 1024 * 1024 * 1024 * 1024,// 1 TB
  custom_s3: 10 * 1024 * 1024 * 1024,// 10 GB
  local: 10 * 1024 * 1024 * 1024,   // 10 GB
});

export const DEFAULT_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

/**
 * UI Badges and styling tokens per provider
 */
export const PROVIDER_STYLE_MAP = Object.freeze({
  r2: {
    name: 'Cloudflare R2',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    badgeVariant: 'amber',
  },
  b2: {
    name: 'Backblaze B2',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    badgeVariant: 'rose',
  },
  s3: {
    name: 'Amazon S3',
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    badgeVariant: 'amber',
  },
  minio: {
    name: 'MinIO S3',
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
    badgeVariant: 'rose',
  },
  wasabi: {
    name: 'Wasabi Hot Cloud',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    badgeVariant: 'emerald',
  },
  custom_s3: {
    name: 'Custom S3 Compatible',
    color: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
    badgeVariant: 'teal',
  },
  local: {
    name: 'Panda Local Storage',
    color: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
    badgeVariant: 'teal',
  },
});
