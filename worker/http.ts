export interface AppEnv {
  DB: D1Database
  /** R2 bucket for uploaded files. No public access; served only via the authenticated route. */
  FILES: R2Bucket
  /** Global upload cap in bytes (default 5 GB). Optional; parsed defensively. */
  MAX_TOTAL_STORAGE_BYTES?: string
  /** Per-user upload cap in bytes (default 100 MB). Optional; parsed defensively. */
  MAX_USER_STORAGE_BYTES?: string
  /** Google OAuth client ID (ID token audience). Empty or unset means sign-in fails closed. */
  GOOGLE_CLIENT_ID?: string
  /** Per-user recipe cap (default 50). Optional; parsed defensively. */
  MAX_USER_RECIPES?: string
  /** Per-user write requests per minute (default 20). Optional; parsed defensively. */
  WRITE_RATE_PER_MINUTE?: string
}

export const json = (body: unknown, status = 200, headers?: HeadersInit): Response => {
  const h = new Headers(headers)
  h.set('content-type', 'application/json; charset=utf-8')
  h.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers: h })
}

/** The one error shape used by every endpoint. */
export const errorResponse = (status: number, code: string, message: string): Response =>
  json({ error: { code, message } }, status)
