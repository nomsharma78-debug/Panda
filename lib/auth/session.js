import { validateSessionToken, recordDeviceSession, touchDeviceSession } from '../db/sessions.js';
import { syncSupabaseUser, findUserById } from '../db/users.js';
import { getSupabaseServerClient } from './supabase.js';

export const SESSION_COOKIE_NAME = 'panda_session';

/**
 * Validate CSRF Origin header for mutating requests (POST, PATCH, DELETE, PUT).
 */
export function validateCsrfOrigin(request) {
  if (!request) return true;
  const method = request.method ? request.method.toUpperCase() : 'GET';
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

  const origin = request.headers.get ? request.headers.get('origin') : request.headers?.origin;
  const host = request.headers.get
    ? (request.headers.get('host') || request.headers.get('x-forwarded-host'))
    : (request.headers?.host || request.headers?.['x-forwarded-host']);

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      const originHostname = originUrl.hostname.toLowerCase();
      const hostHostname = host.split(':')[0].toLowerCase();
      if (originHostname !== hostHostname && !host.toLowerCase().includes(originHostname)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Get cookie options for setting the HTTP-only session cookie
 */
export function getSessionCookieOptions(expiresAt) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

/**
 * Authenticate incoming request and retrieve session & user.
 * Supports Supabase Auth (Bearer token / Supabase Auth cookies)
 * and links Panda users.id to the Supabase Auth user ID.
 */
// In-memory token verification cache (30 second TTL) for ultra-fast API response times
const tokenAuthCache = new Map();

export async function getAuthenticatedUser(request = null) {
  // 1. Check for Supabase Auth Bearer Token in Authorization header OR query param (?token=)
  let authHeader = null;
  let queryToken = null;
  if (request) {
    authHeader = request.headers.get ? request.headers.get('authorization') : request.headers?.authorization;
    if (!authHeader && request.url) {
      try {
        const urlObj = new URL(request.url);
        queryToken = urlObj.searchParams.get('token');
      } catch {}
    }
  }

  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : queryToken;

  if (token) {
    const nowTs = Date.now();

    // Check fast in-memory cache first (<0.1ms)
    const cached = tokenAuthCache.get(token);
    if (cached && cached.expiresAt > nowTs) {
      return cached.authData;
    }

    try {
      const supabase = getSupabaseServerClient(token);
      let userObj = null;

      if (supabase) {
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user) {
          userObj = data.user;
        } else if (error) {
          console.warn('[session] supabase.auth.getUser error:', error.message);
        }
      }

      if (!userObj) {
        const { getSupabaseAdminClient } = await import('./supabase.js');
        const admin = getSupabaseAdminClient();
        if (admin) {
          const { data, error } = await admin.auth.getUser(token);
          if (!error && data?.user) {
            userObj = data.user;
          } else if (error) {
            console.warn('[session] admin.auth.getUser error:', error.message);
          }
        } else {
          console.warn('[session] No Supabase client available to verify token');
        }
      }

      if (userObj) {
        const userAgent = request?.headers?.get ? request.headers.get('user-agent') || '' : '';
        const ip = request?.headers?.get
          ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || ''
          : '';

        const userName =
          userObj.user_metadata?.full_name ||
          userObj.user_metadata?.name ||
          userObj.name ||
          null;

        const authData = {
          user: {
            id: userObj.id,
            email: userObj.email,
            name: userName,
          },
          session: {
            id: userObj.id,
            userId: userObj.id,
            userAgent,
            ipAddress: ip,
          },
        };

        // Cache for 30 seconds
        tokenAuthCache.set(token, {
          authData,
          expiresAt: nowTs + 30000,
        });

        // Background non-blocking sync & session touch
        Promise.all([
          syncSupabaseUser({ id: userObj.id, email: userObj.email, name: userName }).catch(() => {}),
          touchDeviceSession(userObj.id, userAgent, ip).catch(() => {}),
        ]).catch(() => {});

        return authData;
      } else {
        console.warn('[session] Token present but userObj is null - auth failed for token prefix:', token.slice(0, 10) + '...');
      }
    } catch (err) {
      console.error('[session] Token verification threw:', err.message);
    }
  }

  // 2. Check for Supabase Auth token inside cookies
  let cookieString = '';
  if (request) {
    cookieString = (request.headers.get ? request.headers.get('cookie') : request.headers?.cookie) || '';
  } else {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      cookieString = cookieStore.toString();
    } catch {}
  }

  // Look for Supabase access token in cookies (e.g. sb-*-auth-token)
  if (cookieString) {
    const sbMatch = cookieString.match(/sb-[a-zA-Z0-9]+-auth-token=([^;]+)/);
    if (sbMatch) {
      try {
        const parsed = JSON.parse(decodeURIComponent(sbMatch[1]));
        const token = Array.isArray(parsed) ? parsed[0] : parsed.access_token || parsed[0];
        if (token) {
          const supabase = getSupabaseServerClient(token);
          const { data, error } = await supabase.auth.getUser(token);
          if (!error && data?.user) {
            await syncSupabaseUser({ id: data.user.id, email: data.user.email });
            return {
              user: {
                id: data.user.id,
                email: data.user.email,
              },
              session: {
                id: data.user.id,
                userId: data.user.id,
              },
            };
          }
        }
      } catch {}
    }
  }

  // 3. Fallback to Panda session token cookie (panda_session)
  let pandaSessionToken = null;
  if (request) {
    const match = cookieString.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    if (match) {
      pandaSessionToken = decodeURIComponent(match[1]);
    }
  }

  if (!pandaSessionToken) {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
      if (sessionCookie) {
        pandaSessionToken = sessionCookie.value;
      }
    } catch {}
  }

  if (!pandaSessionToken) return null;

  const authData = await validateSessionToken(pandaSessionToken);
  return authData;
}

/**
 * Higher-order middleware helper for route handlers requiring authentication.
 */
export function requireAuth(handler) {
  return async (request, context) => {
    const { NextResponse } = await import('next/server');

    if (!validateCsrfOrigin(request)) {
      return NextResponse.json(
        { error: 'Forbidden: Cross-site request forgery protection triggered.' },
        { status: 403 }
      );
    }

    const authData = await getAuthenticatedUser(request);
    if (!authData || !authData.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login to continue.' },
        { status: 401 }
      );
    }

    return handler(request, { ...context, auth: authData });
  };
}
