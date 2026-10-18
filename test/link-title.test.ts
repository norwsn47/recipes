import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CSRF_HEADERS, baseEnv, call, resetDb, setupGoogleMock, signIn } from './helpers'
import { cleanTitle, decodeEntities, lookupTitle, recipeNameFromJsonLd } from '../worker/link-title'
import type { AppEnv } from '../worker/http'

let googleFetch: typeof fetch
beforeAll(async () => {
  await setupGoogleMock()
  googleFetch = globalThis.fetch
})
beforeEach(resetDb)
afterEach(() => { globalThis.fetch = googleFetch })

interface Seen { url: string; init: RequestInit }
type Responder = (url: string, init: RequestInit) => Response | Promise<Response>

/** Replaces outbound fetch; Google's key fetch still works for sign-in. Records every other call. */
function stubOutbound(responder: Responder): Seen[] {
  const seen: Seen[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.startsWith('https://www.googleapis.com/')) return googleFetch(input, init)
    seen.push({ url, init: init ?? {} })
    return responder(url, init ?? {})
  }) as typeof fetch
  return seen
}

const html = (body: string, type = 'text/html; charset=utf-8', status = 200) =>
  new Response(body, { status, headers: { 'content-type': type } })
const page = (head: string, body = '') => html(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`)
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } })

const lookup = (cookie: string | undefined, url: unknown, e: AppEnv = baseEnv, headers: Record<string, string> = CSRF_HEADERS) =>
  call('/api/link-title', {
    method: 'POST',
    headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json', ...headers },
    body: typeof url === 'string' && url.startsWith('RAW:') ? url.slice(4) : JSON.stringify({ url }),
  }, e)
const titleOf = async (res: Response) => ((await res.json()) as { title: string }).title
const rows = async (table: string) =>
  (await baseEnv.DB.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>())!.c

describe('auth, CSRF and headers', () => {
  it('401 without a session, 403 on CSRF failure, no outbound request', async () => {
    const seen = stubOutbound(() => page('<title>x</title>'))
    expect((await lookup(undefined, 'https://example.com/')).status).toBe(401)
    const { cookie } = await signIn()
    expect((await lookup(cookie, 'https://example.com/', baseEnv, { origin: 'http://example.com' })).status).toBe(403)
    expect((await lookup(cookie, 'https://example.com/', baseEnv, { origin: 'http://evil.test', 'x-requested-with': 'fetch' })).status).toBe(403)
    expect((await call('/api/link-title', { method: 'GET', headers: { cookie } })).status).toBe(404)
    expect(seen).toHaveLength(0)
  })

  it('returns 200 {title} with no-store and sets nothing about the URL', async () => {
    stubOutbound(() => page('<title>Pasta bake</title>'))
    const { cookie } = await signIn()
    const res = await lookup(cookie, 'https://example.com/pasta')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ title: 'Pasta bake' })
  })
})

describe('validation: 400 invalid_url and no outbound request', () => {
  const bad: Array<[string, unknown]> = [
    ['ftp scheme', 'ftp://example.com/'], ['file scheme', 'file:///etc/passwd'], ['javascript scheme', 'javascript:alert(1)'],
    ['credentials', 'https://u:p@example.com/'], ['localhost', 'http://localhost/'], ['subdomain of localhost', 'http://a.localhost/'],
    ['.local', 'http://nas.local/'], ['.internal', 'http://x.internal/'], ['dotless', 'http://intranet/'],
    ['loopback', 'http://127.0.0.1/'], ['private 10', 'http://10.1.2.3/'], ['private 192.168', 'http://192.168.0.1/'],
    ['private 172.16', 'http://172.20.0.1/'], ['metadata', 'http://169.254.169.254/latest/meta-data/'], ['CGNAT', 'http://100.64.0.1/'],
    ['ipv6 loopback', 'http://[::1]/'], ['ipv6 unique local', 'http://[fc00::1]/'], ['ipv6 link-local', 'http://[fe80::1]/'],
    ['ipv4-mapped', 'http://[::ffff:127.0.0.1]/'], ['decimal ip', 'http://2130706433/'], ['hex ip', 'http://0x7f.1/'],
    ['octal ip', 'http://0177.0.0.1/'], ['non-default port', 'https://example.com:8443/'], ['too long', `https://example.com/${'a'.repeat(2000)}`],
    ['not a url', 'hello'], ['empty', ''], ['non-string url', 42], ['null url', null], ['missing url', undefined],
    ['non-JSON body', 'RAW:not json'], ['array body', 'RAW:["https://example.com/"]'], ['null body', 'RAW:null'],
    ['empty body', 'RAW:'], ['huge body', `RAW:{"url":"${'a'.repeat(5000)}"}`],
  ]
  it.each(bad)('%s', async (_name, url) => {
    const seen = stubOutbound(() => page('<title>x</title>'))
    const { cookie } = await signIn()
    const res = await lookup(cookie, url)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_url' } })
    expect(seen).toHaveLength(0)
    expect(await rows('link_title_rate_limits')).toBe(0) // a rejected URL spends no token
  })
})

