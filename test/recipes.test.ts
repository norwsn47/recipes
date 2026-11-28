import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CSRF_HEADERS, baseEnv, call, resetDb, setupGoogleMock, signIn } from './helpers'
import type { AppEnv } from '../worker/http'
import { MAX_NOTES, MAX_NOTES_RAW, isHtmlNotes, notesVisibleLength, notesVisibleText, validateRecipeInput } from '../worker/recipe-validation'

beforeAll(setupGoogleMock)
beforeEach(resetDb)

interface Recipe {
  id: string; title: string; timeTag: string; meals: string[]; foodTypes: string[]; addedBy: string
  canEdit: boolean; createdAt: string; hasFiles: boolean
  link?: string | null; notes?: string | null
}
const valid = { title: 'Pasta bake', timeTag: 'Around 1 hr', meals: ['Dinner'], foodTypes: ['Chicken'], notes: 'Bake it' }

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
    const { cookie, userId } = await signIn({ name: 'Cook One Smith' })
    const res = await create(cookie, { ...valid, link: ' https://example.com/r ', meals: ['Dinner', 'Breakfast'], foodTypes: ['Fish', 'Chicken'] })
    expect(res.status).toBe(201)
    const { recipe } = (await res.json()) as { recipe: Recipe }
    expect(recipe).toMatchObject({
      title: 'Pasta bake', timeTag: 'Around 1 hr', meals: ['Breakfast', 'Dinner'], foodTypes: ['Chicken', 'Fish'], addedBy: 'Cook',
      canEdit: true, hasFiles: false,
      link: 'https://example.com/r', notes: 'Bake it',
    })
    // Privacy: first name only, no owner id, no full name, no unused flags anywhere in the response.
    const raw = JSON.stringify(recipe)
    expect(raw).not.toContain('ownerId')
    expect(raw).not.toContain(userId)
    expect(raw).not.toContain('Smith')
    for (const k of ['ownerId', 'hasLink', 'hasNotes', 'updatedAt']) expect(recipe).not.toHaveProperty(k)
    const detail = (await (await send(cookie, 'GET', `/api/recipes/${recipe.id}`)).json()) as { recipe: Recipe }
    expect(detail.recipe.id).toBe(recipe.id)
    expect((await list(cookie)).map((r) => r.id)).toEqual([recipe.id])
  })

  it('lists newest first and sets canEdit per viewer', async () => {
    const a = await signIn({ sub: 'a', name: 'Ann' })
    const b = await signIn({ sub: 'b', name: 'Bob Builder', email: 'b@example.com' })
    const first = await makeRecipe(a.cookie, { title: 'First' })
    await new Promise((r) => setTimeout(r, 3))
    const second = await makeRecipe(b.cookie, { title: 'Second' })
    const asA = await list(a.cookie)
    expect(asA.map((r) => r.id)).toEqual([second.id, first.id])
    expect(asA.map((r) => r.canEdit)).toEqual([false, true])
    expect(asA[0].addedBy).toBe('Bob')
    expect(JSON.stringify(asA)).not.toContain('Builder')
    expect(JSON.stringify(asA)).not.toContain('ownerId')
    expect(JSON.stringify(asA)).not.toContain(b.userId)
  })

  it('list summary carries the link, or null when there is none', async () => {
    const { cookie } = await signIn()
    const withLink = await makeRecipe(cookie, { title: 'Linked', link: ' https://example.com/r ' })
    await new Promise((r) => setTimeout(r, 3))
    const without = await makeRecipe(cookie, { title: 'Plain' })
    const rows = await list(cookie)
    expect(rows.find((r) => r.id === withLink.id)).toMatchObject({ link: 'https://example.com/r' })
    expect(rows.find((r) => r.id === without.id)).toMatchObject({ link: null })
  })

  it('ignores a spoofed added-by, user id and created date', async () => {
    const { cookie } = await signIn()
    const res = await create(cookie, {
      ...valid, addedBy: 'Mallory', user_id: 'x', userId: 'x', ownerId: 'x', id: 'mine', createdAt: '2001-01-01',
    })
    const { recipe } = (await res.json()) as { recipe: Recipe }
    expect(recipe.addedBy).toBe('Cook')
    expect(recipe).not.toHaveProperty('ownerId')
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
    expect(await rowCount('recipe_meals')).toBe(0)
    expect(await rowCount('recipe_food_types')).toBe(0)
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
  it('meals: required, non-empty array from the fixed list, case-exact, no duplicates', async () => {
    await rejects({ meals: undefined }, 'meals')
    await rejects({ meals: [] }, 'meals')
    await rejects({ meals: 'Dinner' }, 'meals')
    await rejects({ meals: ['Supper'] }, 'meals')
    await rejects({ meals: ['dinner'] }, 'meals')
    await rejects({ meals: ['Chicken'] }, 'meals')
    await rejects({ meals: [''] }, 'meals')
    await rejects({ meals: ['Dinner', 7] }, 'meals')
    await rejects({ meals: ['Dinner', 'Dinner'] }, 'meals')
  })
  it('food types: optional, known values only, no duplicates', async () => {
    await rejects({ foodTypes: 'Fish' }, 'foodTypes')
    await rejects({ foodTypes: ['Other'] }, 'foodTypes')
    await rejects({ foodTypes: ['fish'] }, 'foodTypes')
    await rejects({ foodTypes: ['Fish', 3] }, 'foodTypes')
    await rejects({ foodTypes: ['Fish', 'Fish'] }, 'foodTypes')
    const { cookie } = await signIn()
    expect((await makeRecipe(cookie, { foodTypes: undefined })).foodTypes).toEqual([])
    expect((await makeRecipe(cookie, { foodTypes: [] })).foodTypes).toEqual([])
    expect((await makeRecipe(cookie, { foodTypes: ['Vegetarian', 'Lamb'] })).foodTypes).toEqual(['Lamb', 'Vegetarian'])
  })
  it('the old categories field is rejected, not ignored', async () => {
    await rejects({ categories: ['Chicken'] }, 'categories')
    await rejects({ categories: [] }, 'categories')
  })
  it('meals and food types come back in list order whatever order was sent', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie, { meals: ['Baking', 'Lunch', 'Breakfast'], foodTypes: ['Lamb', 'Chicken'] })
    expect(r.meals).toEqual(['Breakfast', 'Lunch', 'Baking'])
    expect(r.foodTypes).toEqual(['Chicken', 'Lamb'])
    expect(await rowCount('recipe_meals')).toBe(3)
    expect(await rowCount('recipe_food_types')).toBe(2)
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
    expect((await create(cookie, JSON.stringify({ ...valid, notes: 'x'.repeat(70000) }))).status).toBe(413)
    expect(await rowCount('recipes')).toBe(0)
  })
})

