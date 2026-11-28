import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { baseEnv } from './helpers'

const db = baseEnv.DB
const migrations = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS
const m0008 = migrations.find((m) => m.name.startsWith('0008'))!

// Every app table, children before parents, so they can be dropped in this order.
const DROP_ORDER = [
  'recipe_views', 'recipe_meals', 'recipe_food_types', 'recipe_files', 'favourites', 'recipes',
  'write_rate_limits', 'link_title_rate_limits', 'sessions', 'users',
]
const CHILDREN = ['recipe_files', 'favourites', 'recipe_meals', 'recipe_food_types', 'recipe_views']
const ORDER_BY: Record<string, string> = {
  users: 'id', sessions: 'id', recipes: 'id', recipe_files: 'id', favourites: 'user_id, recipe_id',
  recipe_meals: 'recipe_id, meal', recipe_food_types: 'recipe_id, food_type', recipe_views: 'user_id, recipe_id',
  write_rate_limits: 'user_id', link_title_rate_limits: 'user_id',
}

const rows = async (sql: string) => (await db.prepare(sql).all<Record<string, unknown>>()).results
const dump = async () => {
  const out: Record<string, unknown[]> = {}
  for (const t of Object.keys(ORDER_BY)) out[t] = await rows(`SELECT * FROM ${t} ORDER BY ${ORDER_BY[t]}`)
  return out
}
const schema = async () =>
  rows("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name")
const count = async (sql: string) => (await rows(sql))[0].c as number

