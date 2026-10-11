import type { AppEnv } from './http'

export const DEFAULT_MAX_USER_RECIPES = 50
export const DEFAULT_WRITE_RATE_PER_MINUTE = 20
const RATE_WINDOW_MS = 60_000

/** Positive whole number from a config string, else the default (unset, empty, junk, zero, negative). */
export function positiveInt(value: string | undefined, fallback: number, maxDigits = 9): number {
  if (typeof value !== 'string' || !new RegExp(`^\\d{1,${maxDigits}}$`).test(value.trim())) return fallback
  const n = Number(value.trim())
  return n > 0 ? n : fallback
}

export const maxUserRecipes = (env: AppEnv): number =>
  positiveInt(env.MAX_USER_RECIPES, DEFAULT_MAX_USER_RECIPES)

export const writeRatePerMinute = (env: AppEnv): number =>
  positiveInt(env.WRITE_RATE_PER_MINUTE, DEFAULT_WRITE_RATE_PER_MINUTE)

// File rules: product constants (not configuration). "MB" here means 1,048,576 bytes.
const MIB = 1024 * 1024
export const MAX_FILES_PER_RECIPE = 5
export const MAX_FILE_BYTES = 10 * MIB
export const MAX_RECIPE_FILE_BYTES = 25 * MIB
/** Room for the recipe JSON (16 KB), part headers and boundaries on top of 25 MB of files. */
export const MAX_MULTIPART_BYTES = MAX_RECIPE_FILE_BYTES + 64 * 1024

export const DEFAULT_MAX_USER_STORAGE_BYTES = 100 * MIB
export const DEFAULT_MAX_TOTAL_STORAGE_BYTES = 5 * 1024 * MIB

// Byte caps can exceed nine digits (5 GB is ten), so allow up to 15 (still a safe integer).
export const maxUserStorageBytes = (env: AppEnv): number =>
  positiveInt(env.MAX_USER_STORAGE_BYTES, DEFAULT_MAX_USER_STORAGE_BYTES, 15)

export const maxTotalStorageBytes = (env: AppEnv): number =>
  positiveInt(env.MAX_TOTAL_STORAGE_BYTES, DEFAULT_MAX_TOTAL_STORAGE_BYTES, 15)

export const STORAGE_FULL_MESSAGE =
  "The app's shared storage is full, so this file could not be saved. Ask the owner to free up space."

export const userStorageMessage = (maxBytes: number): string => {
  const mb = maxBytes / MIB
  const text = Number.isInteger(mb) ? String(mb) : mb.toFixed(1)
  return `You have reached your ${text} MB upload limit. Delete a file or recipe you no longer need, then try again.`
}

export const recipeLimitMessage = (max: number): string =>
  `You have reached the limit of ${max} recipes. Delete one to add another.`

export const RATE_LIMIT_MESSAGE = 'You are doing that too fast. Wait a minute and try again.'

/**
 * Fixed-window write rate limit, shared by all isolates because the counter lives in D1.
 * One atomic upsert per write request. When the user is over the limit the WHERE clause makes the
 * statement a no-op (no row returned, no row written), so a flood of rejected requests costs no
 * D1 writes. Returns true if the write may proceed.
 */
export async function takeWriteToken(env: AppEnv, userId: string, now = Date.now()): Promise<boolean> {
  const cutoff = now - RATE_WINDOW_MS
  const row = await env.DB.prepare(
    `INSERT INTO write_rate_limits (user_id, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(user_id) DO UPDATE SET
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END,
       count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END
     WHERE window_start <= ?3 OR count < ?4
     RETURNING count`,
  )
    .bind(userId, now, cutoff, writeRatePerMinute(env))
    .first<{ count: number }>()
  return row !== null
}
