import { env } from 'cloudflare:workers'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import type { JWK } from 'jose'
import { vi } from 'vitest'
import worker from '../worker/index'
import type { AppEnv } from '../worker/http'

export const ORIGIN = 'http://example.com'
export const AUDIENCE = 'test-client-id.apps.googleusercontent.com'
export const KID = 'test-key-1'
export const baseEnv = env as unknown as AppEnv

export const CSRF_HEADERS = { origin: ORIGIN, 'x-requested-with': 'fetch' }

let goodKey: CryptoKey
let otherKey: CryptoKey
let rs384Key: CryptoKey
export let googleFetches = 0

/** Generates RSA keys and replaces global fetch so Google's JWKS URL serves our public key. */
export async function setupGoogleMock(): Promise<void> {
  const good = await generateKeyPair('RS256', { extractable: true })
  const other = await generateKeyPair('RS256', { extractable: true })
  const rs384 = await generateKeyPair('RS384', { extractable: true })
  rs384Key = rs384.privateKey
  goodKey = good.privateKey
  otherKey = other.privateKey
  const jwk: JWK = { ...(await exportJWK(good.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }
  const realFetch = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.startsWith('https://www.googleapis.com/')) {
      googleFetches++
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
      })
    }
    return realFetch(input, init)
  })
}

export interface TokenOptions {
  sub?: string
  email?: string
  name?: string
  emailVerified?: boolean | string
  aud?: string
  iss?: string
  expSeconds?: number
  key?: 'good' | 'other'
  alg?: 'RS256' | 'RS384'
  omitSub?: boolean
}

export async function makeToken(o: TokenOptions = {}): Promise<string> {
  const claims: Record<string, unknown> = {
    email: o.email ?? 'cook@example.com',
    email_verified: o.emailVerified ?? true,
    name: o.name ?? 'Cook One',
  }
  if (!o.omitSub) claims.sub = o.sub ?? 'google-sub-1'
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(claims)
    .setProtectedHeader({ alg: o.alg ?? 'RS256', kid: KID })
    .setIssuer(o.iss ?? 'https://accounts.google.com')
    .setAudience(o.aud ?? AUDIENCE)
    .setIssuedAt(now - 10)
    .setExpirationTime(now + (o.expSeconds ?? 3600))
    .sign(o.alg === 'RS384' ? rs384Key : o.key === 'other' ? otherKey : goodKey)
}

export const call = (path: string, init: RequestInit = {}, e: AppEnv = baseEnv) =>
  worker.fetch(new Request(`${ORIGIN}${path}`, init), e)

export const signInRequest = (credential: unknown, headers: Record<string, string> = CSRF_HEADERS) =>
  call('/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ credential }),
  })

/** Signs in and returns the cookie pair ("name=value") for later requests. */
export async function signIn(o: TokenOptions = {}): Promise<{ cookie: string; userId: string }> {
  const res = await signInRequest(await makeToken(o))
  if (res.status !== 200) throw new Error(`sign-in failed in test: ${res.status}`)
  const cookie = res.headers.get('set-cookie')!.split(';')[0]
  return { cookie, userId: ((await res.json()) as { user: { id: string } }).user.id }
}

export async function counts(): Promise<{ users: number; sessions: number }> {
  const u = await baseEnv.DB.prepare('SELECT COUNT(*) AS c FROM users').first<{ c: number }>()
  const s = await baseEnv.DB.prepare('SELECT COUNT(*) AS c FROM sessions').first<{ c: number }>()
  return { users: u!.c, sessions: s!.c }
}

export async function resetBucket(): Promise<void> {
  const listed = await baseEnv.FILES.list()
  if (listed.objects.length) await baseEnv.FILES.delete(listed.objects.map((o) => o.key))
}

export async function resetDb(): Promise<void> {
  await resetBucket()
  await baseEnv.DB.batch([baseEnv.DB.prepare('DELETE FROM recipes'), baseEnv.DB.prepare('DELETE FROM write_rate_limits'), baseEnv.DB.prepare('DELETE FROM link_title_rate_limits'), baseEnv.DB.prepare('DELETE FROM sessions'), baseEnv.DB.prepare('DELETE FROM users')])
}
