/** Headers for every /api response (JSON only, so the CSP can forbid everything). The SPA's own
 *  headers live in public/_headers because static assets never pass through the Worker. */
const API_SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
}

/** `csp` overrides the policy for the one HTML route (the share preview); everything else is strict API. */
export function withSecurityHeaders(res: Response, csp?: string): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) out.headers.set(k, v)
  if (csp) out.headers.set('content-security-policy', csp)
  return out
}
