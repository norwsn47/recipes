import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import headersFile from '../public/_headers?raw'
import { CSRF_HEADERS, call, resetDb, setupGoogleMock, signIn } from './helpers'

beforeAll(setupGoogleMock)
beforeEach(resetDb)

function expectApiHeaders(res: Response) {
  expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  expect(res.headers.get('x-frame-options')).toBe('DENY')
  expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
}

describe('security headers on /api responses', () => {
  it('200 health', async () => expectApiHeaders(await call('/api/health')))
  it('405 health', async () => {
    const res = await call('/api/health', { method: 'POST', headers: CSRF_HEADERS })
    expect(res.status).toBe(405)
    expectApiHeaders(res)
  })
  it('401 without a session', async () => {
    const res = await call('/api/auth/me')
    expect(res.status).toBe(401)
    expectApiHeaders(res)
  })
  it('403 CSRF rejection', async () => {
    const res = await call('/api/auth/signout', { method: 'POST' })
    expect(res.status).toBe(403)
    expectApiHeaders(res)
  })
  it('404 with a session', async () => {
    const { cookie } = await signIn()
    const res = await call('/api/nope', { headers: { cookie } })
    expect(res.status).toBe(404)
    expectApiHeaders(res)
  })
  it('404 outside /api', async () => {
    const res = await call('/nope')
    expect(res.status).toBe(404)
    expectApiHeaders(res)
  })
  it('authenticated 200', async () => {
    const { cookie } = await signIn()
    const res = await call('/api/auth/me', { headers: { cookie } })
    expect(res.status).toBe(200)
    expectApiHeaders(res)
  })
  it('renewed-cookie path keeps the headers and sets the cookie', async () => {
    const { cookie } = await signIn()
    await baseDbAge()
    const res = await call('/api/auth/me', { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('__Host-session=')
    expectApiHeaders(res)
  })
})

async function baseDbAge() {
  const { baseEnv } = await import('./helpers')
  await baseEnv.DB.prepare('UPDATE sessions SET last_renewed_at = last_renewed_at - 172800000').run()
}

describe('CSRF covers every non-safe method', () => {
  for (const method of ['PUT', 'PATCH', 'DELETE', 'POST', 'PURGE', 'TRACE']) {
    it(`${method} without origin is 403`, async () => {
      const { cookie } = await signIn()
      let res: Response
      try {
        res = await call('/api/auth/me', { method, headers: { cookie } })
      } catch {
        throw new Error(`could not send ${method}`)
      }
      expect(res.status).toBe(403)
    })
  }
  it('GET, HEAD and OPTIONS skip the CSRF check', async () => {
    const { cookie } = await signIn()
    expect((await call('/api/auth/me', { headers: { cookie } })).status).toBe(200)
    expect((await call('/api/auth/me', { method: 'HEAD', headers: { cookie } })).status).not.toBe(403)
    expect((await call('/api/auth/me', { method: 'OPTIONS', headers: { cookie } })).status).not.toBe(403)
  })
})

describe('public/_headers', () => {
  const text = headersFile
  it('sets the key directives', () => {
    expect(text).toContain('/*')
    for (const d of [
      "default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
      "frame-ancestors 'none'", 'https://accounts.google.com/gsi/client', 'https://accounts.google.com/gsi/style',
      'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
      'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY',
      'Referrer-Policy: strict-origin-when-cross-origin', 'Cross-Origin-Opener-Policy: same-origin-allow-popups',
    ]) expect(text).toContain(d)
  })
  it('does not allow unsafe script sources', () => {
    const script = text.match(/script-src[^;]*/)![0]
    expect(script).not.toContain('unsafe')
  })
})
