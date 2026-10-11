// The one place the app talks to /api/*. Same-origin relative URLs only. Mutating requests carry
// the CSRF header the Worker requires. A 401 from any call other than the sign-in/me calls means
// the session ended, and listeners (the auth context) are told so the app can re-prompt sign-in.
// Kept free of DOM and React so it can be unit tested in the existing Workers-pool setup.

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to "the session ended". Returns an unsubscribe function. */
export function onSessionEnded(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  /** Sent as JSON. */
  json?: unknown
  /** The caller handles 401 itself (sign-in and the "who am I" check), so do not signal. */
  handleUnauthorised?: boolean
}

export function apiFetch(path: string, options: ApiOptions = {}): Promise<Response> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    return Promise.reject(new Error('apiFetch only accepts same-origin paths'))
  }
  const { json, handleUnauthorised, headers: extra, ...init } = options
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(extra)
  if (MUTATING.has(method)) headers.set('X-Requested-With', 'fetch')
  let body: string | undefined
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(json)
  }
  return fetch(path, { ...init, method, headers, body }).then((res) => {
    if (res.status === 401 && !handleUnauthorised) listeners.forEach((l) => l())
    return res
  })
}

export interface User {
  id: string
  name: string
  email: string
}

async function readUser(res: Response): Promise<User | null> {
  try {
    const data = (await res.json()) as { user?: User } | null
    return data?.user ?? null
  } catch {
    return null
  }
}

/** The signed-in user, or null when signed out. Throws on network or server failure. */
export async function fetchMe(): Promise<User | null> {
  const res = await apiFetch('/api/auth/me', { handleUnauthorised: true })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`me failed: ${res.status}`)
  return readUser(res)
}

/** Exchanges the Google ID token for an app session. Returns null if sign-in was refused. */
export async function signInWithGoogle(credential: string): Promise<User | null> {
  const res = await apiFetch('/api/auth/google', { method: 'POST', json: { credential }, handleUnauthorised: true })
  if (!res.ok) return null
  return readUser(res)
}

export async function signOutRequest(): Promise<void> {
  await apiFetch('/api/auth/signout', { method: 'POST', handleUnauthorised: true })
}