describe('rate limit', () => {
  it('allows 10 a minute then 429s with no D1 write and no outbound call; separate from writes', async () => {
    const seen = stubOutbound(() => page('<title>x</title>'))
    const { cookie } = await signIn()
    for (let i = 0; i < 10; i++) expect((await lookup(cookie, 'https://example.com/')).status).toBe(200)
    expect(seen).toHaveLength(10)
    const before = await baseEnv.DB.prepare('SELECT count, window_start FROM link_title_rate_limits').first()
    const res = await lookup(cookie, 'https://example.com/')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } })
    for (let i = 0; i < 5; i++) await lookup(cookie, 'https://example.com/')
    expect(seen).toHaveLength(10)
    expect(await baseEnv.DB.prepare('SELECT count, window_start FROM link_title_rate_limits').first()).toEqual(before)
    // Lookups did not spend write tokens, and writes do not spend lookup tokens.
    expect(await rows('write_rate_limits')).toBe(0)
    const create = await call('/api/recipes', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json', ...CSRF_HEADERS },
      body: JSON.stringify({ title: 'T', timeTag: 'Around 1 hr', categories: ['Chicken'], notes: 'n' }),
    })
    expect(create.status).toBe(201)
    // Window reset frees it again.
    await baseEnv.DB.prepare('UPDATE link_title_rate_limits SET window_start = window_start - 61000').run()
    expect((await lookup(cookie, 'https://example.com/')).status).toBe(200)
  })

  it('is per user and configurable, with a defensive default', async () => {
    stubOutbound(() => page('<title>x</title>'))
    const a = await signIn({ sub: 'a' })
    const b = await signIn({ sub: 'b', email: 'b@example.com' })
    const small: AppEnv = { DB: baseEnv.DB, FILES: baseEnv.FILES, LINK_TITLE_RATE_PER_MINUTE: '2' }
    expect((await lookup(a.cookie, 'https://example.com/', small)).status).toBe(200)
    expect((await lookup(a.cookie, 'https://example.com/', small)).status).toBe(200)
    expect((await lookup(a.cookie, 'https://example.com/', small)).status).toBe(429)
    expect((await lookup(b.cookie, 'https://example.com/', small)).status).toBe(200)
    const junk: AppEnv = { DB: baseEnv.DB, FILES: baseEnv.FILES, LINK_TITLE_RATE_PER_MINUTE: 'abc' }
    for (let i = 0; i < 9; i++) expect((await lookup(b.cookie, 'https://example.com/', junk)).status).not.toBe(429)
  })
})

describe('outbound request', () => {
  it('carries only the fixed User-Agent and Accept; no cookies, auth or user headers; manual redirects', async () => {
    const seen = stubOutbound(() => page('<title>x</title>'))
    const { cookie } = await signIn()
    await call('/api/link-title', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', authorization: 'Bearer secret', 'user-agent': 'Evil/1', 'accept-language': 'fr', referer: 'http://example.com/app', ...CSRF_HEADERS },
      body: JSON.stringify({ url: ' https://example.com/r ' }),
    })
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe('https://example.com/r')
    expect(seen[0].init.method).toBe('GET')
    expect(seen[0].init.redirect).toBe('manual')
    expect(seen[0].init.body).toBeUndefined()
    const headers = new Headers(seen[0].init.headers)
    expect([...headers.keys()].sort()).toEqual(['accept', 'user-agent'])
    expect(headers.get('user-agent')).toBe('Mozilla/5.0 (compatible; FamilyRecipes-LinkTitle/1.0)')
    expect(headers.get('accept')).toContain('text/html')
    expect(JSON.stringify(seen[0])).not.toContain('secret')
    expect(JSON.stringify(seen[0])).not.toContain('session')
  })
})

