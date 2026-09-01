import { validateSessionToken } from '../db/sessions.js';
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
      const originHost = new URL(origin).host;
      if (originHost.toLowerCase() !== host.toLowerCase()) {
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
export async function getAuthenticatedUser(request = null) {
  if (request && !validateCsrfOrigin(request)) {
    return null;
  }

  // 1. Check for Supabase Auth Bearer Token in Authorization header
  let authHeader = null;
  if (request) {
    authHeader = request.headers.get ? request.headers.get('authorization') : request.headers?.authorization;
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const supabase = getSupabaseServerClient(token);
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        // Sync user to Panda's PostgreSQL users table (id = supabase.user.id)
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
    } catch {}
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
  let token = null;
  if (request) {
    const match = cookieString.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
      if (sessionCookie) {
        token = sessionCookie.value;
      }
    } catch {}
  }

  if (!token) return null;

  const authData = await validateSessionToken(token);
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
