import { NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

const apiLogger = logger.child('API');

/**
 * Return a successful JSON response
 * @param {object} data
 * @param {number} [status=200]
 * @param {object} [init={}]
 */
export function jsonSuccess(data, status = 200, init = {}) {
  return NextResponse.json(data, {
    status,
    ...init,
  });
}

/**
 * Return a formatted JSON error response
 * @param {string} message
 * @param {number} [status=500]
 * @param {object} [details=null]
 */
export function jsonError(message, status = 500, details = null) {
  const body = { error: message };
  if (details && typeof details === 'object') {
    Object.assign(body, details);
  }
  return NextResponse.json(body, { status });
}

export function jsonBadRequest(message = 'Bad Request', details = null) {
  return jsonError(message, 400, details);
}

export function jsonUnauthorized(message = 'Unauthorized') {
  return jsonError(message, 401);
}

export function jsonForbidden(message = 'Forbidden') {
  return jsonError(message, 403);
}

export function jsonNotFound(message = 'Resource not found') {
  return jsonError(message, 404);
}

/**
 * Universal error handler for route handlers
 * @param {Error} error
 * @param {string} [context='Route']
 */
export function handleApiError(error, context = 'Route') {
  apiLogger.error(`[${context}] Handler error:`, error?.message || error);
  return jsonError(error?.message || 'An internal server error occurred', 500);
}