describe('edit and delete', () => {
  it('owner can replace every field including meals and food types', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie, { meals: ['Dinner', 'Lunch'], foodTypes: ['Chicken', 'Fish'] })
    const res = await send(cookie, 'PUT', `/api/recipes/${r.id}`, {
      title: 'New', timeTag: 'Extensive prep', meals: ['Dessert'], foodTypes: [], link: 'https://example.com', notes: '',
    })
    expect(res.status).toBe(200)
    const { recipe } = (await res.json()) as { recipe: Recipe }
    expect(recipe).toMatchObject({
      title: 'New', timeTag: 'Extensive prep', meals: ['Dessert'], foodTypes: [], link: 'https://example.com', notes: null, createdAt: r.createdAt,
    })
    expect(await rowCount('recipe_meals')).toBe(1)
    expect(await rowCount('recipe_food_types')).toBe(0)
  })

  it('failed edit leaves the recipe unchanged; cannot remove the last meal', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    const res = await send(cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, title: 'Changed', meals: [] })
    expect(res.status).toBe(400)
    const after = (await (await send(cookie, 'GET', `/api/recipes/${r.id}`)).json()) as { recipe: Recipe }
    expect(after.recipe).toMatchObject({ title: 'Pasta bake', meals: ['Dinner'], foodTypes: ['Chicken'] })
  })

  it('edit cannot change the owner', async () => {
    const a = await signIn({ sub: 'a' })
    const r = await makeRecipe(a.cookie)
    const res = await send(a.cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, ownerId: 'x', user_id: 'x', addedBy: 'x' })
    const { recipe } = (await res.json()) as { recipe: Recipe }
    expect(recipe.canEdit).toBe(true)
    expect(recipe.addedBy).toBe('Cook')
    expect((await send(a.cookie, 'GET', `/api/recipes/${r.id}`).then((x) => x.json()) as { recipe: Recipe }).recipe).toMatchObject({ canEdit: true })
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

  it('delete removes the recipe and its tag rows; detail is then 404', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie, { meals: ['Dinner', 'Lunch'], foodTypes: ['Fish', 'Beef'] })
    expect((await send(cookie, 'DELETE', `/api/recipes/${r.id}`)).status).toBe(200)
    expect((await send(cookie, 'GET', `/api/recipes/${r.id}`)).status).toBe(404)
    expect(await rowCount('recipe_meals')).toBe(0)
    expect(await rowCount('recipe_food_types')).toBe(0)
  })
})