describe('redirects', () => {
  const hop = (n: number) => `https://example.com/r${n}`
  it('follows 3, stops at the 4th, resolving relative Locations', async () => {
    const seen = stubOutbound((url) => {
      if (url === 'https://example.com/start') return redirect('/r1', 301)
      if (url === hop(1)) return redirect('r2', 307)
      if (url === hop(2)) return redirect('https://other.example.org/r3', 308)
      return page('<title>Landed</title>')
    })
    const { cookie } = await signIn()
    expect(await titleOf(await lookup(cookie, 'https://example.com/start'))).toBe('Landed')
    expect(seen.map((s) => s.url)).toEqual(['https://example.com/start', hop(1), hop(2), 'https://other.example.org/r3'])
  })

  it('a 4th redirect makes exactly 4 requests and returns empty', async () => {
    let n = 0
    const seen = stubOutbound(() => redirect(`https://example.com/loop${++n}`))
    const { cookie } = await signIn()
    const res = await lookup(cookie, 'https://example.com/loop0')
    expect(res.status).toBe(200)
    expect(await titleOf(res)).toBe('')
    expect(seen).toHaveLength(4)
  })

  it.each([
    ['file:', 'file:///etc/passwd'], ['javascript:', 'javascript:alert(1)'], ['private IP', 'http://10.0.0.5/admin'],
    ['metadata IP', 'http://169.254.169.254/latest/'], ['localhost', 'http://localhost:8787/'], ['credentials', 'https://a:b@evil.example.org/'],
    ['mapped IPv6', 'http://[::ffff:7f00:1]/'], ['non-default port', 'https://example.org:8443/'], ['dotless', 'http://intranet/'],
    ['empty Location', ''],
  ])('stops on a redirect to %s without a further request', async (_n, target) => {
    const seen = stubOutbound(() => redirect(target))
    const { cookie } = await signIn()
    const res = await lookup(cookie, 'https://example.com/')
    expect(res.status).toBe(200)
    expect(await titleOf(res)).toBe('')
    expect(seen).toHaveLength(1)
  })

  it('a redirect with no Location header stops', async () => {
    const seen = stubOutbound(() => new Response(null, { status: 302 }))
    const { cookie } = await signIn()
    expect(await titleOf(await lookup(cookie, 'https://example.com/'))).toBe('')
    expect(seen).toHaveLength(1)
  })
})

