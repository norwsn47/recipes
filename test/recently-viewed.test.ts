import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CSRF_HEADERS, baseEnv, call, resetDb, setupGoogleMock, signIn } from './helpers'

beforeAll(setupGoogleMock)
beforeEach(resetDb)

interface Recipe { id: string; title: string; viewedAt: string | null }
const valid = { title: 'Pasta bake', timeTag: 'Around 1 hr', meals: ['Dinner'], foodTypes: ['Chicken'], notes: 'Bake it' }

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  call(path, {
    method,
    headers: { cookie, 'content-type': 'application/json', ...(method === 'GET' ? {} : CSRF_HEADERS) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const makeRecipe = async (cookie: string) =>
  ((await (await send(cookie, 'POST', '/api/recipes', valid)).json()) as { recipe: Recipe }).recipe
const open = async (cookie: string, id: string) => {
  const res = await send(cookie, 'GET', `/api/recipes/${id}`)
  return { res, recipe: ((await res.clone().json()) as { recipe?: Recipe }).recipe }
}
const list = async (cookie: string) =>
  ((await (await send(cookie, 'GET', '/api/recipes')).json()) as { recipes: Recipe[] }).recipes
const viewRows = async (recipeId?: string) =>
  (await baseEnv.DB.prepare('SELECT user_id, recipe_id, viewed_at FROM recipe_views WHERE ?1 IS NULL OR recipe_id = ?1').bind(recipeId ?? null).all<{ user_id: string; viewed_at: number }>()).results

describe('recently viewed', () => {
  it('records a view on opening the detail; never-opened recipes have viewedAt null', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    expect(r.viewedAt).toBeNull()
    expect((await list(cookie))[0].viewedAt).toBeNull()
    expect(await viewRows()).toHaveLength(0)
    const before = Date.now()
    expect((await open(cookie, r.id)).res.status).toBe(200)
    const rows = await viewRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].viewed_at).toBeGreaterThanOrEqual(before)
    const listed = (await list(cookie))[0].viewedAt
    expect(listed).toBe(new Date(rows[0].viewed_at).toISOString())
  })

  it('a second open updates viewed_at on the same row', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    await open(cookie, r.id)
    await baseEnv.DB.prepare('UPDATE recipe_views SET viewed_at = 1000').run()
    expect((await list(cookie))[0].viewedAt).toBe(new Date(1000).toISOString())
    await open(cookie, r.id)
    const rows = await viewRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].viewed_at).toBeGreaterThan(1000)
  })

  it('is personal: A\'s view is not visible to B, in list or detail', async () => {
    const a = await signIn({ sub: 'a', name: 'Ann' })
    const b = await signIn({ sub: 'b', name: 'Bob', email: 'b@example.com' })
    const r = await makeRecipe(a.cookie)
    await open(a.cookie, r.id)
    expect((await list(a.cookie))[0].viewedAt).not.toBeNull()
    expect((await list(b.cookie))[0].viewedAt).toBeNull()
    expect((await open(b.cookie, r.id)).recipe!.viewedAt).toBeNull() // B's own first open: nothing before it
    expect(await viewRows(r.id)).toHaveLength(2)
  })

  it('a missing recipe is a 404 and records nothing', async () => {
    const { cookie } = await signIn()
    expect((await open(cookie, 'nope')).res.status).toBe(404)
    expect(await viewRows()).toHaveLength(0)
  })

  it('does not use the write limit', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    const before = (await baseEnv.DB.prepare('SELECT COUNT(*) AS c FROM write_rate_limits').first<{ c: number }>())!.c
    const sums = async () => (await baseEnv.DB.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM write_rate_limits').first<{ n: number }>())!.n
    const tokens = await sums()
    for (let i = 0; i < 30; i++) expect((await open(cookie, r.id)).res.status).toBe(200)
    expect(await sums()).toBe(tokens)
    expect((await baseEnv.DB.prepare('SELECT COUNT(*) AS c FROM write_rate_limits').first<{ c: number }>())!.c).toBe(before)
  })

  it('deleting a recipe removes every user\'s view of it', async () => {
    const a = await signIn({ sub: 'a' })
    const b = await signIn({ sub: 'b', email: 'b@example.com' })
    const r = await makeRecipe(a.cookie)
    const keep = await makeRecipe(a.cookie)
    for (const u of [a, b]) { await open(u.cookie, r.id); await open(u.cookie, keep.id) }
    expect(await viewRows()).toHaveLength(4)
    expect((await send(a.cookie, 'DELETE', `/api/recipes/${r.id}`)).status).toBe(200)
    expect(await viewRows(r.id)).toHaveLength(0)
    expect(await viewRows()).toHaveLength(2)
  })

  it('the share preview carries no view data', async () => {
    const { cookie } = await signIn()
    const r = await makeRecipe(cookie)
    await open(cookie, r.id)
    const res = await call(`/r/${r.id}`)
    expect(res.status).toBe(200)
    expect(await res.text()).not.toMatch(/viewed|views/i)
  })
})
