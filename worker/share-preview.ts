// Public share-preview page, GET/HEAD /r/:id. The ONLY unauthenticated recipe route.
// It exposes the title of one recipe and nothing else, so chat apps can show a link preview (the
// recipe name, which apps show in bold, and the web address they add themselves). No image and no
// description, by owner decision (28 November 2026). People then follow the redirect to
// /recipes/:id, which needs sign-in.
import { errorResponse } from './http'
import type { AppEnv } from './http'

/** Same character class and length as the /api/recipes/:id routes. */
const ID = /^[A-Za-z0-9-]{1,64}$/

/** This page loads nothing and runs nothing. */
export const SHARE_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

const SITE = 'Family Recipes'
const CACHE_CONTROL = 'public, max-age=300'

export const isSharePath = (pathname: string): boolean => pathname === '/r' || pathname.startsWith('/r/')

/** Escapes text for both element and (double- or single-quoted) attribute contexts. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

interface Preview {
  title: string
  /** Path (not escaped) used for both og:url and the redirect. */
  path: string
}

async function lookup(env: AppEnv, id: string): Promise<{ title: string } | null> {
  // One read by primary key. Only the title is selected.
  return env.DB.prepare('SELECT title FROM recipes WHERE id = ?1').bind(id).first<{ title: string }>()
}

const GENERIC: Preview = { title: SITE, path: '/' }

function render(origin: string, sharePath: string, p: Preview): string {
  const e = escapeHtml
  const url = e(`${origin}${sharePath}`)
  const target = e(p.path)
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(p.title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${e(p.title)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${e(p.title)}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${target}">
</head>
<body>
<p>Opening ${SITE}...</p>
<p><a href="${target}">Open ${e(p.title)}</a></p>
</body>
</html>
`
}

/**
 * Handles every /r, /r/ and /r/* request. An unknown or malformed id gets the same generic 200
 * page as a missing one, so the route never confirms whether a given id exists.
 */
export async function handleSharePreview(request: Request, env: AppEnv): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const res = errorResponse(405, 'method_not_allowed', 'Method not allowed')
    res.headers.set('allow', 'GET, HEAD')
    return res
  }
  const url = new URL(request.url)
  const id = url.pathname.startsWith('/r/') ? url.pathname.slice(3) : ''
  let preview = GENERIC
  let sharePath = '/'
  if (ID.test(id)) {
    const row = await lookup(env, id)
    if (row) {
      preview = { title: row.title, path: `/recipes/${id}` }
      sharePath = `/r/${id}`
    }
  }
  const html = render(url.origin, sharePath, preview)
  return new Response(request.method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': CACHE_CONTROL,
    },
  })
}
