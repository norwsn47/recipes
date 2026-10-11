import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CSRF_HEADERS, baseEnv, call, resetDb, setupGoogleMock, signIn } from './helpers'
import type { AppEnv } from '../worker/http'

beforeAll(setupGoogleMock)
beforeEach(resetDb)

interface Recipe {
  id: string; title: string; timeTag: string; categories: string[]; addedBy: string; ownerId: string
  canEdit: boolean; createdAt: string; hasLink: boolean; hasNotes: boolean; hasFiles: boolean
  link?: string | null; notes?: string | null
}
const valid = { title: 'Pasta bake', timeTag: 'Around 1 hr', categories: ['Chicken'], notes: 'Bake it' }

const send = (cookie: string, method: string, path: string, body?: unknown, e: AppEnv = baseEnv) =>
  call(path, {
    method,
    headers: { cookie, 'content-type': 'application/json', ...(method === 'GET' ? {} : CSRF_HEADERS) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }, e)
const create = (cookie: string, body: unknown, e?: AppEnv) => send(cookie, 'POST', '/api/recipes', body, e)
const list = async (cookie: string, query = '') =>
  ((await (await send(cookie, 'GET', `/api/recipes${query}`)).json()) as { recipes: Recipe[] }).recipes
const makeRecipe = async (cookie: string, over: Record<string, unknown> = {}) =>
  ((await (await create(cookie, { ...valid, ...over })).json()) as { recipe: Recipe }).recipe
const rowCount = async (table: string) =>
  (await baseEnv.DB.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>())!.c
const withEnv = (extra: Partial<AppEnv>): AppEnv => ({ DB: baseEnv.DB, FILES: baseEnv.FILES, ...extra })

describe('auth and CSRF', () => {
  it('401 without a session on every recipe route, 403 on CSRF failure, nothing saved', async () => {
    const headers = CSRF_HEADERS
    for (const [method, path] of [
      ['GET', '/api/recipes'], ['POST', '/api/recipes'], ['GET', '/api/recipes/x'],
      ['PUT', '/api/recipes/x'], ['DELETE', '/api/recipes/x'],
    ]) {
      const res = await call(path, { method, headers: method === 'GET' ? {} : headers })
      expect(res.status).toBe(401)
    }
    const { cookie } = await signIn()
    const noHeader = await call('/api/recipes', {
      method: 'POST', headers: { cookie, origin: 'http://example.com' }, body: JSON.stringify(valid),
    })
    const foreign = await call('/api/recipes', {
      method: 'POST', headers: { cookie, origin: 'http://evil.test', 'x-requested-with': 'fetch' }, body: JSON.stringify(valid),
    })
    expect(noHeader.status).toBe(403)
    expect(foreign.status).toBe(403)
    expect(await rowCount('recipes')).toBe(0)
  })
})

describe('create and read', () => {
  it('creates, returns 201 with session identity, and appears in list and detail', async () => {
    const { cookie, userId } = await signIn()
    const res = await create(cookie, { ...valid, link: ' https://example.com/r ', categories: ['Fish', 'Chicken'] })
    expect(res.status).toBe(201)
    const { recipe } = (await res.json()) as { recipe: Recipe }
    expect(recipe).toMatchObject({
      title: 'Pasta bake', timeTag: 'Around 1 hr', categories: ['Chicken', 'Fish'], addedBy: 'Cook One',
      ownerId: userId, canEdit: true, hasLink: true, hasNotes: true, hasFiles: false,
      link: 'https://example.com/r', notes: 'Bake it',
    })
    const detail = (await (await send(cookie, 'GET', `/api/recipes/${recipe.id}`)).json()) as { recipe: Recipe }
    expect(detail.recipe.id).toBe(recipe.id)
    expect((await list(cookie)).map((r) => r.id)).toEqual([recipe.id])
  })

  it('lists newest first and sets canEdit per viewer', async () => {
    const a = await signIn({ sub: 'a', name: 'Ann' })
    const b = await signIn({ sub: 'b', name: 'Bob', email: 'b@example.com' })
    const first = await makeRecipe(a.cookie, { title: 'First' })
    await new Promise((r) => setTimeout(r, 3))
    const second = await makeRecipe(b.cookie, { title: 'Second' })
    const asA = await list(a.cookie)
    expect(asA.map((r) => r.id)).toEqual([second.id, first.id])
    expect(asA.map((r) => r.canEdit)).toEqual([false, true])
    expect(asA[0].addedBy).toBe('Bob')
  })

  it('ignores a spoofed added-by, user id and created date', async () => {
    const { cookie, userId } = await signIn()
    const res = await create(cookie, {
      ...valid, addedBy: 'Mallory', user_id: 'x', userId: 'x', ownerId: 'x', id: 'mine', createdAt: '2001-01-01',
    })
    const { recipe } = (await res.json()) as { recipe: Recipe }
    expect(recipe.addedBy).toBe('Cook One')
    expect(recipe.ownerId).toBe(userId)
    expect(recipe.id).not.toBe('mine')
    expect(new Date(recipe.createdAt).getFullYear()).toBeGreaterThan(2020)
  })

  it('404 for a missing or malformed id', async () => {
    const { cookie } = await signIn()
    expect((await send(cookie, 'GET', '/api/recipes/nope')).status).toBe(404)
    expect((await send(cookie, 'GET', '/api/recipes/a%2Fb')).status).toBe(404)
  })
})

describe('validation', () => {
  const rejects = async (over: Record<string, unknown>, field: string) => {
    const { cookie } = await signIn()
    const res = await create(cookie, { ...valid, ...over })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; message: string; fields: Record<string, string> } }
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.fields[field]).toBeTruthy()
    expect(await rowCount('recipes')).toBe(0)
    expect(await rowCount('recipe_categories')).toBe(0)
  }

  it('title: required, trimmed, max 100', async () => {
    await rejects({ title: undefined }, 'title')
    await rejects({ title: '   ' }, 'title')
    await rejects({ title: 5 }, 'title')
    await rejects({ title: 'x'.repeat(101) }, 'title')
  })
  it('accepts a 100 character title and trims it', async () => {
    const { cookie } = await signIn()
    expect((await makeRecipe(cookie, { title: `  ${'x'.repeat(100)}  ` })).title).toHaveLength(100)
  })
  it('time tag: exactly one of the three', async () => {
    await rejects({ timeTag: undefined }, 'timeTag')
    await rejects({ timeTag: 'Quick' }, 'timeTag')
    await rejects({ timeTag: ['Around 1 hr'] }, 'timeTag')
    await rejects({ timeTag: 'around 1 hr' }, 'timeTag')
  })
  it('categories: non-empty array from the fixed list, case-exact', async () => {
    await rejects({ categories: undefined }, 'categories')
    await rejects({ categories: [] }, 'categories')
    await rejects({ categories: 'Chicken' }, 'categories')
    await rejects({ categories: ['Vegan'] }, 'categories')
    await rejects({ categories: ['chicken'] }, 'categories')
    await rejects({ categories: [''] }, 'categories')
    await rejects({ categories: ['Chicken', 7] }, 'categories')
  })
  it('categories: duplicates collapse', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie, { categories: ['Fish', 'Fish', 'Beef'] })
    expect(r.categories).toEqual(['Fish', 'Beef'])
    expect(await rowCount('recipe_categories')).toBe(2)
  })
  it('link: http(s) only, max 2000', async () => {
    await rejects({ link: 'javascript:alert(1)' }, 'link')
    await rejects({ link: 'ftp://example.com/x' }, 'link')
    await rejects({ link: 'data:text/html,hi' }, 'link')
    await rejects({ link: 'not a url' }, 'link')
    await rejects({ link: 12 }, 'link')
    await rejects({ link: `https://example.com/${'a'.repeat(2000)}` }, 'link')
  })
  it('link: accepts http, https and exactly 2000 characters', async () => {
    const { cookie } = await signIn()
    await makeRecipe(cookie, { link: 'http://example.com' })
    const long = `https://example.com/${'a'.repeat(2000 - 20)}`
    expect(long).toHaveLength(2000)
    expect((await create(cookie, { ...valid, link: long })).status).toBe(201)
  })
  it('notes: max 2000, text only', async () => {
    await rejects({ notes: 'n'.repeat(2001) }, 'notes')
    await rejects({ notes: { a: 1 } }, 'notes')
    const { cookie } = await signIn()
    expect((await create(cookie, { ...valid, notes: 'n'.repeat(2000) })).status).toBe(201)
  })
  it('notes are stored as text, not interpreted', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie, { notes: '<script>alert(1)</script>' })
    expect(r.notes).toBe('<script>alert(1)</script>')
  })
  it('content rule: needs a link or notes (blank counts as missing)', async () => {
    await rejects({ notes: undefined, link: undefined }, 'content')
    await rejects({ notes: '  ', link: '' }, 'content')
    await rejects({ notes: null, link: null }, 'content')
    const { cookie } = await signIn()
    expect((await create(cookie, { ...valid, notes: undefined, link: 'https://example.com' })).status).toBe(201)
  })
  it('bad JSON is 400, non-object is 400, oversized is 413', async () => {
    const { cookie } = await signIn()
    expect((await create(cookie, '{nope')).status).toBe(400)
    expect((await create(cookie, '[1]')).status).toBe(400)
    expect((await create(cookie, 'null')).status).toBe(400)
    expect((await create(cookie, JSON.stringify({ ...valid, notes: 'x'.repeat(20000) }))).status).toBe(413)
    expect(await rowCount('recipes')).toBe(0)
  })
})

