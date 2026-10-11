import { createRemoteJWKSet, jwtVerify } from 'jose'

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

export interface GoogleIdentity {
  sub: string
  email: string
  name: string
}

// Created lazily and reused: jose caches the fetched keys and honours Google's cache headers.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
const getJwks = () => (jwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)))

/**
 * Verifies a Google ID token: RS256 signature against Google's published keys, issuer, audience
 * (this app's client ID), expiry, verified email and presence of sub. Returns null on any failure
 * (never throws, never logs token contents). Fails closed when the audience is not configured.
 */
export async function verifyGoogleIdToken(
  credential: string,
  audience: string | undefined,
): Promise<GoogleIdentity | null> {
  if (!audience) return null
  try {
    const { payload } = await jwtVerify(credential, getJwks(), {
      algorithms: ['RS256'],
      issuer: GOOGLE_ISSUERS,
      audience,
      requiredClaims: ['exp', 'sub'],
    })
    const { sub, email, email_verified: verified, name } = payload
    if (typeof sub !== 'string' || !sub) return null
    if (verified !== true) return null
    if (typeof email !== 'string' || !email) return null
    return { sub, email, name: typeof name === 'string' && name ? name : email }
  } catch {
    return null
  }
}
