// Recipe CRUD, list, filter and search. Every handler runs after CSRF and session checks.
import { checkFiles, deleteObjects, fileInsert, isConstraintError, recipeTooLarge, storeFiles } from './files'
import type { FileRow, IncomingFile } from './files'
import { errorResponse, json } from './http'
import type { AppEnv } from './http'
import {
  MAX_FILES_PER_RECIPE, MAX_MULTIPART_BYTES, RATE_LIMIT_MESSAGE, maxUserRecipes, recipeLimitMessage,
  takeWriteToken,
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
  has_files: number
  favourite: number
}

const SELECT_RECIPE = `
  SELECT r.id, r.user_id, r.title, r.time_tag, r.link, r.notes, r.created_at, r.updated_at,
         u.name AS added_by,
         (SELECT group_concat(category) FROM recipe_categories WHERE recipe_id = r.id) AS categories,
         EXISTS (SELECT 1 FROM recipe_files WHERE recipe_id = r.id) AS has_files,
         EXISTS (SELECT 1 FROM favourites fv WHERE fv.recipe_id = r.id AND fv.user_id = ?) AS favourite
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
    link: row.link,
    hasNotes: row.notes !== null,
    hasFiles: row.has_files === 1,
    favourite: row.favourite === 1, // the signed-in user's own state only
  }
}

const fileView = (recipeId: string, f: FileRow) => ({
  id: f.id,
  name: f.original_name,
  contentType: f.content_type,
  size: f.size,
  url: `/api/recipes/${recipeId}/files/${f.id}`,
})

const detail = (row: RecipeRow, user: SessionUser, files: FileRow[]) => ({
  ...summary(row, user),
  notes: row.notes,
  updatedAt: new Date(row.updated_at).toISOString(),
  files: files.map((f) => fileView(row.id, f)),
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

// A body past the limit means the files alone are over 25 MB, so it gets the recipe-total refusal.
const uploadTooLarge = recipeTooLarge

/** Parses the recipe JSON text defensively. Returns a Response on failure. */
function parseJson(text: string): { body: unknown } | Response {
  if (text.length > MAX_BODY_BYTES) return errorResponse(413, 'payload_too_large', 'Request is too large.')
  try {
    return { body: JSON.parse(text) as unknown }
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
  }
}

async function readJson(request: Request): Promise<{ body: unknown } | Response> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return errorResponse(413, 'payload_too_large', 'Request is too large.')
  let text: string
  try {
    text = await request.text()
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body could not be read.')
  }
  return parseJson(text)
}

/**
 * multipart/form-data: field "recipe" (the same JSON as a JSON request) plus zero or more "files"
 * parts. The declared length is checked before a byte is read. A body with no usable length is
 * counted as it streams and cut off at the limit. formData() runs natively in the runtime, so the
 * Worker's own JavaScript never touches the file bytes (see the CPU note in the handoff).
 */
async function readMultipart(request: Request): Promise<{ body: unknown; files: File[] } | Response> {
  const lengthHeader = request.headers.get('content-length')
  const declared = lengthHeader === null ? NaN : Number(lengthHeader)
  if (declared > MAX_MULTIPART_BYTES) return uploadTooLarge()
  if (!request.body) return errorResponse(400, 'invalid_upload', 'The upload could not be read.')

  let source: ReadableStream<Uint8Array> = request.body
  let overLimit = false
  if (!Number.isFinite(declared)) {
    let seen = 0
    source = source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength
        if (seen > MAX_MULTIPART_BYTES) {
          overLimit = true
          controller.error(new Error('upload too large'))
        } else controller.enqueue(chunk)
      },
    }))
  }
  let form: FormData
  try {
    form = await new Response(source, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData()
  } catch {
    return overLimit ? uploadTooLarge() : errorResponse(400, 'invalid_upload', 'The upload could not be read.')
  }

  const recipe = form.get('recipe')
  if (typeof recipe !== 'string') return errorResponse(400, 'invalid_upload', 'The upload is missing the recipe fields.')
  const parsed = parseJson(recipe)
  if (parsed instanceof Response) return parsed
  const parts = form.getAll('files')
  const files = parts.filter((p): p is File => typeof p !== 'string')
  if (files.length !== parts.length) return errorResponse(400, 'invalid_upload', 'Files must be sent as file uploads.')
  return { body: parsed.body, files }
}

const readRequest = (request: Request): Promise<{ body: unknown; files: File[] } | Response> =>
  (request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')
    ? readMultipart(request)
    : readJson(request).then((r) => (r instanceof Response ? r : { body: r.body, files: [] }))

// The first bind is always the session user id (for the favourite flag in SELECT_RECIPE).
async function fetchRecipe(env: AppEnv, userId: string, id: string): Promise<RecipeRow | null> {
  return env.DB.prepare(`${SELECT_RECIPE} WHERE r.id = ?`).bind(userId, id).first<RecipeRow>()
}

async function loadFiles(env: AppEnv, recipeId: string): Promise<FileRow[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM recipe_files WHERE recipe_id = ? ORDER BY created_at, rowid',
  ).bind(recipeId).all<FileRow>()
  return results
}

/** The recipe as the client sees it (with its files), or null if it is gone. */
async function recipeView(env: AppEnv, user: SessionUser, id: string) {
  const [row, files] = await Promise.all([fetchRecipe(env, user.id, id), loadFiles(env, id)])
  return row ? detail(row, user, files) : null
}

/** GET /api/recipes?time=&categories=&q=&favourites=1 */
export async function listRecipes(request: Request, env: AppEnv, user: SessionUser): Promise<Response> {
  const params = new URL(request.url).searchParams
  const where: string[] = []
  const binds: unknown[] = [user.id] // first: the favourite flag in SELECT_RECIPE

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

  // favourites=1 keeps only the session user's own favourites. Any other value is no filter.
  if (params.get('favourites') === '1') {
    where.push('EXISTS (SELECT 1 FROM favourites f2 WHERE f2.recipe_id = r.id AND f2.user_id = ?)')
    binds.push(user.id)
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
  const recipe = await recipeView(env, user, id)
  if (!recipe) return errorResponse(404, 'not_found', 'Recipe not found')
  return json({ recipe })
}

const categoryInserts = (env: AppEnv, id: string, categories: Category[]) =>
  // Guarded on the recipe existing, so a failed (capped) insert leaves no stray rows.
  categories.map((c) =>
    env.DB.prepare(
      'INSERT INTO recipe_categories (recipe_id, category) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM recipes WHERE id = ?1)',
    ).bind(id, c),
  )

const FILES_CHANGED = () =>
  errorResponse(409, 'conflict', 'Your files changed while saving. Try again.')

export async function createRecipe(request: Request, env: AppEnv, user: SessionUser): Promise<Response> {
  if (!(await takeWriteToken(env, user.id))) return rateLimited()
  const parsed = await readRequest(request)
  if (parsed instanceof Response) return parsed
  const v = validateRecipeInput(parsed.body, parsed.files.length)
  if (!v.ok) return validationError(v.errors)
  const input: RecipeInput = v.value

  const id = crypto.randomUUID()
  const max = maxUserRecipes(env)
  if (parsed.files.length > 0) {
    // Cheap early refusal so a capped user's files are not written to R2 for nothing. The INSERT
    // below still enforces the cap atomically.
    const own = await env.DB.prepare('SELECT COUNT(*) AS c FROM recipes WHERE user_id = ?').bind(user.id).first<{ c: number }>()
    if ((own?.c ?? 0) >= max) return errorResponse(409, 'recipe_limit_reached', recipeLimitMessage(max))
  }
  const checked = await checkFiles(env, user.id, id, parsed.files, { count: 0, bytes: 0 }, 0)
  if (!checked.ok) return checked.response
  const { incoming } = checked

  // R2 first, D1 second: if anything after this fails the objects are deleted again, and a
  // recipe row is never visible without its files.
  const stored = await storeFiles(env, incoming)
  if (stored) return stored
  const keys = incoming.map((f) => f.key)

  const now = Date.now()
  let inserted
  try {
    // The recipe cap and the file caps are checked inside the statements themselves, so two
    // simultaneous creates cannot both pass. A file cap failure rolls the whole batch back.
    ;[inserted] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO recipes (id, user_id, title, time_tag, link, notes, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7
         WHERE (SELECT COUNT(*) FROM recipes WHERE user_id = ?2) < ?8`,
      ).bind(id, user.id, input.title, input.timeTag, input.link, input.notes, now, max),
      ...categoryInserts(env, id, input.categories),
      ...incoming.map((f) => fileInsert(env, id, user.id, now, f)),
    ])
  } catch (err) {
    await deleteObjects(env, keys, 'create failed')
    if (!isConstraintError(err)) throw err
    const again = await checkFiles(env, user.id, id, parsed.files, { count: 0, bytes: 0 }, 0)
    return again.ok ? FILES_CHANGED() : again.response
  }
  if (inserted.meta.changes === 0) {
    await deleteObjects(env, keys, 'recipe limit')
    return errorResponse(409, 'recipe_limit_reached', recipeLimitMessage(max))
  }
  const recipe = await recipeView(env, user, id)
  if (!recipe) throw new Error('created recipe not found')
  return json({ recipe }, 201)
}

