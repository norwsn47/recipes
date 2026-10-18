// Public share-preview page, GET/HEAD /r/:id. The ONLY unauthenticated recipe route.
// It exposes the title, time label and categories of one recipe and nothing else, so chat apps can
// show a link preview. People then follow the redirect to /recipes/:id, which needs sign-in.
import { errorResponse } from './http'
import type { AppEnv } from './http'
import { TIME_TAGS, sortCategories } from './recipe-validation'
import type { TimeTag } from './recipe-validation'

/** Same character class and length as the /api/recipes/:id routes. */
const ID = /^[A-Za-z0-9-]{1,64}$/

/** Short labels, mirroring TIME_LABELS in src/lib/recipes.ts (a test fails if they drift). */
export const SHARE_TIME_LABELS: Record<TimeTag, string> = {
  'Less than 30 mins': '< 30 mins',
  'Around 1 hr': '1 hr',
  'Extensive prep': '1 hr +',
}

/** This page loads nothing and runs nothing: images from our own origin only. */
export const SHARE_CSP =
  "default-src 'none'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

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
  description: string
  /** Path (not escaped) used for both og:url and the redirect. */
  path: string
}

interface ShareRow {
  title: string
  time_tag: string
  categories: string | null
}

async function lookup(env: AppEnv, id: string): Promise<ShareRow | null> {
  // One read by primary key. Only the three public fields are selected.
  return env.DB.prepare(
    `SELECT r.title, r.time_tag,
            (SELECT group_concat(category) FROM recipe_categories WHERE recipe_id = r.id) AS categories
     FROM recipes r WHERE r.id = ?1`,
  ).bind(id).first<ShareRow>()
}

function previewFor(row: ShareRow, id: string): Preview {
  const label = (TIME_TAGS as readonly string[]).includes(row.time_tag) ? SHARE_TIME_LABELS[row.time_tag as TimeTag] : ''
  const cats = sortCategories((row.categories ?? '').split(',')).join(', ')
  const description = [cats, label, SITE].filter(Boolean).join(' · ')
  return { title: row.title, description, path: `/recipes/${id}` }
}

const GENERIC: Preview = { title: SITE, description: SITE, path: '/' }

function render(origin: string, sharePath: string, p: Preview): string {
  const e = escapeHtml
  const url = e(`${origin}${sharePath}`)
  const image = e(`${origin}/og-image.png`)
  const target = e(p.path)
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(p.title)}</title>
<meta name="description" content="${e(p.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${e(p.title)}">
<meta property="og:description" content="${e(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(p.title)}">
<meta name="twitter:description" content="${e(p.description)}">
<meta name="twitter:image" content="${image}">
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
      preview = previewFor(row, id)
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
