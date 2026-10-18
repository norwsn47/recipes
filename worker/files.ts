// Uploaded files: content sniffing, name sanitising, limit checks, R2 helpers and the file route.
// Nothing here trusts the client's filename, extension or declared type.
import { errorResponse } from './http'
import type { AppEnv } from './http'
import {
  MAX_FILE_BYTES, MAX_FILES_PER_RECIPE, MAX_RECIPE_FILE_BYTES, MIB, STORAGE_FULL_MESSAGE,
  maxTotalStorageBytes, maxUserStorageBytes, userStorageMessage,
} from './limits'

export type AllowedType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/heic'

export interface FileRow {
  id: string
  recipe_id: string
  user_id: string
  r2_key: string
  original_name: string
  content_type: AllowedType
  size: number
  created_at: number
}

/** A validated upload, ready to be written to R2 and inserted. */
export interface IncomingFile {
  file: File
  name: string
  contentType: AllowedType
  size: number
  fileId: string
  key: string
}

// --- Content sniffing (first bytes only) ------------------------------------------------------

const ascii = (b: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...b.subarray(start, start + len))

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])
// Generic HEIF brands are shared with AVIF, so they only count if a HEIC brand is also listed.
const HEIF_GENERIC_BRANDS = new Set(['mif1', 'msf1'])

function isHeic(b: Uint8Array): boolean {
  if (b.length < 16 || ascii(b, 4, 4) !== 'ftyp') return false
  const boxSize = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0)
  if (boxSize < 16) return false
  const major = ascii(b, 8, 4)
  if (HEIC_BRANDS.has(major)) return true
  if (!HEIF_GENERIC_BRANDS.has(major)) return false
  const end = Math.min(boxSize, b.length)
  for (let i = 16; i + 4 <= end; i += 4) if (HEIC_BRANDS.has(ascii(b, i, 4))) return true
  return false
}

/** The allowed type that the bytes really are, or null. Needs the first 64 bytes. */
export function sniffType(b: Uint8Array): AllowedType | null {
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-') return 'application/pdf'
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return 'image/png'
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (isHeic(b)) return 'image/heic'
  return null
}

// --- Names ------------------------------------------------------------------------------------

const MAX_NAME_CHARS = 100

/** A safe display name: no path, control or direction-override characters, at most 100 characters. */
export function sanitiseName(raw: string): string {
  // Browsers escape quotes and line breaks in multipart filenames as %22, %0D and %0A; undo that.
  const unescaped = raw.replace(/%0[DA]/gi, '').replace(/%22/g, '"')
  const base = unescaped.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  const chars = [...cleaned]
  if (chars.length <= MAX_NAME_CHARS) return cleaned || 'file'
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(cleaned)?.[0] ?? ''
  return chars.slice(0, MAX_NAME_CHARS - [...ext].length).join('') + ext
}

function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%]/g, '_')
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

// --- Limit checks -----------------------------------------------------------------------------

const fileTooLarge = (name: string) =>
  errorResponse(413, 'file_too_large', `${name} is larger than ${MAX_FILE_BYTES / MIB} MB. Choose a smaller file.`)
export const recipeTooLarge = () =>
  errorResponse(413, 'recipe_files_too_large',
    `A recipe's files can total ${MAX_RECIPE_FILE_BYTES / MIB} MB at most (${MAX_FILE_BYTES / MIB} MB each). Remove a file or choose smaller ones.`)
const tooMany = () =>
  errorResponse(400, 'too_many_files', `A recipe can have ${MAX_FILES_PER_RECIPE} files at most.`)
const badType = (name: string) =>
  errorResponse(400, 'file_type_not_allowed', `${name} is not a PDF, PNG, JPG or HEIC file. Only those types can be uploaded.`)

/** What a recipe holds after an edit, before the new files are added. */
export interface Remaining { count: number; bytes: number }

/**
 * Validates the new files for one write, in this order: count, then each file in turn (size, then
 * content), then the recipe total, then the per-user and global caps. Reads only the first 64
 * bytes of each file. Returns the prepared files or the refusing Response. Nothing is stored here.
 * removedBytes (files being removed by the same edit) is credited against the user and global usage.
 */
export async function checkFiles(
  env: AppEnv, userId: string, recipeId: string, files: File[], remaining: Remaining, removedBytes: number,
): Promise<{ ok: true; incoming: IncomingFile[] } | { ok: false; response: Response }> {
  const refuse = (response: Response) => ({ ok: false as const, response })
  if (files.length === 0) return { ok: true, incoming: [] }
  if (remaining.count + files.length > MAX_FILES_PER_RECIPE) return refuse(tooMany())

  const incoming: IncomingFile[] = []
  let addBytes = 0
  for (const file of files) {
    const name = sanitiseName(file.name)
    if (file.size > MAX_FILE_BYTES) return refuse(fileTooLarge(name))
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer())
    const contentType = sniffType(head)
    if (!contentType) return refuse(badType(name))
    const fileId = crypto.randomUUID()
    incoming.push({ file, name, contentType, size: file.size, fileId, key: `recipes/${recipeId}/${fileId}` })
    addBytes += file.size
  }
  if (remaining.bytes + addBytes > MAX_RECIPE_FILE_BYTES) return refuse(recipeTooLarge())

  // One round trip for both sums; both read covering indexes only.
  const usage = await env.DB.prepare(
    `SELECT (SELECT COALESCE(SUM(size), 0) FROM recipe_files WHERE user_id = ?1) AS mine,
            (SELECT COALESCE(SUM(size), 0) FROM recipe_files) AS total`,
  ).bind(userId).first<{ mine: number; total: number }>()
  const mine = (usage?.mine ?? 0) - removedBytes + addBytes
  const total = (usage?.total ?? 0) - removedBytes + addBytes
  const userCap = maxUserStorageBytes(env)
  if (mine > userCap) return refuse(errorResponse(409, 'user_storage_limit_reached', userStorageMessage(userCap)))
  if (total > maxTotalStorageBytes(env)) return refuse(errorResponse(409, 'storage_full', STORAGE_FULL_MESSAGE))
  return { ok: true, incoming }
}

