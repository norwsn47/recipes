// Recipe CRUD, list, filter and search. Every handler runs after CSRF and session checks.
import { errorResponse, json } from './http'
import type { AppEnv } from './http'
import {
  RATE_LIMIT_MESSAGE, maxUserRecipes, recipeLimitMessage, takeWriteToken,
} from './limits'
import {
  CATEGORIES, MAX_BODY_BYTES, isCategory, isTimeTag, sortCategories, validateRecipeInput,
} from './recipe-validation'
import type { Category, RecipeInput, TimeTag } from './recipe-validation'
import type { SessionUser } from './session'

const MAX_SEARCH_LENGTH = 100
const MAX_LIST_ROWS = 1000 // sanity ceiling; the real ceiling is users x 50 recipes

interface RecipeRow {
  id: string
  user_id: string
  title: string
  time_tag: TimeTag
  link: string | null
  notes: string | null
  created_at: number
  updated_at: number
  added_by: string
  categories: string | null
}

const SELECT_RECIPE = `
  SELECT r.id, r.user_id, r.title, r.time_tag, r.link, r.notes, r.created_at, r.updated_at,
         u.name AS added_by,
         (SELECT group_concat(category) FROM recipe_categories WHERE recipe_id = r.id) AS categories
  FROM recipes r JOIN users u ON u.id = r.user_id`

function summary(row: RecipeRow, user: SessionUser) {
  return {
    id: row.id,
    title: row.title,
    timeTag: row.time_tag,
    categories: sortCategories((row.categories ?? '').split(',')),
    addedBy: row.added_by,
    ownerId: row.user_id,
    canEdit: row.user_id === user.id,
    createdAt: new Date(row.created_at).toISOString(),
    hasLink: row.link !== null,
    hasNotes: row.notes !== null,
    hasFiles: false, // stage B
  }
}

const detail = (row: RecipeRow, user: SessionUser) => ({
  ...summary(row, user),
  link: row.link,
  notes: row.notes,
  updatedAt: new Date(row.updated_at).toISOString(),
  files: [] as never[], // stage B
})

const validationError = (errors: Record<string, string>): Response =>
  json(
    { error: { code: 'validation_failed', message: Object.values(errors).join(' '), fields: errors } },
    400,
  )

const rateLimited = (): Response =>
  new Response(
    JSON.stringify({ error: { code: 'rate_limited', message: RATE_LIMIT_MESSAGE } }),
    {
      status: 429,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '60' },
    },
  )

/** Reads and parses a JSON body defensively. Returns a Response on failure. */
async function readJson(request: Request): Promise<{ body: unknown } | Response> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return errorResponse(413, 'payload_too_large', 'Request is too large.')
  let text: string
  try {
    text = await request.text()
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body could not be read.')
  }
  if (text.length > MAX_BODY_BYTES) return errorResponse(413, 'payload_too_large', 'Request is too large.')
  try {
    return { body: JSON.parse(text) as unknown }
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
  }
}

async function fetchRecipe(env: AppEnv, id: string): Promise<RecipeRow | null> {
  return env.DB.prepare(`${SELECT_RECIPE} WHERE r.id = ?`).bind(id).first<RecipeRow>()
}

/** GET /api/recipes?time=&categories=&q= */
export async function listRecipes(request: Request, env: AppEnv, user: SessionUser): Promise<Response> {
  const params = new URL(request.url).searchParams
  const where: string[] = []
  const binds: unknown[] = []

  const time = params.get('time')
  if (time !== null && time !== '') {
    if (!isTimeTag(time)) return errorResponse(400, 'invalid_filter', 'Unknown time tag.')
    where.push('r.time_tag = ?')
    binds.push(time)
  }

  // categories: comma-separated and/or repeated; any-of (OR). Empty means no category filter.
  const cats = params.getAll('categories').flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  if (cats.length > 0) {
    if (!cats.every(isCategory)) {
      return errorResponse(400, 'invalid_filter', `Categories must come from: ${CATEGORIES.join(', ')}.`)
    }
    const unique = [...new Set(cats)]
    where.push(
      `EXISTS (SELECT 1 FROM recipe_categories c WHERE c.recipe_id = r.id AND c.category IN (${unique.map(() => '?').join(',')}))`,
    )
    binds.push(...unique)
  }

  const q = (params.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH).toLowerCase()

  const sql = `${SELECT_RECIPE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY r.created_at DESC, r.rowid DESC LIMIT ${MAX_LIST_ROWS}`
  const { results } = await env.DB.prepare(sql).bind(...binds).all<RecipeRow>()

  // Title search is done here, not with SQL LIKE: SQLite LIKE only folds ASCII case, and a plain
  // substring test needs no wildcard escaping, so "%" and "_" in q are ordinary characters.
  const rows = q ? results.filter((r) => r.title.toLowerCase().includes(q)) : results
  return json({ recipes: rows.map((r) => summary(r, user)) })
}

