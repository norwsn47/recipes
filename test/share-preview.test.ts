import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TIME_LABELS } from '../src/lib/recipes'
import { SHARE_TIME_LABELS, escapeHtml } from '../worker/share-preview'
import { CSRF_HEADERS, baseEnv, call, resetDb, setupGoogleMock, signIn } from './helpers'

beforeAll(setupGoogleMock)
beforeEach(resetDb)

const ID = '11111111-2222-4333-8444-555555555555'
const OTHER_ID = '99999999-8888-4777-8666-444444444444'
const NASTY = `"><script>alert(1)</script>' & <b>`

async function seed(title = 'Pasta bake', timeTag = 'Less than 30 mins', cats = ['Chicken', 'Breakfast']) {
  const db = baseEnv.DB
  await db.batch([
    db.prepare(`INSERT INTO users (id, google_sub, email, name, created_at, updated_at) VALUES ('owner-user-id-xyz', 'sub-secret', 'secret.owner@example.org', 'Zebediah Ownerman', 1, 1)`),
    db.prepare(`INSERT INTO recipes (id, user_id, title, time_tag, link, notes, created_at, updated_at) VALUES (?, 'owner-user-id-xyz', ?, ?, 'https://secret-link.example/path', 'SECRET NOTES TEXT', 1, 1)`).bind(ID, title, timeTag),
    db.prepare(`INSERT INTO recipes (id, user_id, title, time_tag, created_at, updated_at, notes) VALUES (?, 'owner-user-id-xyz', 'Other recipe title', 'Around 1 hr', 2, 2, 'x')`).bind(OTHER_ID),
    db.prepare(`INSERT INTO recipe_files (id, recipe_id, user_id, r2_key, original_name, content_type, size, created_at) VALUES ('file-id-abc', ?, 'owner-user-id-xyz', 'r2/secret-key', 'secret-file-name.pdf', 'application/pdf', 10, 1)`).bind(ID),
    ...cats.map((c) => db.prepare('INSERT INTO recipe_categories (recipe_id, category) VALUES (?, ?)').bind(ID, c)),
  ])
}