describe('edit and delete', () => {
  it('owner can replace every field including categories', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie, { categories: ['Chicken', 'Fish'] })
    const res = await send(cookie, 'PUT', `/api/recipes/${r.id}`, {
      title: 'New', timeTag: 'Extensive prep', categories: ['Dessert'], link: 'https://example.com', notes: '',
    })
    expect(res.status).toBe(200)
    const { recipe } = (await res.json()) as { recipe: Recipe }
    expect(recipe).toMatchObject({
      title: 'New', timeTag: 'Extensive prep', categories: ['Dessert'], hasLink: true, hasNotes: false, createdAt: r.createdAt,
    })
    expect(await rowCount('recipe_categories')).toBe(1)
  })

  it('failed edit leaves the recipe unchanged; cannot remove the last category', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    const res = await send(cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, title: 'Changed', categories: [] })
    expect(res.status).toBe(400)
    const after = (await (await send(cookie, 'GET', `/api/recipes/${r.id}`)).json()) as { recipe: Recipe }
    expect(after.recipe).toMatchObject({ title: 'Pasta bake', categories: ['Chicken'] })
  })

  it('edit cannot change the owner', async () => {
    const a = await signIn({ sub: 'a' })
    const r = await makeRecipe(a.cookie)
    const res = await send(a.cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, ownerId: 'x', user_id: 'x', addedBy: 'x' })
    expect(((await res.json()) as { recipe: Recipe }).recipe.ownerId).toBe(a.userId)
  })

  it('non-owner gets 403 on edit and delete and nothing changes; missing is 404', async () => {
    const a = await signIn({ sub: 'a', name: 'Ann' })
    const b = await signIn({ sub: 'b', email: 'b@example.com', name: 'Bob' })
    const r = await makeRecipe(a.cookie)
    const put = await send(b.cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, title: 'Hacked' })
    const del = await send(b.cookie, 'DELETE', `/api/recipes/${r.id}`)
    expect(put.status).toBe(403)
    expect(del.status).toBe(403)
    expect(((await put.json()) as { error: { code: string } }).error.code).toBe('forbidden')
    expect((await list(a.cookie))[0].title).toBe('Pasta bake')
    expect((await send(b.cookie, 'PUT', '/api/recipes/missing', valid)).status).toBe(404)
    expect((await send(b.cookie, 'DELETE', '/api/recipes/missing')).status).toBe(404)
  })

  it('delete removes the recipe and its category rows; detail is then 404', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie, { categories: ['Fish', 'Beef'] })
    expect((await send(cookie, 'DELETE', `/api/recipes/${r.id}`)).status).toBe(200)
    expect((await send(cookie, 'GET', `/api/recipes/${r.id}`)).status).toBe(404)
    expect(await rowCount('recipe_categories')).toBe(0)
  })
})

