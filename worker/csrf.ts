import { errorResponse } from './http'

// Only these are treated as safe (read-only). Every other method, including unknown ones such as
// TRACE or PURGE, counts as mutating and must pass the CSRF checks.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF protection for every method except GET, HEAD and OPTIONS (so POST, PUT, PATCH, DELETE and any
 * unknown verb), including sign-in and
 * sign-out. SameSite on the cookie is defence in depth only. Both checks must pass:
 *
 *  1. The Origin header must be present and equal to this request's own origin. Browsers always
 *     send Origin on cross-origin and on same-origin non-GET requests and page script cannot
 *     forge it, so a missing or foreign Origin is rejected.
 *  2. A custom header "X-Requested-With: fetch" must be present. A cross-site form or simple
 *     request cannot add a custom header, and a cross-origin fetch that adds one triggers a CORS
 *     preflight which this Worker never approves (it sends no CORS headers).
 *
 * Rejections are 403 and happen before any handler runs, so nothing is changed.
 */
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_HEADER_VALUE = 'fetch'

export function checkCsrf(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null
  const origin = request.headers.get('origin')
  const ownOrigin = new URL(request.url).origin
  if (!origin || origin !== ownOrigin || request.headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    return errorResponse(403, 'csrf_rejected', 'Request rejected')
  }
  return null
}
