import type { AppEnv } from './http'

export const DEFAULT_MAX_USER_RECIPES = 50
export const DEFAULT_WRITE_RATE_PER_MINUTE = 20
const RATE_WINDOW_MS = 60_000

/** Positive whole number from a config string, else the default (unset, empty, junk, zero, negative). */
export function positiveInt(value: string | undefined, fallback: number): number {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value.trim())) return fallback
  const n = Number(value.trim())
  return n > 0 ? n : fallback
}

export const maxUserRecipes = (env: AppEnv): number =>
  positiveInt(env.MAX_USER_RECIPES, DEFAULT_MAX_USER_RECIPES)

export const writeRatePerMinute = (env: AppEnv): number =>
  positiveInt(env.WRITE_RATE_PER_MINUTE, DEFAULT_WRITE_RATE_PER_MINUTE)

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