describe('filter and search', () => {
  let cookie: string
  beforeEach(async () => {
    cookie = (await signIn()).cookie
    const seed: [string, string, string[], string[]][] = [
      ['Chicken Pasta', 'Around 1 hr', ['Dinner'], ['Chicken']],
      ['Fish Pie', 'Extensive prep', ['Dinner', 'Lunch'], ['Fish']],
      ['Quick PASTA salad', 'Less than 30 mins', ['Lunch'], ['Chicken', 'Vegetarian']],
      ['Pancakes', 'Less than 30 mins', ['Breakfast', 'Baking'], []],
      ['100% beef_stew', 'Extensive prep', ['Dinner'], ['Beef']],
    ]
    for (const [title, timeTag, meals, foodTypes] of seed) await makeRecipe(cookie, { title, timeTag, meals, foodTypes })
  })
  const titles = async (q: string) => (await list(cookie, q)).map((r) => r.title).sort()

  it('no filters returns everything', async () => expect(await titles('')).toHaveLength(5))
  it('time tag', async () => expect(await titles('?time=Less%20than%2030%20mins')).toEqual(['Pancakes', 'Quick PASTA salad']))
  it('meal filter (a recipe with several meals matches each, listed once)', async () => {
    expect(await titles('?meal=Dinner')).toEqual(['100% beef_stew', 'Chicken Pasta', 'Fish Pie'])
    expect(await titles('?meal=Lunch')).toEqual(['Fish Pie', 'Quick PASTA salad'])
    expect(await titles('?meal=Baking')).toEqual(['Pancakes'])
    expect(await titles('?meal=Dessert')).toEqual([])
  })
  it('food type filter', async () => {
    expect(await titles('?foodType=Chicken')).toEqual(['Chicken Pasta', 'Quick PASTA salad'])
    expect(await titles('?foodType=Vegetarian')).toEqual(['Quick PASTA salad'])
    expect(await titles('?foodType=Lamb')).toEqual([])
  })
  it('empty meal and foodType mean no filter', async () => expect(await titles('?meal=&foodType=')).toHaveLength(5))
  it('meal and food type AND together', async () => {
    expect(await titles('?meal=Dinner&foodType=Chicken')).toEqual(['Chicken Pasta'])
    expect(await titles('?meal=Lunch&foodType=Chicken')).toEqual(['Quick PASTA salad'])
    expect(await titles('?meal=Breakfast&foodType=Chicken')).toEqual([])
  })
  it('search is case-insensitive substring of the title', async () => {
    expect(await titles('?q=pasta')).toEqual(['Chicken Pasta', 'Quick PASTA salad'])
    expect(await titles('?q=ASTA%20SAL')).toEqual(['Quick PASTA salad'])
  })
  it('ANDs time, meal, food type and search', async () => {
    expect(await titles('?time=Less%20than%2030%20mins&meal=Lunch&foodType=Chicken&q=pasta')).toEqual(['Quick PASTA salad'])
    expect(await titles('?time=Around%201%20hr&foodType=Fish')).toEqual([])
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
    for (const q of ['meal=Chicken', 'meal=dinner', 'meal=Dinner,Lunch', 'foodType=Other', 'foodType=Dinner', 'foodType=Fish,Beef']) {
      const res = await send(cookie, 'GET', `/api/recipes?${q}`)
      expect(res.status, q).toBe(400)
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_filter')
    }
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
    expect(await rowCount('recipe_meals')).toBe(0)
    // Another user is not affected.
    expect((await create(a.cookie, valid)).status).toBe(201)
    // Editing still works at the cap.
    await baseEnv.DB.prepare("INSERT INTO recipe_meals (recipe_id, meal) VALUES ('seed-0', 'Lunch')").run()
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

describe('rich-text notes', () => {
  const post = async (notes: unknown, over: Record<string, unknown> = {}) => {
    const { cookie } = await signIn()
    const res = await create(cookie, { ...valid, ...over, notes })
    return { cookie, res, body: (await res.json()) as { recipe?: Recipe; error?: { fields: Record<string, string> } } }
  }
  const accepted = async (notes: string) => {
    const { res, body } = await post(notes)
    expect(res.status).toBe(201)
    expect(body.recipe!.notes).toBe(notes)
  }
  const refused = async (notes: unknown, message?: string) => {
    const { res, body } = await post(notes)
    expect(res.status).toBe(400)
    expect(body.error!.fields.notes).toBeTruthy()
    if (message) expect(body.error!.fields.notes).toContain(message)
    expect(await rowCount('recipes')).toBe(0)
  }

  it('legacy plain text is accepted unchanged', async () => {
    for (const t of ['<3 this', '< 30 mins', 'a & b', 'line one\nline two\n\nline four', '<script>alert(1)</script>', 'x <p> y', '&amp; literal']) {
      expect(isHtmlNotes(t)).toBe(false)
      await accepted(t)
      await resetDb()
    }
  })

  it('classifies HTML by its first tag only', () => {
    expect(isHtmlNotes('<p>a</p>')).toBe(true)
    expect(isHtmlNotes('  <ul><li><p>a</p></li></ul>  ')).toBe(true)
    expect(isHtmlNotes('<ol>')).toBe(true)
    for (const t of ['<P>a</P>', '<p class="x">a</p>', '<pre>', '<strong>a</strong>', '<3', 'text <p>a</p>', '']) expect(isHtmlNotes(t)).toBe(false)
  })

  it('allowed HTML is stored byte for byte', async () => {
    for (const html of [
      '<p>Plain</p>',
      '<p>Mix <strong>bold</strong> text</p><p>Second</p>',
      '<p>one<br>two<br><strong>b<br>c</strong></p>',
      '<ul><li><p>a</p></li><li><p>b <strong>c</strong></p></li></ul>',
      '<ol><li><p>a</p><ul><li><p>nested</p></li></ul></li></ol>',
      '<p>a &amp; b &lt; c &gt; d &nbsp; &quot;e&quot; &#39;f&#39;</p>',
      '<ul><li><p>x</p><p>y</p></li></ul>',
    ]) {
      await accepted(html)
      await resetDb()
    }
  })

  it('trims surrounding whitespace but never rewrites the markup', async () => {
    const { res, body } = await post('  \n<p>Hi  there</p>\n ')
    expect(res.status).toBe(201)
    expect(body.recipe!.notes).toBe('<p>Hi  there</p>')
  })

  it('rejects disallowed tags', async () => {
    for (const t of [
      '<p><script>alert(1)</script></p>', '<p><a>x</a></p>', '<p><em>x</em></p>', '<h1>x</h1>', '<p><img></p>',
      '<div>x</div>', '<p><span>x</span></p>', '<p><b>x</b></p>', '<p>x</p><hr>', '<p>a<br/>b</p>', '<p>x</P>',
    ]) await refused(`<p>ok</p>${t}`, 'Notes can only use bold, bullet lists and numbered lists.')
  })

  it('rejects attributes, comments and doctypes', async () => {
    for (const t of [
      '<p class="x">a</p>', '<p style="color:red">a</p>', '<p onclick="x()">a</p>', '<p><strong class="b">a</strong></p>',
      '<ul id="a"><li><p>a</p></li></ul>', '<p>a</p><!-- c -->', '<p><!-- c -->a</p>', '<p>a</p><!DOCTYPE html>', '<p >a</p>',
    ]) await refused(`<p>ok</p>${t}`)
  })

  it('rejects bad nesting and misplaced text', async () => {
    for (const t of [
      '<p><p>a</p></p>', '<p><ul><li><p>a</p></li></ul></p>', '<ul><p>a</p></ul>', '<ul><li>bare</li></ul>',
      '<li><p>a</p></li>', '<p><li>a</li></p>', '<p><strong><strong>a</strong></strong></p>', '<p><strong><p>a</p></strong></p>',
      '<ul>x<li><p>a</p></li></ul>', '<p>a</p>top level text', '<p>a</p>\n<p>b</p>', '<p>a</p><br>', '<ul><br></ul>',
      '<p><strong>a</p></strong>', '<ul><li><p>a</p></li></ol>',
    ]) await refused(`<p>ok</p>${t}`)
  })

  it('rejects unclosed tags', async () => {
    for (const t of ['<p>a', '<p>a</p><p>b', '<ul><li><p>a</p></li>', '<p><strong>a</p>', '<p>a</p></p>', '<p>a</p><', '<p>a<']) await refused(t)
  })

  it('rejects a bare < or & in HTML mode', async () => {
    for (const t of ['<p>a < b</p>', '<p>a & b</p>', '<p>a &copy; b</p>', '<p>a &amp b</p>', '<p>&#65;</p>', '<p>a &lt</p>', '<p>1 <2</p>']) await refused(t)
  })

  it('caps list nesting at depth 6', async () => {
    const nest = (n: number) => '<ul><li>'.repeat(n).replace(/<li>/g, '<li><p>x</p>') + '</li></ul>'.repeat(n)
    expect(nest(6)).toContain('<ul>')
    await accepted(nest(6))
    await resetDb()
    await refused(nest(7))
  })

  it('counts visible text only', async () => {
    expect(notesVisibleLength('plain  ')).toBe(5)
    expect(notesVisibleLength('<p>a<strong>b</strong></p><p>c</p>')).toBe(3)
    expect(notesVisibleLength('<ul><li><p>ab</p></li><li><p>cd</p></li></ul>')).toBe(4)
    expect(notesVisibleLength('<p>a<br>b</p>')).toBe(2)
    expect(notesVisibleLength('<p>&amp;&lt;&gt;&quot;&#39;&nbsp;</p>')).toBe(6)
    expect(notesVisibleText('<p>&amp;</p>')).toBe('&')
    expect(notesVisibleLength('<p>bad & markup</p>')).toBeNull()
  })

  // Pure validator cases; the API cases further down go through the database (CHECK <= 8000, migration 0008).
  const validate = (notes: string) => validateRecipeInput({ ...valid, notes })

  it('passes at 2,000 visible characters with markup and fails at 2,001', () => {
    const wrap = (n: number) => `<p>${'a'.repeat(n - 10)}<strong>${'b'.repeat(10)}</strong></p>`
    expect(wrap(MAX_NOTES).length).toBeGreaterThan(MAX_NOTES)
    expect(validate(wrap(MAX_NOTES))).toMatchObject({ ok: true, value: { notes: wrap(MAX_NOTES) } })
    const over = validate(wrap(MAX_NOTES + 1))
    expect(over).toMatchObject({ ok: false, errors: { notes: 'Notes must be 2,000 characters or fewer.' } })
  })

  it('decodes entities when counting', () => {
    // Five raw characters per visible one, so use a mix to stay under the raw cap.
    const mix = (amps: number) => `<p>${'&amp;'.repeat(amps)}${'a'.repeat(MAX_NOTES - 1000)}</p>`
    expect(notesVisibleLength(mix(1000))).toBe(MAX_NOTES)
    expect(validate(mix(1000)).ok).toBe(true)
    expect(validate(mix(1001)).ok).toBe(false)
  })

  it('applies the raw cap before tokenising', async () => {
    const alternating = `<p>${'<strong>a</strong>b'.repeat(1000)}</p>` // 2,000 visible, far over the raw cap
    expect(notesVisibleLength(alternating)).toBe(2000)
    expect(alternating.length).toBeGreaterThan(MAX_NOTES_RAW)
    await refused(alternating, 'too much formatting')
    // Invalid markup over the cap also gets the cap message, not a parse error.
    await refused(`<p>${'<x>'.repeat(MAX_NOTES_RAW)}</p>`, 'too much formatting')
  })

  it('treats empty editor variants as no notes, so the content rule applies', async () => {
    for (const empty of [
      '<p></p>', '<p>  </p>', '<p>&nbsp;</p>', '<p></p><p></p>', '<ul><li><p></p></li></ul>', '<p><br></p>', '<ol><li><p>&nbsp;</p></li></ol>',
    ]) {
      const { res, body } = await post(empty)
      expect(res.status).toBe(400)
      expect(body.error!.fields.content).toBeTruthy()
      expect(body.error!.fields.notes).toBeUndefined()
    }
    const { res, body } = await post('<p></p>', { link: 'https://example.com' })
    expect(res.status).toBe(201)
    expect(body.recipe!.notes).toBeNull()
  })

  it('round-trips through create, detail, list and update', async () => {
    const { cookie } = await signIn()
    const html = '<p>Hello <strong>there</strong></p><ul><li><p>one</p></li></ul>'
    const r = await makeRecipe(cookie, { notes: html })
    const got = (await (await send(cookie, 'GET', `/api/recipes/${r.id}`)).json()) as { recipe: Recipe }
    expect(got.recipe.notes).toBe(html)
    const html2 = '<ol><li><p>step</p></li></ol>'
    const put = await send(cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, notes: html2 })
    expect(put.status).toBe(200)
    const again = (await (await send(cookie, 'GET', `/api/recipes/${r.id}`)).json()) as { recipe: Recipe }
    expect(again.recipe.notes).toBe(html2)
    const bad = await send(cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, notes: '<p>a</p><p onclick="x">a</p>' })
    expect(bad.status).toBe(400)
    const after = (await (await send(cookie, 'GET', `/api/recipes/${r.id}`)).json()) as { recipe: Recipe }
    expect(after.recipe.notes).toBe(html2)
  })

  it('search matches titles only, so markup in notes never matches', async () => {
    const { cookie } = await signIn()
    await makeRecipe(cookie, { title: 'Soup', notes: '<p><strong>bold</strong> text</p>' })
    expect(await list(cookie, '?q=strong')).toHaveLength(0)
    expect(await list(cookie, '?q=bold')).toHaveLength(0)
    expect(await list(cookie, '?q=soup')).toHaveLength(1)
  })

  const richOf = (visible: number) => `<p>${'a'.repeat(visible - 10)}<strong>${'b'.repeat(10)}</strong></p>`

  it('API stores and round-trips rich notes over 2,000 raw characters but under 2,000 visible', async () => {
    const { cookie } = await signIn()
    const html = `<p>${'<strong>a</strong>b'.repeat(300)}</p>` // 600 visible, over 2,000 raw
    expect(html.length).toBeGreaterThan(2000)
    expect(html.length).toBeLessThanOrEqual(MAX_NOTES_RAW)
    const r = await makeRecipe(cookie, { notes: html })
    expect(r.notes).toBe(html)
    const got = (await (await send(cookie, 'GET', `/api/recipes/${r.id}`)).json()) as { recipe: Recipe }
    expect(got.recipe.notes).toBe(html)
    const html2 = `<p>${'<strong>c</strong>d'.repeat(400)}</p>`
    expect((await send(cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, notes: html2 })).status).toBe(200)
    const again = (await (await send(cookie, 'GET', `/api/recipes/${r.id}`)).json()) as { recipe: Recipe }
    expect(again.recipe.notes).toBe(html2)
  })

  it('API accepts 2,000 visible characters of rich notes and refuses 2,001', async () => {
    const { cookie } = await signIn()
    const ok = richOf(MAX_NOTES)
    expect(ok.length).toBeGreaterThan(MAX_NOTES)
    const res = await create(cookie, { ...valid, notes: ok })
    expect(res.status).toBe(201)
    expect(((await res.json()) as { recipe: Recipe }).recipe.notes).toBe(ok)
    const over = await create(cookie, { ...valid, notes: richOf(MAX_NOTES + 1) })
    expect(over.status).toBe(400)
    expect(((await over.json()) as { error: { fields: Record<string, string> } }).error.fields.notes).toBe('Notes must be 2,000 characters or fewer.')
    expect(await rowCount('recipes')).toBe(1)
  })

  it('API stores rich notes at exactly 8,000 raw characters and refuses 8,001 with 400', async () => {
    const { cookie } = await signIn()
    // Mostly empty tags, so the visible text stays small while the raw length hits the cap exactly.
    const tags = (raw: number) => `<p>${'<strong></strong>'.repeat(Math.floor((raw - 7) / 17))}${'a'.repeat((raw - 7) % 17)}</p>`
    expect(tags(MAX_NOTES_RAW)).toHaveLength(MAX_NOTES_RAW)
    const res = await create(cookie, { ...valid, notes: tags(MAX_NOTES_RAW) })
    expect(res.status).toBe(201)
    const over = await create(cookie, { ...valid, notes: tags(MAX_NOTES_RAW + 1) })
    expect(over.status).toBe(400)
    expect(((await over.json()) as { error: { fields: Record<string, string> } }).error.fields.notes).toContain('too much formatting')
    expect(await rowCount('recipes')).toBe(1)
  })

  it('a database constraint failure that is not about files is not reported as "files changed"', async () => {
    const { cookie } = await signIn()
    const failing = new Proxy(baseEnv.DB, {
      get(target, prop) {
        if (prop === 'batch') return () => Promise.reject(new Error('D1_ERROR: CHECK constraint failed: length(notes) <= 8000: SQLITE_CONSTRAINT'))
        const v = Reflect.get(target, prop) as unknown
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
      },
    })
    const res = await create(cookie, valid, withEnv({ DB: failing }))
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('Your files changed')
  })
})
