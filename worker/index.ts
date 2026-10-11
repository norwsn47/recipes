// Worker entry: routing, CSRF, then session auth for everything under /api/ except the public routes.
import { handleGoogleSignIn, handleMe, handleSignOut } from './auth'
import { checkCsrf } from './csrf'
import { errorResponse, json } from './http'
import type { AppEnv } from './http'
import { withSecurityHeaders } from './security-headers'
import { sessionCookie, validateSession } from './session'
import type { SessionUser } from './session'

type Handler = (request: Request, env: AppEnv, user: SessionUser) => Promise<Response> | Response

// Authenticated routes. Later recipe routes are added here and get auth and CSRF for free.
const routes: Record<string, Handler> = {
  'GET /api/auth/me': (_req, _env, user) => handleMe(user),
  'POST /api/auth/signout': (req, env) => handleSignOut(req, env),
}

async function route(request: Request, env: AppEnv): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method

  if (!pathname.startsWith('/api/')) return errorResponse(404, 'not_found', 'Not found')

  // Public: health.
  if (pathname === '/api/health') {
    if (method !== 'GET' && method !== 'HEAD') {
      return errorResponse(405, 'method_not_allowed', 'Method not allowed')
    }
    return json({ ok: true })
  }

  // CSRF applies to every mutating request, before auth and before any handler.
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  // Public: sign-in (it verifies the Google token itself).
  if (pathname === '/api/auth/google') {
    if (method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed')
    return handleGoogleSignIn(request, env)
  }

  // Everything else needs a valid session. Unknown routes also get 401 without a session, so a
  // signed-out caller cannot probe which routes exist; with a session they get 404.
  const session = await validateSession(env, request)
  if (!session) return errorResponse(401, 'unauthorised', 'Sign-in required')

  const handler = routes[`${method} ${pathname}`]
  const res = handler
    ? await handler(request, env, session.user)
    : errorResponse(404, 'not_found', 'Not found')
  if (session.renewedToken) {
    // The session was renewed (at most daily), so extend the browser cookie to match.
    const out = new Response(res.body, res)
    out.headers.append('set-cookie', sessionCookie(session.renewedToken))
    return out
  }
  return res
}

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    try {
      return withSecurityHeaders(await route(request, env))
    } catch (err) {
      console.error('Unhandled worker error', err instanceof Error ? err.message : 'unknown')
      return withSecurityHeaders(errorResponse(500, 'internal', 'Something went wrong'))
    }
  },
}
