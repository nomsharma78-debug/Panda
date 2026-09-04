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

  // 2. Check for Supabase Auth token inside cookies (supporting chunking, base64, and standard JWTs)
  if (cookieString) {
    let rawCookieVal = null;

    // A. Check for chunked cookies (sb-*-auth-token.0, sb-*-auth-token.1...)
    const chunkMatches = Array.from(cookieString.matchAll(/sb-[a-zA-Z0-9_-]+-auth-token\.(\d+)=([^;]+)/g));
    if (chunkMatches.length > 0) {
      chunkMatches.sort((a, b) => parseInt(a[1], 10) - parseInt(b[1], 10));
      rawCookieVal = chunkMatches.map(m => m[2]).join('');
    }

    // B. Check for single auth-token cookie
    if (!rawCookieVal) {
      const sbMatch = cookieString.match(/sb-[a-zA-Z0-9_-]+-auth-token=([^;]+)/);
      if (sbMatch) rawCookieVal = sbMatch[1];
    }

    // C. Check for direct access token cookies
    if (!rawCookieVal) {
      const directMatch = cookieString.match(/(?:sb-access-token|supabase-auth-token)=([^;]+)/);
      if (directMatch) rawCookieVal = directMatch[1];
    }

    if (rawCookieVal) {
      try {
        let decodedStr = decodeURIComponent(rawCookieVal);
        if (decodedStr.startsWith('base64-')) {
          decodedStr = Buffer.from(decodedStr.slice(7), 'base64').toString('utf8');
        }
        let token = null;
        try {
          const parsed = JSON.parse(decodedStr);
          token = Array.isArray(parsed) ? parsed[0] : (parsed.access_token || parsed[0]);
        } catch {
          if (decodedStr.startsWith('ey') && decodedStr.includes('.')) {
            token = decodedStr; // Plain JWT
          }
        }

        if (token) {
          const nowTs = Date.now();
          const cached = tokenAuthCache.get(token);
          if (cached && cached.expiresAt > nowTs) {
            return cached.authData;
          }

          const supabase = getSupabaseServerClient(token);
          if (supabase) {
            const { data, error } = await supabase.auth.getUser(token);
            if (!error && data?.user) {
              const userObj = data.user;
              const userName = userObj.user_metadata?.full_name || userObj.user_metadata?.name || userObj.name || null;
              const authData = {
                user: { id: userObj.id, email: userObj.email, name: userName },
                session: { id: userObj.id, userId: userObj.id },
              };
              tokenAuthCache.set(token, { authData, expiresAt: nowTs + 30000 });
              syncSupabaseUser({ id: userObj.id, email: userObj.email, name: userName }).catch(() => {});
              return authData;
            }
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