const headerText = (res: Response) => [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\n')

function expectShareHeaders(res: Response) {
  expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(res.headers.get('content-security-policy')).toBe(
    "default-src 'none'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  )
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  expect(res.headers.get('x-frame-options')).toBe('DENY')
  expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
  expect(res.headers.get('cache-control')).toBe('public, max-age=300')
}

function expectGeneric(body: string) {
  expect(body).toContain('<title>Family Recipes</title>')
  expect(body).toContain('<meta property="og:title" content="Family Recipes">')
  expect(body).toContain('<meta property="og:description" content="Family Recipes">')
  expect(body).toContain('<meta property="og:url" content="http://example.com/">')
  expect(body).toContain('<meta http-equiv="refresh" content="0;url=/">')
}

describe('GET /r/:id for a real recipe, signed out', () => {
  it('returns the preview tags and the redirect', async () => {
    await seed()
    const res = await call(`/r/${ID}`)
    expect(res.status).toBe(200)
    expectShareHeaders(res)
    const body = await res.text()
    expect(body).toContain('<title>Pasta bake</title>')
    expect(body).toContain('<meta property="og:title" content="Pasta bake">')
    expect(body).toContain('<meta property="og:description" content="Breakfast, Chicken · &lt; 30 mins · Family Recipes">')
    expect(body).toContain(`<meta property="og:url" content="http://example.com/r/${ID}">`)
    expect(body).toContain('<meta property="og:image" content="http://example.com/og-image.png">')
    expect(body).toContain('<meta property="og:image:width" content="1200">')
    expect(body).toContain('<meta property="og:image:height" content="630">')
    expect(body).toContain('<meta property="og:type" content="website">')
    expect(body).toContain('<meta property="og:site_name" content="Family Recipes">')
    expect(body).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(body).toContain(`<meta http-equiv="refresh" content="0;url=/recipes/${ID}">`)
    expect(body).toContain(`<a href="/recipes/${ID}">`)
  })

  it('uses the short label for each time tag', async () => {
    for (const [tag, label] of [['Around 1 hr', '1 hr'], ['Extensive prep', '1 hr +']]) {
      await resetDb()
      await seed('T', tag, ['Fish'])
      expect(await (await call(`/r/${ID}`)).text()).toContain(`content="Fish · ${label} · Family Recipes"`)
    }
  })

  it('builds absolute URLs from the request origin only', async () => {
    await seed()
    const res = await call(`/r/${ID}`, { headers: { host: 'evil.test', 'x-forwarded-host': 'evil.test' } })
    const body = await res.text()
    expect(body).not.toContain('evil.test')
    expect(body).toContain('http://example.com/og-image.png')
  })

  it('has no script, inline style, handlers or external resources', async () => {
    await seed()
    const body = await (await call(`/r/${ID}`)).text()
    expect(body.toLowerCase()).not.toContain('<script')
    expect(body.toLowerCase()).not.toContain('<style')
    expect(body).not.toMatch(/\sstyle=/i)
    expect(body).not.toMatch(/\son[a-z]+=/i)
    expect(body).not.toMatch(/<(link|img|iframe|object|embed)\b/i)
  })
})

describe('escaping', () => {
  it('escapes a hostile title everywhere', async () => {
    await seed(NASTY)
    const body = await (await call(`/r/${ID}`)).text()
    expect(body).not.toContain(NASTY)
    expect(body).not.toContain('<script')
    expect(body).not.toContain('<b>')
    const esc = '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&#39; &amp; &lt;b&gt;'
    expect(body).toContain(`<title>${esc}</title>`)
    expect(body).toContain(`<meta property="og:title" content="${esc}">`)
    expect(body).toContain(`>Open ${esc}</a>`)
  })

  it('escapeHtml covers & < > " and \'', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('no leakage', () => {
  it('shows nothing beyond title, time label and categories', async () => {
    await seed()
    const res = await call(`/r/${ID}`)
    const all = `${await res.text()}\n${headerText(res)}`
    for (const secret of [
      'SECRET NOTES TEXT', 'secret-link.example', 'secret-file-name', 'file-id-abc', 'r2/secret-key',
      'Zebediah', 'Ownerman', 'secret.owner@example.org', 'owner-user-id-xyz', 'sub-secret',
      OTHER_ID, 'Other recipe title',
    ]) expect(all).not.toContain(secret)
  })
})

describe('unknown and malformed ids', () => {
  const bad = [
    '99999999-0000-4000-8000-000000000000', // well formed, not found
    'a'.repeat(65), // too long
    'abc%2Fdef', // encoded slash
    '..%2F..%2Fapi', '%3Cscript%3E', 'a/b', 'a.b', 'a_b', '%00', '%E2%80%A6',
  ]
  for (const id of bad) {
    it(`gives the generic page for ${id.slice(0, 20)}`, async () => {
      await seed()
      const res = await call(`/r/${id}`)
      expect(res.status).toBe(200)
      expectShareHeaders(res)
      const body = await res.text()
      expectGeneric(body)
      expect(body).not.toContain('Pasta bake')
      expect(body).not.toContain(id)
    })
  }
  it('treats a raw < in the path as malformed', async () => {
    const res = await call('/r/<x>')
    expectGeneric(await res.text())
  })
  it('handles /r and /r/', async () => {
    for (const path of ['/r', '/r/']) {
      const res = await call(path)
      expect(res.status).toBe(200)
      expectGeneric(await res.text())
    }
  })
  it('a recipe id with a trailing slash is generic', async () => {
    await seed()
    expectGeneric(await (await call(`/r/${ID}/`)).text())
  })
})

describe('methods', () => {
  it('HEAD matches GET headers with an empty body', async () => {
    await seed()
    const get = await call(`/r/${ID}`)
    const head = await call(`/r/${ID}`, { method: 'HEAD' })
    expect(head.status).toBe(get.status)
    expect(headerText(head)).toBe(headerText(get))
    expect(await head.text()).toBe('')
  })
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    it(`${method} is 405 with Allow, even with CSRF headers`, async () => {
      await seed()
      for (const headers of [{}, CSRF_HEADERS]) {
        const res = await call(`/r/${ID}`, { method, headers })
        expect(res.status).toBe(405)
        expect(res.headers.get('allow')).toBe('GET, HEAD')
      }
    })
  }
  it('405 on /r too, and nothing is changed', async () => {
    await seed()
    expect((await call('/r', { method: 'POST' })).status).toBe(405)
    const row = await baseEnv.DB.prepare('SELECT COUNT(*) AS c FROM recipes').first<{ c: number }>()
    expect(row!.c).toBe(2)
  })
})

describe('the rest of the app is still protected', () => {
  it('unauthenticated recipe API calls are still 401', async () => {
    await seed()
    expect((await call('/api/recipes')).status).toBe(401)
    expect((await call(`/api/recipes/${ID}`)).status).toBe(401)
    expect((await call(`/api/recipes/${ID}/files/file-id-abc`)).status).toBe(401)
  })
  it('mutating /api requests without CSRF headers are still 403', async () => {
    const { cookie } = await signIn()
    const res = await call('/api/recipes', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(403)
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
  })
  it('paths like /recipes/:id and /rx are not the share route', async () => {
    expect((await call(`/recipes/${ID}`)).status).toBe(404)
    expect((await call('/rx')).status).toBe(404)
  })
})

describe('time labels', () => {
  it('worker labels match src/lib/recipes.ts', () => {
    expect(SHARE_TIME_LABELS).toEqual(TIME_LABELS)
  })
})
