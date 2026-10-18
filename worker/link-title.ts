// POST /api/link-title: fetch a pasted recipe link once and return its page title as plain text.
//
// Everything about the page is attacker-controlled, so: the request is minimal and carries nothing
// from the user, only the first 64 KB are read (and only up to the end of <head>), parsing is done
// by HTMLRewriter (streaming, linear time), the JSON-LD parse is capped, and the result is reduced
// to a short plain-text string. Nothing is stored or cached, and neither the URL nor the title is
// logged (only the outcome class). Every failure degrades to an empty title with a 200.
import { errorResponse, json } from './http'
import type { AppEnv } from './http'
import { RATE_LIMIT_MESSAGE, takeLinkTitleToken } from './limits'
import { MAX_URL_LENGTH, parseSafeUrl } from './link-url'
import type { SessionUser } from './session'

export const MAX_TITLE_CHARS = 100
export const MAX_READ_BYTES = 64 * 1024
export const MAX_REDIRECTS = 3
export const TOTAL_TIMEOUT_MS = 4000
const MAX_REQUEST_BYTES = 4096
const MAX_JSON_LD_CHARS = 8 * 1024 // larger blocks are skipped (CPU)
const MAX_JSON_LD_BLOCKS = 3
const FEED_BYTES = 4096 // input is fed to the parser in pieces this size, so the limits below bite promptly
const MAX_HANDLER_CALLS = 200 // each JS handler call costs CPU; a real <head> uses a few dozen
const MAX_RAW_TITLE_CHARS = 2000 // raw text kept before tag stripping and the 100 character cap

/**
 * Fixed generic User-Agent. Honest about being a bot but in the conventional "Mozilla/5.0
 * (compatible; Name/1.0)" form (as Googlebot and Bingbot do), because some recipe sites refuse
 * agents that do not start with Mozilla/5.0. It does not pretend to be a real browser.
 */
export const USER_AGENT = 'Mozilla/5.0 (compatible; FamilyRecipes-LinkTitle/1.0)'

export type Outcome = 'ok' | 'empty' | 'blocked' | 'timeout' | 'nonhtml' | 'redirect_blocked' | 'error'
export interface LookupResult { title: string; outcome: Outcome }
export type FetchFn = (input: string, init: RequestInit) => Promise<Response>

// ---------------------------------------------------------------------------------------------
// Plain-text clean-up
// ---------------------------------------------------------------------------------------------

// Code points of the common named entities (written as numbers so the source holds no odd characters).
const NAMED_ENTITIES: Record<string, number> = {
  amp: 38, lt: 60, gt: 62, quot: 34, apos: 39, nbsp: 32, ndash: 8211, mdash: 8212, hellip: 8230, lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221, eacute: 233, egrave: 232, ecirc: 234, agrave: 224, acirc: 226, aacute: 225, iacute: 237, oacute: 243, uacute: 250, ccedil: 231, ntilde: 241, ouml: 246, uuml: 252, auml: 228, deg: 176, frac12: 189, frac14: 188, frac34: 190, copy: 169, reg: 174, trade: 8482, middot: 183, bull: 8226, times: 215, euro: 8364, pound: 163,
}

/** Bounded single pass: no backtracking, each match is at most about 12 characters. */
const ENTITY = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,8});/gi

export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' '
      return String.fromCodePoint(code)
    }
    return Object.hasOwn(NAMED_ENTITIES, body) ? String.fromCodePoint(NAMED_ENTITIES[body]) : whole
  })
}

/** Removes <...> runs with a linear scan (a regex over hostile input could backtrack). */
export function stripTags(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('<', i)
    if (open === -1) { out += text.slice(i); break }
    out += text.slice(i, open)
    const close = text.indexOf('>', open + 1)
    if (close === -1) break // an unterminated tag swallows the rest
    out += ' '
    i = close + 1
  }
  return out
}

// Control characters, bidi embeddings/overrides/isolates and marks, zero-width characters, BOM,
// as [first, last] code point ranges (tab, newline and carriage return are kept for whitespace
// collapsing). Checked per code point rather than with a regex, so the source stays plain ASCII.
const UNWANTED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0, 0x8], [0xb, 0xc], [0xe, 0x1f], [0x7f, 0x9f], [0x61c, 0x61c], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff],
]

function removeUnwanted(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (!UNWANTED_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) out += ch
  }
  return out
}