/**
 * INSERT for one new file. The caps are re-checked inside the statement itself: if any would be
 * broken the size becomes NULL, the NOT NULL constraint fails and D1 rolls the whole batch back
 * (so the recipe change is undone too). This makes the limits race-proof, not just pre-checked.
 * Inserts only if the recipe exists and belongs to the user.
 */
export const fileInsert = (env: AppEnv, recipeId: string, userId: string, now: number, f: IncomingFile) =>
  env.DB.prepare(
    `INSERT INTO recipe_files (id, recipe_id, user_id, r2_key, original_name, content_type, size, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6,
       CASE WHEN (SELECT COUNT(*) FROM recipe_files WHERE recipe_id = ?2) < ?9
             AND (SELECT COALESCE(SUM(size), 0) FROM recipe_files WHERE recipe_id = ?2) + ?7 <= ?10
             AND (SELECT COALESCE(SUM(size), 0) FROM recipe_files WHERE user_id = ?3) + ?7 <= ?11
             AND (SELECT COALESCE(SUM(size), 0) FROM recipe_files) + ?7 <= ?12
            THEN ?7 END,
       ?8
     WHERE EXISTS (SELECT 1 FROM recipes WHERE id = ?2 AND user_id = ?3)`,
  ).bind(
    f.fileId, recipeId, userId, f.key, f.name, f.contentType, f.size, now,
    MAX_FILES_PER_RECIPE, MAX_RECIPE_FILE_BYTES, maxUserStorageBytes(env), maxTotalStorageBytes(env),
  )

export const isConstraintError = (err: unknown): boolean =>
  err instanceof Error && /constraint/i.test(err.message)

// --- R2 ---------------------------------------------------------------------------------------

/** Writes every file to R2 (File bodies are passed through, never read into JS). All or nothing. */
export async function storeFiles(env: AppEnv, files: IncomingFile[]): Promise<Response | null> {
  const results = await Promise.allSettled(
    files.map((f) => env.FILES.put(f.key, f.file, { httpMetadata: { contentType: f.contentType } })),
  )
  const failed = results.find((r) => r.status === 'rejected')
  if (!failed) return null
  console.error('R2 put failed', { message: failed.reason instanceof Error ? failed.reason.message : 'unknown' })
  await deleteObjects(env, files.map((f) => f.key), 'write failed')
  return errorResponse(503, 'storage_unavailable', 'The files could not be saved right now. Try again in a moment.')
}

/** Best-effort R2 delete. A failure is logged (keys are ids only) and never thrown. */
export async function deleteObjects(env: AppEnv, keys: string[], reason: string): Promise<void> {
  if (keys.length === 0) return
  try {
    await env.FILES.delete(keys)
  } catch (err) {
    console.error('R2 delete failed; objects may be orphaned', {
      reason, keys, message: err instanceof Error ? err.message : 'unknown',
    })
  }
}

// --- Serving ----------------------------------------------------------------------------------

/** GET /api/recipes/:id/files/:fileId. Only files of an existing recipe are served. */
export async function getFile(
  request: Request, env: AppEnv, recipeId: string, fileId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT f.r2_key, f.original_name, f.content_type, f.size
     FROM recipe_files f JOIN recipes r ON r.id = f.recipe_id
     WHERE f.id = ?1 AND f.recipe_id = ?2`,
  ).bind(fileId, recipeId).first<Pick<FileRow, 'r2_key' | 'original_name' | 'content_type' | 'size'>>()
  if (!row) return errorResponse(404, 'not_found', 'File not found')

  const object = await env.FILES.get(row.r2_key)
  if (!object) {
    console.error('File row has no R2 object', { recipeId, fileId })
    return errorResponse(404, 'not_found', 'File not found')
  }
  const download = new URL(request.url).searchParams.get('download') === '1'
  return new Response(object.body, {
    headers: {
      'content-type': row.content_type,
      'content-length': String(row.size),
      // Inline by default (PDF, PNG, JPEG and HEIC, so Safari can preview HEIC); ?download=1 forces a save.
      'content-disposition': contentDisposition(download ? 'attachment' : 'inline', row.original_name),
      'cache-control': 'private, no-cache',
      'x-content-type-options': 'nosniff',
    },
  })
}