describe('filter and search', () => {
  let cookie: string
  beforeEach(async () => {
    cookie = (await signIn()).cookie
    const seed: [string, string, string[]][] = [
      ['Chicken Pasta', 'Around 1 hr', ['Chicken']],
      ['Fish Pie', 'Extensive prep', ['Fish']],
      ['Quick PASTA salad', 'Less than 30 mins', ['Chicken', 'Other']],
      ['Pancakes', 'Less than 30 mins', ['Breakfast', 'Baking']],
      ['100% beef_stew', 'Extensive prep', ['Beef']],
    ]
    for (const [title, timeTag, categories] of seed) await makeRecipe(cookie, { title, timeTag, categories })
  })
  const titles = async (q: string) => (await list(cookie, q)).map((r) => r.title).sort()

  it('no filters returns everything', async () => expect(await titles('')).toHaveLength(5))
  it('time tag', async () => expect(await titles('?time=Less%20than%2030%20mins')).toEqual(['Pancakes', 'Quick PASTA salad']))
  it('single category', async () => expect(await titles('?categories=Chicken')).toEqual(['Chicken Pasta', 'Quick PASTA salad']))
  it('multiple categories are any-of (comma and repeated)', async () => {
    expect(await titles('?categories=Chicken,Fish')).toEqual(['Chicken Pasta', 'Fish Pie', 'Quick PASTA salad'])
    expect(await titles('?categories=Chicken&categories=Fish')).toHaveLength(3)
  })
  it('a recipe with several matching categories is listed once', async () =>
    expect(await titles('?categories=Chicken,Other')).toEqual(['Chicken Pasta', 'Quick PASTA salad']))
  it('search is case-insensitive substring of the title', async () => {
    expect(await titles('?q=pasta')).toEqual(['Chicken Pasta', 'Quick PASTA salad'])
    expect(await titles('?q=ASTA%20SAL')).toEqual(['Quick PASTA salad'])
  })
  it('ANDs time, category and search', async () => {
    expect(await titles('?time=Less%20than%2030%20mins&categories=Chicken&q=pasta')).toEqual(['Quick PASTA salad'])
    expect(await titles('?time=Around%201%20hr&categories=Fish')).toEqual([])
  })
  it('empty result is an empty list', async () => expect(await titles('?q=zzz')).toEqual([]))
  it('LIKE wildcards in q are literal characters', async () => {
    expect(await titles('?q=%25')).toEqual(['100% beef_stew'])
    expect(await titles('?q=_')).toEqual(['100% beef_stew'])
    expect(await titles('?q=p%25a')).toEqual([])
    expect(await titles('?q=%5C')).toEqual([])
  })
  it('rejects unknown filter values', async () => {
    expect((await send(cookie, 'GET', '/api/recipes?time=Fast')).status).toBe(400)
    expect((await send(cookie, 'GET', '/api/recipes?categories=Vegan')).status).toBe(400)
  })
  it('filters list is not affected by SQL in q', async () => expect(await titles("?q=' OR 1=1 --")).toEqual([]))
})

