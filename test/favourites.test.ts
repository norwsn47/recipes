import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CSRF_HEADERS, baseEnv, call, resetDb, setupGoogleMock, signIn } from './helpers'
import type { AppEnv } from '../worker/http'

beforeAll(setupGoogleMock)
beforeEach(resetDb)

interface Recipe { id: string; title: string; favourite: boolean }
const valid = { title: 'Pasta bake', timeTag: 'Around 1 hr', categories: ['Chicken'], notes: 'Bake it' }

const send = (cookie: string, method: string, path: string, body?: unknown, e: AppEnv = baseEnv) =>
  call(path, {
    method,
    headers: { cookie, 'content-type': 'application/json', ...(method === 'GET' ? {} : CSRF_HEADERS) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, e)
const makeRecipe = async (cookie: string, over: Record<string, unknown> = {}) =>
  ((await (await send(cookie, 'POST', '/api/recipes', { ...valid, ...over })).json()) as { recipe: Recipe }).recipe
const fav = (cookie: string, id: string, e?: AppEnv) => send(cookie, 'PUT', `/api/recipes/${id}/favourite`, undefined, e)
const unfav = (cookie: string, id: string, e?: AppEnv) => send(cookie, 'DELETE', `/api/recipes/${id}/favourite`, undefined, e)
const list = async (cookie: string, query = '') =>
  ((await (await send(cookie, 'GET', `/api/recipes${query}`)).json()) as { recipes: Recipe[] }).recipes
const detail = async (cookie: string, id: string) =>
  ((await (await send(cookie, 'GET', `/api/recipes/${id}`)).json()) as { recipe: Recipe }).recipe
const rowCount = async (table: string) =>
  (await baseEnv.DB.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>())!.c

describe('favourites', () => {
  it('toggle persists in list and detail; new recipes start false', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    expect(r.favourite).toBe(false)
    const on = await fav(cookie, r.id)
    expect(on.status).toBe(200)
    expect(await on.json()).toEqual({ favourite: true })
    expect((await list(cookie))[0].favourite).toBe(true)
    expect((await detail(cookie, r.id)).favourite).toBe(true)
    const off = await unfav(cookie, r.id)
    expect(off.status).toBe(200)
    expect(await off.json()).toEqual({ favourite: false })
    expect((await detail(cookie, r.id)).favourite).toBe(false)
  })

  it('is idempotent both ways', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    expect((await unfav(cookie, r.id)).status).toBe(200)
    expect((await fav(cookie, r.id)).status).toBe(200)
    expect((await fav(cookie, r.id)).status).toBe(200)
    expect(await rowCount('favourites')).toBe(1)
    expect((await unfav(cookie, r.id)).status).toBe(200)
    expect((await unfav(cookie, r.id)).status).toBe(200)
    expect(await rowCount('favourites')).toBe(0)
  })

  it('404 for a missing recipe, nothing stored', async () => {
    const { cookie } = await signIn()
    expect((await fav(cookie, 'nope')).status).toBe(404)
    expect((await unfav(cookie, 'nope')).status).toBe(404)
    expect(await rowCount('favourites')).toBe(0)
  })

  it('401 without a session, 403 on CSRF failure, nothing stored', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    for (const method of ['PUT', 'DELETE']) {
      expect((await call(`/api/recipes/${r.id}/favourite`, { method, headers: CSRF_HEADERS })).status).toBe(401)
      const noHeader = await call(`/api/recipes/${r.id}/favourite`, { method, headers: { cookie, origin: 'http://example.com' } })
      const foreign = await call(`/api/recipes/${r.id}/favourite`, { method, headers: { cookie, origin: 'http://evil.test', 'x-requested-with': 'fetch' } })
      expect(noHeader.status).toBe(403)
      expect(foreign.status).toBe(403)
    }
    expect(await rowCount('favourites')).toBe(0)
  })

  it('counts against the write limit: 429 with the existing message, nothing stored', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie) // write 1
    const small = { DB: baseEnv.DB, FILES: baseEnv.FILES, WRITE_RATE_PER_MINUTE: '3' } as AppEnv
    expect((await fav(cookie, r.id, small)).status).toBe(200)
    expect((await unfav(cookie, r.id, small)).status).toBe(200)
    const res = await fav(cookie, r.id, small)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      error: { code: 'rate_limited', message: 'You are doing that too fast. Wait a minute and try again.' },
    })
    expect(await rowCount('favourites')).toBe(0)
  })

  it('is personal: B sees false, can favourite A\'s recipe, and no counts appear', async () => {
    const a = await signIn({ sub: 'a', name: 'Ann' })
    const b = await signIn({ sub: 'b', name: 'Bob', email: 'b@example.com' })
    const r = await makeRecipe(a.cookie)
    await fav(a.cookie, r.id)
    expect((await list(b.cookie))[0].favourite).toBe(false)
    expect((await detail(b.cookie, r.id)).favourite).toBe(false)
    expect(await list(b.cookie, '?favourites=1')).toEqual([])
    expect((await fav(b.cookie, r.id)).status).toBe(200)
    expect((await list(a.cookie, '?favourites=1')).map((x) => x.id)).toEqual([r.id])
    await unfav(b.cookie, r.id)
    expect((await detail(a.cookie, r.id)).favourite).toBe(true)
    const bodies = [
      await (await send(a.cookie, 'GET', '/api/recipes')).text(),
      await (await send(a.cookie, 'GET', `/api/recipes/${r.id}`)).text(),
      await (await fav(a.cookie, r.id)).text(),
    ]
    for (const t of bodies) expect(t).not.toMatch(/count|total|favouritedBy|users/i)
  })

  it('favourites=1 filter combines with the other filters', async () => {
    const { cookie } = await signIn()
    const a = await makeRecipe(cookie, { title: 'Chicken pie' })
    await makeRecipe(cookie, { title: 'Chicken stew' })
    const c = await makeRecipe(cookie, { title: 'Fish pie', categories: ['Fish'] })
    await fav(cookie, a.id)
    await fav(cookie, c.id)
    expect((await list(cookie, '?favourites=1')).map((r) => r.title).sort()).toEqual(['Chicken pie', 'Fish pie'])
    expect((await list(cookie, '?favourites=1&categories=Chicken&q=pie')).map((r) => r.title)).toEqual(['Chicken pie'])
    expect(await list(cookie)).toHaveLength(3)
  })

  it('deleting a recipe removes every user\'s favourite of it (no orphans)', async () => {
    const a = await signIn({ sub: 'a' })
    const b = await signIn({ sub: 'b', email: 'b@example.com' })
    const r = await makeRecipe(a.cookie)
    const keep = await makeRecipe(a.cookie, { title: 'Keep' })
    for (const u of [a, b]) { await fav(u.cookie, r.id); await fav(u.cookie, keep.id) }
    expect(await rowCount('favourites')).toBe(4)
    expect((await send(a.cookie, 'DELETE', `/api/recipes/${r.id}`)).status).toBe(200)
    const orphans = await baseEnv.DB.prepare('SELECT COUNT(*) AS c FROM favourites WHERE recipe_id = ?').bind(r.id).first<{ c: number }>()
    expect(orphans!.c).toBe(0)
    expect(await rowCount('favourites')).toBe(2)
    expect(await list(b.cookie, '?favourites=1')).toHaveLength(1)
  })

  it('editing keeps favourites, including another user\'s', async () => {
    const a = await signIn({ sub: 'a' })
    const b = await signIn({ sub: 'b', email: 'b@example.com' })
    const r = await makeRecipe(a.cookie)
    await fav(b.cookie, r.id)
    await fav(a.cookie, r.id)
    const res = await send(a.cookie, 'PUT', `/api/recipes/${r.id}`, { ...valid, title: 'Renamed' })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { recipe: Recipe }).recipe.favourite).toBe(true)
    expect((await detail(b.cookie, r.id)).favourite).toBe(true)
    expect(await rowCount('favourites')).toBe(2)
  })

  it('does not touch the recipe row or the recipe cap', async () => {
    const { cookie } = await signIn()
    const small = { DB: baseEnv.DB, FILES: baseEnv.FILES, MAX_USER_RECIPES: '2' } as AppEnv
    const mk = (title: string) => send(cookie, 'POST', '/api/recipes', { ...valid, title }, small)
    const one = ((await (await mk('One')).json()) as { recipe: Recipe }).recipe
    expect((await mk('Two')).status).toBe(201)
    const before = await baseEnv.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(one.id).first()
    await fav(cookie, one.id)
    expect(await baseEnv.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(one.id).first()).toEqual(before)
    expect(await rowCount('recipes')).toBe(2)
    expect((await mk('Three')).status).toBe(409)
    expect(await rowCount('recipe_files')).toBe(0)
  })
})
