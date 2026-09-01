/**
 * In-memory sliding window rate limiter for Vercel/Node Serverless environments.
 * Tracks client IP and action key with timestamps.
 */

const tracker = new Map();

// Periodic cleanup of stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of tracker.entries()) {
      if (now - record.resetTime > 60000) {
        tracker.delete(key);
      }
    }
  }, 300000);
}

/**
 * Check if an action is within rate limit.
 * @param {string} identifier - e.g. IP address or user ID.
 * @param {string} action - e.g. 'auth:login', 'storage:test', 'media:upload'.
 * @param {number} maxRequests - Max allowed hits within the window.
 * @param {number} windowMs - Window duration in milliseconds.
 * @returns {{ allowed: boolean, remaining: number, resetInSeconds: number }}
 */
export function checkRateLimit(identifier, action = 'general', maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const key = `${action}:${identifier || 'anonymous'}`;

  let record = tracker.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs,
    };
    tracker.set(key, record);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  record.count += 1;
  const remaining = Math.max(0, maxRequests - record.count);
  const resetInSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

  if (record.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
    };
  }

  return {
    allowed: true,
    remaining,
    resetInSeconds,
  };
}

/**
 * Helper to extract client IP from Next.js request headers
 */
export function getClientIp(request) {
  if (!request) return '127.0.0.1';
  const headers = request.headers;
  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  const xRealIp = headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();
  return '127.0.0.1';
}