/** Existence first (404), then ownership (403). */
async function loadOwned(
  env: AppEnv, user: SessionUser, id: string,
): Promise<{ row: RecipeRow } | Response> {
  const row = await fetchRecipe(env, user.id, id)
  if (!row) return errorResponse(404, 'not_found', 'Recipe not found')
  if (row.user_id !== user.id) return errorResponse(403, 'forbidden', 'You can only change recipes you added.')
  return { row }
}

/** removeFileIds (optional array of file ids of this recipe) -> the rows to remove, or a Response. */
function resolveRemovals(body: unknown, existing: FileRow[]): FileRow[] | Response {
  const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).removeFileIds : undefined
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.length > MAX_FILES_PER_RECIPE || !raw.every((x) => typeof x === 'string')) {
    return validationError({ removeFileIds: 'removeFileIds must be a list of file ids.' })
  }
  const ids = new Set(raw as string[])
  const removing = existing.filter((f) => ids.has(f.id))
  if (removing.length !== ids.size) {
    return validationError({ removeFileIds: 'One of the files to remove is not part of this recipe.' })
  }
  return removing
}

export async function updateRecipe(
  request: Request, env: AppEnv, user: SessionUser, id: string,
): Promise<Response> {
  if (!(await takeWriteToken(env, user.id))) return rateLimited()
  const owned = await loadOwned(env, user, id)
  if (owned instanceof Response) return owned
  const parsed = await readRequest(request)
  if (parsed instanceof Response) return parsed

  const existing = await loadFiles(env, id)
  const removing = resolveRemovals(parsed.body, existing)
  if (removing instanceof Response) return removing
  const removeIds = new Set(removing.map((f) => f.id))
  const kept = existing.filter((f) => !removeIds.has(f.id))
  const remaining = { count: kept.length, bytes: kept.reduce((n, f) => n + f.size, 0) }
  const removedBytes = removing.reduce((n, f) => n + f.size, 0)

  // Content rule counts the files left AFTER this edit (kept + new).
  const v = validateRecipeInput(parsed.body, remaining.count + parsed.files.length)
  if (!v.ok) return validationError(v.errors)
  const input = v.value

  const checked = await checkFiles(env, user.id, id, parsed.files, remaining, removedBytes)
  if (!checked.ok) return checked.response
  const { incoming } = checked
  const stored = await storeFiles(env, incoming)
  if (stored) return stored
  const newKeys = incoming.map((f) => f.key)

  const now = Date.now()
  let updated
  try {
    ;[updated] = await env.DB.batch([
      env.DB.prepare(
        `UPDATE recipes SET title = ?, time_tag = ?, link = ?, notes = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).bind(input.title, input.timeTag, input.link, input.notes, now, id, user.id),
      env.DB.prepare('DELETE FROM recipe_categories WHERE recipe_id = ?1 AND EXISTS (SELECT 1 FROM recipes WHERE id = ?1 AND user_id = ?2)').bind(id, user.id),
      ...categoryInserts(env, id, input.categories),
      // Removals come before inserts so the freed bytes count for the new files' cap checks.
      ...removing.map((f) =>
        env.DB.prepare('DELETE FROM recipe_files WHERE id = ?1 AND recipe_id = ?2 AND user_id = ?3').bind(f.id, id, user.id)),
      ...incoming.map((f: IncomingFile) => fileInsert(env, id, user.id, now, f)),
    ])
  } catch (err) {
    await deleteObjects(env, newKeys, 'edit failed')
    if (!isConstraintError(err)) throw err
    const again = await checkFiles(env, user.id, id, parsed.files, remaining, removedBytes)
    return again.ok ? FILES_CHANGED() : again.response
  }
  if (updated.meta.changes === 0) {
    await deleteObjects(env, newKeys, 'recipe gone')
    return errorResponse(404, 'not_found', 'Recipe not found')
  }
  // Committed. Only now are the removed files deleted from R2; a failure is logged, not raised.
  await deleteObjects(env, removing.map((f) => f.r2_key), 'file removed in edit')
  const recipe = await recipeView(env, user, id)
  if (!recipe) return errorResponse(404, 'not_found', 'Recipe not found')
  return json({ recipe })
}

export async function deleteRecipe(env: AppEnv, user: SessionUser, id: string): Promise<Response> {
  if (!(await takeWriteToken(env, user.id))) return rateLimited()
  const owned = await loadOwned(env, user, id)
  if (owned instanceof Response) return owned
  // Keys are read before the row goes (the file rows cascade away with it).
  const keys = (await loadFiles(env, id)).map((f) => f.r2_key)
  const res = await env.DB.prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?').bind(id, user.id).run()
  // Record first, files second. If R2 fails the user still sees success and the failure is logged.
  if (res.meta.changes > 0) await deleteObjects(env, keys, 'recipe deleted')
  return json({ ok: true })
}

const favouriteState = (favourite: boolean): Response => json({ favourite })

/**
 * PUT /api/recipes/:id/favourite. Idempotent. Any signed-in user may favourite any recipe. The
 * insert is guarded on the recipe still existing, so a delete racing this call gives a 404 and
 * never a foreign key error. Touches only the favourites table (not the recipe row or any cap).
 */
export async function setFavourite(env: AppEnv, user: SessionUser, id: string): Promise<Response> {
  if (!(await takeWriteToken(env, user.id))) return rateLimited()
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO favourites (user_id, recipe_id, created_at)
     SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM recipes WHERE id = ?2)`,
  ).bind(user.id, id, Date.now()).run()
  if (res.meta.changes === 0) {
    // Either already a favourite (a no-op) or the recipe does not exist.
    const exists = await env.DB.prepare('SELECT 1 AS x FROM recipes WHERE id = ?').bind(id).first()
    if (!exists) return errorResponse(404, 'not_found', 'Recipe not found')
  }
  return favouriteState(true)
}

/** DELETE /api/recipes/:id/favourite. Idempotent: un-favouriting a non-favourite is a 200 no-op. */
export async function clearFavourite(env: AppEnv, user: SessionUser, id: string): Promise<Response> {
  if (!(await takeWriteToken(env, user.id))) return rateLimited()
  const exists = await env.DB.prepare('SELECT 1 AS x FROM recipes WHERE id = ?').bind(id).first()
  if (!exists) return errorResponse(404, 'not_found', 'Recipe not found')
  await env.DB.prepare('DELETE FROM favourites WHERE user_id = ? AND recipe_id = ?').bind(user.id, id).run()
  return favouriteState(false)
}