/** Cap by code points so a surrogate pair is never cut in half. */
export function capCodePoints(text: string, max: number): string {
  let out = ''
  let n = 0
  for (const ch of text) {
    if (n === max) break
    out += ch
    n++
  }
  return out
}

/** Drops an obvious trailing " | Site Name" (pipe only: " - " is common inside real recipe names). */
function trimSiteSuffix(title: string): string {
  const at = title.lastIndexOf(' | ')
  if (at <= 0) return title
  const head = title.slice(0, at).trim()
  const tail = title.slice(at + 3)
  return head !== '' && tail.length <= 40 ? head : title
}

/** Raw title text (possibly with tags and entities) to the final plain-text title, or "". */
export function cleanTitle(raw: string): string {
  const text = removeUnwanted(decodeEntities(stripTags(raw.slice(0, MAX_RAW_TITLE_CHARS))))
    .replace(/\s+/g, ' ')
    .trim()
  return capCodePoints(trimSiteSuffix(text), MAX_TITLE_CHARS).trim()
}

// ---------------------------------------------------------------------------------------------
// JSON-LD Recipe name (bounded walk)
// ---------------------------------------------------------------------------------------------

function isRecipeType(t: unknown): boolean {
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

export function recipeNameFromJsonLd(text: string): string | undefined {
  let data: unknown
  try { data = JSON.parse(text) } catch { return undefined }
  const stack: unknown[] = [data]
  for (let steps = 0; stack.length > 0 && steps < 200; steps++) {
    const node = stack.pop()
    if (Array.isArray(node)) { stack.push(...node.slice(0, 50)); continue }
    if (node === null || typeof node !== 'object') continue
    const obj = node as Record<string, unknown>
    if (isRecipeType(obj['@type']) && typeof obj.name === 'string') return obj.name
    if (obj['@graph'] !== undefined) stack.push(obj['@graph'])
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------
// Reading the page
// ---------------------------------------------------------------------------------------------

/** Streams the body through HTMLRewriter, stopping at </head>, an og:title, or 64 KB. */
async function readTitle(body: ReadableStream<Uint8Array>, contentType: string, signal: AbortSignal): Promise<string> {
  let stop = false
  let og: string | undefined
  let ld: string | undefined
  let title: string | undefined
  let titleBuf = ''
  let titleOpen = false
  let ldActive = false
  let ldBlocks = 0
  let ldBuf = ''
  let calls = 0
  const tick = (): boolean => {
    if (++calls > MAX_HANDLER_CALLS) stop = true // a hostile page full of <meta> tags: give up
    return stop
  }

  const rewriter = new HTMLRewriter()
    .on('meta', {
      element(el) {
        if (tick() || og !== undefined) return
        const key = (el.getAttribute('property') ?? el.getAttribute('name') ?? '').trim().toLowerCase()
        if (key !== 'og:title') return
        const content = el.getAttribute('content')
        if (content) { og = content; stop = true }
      },
    })
    .on('title', {
      element() { if (!tick() && title === undefined) titleOpen = true },
      text(chunk) {
        if (!titleOpen || tick()) return
        if (titleBuf.length < MAX_RAW_TITLE_CHARS) titleBuf += chunk.text
        if (chunk.lastInTextNode) { title = titleBuf; titleOpen = false }
      },
    })
    .on('script', {
      element(el) {
        if (tick()) return
        const type = (el.getAttribute('type') ?? '').trim().toLowerCase()
        ldActive = ld === undefined && ldBlocks < MAX_JSON_LD_BLOCKS && type.startsWith('application/ld+json')
        if (ldActive) { ldBlocks++; ldBuf = '' }
      },
      text(chunk) {
        if (!ldActive || tick()) return
        ldBuf += chunk.text
        if (ldBuf.length > MAX_JSON_LD_CHARS) { ldActive = false; ldBuf = ''; return } // too big: skip
        if (chunk.lastInTextNode) { ldActive = false; ld = recipeNameFromJsonLd(ldBuf); ldBuf = '' }
      },
    })
    .on('head', { element(el) { el.onEndTag(() => { stop = true }) } })

  const upstream = body.getReader()
  // The deadline also has to cut off a body that stalls without ever erroring.
  const deadline = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('deadline')), { once: true })
  })
  deadline.catch(() => undefined)
  let total = 0
  let pending: Uint8Array = new Uint8Array(0)
  const capped = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (stop || total >= MAX_READ_BYTES || signal.aborted) { controller.close(); return }
      if (pending.length === 0) {
        let chunkResult: ReadableStreamReadResult<Uint8Array>
        try {
          chunkResult = await Promise.race([upstream.read(), deadline])
        } catch {
          controller.close() // deadline or read error: end the input quietly and use what was parsed
          return
        }
        if (chunkResult.done) { controller.close(); return }
        pending = chunkResult.value
      }
      const take = Math.min(pending.length, FEED_BYTES, MAX_READ_BYTES - total)
      total += take
      controller.enqueue(pending.subarray(0, take))
      pending = pending.subarray(take)
    },
  })

  const out = rewriter.transform(new Response(capped, { headers: { 'content-type': contentType } }))
  const reader = out.body!.getReader()
  try {
    for (;;) {
      const { done } = await reader.read()
      if (done || stop) break
    }
  } finally {
    // Not awaited: cancelling a stalled stream must never hold up the response.
    void reader.cancel().catch(() => undefined)
    void upstream.cancel().catch(() => undefined) // closes the connection if we stopped early
  }
  // A title found before an error or the deadline is still returned; precedence below.
  for (const candidate of [og, ld, title]) {
    if (candidate === undefined) continue
    const cleaned = cleanTitle(candidate)
    if (cleaned !== '') return cleaned
  }
  return ''
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function isHtml(contentType: string | null): boolean {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  return type === 'text/html' || type === 'application/xhtml+xml'
}

