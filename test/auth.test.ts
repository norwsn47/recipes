import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIENCE, CSRF_HEADERS, ORIGIN, baseEnv, call, counts, makeToken, resetDb,
  setupGoogleMock, signIn, signInRequest,
} from './helpers'
import * as helpers from './helpers'

const DAY = 24 * 60 * 60 * 1000
const authed = (cookie: string, extra: Record<string, string> = {}) => ({ headers: { cookie, ...extra } })
const sessionRow = () =>
  baseEnv.DB.prepare('SELECT * FROM sessions').first<{ id: string; expires_at: number; last_renewed_at: number }>()

beforeAll(setupGoogleMock)
beforeEach(resetDb)
afterEach(() => vi.useRealTimers())

describe('POST /api/auth/google', () => {
  it('signs in with a valid token, returns the user and sets a session', async () => {
    const res = await signInRequest(await makeToken())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { id: string; name: string; email: string } }
    expect(body.user).toMatchObject({ name: 'Cook One', email: 'cook@example.com' })
    expect(await counts()).toEqual({ users: 1, sessions: 1 })
  })

  it('sets a __Host- cookie that is HttpOnly, Secure, SameSite=Strict, Path=/, 30 days', async () => {
    const res = await signInRequest(await makeToken())
    const c = res.headers.get('set-cookie')!
    expect(c.startsWith('__Host-session=')).toBe(true)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('Secure')
    expect(c).toContain('SameSite=Strict')
    expect(c).toContain('Path=/')
    expect(c).toContain('Max-Age=2592000')
    expect(c).not.toContain('Domain')
  })

  it('stores only a hash of the session token', async () => {
    const { cookie } = await signIn()
    const token = cookie.split('=')[1]
    expect((await sessionRow())!.id).not.toBe(token)
    expect((await sessionRow())!.id).toMatch(/^[0-9a-f]{64}$/)
  })

  const bad: Array<[string, () => Promise<unknown>]> = [
    ['missing credential', async () => undefined],
    ['empty credential', async () => ''],
    ['garbage credential', async () => 'not.a.jwt'],
    ['expired token', () => makeToken({ expSeconds: -100 })],
    ['bad signature', () => makeToken({ key: 'other' })],
    ['wrong audience', () => makeToken({ aud: 'someone-else' })],
    ['wrong issuer', () => makeToken({ iss: 'https://evil.example.com' })],
    ['unverified email', () => makeToken({ emailVerified: false })],
    ['email_verified as string "true"', () => makeToken({ emailVerified: 'true' })],
    ['wrong algorithm (RS384)', () => makeToken({ alg: 'RS384' })],
    ['missing sub', () => makeToken({ omitSub: true })],
  ]
  it.each(bad)('rejects %s: 401, no session, no cookie, no user', async (_n, make) => {
    const res = await signInRequest(await make())
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await res.json()).toEqual({ error: { code: 'sign_in_failed', message: 'Sign-in failed' } })
    expect(await counts()).toEqual({ users: 0, sessions: 0 })
  })

  it('accepts the bare accounts.google.com issuer', async () => {
    const res = await signInRequest(await makeToken({ iss: 'accounts.google.com' }))
    expect(res.status).toBe(200)
  })

  it('rejects an unsigned (alg none) token', async () => {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
    const now = Math.floor(Date.now() / 1000)
    const t = `${b64({ alg: 'none' })}.${b64({ sub: 'x', iss: 'https://accounts.google.com', aud: AUDIENCE, exp: now + 99, email: 'a@b.c', email_verified: true })}.`
    expect((await signInRequest(t)).status).toBe(401)
    expect(await counts()).toEqual({ users: 0, sessions: 0 })
  })

  it('rejects a non-JSON body', async () => {
    const res = await helpers.call('/api/auth/google', { method: 'POST', headers: CSRF_HEADERS, body: 'nope' })
    expect(res.status).toBe(401)
  })

  it('fails closed when GOOGLE_CLIENT_ID is unset or empty', async () => {
    const token = await makeToken()
    for (const id of [undefined, '']) {
      const res = await call('/api/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...CSRF_HEADERS },
        body: JSON.stringify({ credential: token }),
      }, { ...baseEnv, GOOGLE_CLIENT_ID: id })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
    expect(await counts()).toEqual({ users: 0, sessions: 0 })
  })

  it('keeps the same user id (matched by sub) and refreshes email and name', async () => {
    const first = await signIn({ sub: 'sub-A', email: 'old@example.com', name: 'Old Name' })
    const second = await signIn({ sub: 'sub-A', email: 'new@example.com', name: 'New Name' })
    expect(second.userId).toBe(first.userId)
    expect((await counts()).users).toBe(1)
    const me = await call('/api/auth/me', authed(second.cookie))
    expect(((await me.json()) as { user: unknown }).user).toEqual({
      id: first.userId, name: 'New Name', email: 'new@example.com',
    })
  })

  it('gives a different user id to a different sub with the same email', async () => {
    const a = await signIn({ sub: 'sub-A' })
    const b = await signIn({ sub: 'sub-B' })
    expect(a.userId).not.toBe(b.userId)
  })
})