describe('per-user recipe cap', () => {
  it('refuses the 51st recipe with the exact message; edit still works; delete frees a slot', async () => {
    const { cookie } = await signIn()
    const a = await signIn({ sub: 'other', email: 'o@example.com' })
    const now = Date.now()
    const userId = (await baseEnv.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind('google-sub-1').first<{ id: string }>())!.id
    // Seed 50 directly (the rate limit would otherwise get in the way).
    await baseEnv.DB.batch(Array.from({ length: 50 }, (_, i) =>
      baseEnv.DB.prepare(
        "INSERT INTO recipes (id, user_id, title, time_tag, notes, created_at, updated_at) VALUES (?, ?, ?, 'Around 1 hr', 'n', ?, ?)",
      ).bind(`seed-${i}`, userId, `Seed ${i}`, now + i, now + i)))
    const res = await create(cookie, valid)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: { code: 'recipe_limit_reached', message: 'You have reached the limit of 50 recipes. Delete one to add another.' },
    })
    expect(await rowCount('recipes')).toBe(50)
    expect(await rowCount('recipe_categories')).toBe(0)
    // Another user is not affected.
    expect((await create(a.cookie, valid)).status).toBe(201)
    // Editing still works at the cap.
    await baseEnv.DB.prepare("INSERT INTO recipe_categories (recipe_id, category) VALUES ('seed-0', 'Fish')").run()
    expect((await send(cookie, 'PUT', '/api/recipes/seed-0', { ...valid, title: 'Edited' })).status).toBe(200)
    // Deleting frees the slot.
    expect((await send(cookie, 'DELETE', '/api/recipes/seed-1')).status).toBe(200)
    expect((await create(cookie, valid)).status).toBe(201)
  })

  it('honours MAX_USER_RECIPES and puts the number in the message; junk falls back to 50', async () => {
    const { cookie } = await signIn()
    const env3 = withEnv({ MAX_USER_RECIPES: '2' })
    expect((await create(cookie, valid, env3)).status).toBe(201)
    expect((await create(cookie, valid, env3)).status).toBe(201)
    const res = await create(cookie, valid, env3)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      'You have reached the limit of 2 recipes. Delete one to add another.',
    )
    expect((await create(cookie, valid, withEnv({ MAX_USER_RECIPES: 'abc' }))).status).toBe(201)
  })
})