describe('title extraction', () => {
  const title = async (res: Response) => {
    stubOutbound(() => res)
    const { cookie } = await signIn()
    return titleOf(await lookup(cookie, 'https://example.com/'))
  }

  it('prefers og:title over <title>, accepts name= and attribute order', async () => {
    expect(await title(page('<title>Plain</title><meta property="og:title" content="Open Graph">'))).toBe('Open Graph')
    expect(await title(page('<meta content="Open Graph 2" property="og:title"><title>Plain</title>'))).toBe('Open Graph 2')
    expect(await title(page('<meta name="og:title" content="By name"><title>Plain</title>'))).toBe('By name')
  })

  it('falls back to <title>, and to empty when there is none or it is blank', async () => {
    expect(await title(page('<meta charset="utf-8"><title>  Just   the title </title>'))).toBe('Just the title')
    expect(await title(page('<meta charset="utf-8">'))).toBe('')
    expect(await title(page('<title>   </title>'))).toBe('')
    expect(await title(page('<meta property="og:title" content=""><title>Fallback</title>'))).toBe('Fallback')
  })

  it('uses a small JSON-LD Recipe name: below og:title, above <title>', async () => {
    const ld = (name: string) => `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Site"},{"@type":["Recipe"],"name":"${name}"}]}</script>`
    expect(await title(page(`<title>Plain</title>${ld('Recipe name')}`))).toBe('Recipe name')
    expect(await title(page(`${ld('Recipe name')}<title>Plain</title><meta property="og:title" content="OG">`))).toBe('OG')
    expect(await title(page(`<title>Plain</title><script type="application/ld+json">{"@type":"Article","name":"No"}</script>`))).toBe('Plain')
    expect(await title(page(`<title>Plain</title><script type="application/ld+json">{not json</script>`))).toBe('Plain')
    const big = `<script type="application/ld+json">{"@type":"Recipe","name":"Huge","x":"${'y'.repeat(9000)}"}</script>`
    expect(await title(page(`<title>Plain</title>${big}`))).toBe('Plain') // over 8 KB: skipped
  })

  it('returns empty for non-HTML content types and non-2xx statuses', async () => {
    expect(await title(html('<title>x</title>', 'application/pdf'))).toBe('')
    expect(await title(html('<title>x</title>', 'image/png'))).toBe('')
    expect(await title(html('{"title":"x"}', 'application/json'))).toBe('')
    expect(await title(new Response('<title>x</title>'))).toBe('') // text/plain default
    expect(await title(html('<title>x</title>', 'text/html', 404))).toBe('')
    expect(await title(html('<title>x</title>', 'text/html', 500))).toBe('')
    expect(await title(new Response(null, { status: 204, headers: { 'content-type': 'text/html' } }))).toBe('')
    expect(await title(html('<title>X</title>', 'application/xhtml+xml'))).toBe('X')
    expect(await title(html('<title>X</title>', 'TEXT/HTML;charset=UTF-8'))).toBe('X')
  })

  it('returns empty when the outbound fetch throws', async () => {
    stubOutbound(() => { throw new TypeError('network') })
    const { cookie } = await signIn()
    const res = await lookup(cookie, 'https://example.com/')
    expect(res.status).toBe(200)
    expect(await titleOf(res)).toBe('')
  })

  it('stops at </head>: a title in the body is ignored', async () => {
    expect(await title(html('<html><head></head><body><title>Late</title></body></html>'))).toBe('')
  })

  it('ignores a title that only appears after 64 KB', async () => {
    const filler = `<!-- ${'x'.repeat(70 * 1024)} -->`
    expect(await title(html(`<html><head>${filler}<title>Too late</title></head></html>`))).toBe('')
    expect(await title(html(`<html><head><title>Early</title>${filler}</head></html>`))).toBe('Early')
  })

  it('gives up on a head stuffed with hundreds of tags (CPU cap) but copes with a normal busy head', async () => {
    const meta = '<meta name="m" content="v">'
    expect(await title(page(`${meta.repeat(60)}<title>Busy but fine</title>`))).toBe('Busy but fine')
    expect(await title(page(`${meta.repeat(1500)}<title>Too many</title>`))).toBe('')
  })

  it('sanitises: tags stripped, entities decoded once, whitespace collapsed, capped', async () => {
    expect(await title(page('<title>Hot <script>alert(1)</script> &amp; spicy\n\n  chicken\t&#8211; &#x1F357; &eacute;&nbsp;&copy;</title>')))
      .toBe('Hot alert(1) & spicy chicken – 🍗 é ©')
    expect(await title(page('<meta property="og:title" content="&lt;b&gt;Bold&lt;/b&gt; &amp;amp; stuff">'))).not.toContain('<b>Bold</b> &amp;amp;')
    expect(await title(page(`<title>${'a'.repeat(300)}</title>`))).toBe('a'.repeat(100))
  })

  it('caps at 100 code points without splitting an emoji, and strips controls and bidi overrides', () => {
    const long = '🍝'.repeat(150)
    expect(Array.from(cleanTitle(long))).toHaveLength(100)
    expect(cleanTitle(long)).toBe('🍝'.repeat(100))
    expect(cleanTitle('a\u0000b\u0007c‮def⁦g​h﻿i\u0085j')).toBe('abcdefghij')
    expect(cleanTitle('a\r\n\t b')).toBe('a b')
  })

  it('trims a trailing " | Site" only, and never to empty', () => {
    expect(cleanTitle('Chicken tikka | BBC Good Food')).toBe('Chicken tikka')
    expect(cleanTitle('Chicken - the easy way')).toBe('Chicken - the easy way')
    expect(cleanTitle(' | BBC')).toBe('| BBC')
    expect(cleanTitle('A | ' + 'b'.repeat(60))).toBe('A | ' + 'b'.repeat(60))
  })

  it('entity decoder handles numeric edge cases and unknown names', () => {
    expect(decodeEntities('&#0;&#xD800;&#1114112;&bogus;&amp;lt;')).toBe('   &bogus;&lt;')
    expect(decodeEntities('&#65;&#x41;&AMP;')).toBe('AA&AMP;')
  })

  it('stripTags is linear and handles unterminated tags', () => {
    expect(cleanTitle('a <b>c</b> d')).toBe('a c d')
    expect(cleanTitle('before <unterminated')).toBe('before')
    expect(cleanTitle('<'.repeat(2000))).toBe('')
  })

  it('JSON-LD walker is bounded and tolerant', () => {
    expect(recipeNameFromJsonLd('[{"@type":"Recipe","name":"A"}]')).toBe('A')
    expect(recipeNameFromJsonLd('{"@type":"Recipe","name":5}')).toBeUndefined()
    expect(recipeNameFromJsonLd('null')).toBeUndefined()
    expect(recipeNameFromJsonLd(JSON.stringify(Array.from({ length: 500 }, () => ({ '@type': 'X' }))))).toBeUndefined()
  })
})