describe('migration 0008 (notes limit 2,000 -> 8,000) on seeded data', () => {
  it('keeps every row, column, foreign key, index and cascade; raises only the notes limit', async () => {
    // Back to the schema as it was before 0008: drop everything, replay 0001 to 0007.
    for (const t of DROP_ORDER) await db.prepare(`DROP TABLE IF EXISTS ${t}`).run()
    for (const m of migrations.filter((x) => x.name < '0008')) for (const q of m.queries) await db.prepare(q).run()

    // The old limit really is 2,000 before the migration.
    const insertNotes = (id: string, notes: string) =>
      db.prepare("INSERT INTO recipes (id, user_id, title, time_tag, notes, created_at, updated_at) VALUES (?, 'u1', 't', 'Around 1 hr', ?, 1, 1)").bind(id, notes)
    await db.batch([
      db.prepare("INSERT INTO users (id, google_sub, email, name, created_at, updated_at) VALUES ('u1', 's1', 'a@example.com', 'A', 1, 2), ('u2', 's2', 'b@example.com', 'B', 3, 4)"),
      db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, last_renewed_at) VALUES ('s-1', 'u1', 1, 99, 2)"),
      db.prepare("INSERT INTO write_rate_limits (user_id, window_start, count) VALUES ('u1', 10, 3)"),
      db.prepare("INSERT INTO link_title_rate_limits (user_id, window_start, count) VALUES ('u2', 11, 4)"),
    ])
    await insertNotes('over', 'x'.repeat(2000)).run()
    await expect(insertNotes('over-2', 'x'.repeat(2001)).run()).rejects.toThrow(/constraint/i)
    await db.prepare("DELETE FROM recipes WHERE id = 'over'").run()

    await db.batch([
      db.prepare("INSERT INTO recipes (id, user_id, title, time_tag, link, notes, created_at, updated_at) VALUES ('r1', 'u1', 'Soup', 'Less than 30 mins', 'https://example.com/a', ?, 1700000000001, 1700000000002)").bind('n'.repeat(2000)),
      db.prepare("INSERT INTO recipes (id, user_id, title, time_tag, link, notes, created_at, updated_at) VALUES ('r2', 'u2', 'Stew', 'Extensive prep', NULL, NULL, 1700000000003, 1700000000004)"),
      db.prepare("INSERT INTO recipes (id, user_id, title, time_tag, link, notes, created_at, updated_at) VALUES ('r3', 'u1', 'Cake', 'Around 1 hr', NULL, 'plain <b> text', 5, 5)"),
      db.prepare("INSERT INTO recipe_files (id, recipe_id, user_id, r2_key, original_name, content_type, size, created_at) VALUES ('f1', 'r1', 'u1', 'recipes/r1/f1', 'a.pdf', 'application/pdf', 123, 7), ('f2', 'r1', 'u1', 'recipes/r1/f2', 'b.png', 'image/png', 456, 8), ('f3', 'r2', 'u2', 'recipes/r2/f3', 'c.jpg', 'image/jpeg', 789, 9)"),
      db.prepare("INSERT INTO favourites (user_id, recipe_id, created_at) VALUES ('u1', 'r1', 20), ('u2', 'r1', 21), ('u2', 'r2', 22)"),
      db.prepare("INSERT INTO recipe_meals (recipe_id, meal) VALUES ('r1', 'Lunch'), ('r1', 'Dinner'), ('r2', 'Dinner'), ('r3', 'Dessert')"),
      db.prepare("INSERT INTO recipe_food_types (recipe_id, food_type) VALUES ('r1', 'Fish'), ('r2', 'Beef'), ('r2', 'Lamb')"),
      db.prepare("INSERT INTO recipe_views (user_id, recipe_id, viewed_at) VALUES ('u1', 'r2', 30), ('u2', 'r1', 31)"),
    ])

    const dataBefore = await dump()
    const schemaBefore = await schema()
    const sizes = Object.fromEntries(Object.entries(dataBefore).map(([t, r]) => [t, r.length]))
    expect(sizes).toMatchObject({ recipes: 3, recipe_files: 3, favourites: 3, recipe_meals: 4, recipe_food_types: 3, recipe_views: 2 })

    for (const q of m0008.queries) await db.prepare(q).run()

    // Every row and value identical, in every table.
    expect(await dump()).toEqual(dataBefore)
    expect(await rows('PRAGMA foreign_key_check')).toEqual([])

    // Schema identical except the one notes limit; no temporary tables left behind.
    const schemaAfter = await schema()
    expect(schemaAfter.map((o) => o.name)).toEqual(schemaBefore.map((o) => o.name))
    expect(schemaAfter.some((o) => String(o.name).startsWith('tmp_'))).toBe(false)
    for (const [i, after] of schemaAfter.entries()) {
      const before = schemaBefore[i]
      if (after.name === 'recipes') {
        expect(before.sql).toContain('length(notes) <= 2000')
        expect(after.sql).toBe((before.sql as string).replace('length(notes) <= 2000', 'length(notes) <= 8000'))
      } else {
        expect(after).toEqual(before)
      }
    }

    // Indexes on recipes and the children are present; there are no triggers or views.
    const names = new Set(schemaAfter.map((o) => o.name))
    for (const i of [
      'idx_recipes_created_at', 'idx_recipes_user_id', 'idx_recipe_files_recipe', 'idx_recipe_files_user',
      'idx_favourites_recipe_id', 'idx_recipe_meals_meal', 'idx_recipe_food_types_food_type', 'idx_recipe_views_recipe_id',
    ]) expect(names.has(i)).toBe(true)
    expect(schemaAfter.filter((o) => o.type === 'trigger' || o.type === 'view')).toEqual([])

    // Child tables still reference recipes (not a renamed or temporary table).
    for (const t of CHILDREN) {
      const targets = (await rows(`PRAGMA foreign_key_list(${t})`)).map((f) => `${f.table}:${f.on_delete}`)
      expect(targets).toContain('recipes:CASCADE')
      expect(targets.some((x) => x.startsWith('tmp_') || x.includes('_old'))).toBe(false)
    }

    // The new limit: exactly 8,000 accepted, 8,001 refused by the database itself.
    await insertNotes('ok-8000', 'y'.repeat(8000)).run()
    await expect(insertNotes('bad-8001', 'y'.repeat(8001)).run()).rejects.toThrow(/constraint/i)
    expect(await count("SELECT COUNT(*) AS c FROM recipes WHERE id = 'bad-8001'")).toBe(0)
    await db.prepare("DELETE FROM recipes WHERE id = 'ok-8000'").run()

    // Deleting a recipe still cascades to every child, and only that recipe's rows.
    await db.prepare("DELETE FROM recipes WHERE id = 'r1'").run()
    for (const t of CHILDREN) expect(await count(`SELECT COUNT(*) AS c FROM ${t} WHERE recipe_id = 'r1'`)).toBe(0)
    expect(await count('SELECT COUNT(*) AS c FROM recipe_files')).toBe(1)
    expect(await count('SELECT COUNT(*) AS c FROM favourites')).toBe(1)
    expect(await count('SELECT COUNT(*) AS c FROM recipe_meals')).toBe(2)
    expect(await count('SELECT COUNT(*) AS c FROM recipe_food_types')).toBe(2)
    expect(await count('SELECT COUNT(*) AS c FROM recipe_views')).toBe(1)

    // Deleting a user still cascades through recipes to the children.
    await db.prepare("DELETE FROM users WHERE id = 'u2'").run()
    expect(await count('SELECT COUNT(*) AS c FROM recipes WHERE user_id = \'u2\'')).toBe(0)
    expect(await count("SELECT COUNT(*) AS c FROM recipe_meals WHERE recipe_id = 'r2'")).toBe(0)
    expect(await count("SELECT COUNT(*) AS c FROM recipe_files WHERE recipe_id = 'r2'")).toBe(0)
  })
})