describe('write rate limit', () => {
  const TOO_FAST = 'You are doing that too fast. Wait a minute and try again.'

  it('allows 20 writes a minute then 429s, without writing; reads are not limited', async () => {
    const { cookie } = await signIn()
    for (let i = 0; i < 20; i++) expect((await create(cookie, valid)).status).toBe(201)
    const res = await create(cookie, valid)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(await res.json()).toEqual({ error: { code: 'rate_limited', message: TOO_FAST } })
    expect(await rowCount('recipes')).toBe(20)
    const row = await baseEnv.DB.prepare('SELECT count FROM write_rate_limits').first<{ count: number }>()
    for (let i = 0; i < 5; i++) await create(cookie, valid)
    expect((await baseEnv.DB.prepare('SELECT count FROM write_rate_limits').first<{ count: number }>())!.count).toBe(row!.count)
    expect((await send(cookie, 'GET', '/api/recipes')).status).toBe(200)
  })

  it('applies to edit and delete, is per user, and resets after the window', async () => {
    const a = await signIn({ sub: 'a' })
    const b = await signIn({ sub: 'b', email: 'b@example.com' })
    const small = withEnv({ WRITE_RATE_PER_MINUTE: '3' })
    const r = await makeRecipe(a.cookie) // write 1 of the window; the next two use the limit of 3
    expect((await send(a.cookie, 'PUT', `/api/recipes/${r.id}`, valid, small)).status).toBe(200)
    expect((await send(a.cookie, 'PUT', `/api/recipes/${r.id}`, valid, small)).status).toBe(200)
    expect((await send(a.cookie, 'PUT', `/api/recipes/${r.id}`, valid, small)).status).toBe(429)
    expect((await send(a.cookie, 'DELETE', `/api/recipes/${r.id}`, undefined, small)).status).toBe(429)
    expect((await create(b.cookie, valid, small)).status).toBe(201)
    await baseEnv.DB.prepare('UPDATE write_rate_limits SET window_start = window_start - 61000').run()
    expect((await send(a.cookie, 'DELETE', `/api/recipes/${r.id}`, undefined, small)).status).toBe(200)
  })
})