describe('GET /api/auth/me and session validation', () => {
  it('returns the user for a valid session without calling Google', async () => {
    const { cookie, userId } = await signIn()
    const before = helpers.googleFetches
    const res = await call('/api/auth/me', authed(cookie))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: { id: userId, name: 'Cook One', email: 'cook@example.com' } })
    expect(helpers.googleFetches).toBe(before)
  })

  const unauth: Array<[string, string | undefined]> = [
    ['no cookie', undefined],
    ['malformed cookie', '__Host-session=short'],
    ['wrong-charset cookie', `__Host-session=${'!'.repeat(43)}`],
    ['unknown session id', `__Host-session=${'a'.repeat(43)}`],
    ['other cookie name only', `session=${'a'.repeat(43)}`],
  ]
  it.each(unauth)('401 with %s', async (_n, cookie) => {
    const res = await call('/api/auth/me', cookie ? authed(cookie) : {})
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: 'unauthorised', message: 'Sign-in required' } })
  })

  it('401 for an expired session, and the row is removed', async () => {
    const { cookie } = await signIn()
    await baseEnv.DB.prepare('UPDATE sessions SET expires_at = ?').bind(Date.now() - 1000).run()
    expect((await call('/api/auth/me', authed(cookie))).status).toBe(401)
    expect((await counts()).sessions).toBe(0)
  })

  it('expires 30 days after sign-in and not before', async () => {
    const { cookie } = await signIn()
    const row = (await sessionRow())!
    expect(row.expires_at - row.last_renewed_at).toBe(30 * DAY)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(row.last_renewed_at + 29 * DAY)
    expect((await call('/api/auth/me', authed(cookie))).status).toBe(200)
  })

  it('a session unused for 30 days is rejected', async () => {
    const { cookie } = await signIn()
    const row = (await sessionRow())!
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(row.expires_at + 1)
    expect((await call('/api/auth/me', authed(cookie))).status).toBe(401)
  })

  it('does not write on use within 24 hours', async () => {
    const { cookie } = await signIn()
    const before = (await sessionRow())!
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(before.last_renewed_at + DAY - 60_000)
    const res = await call('/api/auth/me', authed(cookie))
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await sessionRow()).toEqual(before)
  })

  it('renews once after 24 hours, extends expiry and the cookie, then not again', async () => {
    const { cookie } = await signIn()
    const before = (await sessionRow())!
    vi.useFakeTimers({ toFake: ['Date'] })
    const t = before.last_renewed_at + DAY + 1000
    vi.setSystemTime(t)
    const res = await call('/api/auth/me', authed(cookie))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=2592000')
    const after = (await sessionRow())!
    expect(after.last_renewed_at).toBe(t)
    expect(after.expires_at).toBe(t + 30 * DAY)
    vi.setSystemTime(t + 3_600_000)
    const again = await call('/api/auth/me', authed(cookie))
    expect(again.headers.get('set-cookie')).toBeNull()
    expect(await sessionRow()).toEqual(after)
  })
})

describe('POST /api/auth/signout', () => {
  it('deletes the session, clears the cookie, and the old cookie then gets 401', async () => {
    const { cookie } = await signIn()
    const res = await call('/api/auth/signout', { method: 'POST', headers: { cookie, ...CSRF_HEADERS } })
    expect(res.status).toBe(200)
    const c = res.headers.get('set-cookie')!
    expect(c).toContain('Max-Age=0')
    expect(c.startsWith('__Host-session=;')).toBe(true)
    expect((await counts()).sessions).toBe(0)
    expect((await call('/api/auth/me', authed(cookie))).status).toBe(401)
  })

  it('without a session is 401', async () => {
    const res = await call('/api/auth/signout', { method: 'POST', headers: CSRF_HEADERS })
    expect(res.status).toBe(401)
  })
})

describe('CSRF', () => {
  const variants: Array<[string, Record<string, string>]> = [
    ['foreign Origin', { origin: 'https://evil.example.com', 'x-requested-with': 'fetch' }],
    ['same host, different scheme Origin', { origin: 'https://example.com', 'x-requested-with': 'fetch' }],
    ['missing Origin', { 'x-requested-with': 'fetch' }],
    ['"null" Origin', { origin: 'null', 'x-requested-with': 'fetch' }],
    ['missing custom header', { origin: ORIGIN }],
    ['wrong custom header value', { origin: ORIGIN, 'x-requested-with': 'XMLHttpRequest' }],
  ]

  it.each(variants)('sign-in with %s: 403, nothing changed', async (_n, headers) => {
    const res = await signInRequest(await makeToken(), headers)
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await counts()).toEqual({ users: 0, sessions: 0 })
  })

  it.each(variants)('sign-out with %s: 403 and the session survives', async (_n, headers) => {
    const { cookie } = await signIn()
    const res = await call('/api/auth/signout', { method: 'POST', headers: { cookie, ...headers } })
    expect(res.status).toBe(403)
    expect((await counts()).sessions).toBe(1)
    expect((await call('/api/auth/me', authed(cookie))).status).toBe(200)
  })

  it.each(['PUT', 'PATCH', 'DELETE', 'POST'])('%s to any /api route needs CSRF even with a valid session', async (method) => {
    const { cookie } = await signIn()
    const res = await call('/api/recipes/1', { method, headers: { cookie, origin: 'https://evil.example.com' } })
    expect(res.status).toBe(403)
  })

  it('GET does not need the CSRF header', async () => {
    const { cookie } = await signIn()
    expect((await call('/api/auth/me', authed(cookie))).status).toBe(200)
  })
})

describe('routing and public routes', () => {
  it('health stays public for GET and HEAD', async () => {
    expect((await call('/api/health')).status).toBe(200)
    expect((await call('/api/health', { method: 'HEAD' })).status).toBe(200)
  })

  it('POST /api/health is 405', async () => {
    expect((await call('/api/health', { method: 'POST', headers: CSRF_HEADERS })).status).toBe(405)
  })

  it('unknown /api route is 401 without a session (no route probing) and 404 with one', async () => {
    expect((await call('/api/nope')).status).toBe(401)
    const { cookie } = await signIn()
    expect((await call('/api/nope', authed(cookie))).status).toBe(404)
  })

  it('GET /api/auth/google is 405', async () => {
    expect((await call('/api/auth/google')).status).toBe(405)
  })
})
