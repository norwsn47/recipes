import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { FOOD_TYPES as CLIENT_FOOD_TYPES, MEALS as CLIENT_MEALS, TIME_TAGS as CLIENT_TIME_TAGS } from '../src/lib/recipes'
import { FOOD_TYPES, MEALS, TIME_TAGS } from '../worker/recipe-validation'
import { baseEnv, resetDb } from './helpers'

const db = baseEnv.DB
const migration = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS.find((m) => m.name.startsWith('0006'))!

const OLD_CATEGORIES_DDL = [
  `CREATE TABLE recipe_categories (
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN
      ('Breakfast', 'Chicken', 'Fish', 'Pork', 'Beef', 'Lamb', 'Dessert', 'Baking', 'Other')),
    PRIMARY KEY (recipe_id, category)
  ) WITHOUT ROWID`,
  'CREATE INDEX idx_recipe_categories_category ON recipe_categories(category)',
]

const rows = async (sql: string) => (await db.prepare(sql).all<Record<string, string>>()).results

describe('constants stay in sync', () => {
  it('worker and client lists match', () => {
    expect([...MEALS]).toEqual([...CLIENT_MEALS])
    expect([...FOOD_TYPES]).toEqual([...CLIENT_FOOD_TYPES])
    expect([...TIME_TAGS]).toEqual([...CLIENT_TIME_TAGS])
  })
  it('database CHECK constraints list exactly the same values', async () => {
    const sqlOf = async (t: string) => (await db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').bind(t).first<{ sql: string }>())!.sql
    const quoted = (sql: string) => [...sql.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(quoted(await sqlOf('recipe_meals'))).toEqual([...MEALS])
    expect(quoted(await sqlOf('recipe_food_types'))).toEqual([...FOOD_TYPES])
  })
})

describe('migration 0006 on data from the old schema', () => {
  it('maps categories to meals and food types with no loss and no duplicates', async () => {
    await resetDb()
    // Put the database back into its pre-0006 shape: drop the new tables, recreate the old one.
    await db.batch([
      db.prepare('DROP TABLE recipe_meals'),
      db.prepare('DROP TABLE recipe_food_types'),
      ...OLD_CATEGORIES_DDL.map((q) => db.prepare(q)),
      db.prepare("INSERT INTO users (id, google_sub, email, name, created_at, updated_at) VALUES ('u1', 's1', 'a@example.com', 'A', 1, 1)"),
    ])
    const seed: [string, string[]][] = [
      ['multi', ['Chicken', 'Fish', 'Breakfast', 'Other']],
      ['other-only', ['Other']],
      ['breakfast-only', ['Breakfast']],
      ['chicken-dessert', ['Chicken', 'Dessert']],
      ['none', []],
      ['baking', ['Baking', 'Lamb']],
      ['pork-beef', ['Pork', 'Beef']],
    ]
    for (const [id, cats] of seed) {
      await db.batch([
        db.prepare("INSERT INTO recipes (id, user_id, title, time_tag, notes, created_at, updated_at) VALUES (?, 'u1', ?, 'Around 1 hr', 'n', 1, 1)").bind(id, id),
        ...cats.map((c) => db.prepare('INSERT INTO recipe_categories (recipe_id, category) VALUES (?, ?)').bind(id, c)),
      ])
    }
    await db.prepare("INSERT INTO favourites (user_id, recipe_id, created_at) VALUES ('u1', 'multi', 1)").run()

    for (const q of migration.queries) await db.prepare(q).run()

    const meals: Record<string, string> = {}
    for (const r of await rows('SELECT recipe_id, group_concat(meal) AS m FROM (SELECT * FROM recipe_meals ORDER BY meal) GROUP BY recipe_id')) meals[r.recipe_id] = r.m
    const types: Record<string, string> = {}
    for (const r of await rows('SELECT recipe_id, group_concat(food_type) AS t FROM (SELECT * FROM recipe_food_types ORDER BY food_type) GROUP BY recipe_id')) types[r.recipe_id] = r.t
    expect(meals).toEqual({
      multi: 'Breakfast,Dinner', 'other-only': 'Dinner', 'breakfast-only': 'Breakfast', 'chicken-dessert': 'Dessert,Dinner'.split(',').sort().join(','),
      none: 'Dinner', baking: 'Baking,Dinner', 'pork-beef': 'Dinner',
    })
    expect(types).toEqual({ multi: 'Chicken,Fish', 'chicken-dessert': 'Chicken', baking: 'Lamb', 'pork-beef': 'Beef,Pork' })

    // Every recipe has a meal; nothing was lost; favourites and recipes untouched; old table gone.
    expect((await rows('SELECT COUNT(*) AS c FROM recipes WHERE id NOT IN (SELECT recipe_id FROM recipe_meals)'))[0].c).toBe(0)
    expect((await rows('SELECT COUNT(*) AS c FROM recipes'))[0].c).toBe(7)
    expect((await rows('SELECT COUNT(*) AS c FROM favourites'))[0].c).toBe(1)
    expect(await rows("SELECT name FROM sqlite_master WHERE name LIKE '%recipe_categories%'")).toEqual([])

    // Cascade still works on the new tables.
    await db.prepare("DELETE FROM recipes WHERE id = 'multi'").run()
    expect((await rows("SELECT COUNT(*) AS c FROM recipe_meals WHERE recipe_id = 'multi'"))[0].c).toBe(0)
    expect((await rows("SELECT COUNT(*) AS c FROM recipe_food_types WHERE recipe_id = 'multi'"))[0].c).toBe(0)
  })
})
