import { errorResponse, json } from './http'
import type { AppEnv } from './http'
import { verifyGoogleIdToken } from './google'
import { clearedCookie, createSession, deleteSession, sessionCookie } from './session'
import type { SessionUser } from './session'

const MAX_CREDENTIAL_LENGTH = 8192
const signInFailed = () => errorResponse(401, 'sign_in_failed', 'Sign-in failed')

async function upsertUser(env: AppEnv, sub: string, email: string, name: string): Promise<string> {
  const now = Date.now()
  // Atomic upsert keyed on sub; a changed email or name is refreshed, the user id never changes.
  const row = await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = excluded.updated_at
     RETURNING id`,
  )
    .bind(crypto.randomUUID(), sub, email, name, now, now)
    .first<{ id: string }>()
  if (!row) throw new Error('user upsert returned no row')
  return row.id
}

/** POST /api/auth/google  body: {credential}. The only unauthenticated mutating route. */
export async function handleGoogleSignIn(request: Request, env: AppEnv): Promise<Response> {
  let credential: unknown
  try {
    credential = ((await request.json()) as { credential?: unknown } | null)?.credential
  } catch {
    return signInFailed()
  }
  if (typeof credential !== 'string' || !credential || credential.length > MAX_CREDENTIAL_LENGTH) {
    return signInFailed()
  }
  const identity = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID)
  if (!identity) return signInFailed()

  const userId = await upsertUser(env, identity.sub, identity.email, identity.name)
  const token = await createSession(env, userId)
  const user: SessionUser = { id: userId, name: identity.name, email: identity.email }
  return json({ user }, 200, { 'set-cookie': sessionCookie(token) })
}

/** GET /api/auth/me. Identity comes only from the session. */
export function handleMe(user: SessionUser): Response {
  return json({ user: { id: user.id, name: user.name, email: user.email } })
}

/** POST /api/auth/signout. Deletes the session row, so the old cookie stops working at once. */
export async function handleSignOut(request: Request, env: AppEnv): Promise<Response> {
  await deleteSession(env, request)
  return json({ ok: true }, 200, { 'set-cookie': clearedCookie() })
}