export async function getRecipe(env: AppEnv, user: SessionUser, id: string): Promise<Response> {
  const row = await fetchRecipe(env, id)
  if (!row) return errorResponse(404, 'not_found', 'Recipe not found')
  return json({ recipe: detail(row, user) })
}

const categoryInserts = (env: AppEnv, id: string, categories: Category[]) =>
  // Guarded on the recipe existing, so a failed (capped) insert leaves no stray rows.
  categories.map((c) =>
    env.DB.prepare(
      'INSERT INTO recipe_categories (recipe_id, category) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM recipes WHERE id = ?1)',
    ).bind(id, c),
  )

export async function createRecipe(request: Request, env: AppEnv, user: SessionUser): Promise<Response> {
  if (!(await takeWriteToken(env, user.id))) return rateLimited()
  const parsed = await readJson(request)
  if (parsed instanceof Response) return parsed
  const v = validateRecipeInput(parsed.body)
  if (!v.ok) return validationError(v.errors)
  const input: RecipeInput = v.value

  const id = crypto.randomUUID()
  const now = Date.now()
  const max = maxUserRecipes(env)
  // The cap is checked inside the INSERT itself, so two simultaneous creates cannot both pass.
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO recipes (id, user_id, title, time_tag, link, notes, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7
       WHERE (SELECT COUNT(*) FROM recipes WHERE user_id = ?2) < ?8`,
    ).bind(id, user.id, input.title, input.timeTag, input.link, input.notes, now, max),
    ...categoryInserts(env, id, input.categories),
  ])
  if (inserted.meta.changes === 0) {
    return errorResponse(409, 'recipe_limit_reached', recipeLimitMessage(max))
  }
  const row = await fetchRecipe(env, id)
  if (!row) throw new Error('created recipe not found')
  return json({ recipe: detail(row, user) }, 201)
}

/** Existence first (404), then ownership (403). */
async function loadOwned(
  env: AppEnv, user: SessionUser, id: string,
): Promise<{ row: RecipeRow } | Response> {
  const row = await fetchRecipe(env, id)
  if (!row) return errorResponse(404, 'not_found', 'Recipe not found')
  if (row.user_id !== user.id) return errorResponse(403, 'forbidden', 'You can only change recipes you added.')
  return { row }
}

export async function updateRecipe(
  request: Request, env: AppEnv, user: SessionUser, id: string,
): Promise<Response> {
  if (!(await takeWriteToken(env, user.id))) return rateLimited()
  const owned = await loadOwned(env, user, id)
  if (owned instanceof Response) return owned
  const parsed = await readJson(request)
  if (parsed instanceof Response) return parsed
  // Stage B: pass the count of files that will remain after this edit.
  const v = validateRecipeInput(parsed.body, 0)
  if (!v.ok) return validationError(v.errors)
  const input = v.value

  const [updated] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE recipes SET title = ?, time_tag = ?, link = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(input.title, input.timeTag, input.link, input.notes, Date.now(), id, user.id),
    env.DB.prepare('DELETE FROM recipe_categories WHERE recipe_id = ?1 AND EXISTS (SELECT 1 FROM recipes WHERE id = ?1 AND user_id = ?2)').bind(id, user.id),
    ...categoryInserts(env, id, input.categories),
  ])
  if (updated.meta.changes === 0) return errorResponse(404, 'not_found', 'Recipe not found')
  const row = await fetchRecipe(env, id)
  if (!row) return errorResponse(404, 'not_found', 'Recipe not found')
  return json({ recipe: detail(row, user) })
}

export async function deleteRecipe(env: AppEnv, user: SessionUser, id: string): Promise<Response> {
  if (!(await takeWriteToken(env, user.id))) return rateLimited()
  const owned = await loadOwned(env, user, id)
  if (owned instanceof Response) return owned
  // Category rows go with it (ON DELETE CASCADE). Stage B deletes the files after this succeeds.
  await env.DB.prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?').bind(id, user.id).run()
  return json({ ok: true })
}