const cancelBody = (res: Response): Promise<void> => (res.body ? res.body.cancel().catch(() => undefined) : Promise.resolve())

/** Looks up a title for an already syntactically valid URL string. Never throws. */
export async function lookupTitle(
  rawUrl: string,
  fetchFn: FetchFn = (input, init) => fetch(input, init),
  timeoutMs = TOTAL_TIMEOUT_MS,
): Promise<LookupResult> {
  const signal = AbortSignal.timeout(timeoutMs) // one deadline for the whole chain, redirects included
  try {
    let url = parseSafeUrl(rawUrl)
    if (!url) return { title: '', outcome: 'blocked' }
    for (let hop = 0; ; hop++) {
      const res = await fetchFn(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9' },
      })
      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get('location')
        await cancelBody(res)
        if (hop >= MAX_REDIRECTS || !location) return { title: '', outcome: 'redirect_blocked' }
        const next = parseSafeUrl(location, url.href)
        if (!next) return { title: '', outcome: 'redirect_blocked' }
        url = next
        continue
      }
      if (res.status < 200 || res.status > 299 || !res.body) {
        await cancelBody(res)
        return { title: '', outcome: 'empty' }
      }
      const contentType = res.headers.get('content-type')
      if (!isHtml(contentType)) {
        await cancelBody(res)
        return { title: '', outcome: 'nonhtml' }
      }
      const title = await readTitle(res.body, contentType!, signal)
      return { title, outcome: title !== '' ? 'ok' : signal.aborted ? 'timeout' : 'empty' }
    }
  } catch {
    return { title: '', outcome: signal.aborted ? 'timeout' : 'error' }
  }
}

// ---------------------------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------------------------

const invalidUrl = (): Response => errorResponse(400, 'invalid_url', 'That does not look like a link we can read')

/** Reads at most MAX_REQUEST_BYTES of the body as text; null if it is larger. */
async function readSmallBody(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_REQUEST_BYTES) { await reader.cancel().catch(() => undefined); return null }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { all.set(c, at); at += c.length }
  return new TextDecoder().decode(all)
}

export async function handleLinkTitle(request: Request, env: AppEnv, user: SessionUser): Promise<Response> {
  // 1. Validate first: free (no D1), and a bad request never spends a rate-limit token or goes out.
  const text = await readSmallBody(request)
  let url: unknown
  try {
    const body: unknown = text === null ? null : JSON.parse(text)
    url = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as { url?: unknown }).url : undefined
  } catch {
    return invalidUrl()
  }
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH || !parseSafeUrl(url.trim())) return invalidUrl()

  // 2. Take the rate-limit token before any outbound request.
  if (!(await takeLinkTitleToken(env, user.id))) {
    return new Response(
      JSON.stringify({ error: { code: 'rate_limited', message: RATE_LIMIT_MESSAGE } }),
      { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '60' } },
    )
  }

  // 3. Look up. Only the outcome class is logged: never the URL or the title.
  const result = await lookupTitle(url.trim())
  console.log('link-title', result.outcome)
  return json({ title: result.title })
}
