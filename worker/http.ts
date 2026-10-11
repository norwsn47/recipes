export interface AppEnv {
  DB: D1Database
  /** Google OAuth client ID (ID token audience). Empty or unset means sign-in fails closed. */
  GOOGLE_CLIENT_ID?: string
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
