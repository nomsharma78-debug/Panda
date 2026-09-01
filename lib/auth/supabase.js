import { createClient } from '@supabase/supabase-js';

function getAuthUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  return url ? url.trim() : '';
}

function getAuthAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  return key ? key.trim() : '';
}

function getVaultUrl() {
  const url =
    process.env.NEXT_PUBLIC_VAULT_SUPABASE_URL ||
    process.env.VAULT_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  return url ? url.trim() : '';
}

function getVaultAnonKey() {
  const key =
    process.env.NEXT_PUBLIC_VAULT_SUPABASE_ANON_KEY ||
    process.env.VAULT_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return key ? key.trim() : '';
}

export function isSupabaseConfigured() {
  const url = getAuthUrl();
  const key = getAuthAnonKey();
  return Boolean(
    url &&
    key &&
    !url.includes('placeholder') &&
    url.startsWith('http')
  );
}

export function isVaultSupabaseConfigured() {
  const url = getVaultUrl();
  const key = getVaultAnonKey();
  return Boolean(
    url &&
    key &&
    !url.includes('placeholder') &&
    url.startsWith('http')
  );
}

let browserAuthClient = null;
let browserVaultClient = null;

/**
 * Singleton Browser Supabase Client for Database 1 (Auth & Storage Connections)
 */
export function getSupabaseBrowserClient() {
  const url = getAuthUrl();
  const key = getAuthAnonKey();

  if (!url || !key || !url.startsWith('http')) {
    return null;
  }

  if (typeof window === 'undefined') {
    return createClient(url, key);
  }

  if (!browserAuthClient) {
    try {
      browserAuthClient = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch (e) {
      console.warn('Supabase browser client init notice:', e.message);
      return null;
    }
  }
  return browserAuthClient;
}

/**
 * Singleton Browser Supabase Client for Database 2 (Personal Vault Details)
 */
export function getSupabaseVaultClient() {
  const url = getVaultUrl();
  const key = getVaultAnonKey();

  if (!url || !key || !url.startsWith('http')) {
    return getSupabaseBrowserClient();
  }

  if (typeof window === 'undefined') {
    return createClient(url, key);
  }

  if (!browserVaultClient) {
    try {
      browserVaultClient = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    } catch (e) {
      return getSupabaseBrowserClient();
    }
  }
  return browserVaultClient;
}

/**
 * Server-side Supabase Client for Database 1 (Auth & Storage Connections)
 */
export function getSupabaseServerClient(token = null) {
  const url = getAuthUrl();
  const key = getAuthAnonKey();

  if (!url || !key || !url.startsWith('http')) {
    return null;
  }

  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  };

  if (token) {
    options.global = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  try {
    return createClient(url, key, options);
  } catch {
    return null;
  }
}

/**
 * Server-side Supabase Client for Database 2 (Personal Vault Details)
 */
export function getSupabaseServerVaultClient(token = null) {
  const url = getVaultUrl();
  const key = getVaultAnonKey();

  if (!url || !key || !url.startsWith('http')) {
    return getSupabaseServerClient(token);
  }

  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  };

  if (token) {
    options.global = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  try {
    return createClient(url, key, options);
  } catch {
    return null;
  }
}

/**
 * Supabase Admin Client using Service Role Key (if available)
 */
export function getSupabaseAdminClient() {
  const url = getAuthUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || getAuthAnonKey();

  if (!url || !serviceKey || !url.startsWith('http')) {
    return null;
  }

  try {
    return createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Supabase Admin Client for Database 2 (Vault Database)
 */
export function getSupabaseVaultAdminClient() {
  const url = getVaultUrl();
  const serviceKey =
    process.env.VAULT_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    getVaultAnonKey();

  if (!url || !serviceKey || !url.startsWith('http')) {
    return getSupabaseAdminClient();
  }

  try {
    return createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch {
    return null;
  }
}