describe('streaming limits and the deadline', () => {
  it('cancels the body when it stops early (og:title found, or end of head)', async () => {
    for (const head of ['<meta property="og:title" content="Found">', '<title>T</title></head><body>']) {
      let cancelled = false
      let sent = 0
      const body = new ReadableStream<Uint8Array>({
        pull(c) {
          const text = sent === 0 ? `<html><head>${head}` : 'z'.repeat(8192)
          sent++
          c.enqueue(new TextEncoder().encode(text))
        },
        cancel() { cancelled = true },
      })
      const res = await lookupTitle('https://example.com/', async () => new Response(body, { headers: { 'content-type': 'text/html' } }))
      expect(res.outcome).toBe('ok')
      expect(cancelled).toBe(true)
      expect(sent).toBeLessThan(5)
    }
  })

  it('reads at most 64 KB of an endless head and cancels', async () => {
    let cancelled = false
    let bytes = 0
    const body = new ReadableStream<Uint8Array>({
      pull(c) { bytes += 8192; c.enqueue(new TextEncoder().encode('<!--'.padEnd(8192, 'x'))) },
      cancel() { cancelled = true },
    })
    const res = await lookupTitle('https://example.com/', async () => new Response(body, { headers: { 'content-type': 'text/html' } }))
    expect(res).toEqual({ title: '', outcome: 'empty' })
    expect(cancelled).toBe(true)
    expect(bytes).toBeLessThanOrEqual(64 * 1024 + 8192 * 2)
  })

  it('cancels the body on non-HTML and non-2xx responses', async () => {
    for (const [type, status] of [['application/pdf', 200], ['text/html', 404]] as const) {
      let cancelled = false
      const body = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(10)) }, cancel() { cancelled = true } })
      const res = await lookupTitle('https://example.com/', async () => new Response(body, { status, headers: { 'content-type': type } }))
      expect(res.title).toBe('')
      expect(cancelled).toBe(true)
    }
  })

  it('aborts at the deadline (fetch never answers) and returns empty', async () => {
    let aborted = false
    const res = await lookupTitle(
      'https://example.com/',
      (_u, init) => new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) })
      }),
      50,
    )
    expect(res).toEqual({ title: '', outcome: 'timeout' })
    expect(aborted).toBe(true)
  })

  it('aborts when the body stalls past the deadline', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('<html><head>')) },
      pull: () => new Promise(() => undefined),
    })
    const res = await Promise.race([
      lookupTitle('https://example.com/', async () => new Response(body, { headers: { 'content-type': 'text/html' } }), 50),
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 1500)),
    ])
    expect(res).toEqual({ title: '', outcome: 'timeout' })
  })

  it('shares one deadline across redirects', async () => {
    let calls = 0
    const res = await lookupTitle(
      'https://example.com/',
      async (_u, init) => {
        calls++
        await new Promise((r) => setTimeout(r, 30))
        if (init.signal?.aborted) throw new Error('aborted')
        return redirect(`https://example.com/${calls}`)
      },
      50,
    )
    expect(res.title).toBe('')
    expect(calls).toBeLessThan(4)
  })
})

describe('privacy', () => {
  it('does not log the URL or the title', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubOutbound(() => page('<title>Secret Soup Title</title>'))
    const { cookie } = await signIn()
    await lookup(cookie, 'https://example.com/very-secret-path?token=abc')
    const logged = JSON.stringify([...log.mock.calls, ...err.mock.calls])
    expect(logged).toContain('link-title')
    expect(logged).not.toContain('secret')
    expect(logged).not.toContain('Secret')
    expect(logged).not.toContain('example.com')
    log.mockRestore()
    err.mockRestore()
  })
})
