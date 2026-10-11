import type { AppEnv } from './http'

export const COOKIE_NAME = '__Host-session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const RENEW_AFTER_MS = 24 * 60 * 60 * 1000
const SESSION_TTL_S = SESSION_TTL_MS / 1000
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/ // 32 random bytes, base64url

export interface SessionUser {
  id: string
  name: string
  email: string
}

export interface ValidSession {
  user: SessionUser
  /** Set only when this request renewed the session, so the cookie lifetime can be extended too. */
  renewedToken?: string
}

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Cookie: __Host- prefix (requires Secure, Path=/, no Domain, so it cannot be set by a sibling
 * subdomain). SameSite=Strict: the app is a single-origin SPA that talks to its API with fetch,
 * so the cookie is never needed on cross-site navigations, and Strict is the safer default.
 */
export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_TTL_S}; Path=/; HttpOnly; Secure; SameSite=Strict`
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`
}

/** Returns the well-formed token from the Cookie header, or null. */
export function readToken(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === COOKIE_NAME) {
      const value = part.slice(eq + 1).trim()
      return TOKEN_PATTERN.test(value) ? value : null
    }
  }
  return null
}

export async function createSession(env: AppEnv, userId: string, now = Date.now()): Promise<string> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, last_renewed_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await hashToken(token), userId, now, now + SESSION_TTL_MS, now)
    .run()
  return token
}

interface SessionRow {
  expires_at: number
  last_renewed_at: number
  user_id: string
  name: string
  email: string
}

/** Validates the cookie against D1. Sliding expiry; the renewal write happens at most daily. */
export async function validateSession(
  env: AppEnv,
  request: Request,
  now = Date.now(),
): Promise<ValidSession | null> {
  const token = readToken(request)
  if (!token) return null
  const id = await hashToken(token)
  const row = await env.DB.prepare(
    `SELECT s.expires_at, s.last_renewed_at, u.id AS user_id, u.name, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
  )
    .bind(id)
    .first<SessionRow>()
  if (!row) return null
  if (row.expires_at <= now) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()
    return null
  }
  const user = { id: row.user_id, name: row.name, email: row.email }
  if (now - row.last_renewed_at < RENEW_AFTER_MS) return { user }
  await env.DB.prepare('UPDATE sessions SET expires_at = ?, last_renewed_at = ? WHERE id = ?')
    .bind(now + SESSION_TTL_MS, now, id)
    .run()
  return { user, renewedToken: token }
}

export async function deleteSession(env: AppEnv, request: Request): Promise<void> {
  const token = readToken(request)
  if (!token) return
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await hashToken(token)).run()
}
