// Pure logic for the home tiles, the list pages, their URL filters and the back link. No DOM or React, so it is unit tested.
import { FOOD_TYPES, MEALS, TIME_TAGS, timeLabel } from './recipes'
import type { FoodType, Meal, RecipeSummary, TimeTag } from './recipes'

export const FAVOURITES_PATH = '/favourites'
export const EVERYTHING_PATH = '/everything'

/** "Dinner" becomes "dinner". */
export const mealSlug = (meal: Meal): string => meal.toLowerCase()
export const mealPath = (meal: Meal): string => `/meals/${mealSlug(meal)}`

/** The meal for a URL slug (any case), or null when it is not one of the fixed meals. */
export function mealFromSlug(slug: string | undefined): Meal | null {
  if (!slug) return null
  const lower = slug.toLowerCase()
  return MEALS.find((m) => mealSlug(m) === lower) ?? null
}

/** "Dinner" becomes "dinners", "Lunch" becomes "lunches"; "Baking" stays "baking". For lines like "No matching dinners". */
export function mealPlural(meal: Meal): string {
  const lower = mealSlug(meal)
  if (meal === 'Baking') return lower
  return /(ch|sh|s|x)$/.test(lower) ? `${lower}es` : `${lower}s`
}

// ---------------------------------------------------------------------------------------------------------------
// Home tiles

export interface TileCounts {
  /** The signed-in user's own hearted recipes. */
  favourites: number
  total: number
  /** A recipe with several meals counts in each, so these can add up to more than `total`. */
  meals: Record<Meal, number>
}

export function tileCounts(recipes: readonly RecipeSummary[], favouriteIds: ReadonlySet<string>): TileCounts {
  const meals = Object.fromEntries(MEALS.map((m) => [m, 0])) as Record<Meal, number>
  let favourites = 0
  for (const r of recipes) {
    if (favouriteIds.has(r.id)) favourites += 1
    for (const m of new Set(r.meals)) meals[m] += 1
  }
  return { favourites, total: recipes.length, meals }
}

/**
 * The `n` newest recipes by creation date, newest first. Ties (and unparseable dates) keep the order of the
 * input, which the list API already returns newest first (created_at DESC, rowid DESC). Does not mutate the input.
 */
export function justAdded(recipes: readonly RecipeSummary[], n = 3): RecipeSummary[] {
  const time = (r: RecipeSummary): number => {
    const t = Date.parse(r.createdAt)
    return Number.isNaN(t) ? -Infinity : t
  }
  return recipes
    .map((r, i) => ({ r, i, t: time(r) }))
    .sort((a, b) => (a.t === b.t ? a.i - b.i : b.t - a.t))
    .slice(0, Math.max(0, n))
    .map((x) => x.r)
}

/**
 * Up to `n` recipes the signed-in user has viewed (non-null `viewedAt`), most recently viewed first. Ties keep the
 * order of the input. Recipes never viewed are excluded, and so are ones whose `viewedAt` cannot be parsed as a date.
 * Does not mutate the input.
 */
export function recentlyViewed(recipes: readonly RecipeSummary[], n = 3): RecipeSummary[] {
  return recipes
    .map((r, i) => ({ r, i, t: r.viewedAt === null ? NaN : Date.parse(r.viewedAt) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => (a.t === b.t ? a.i - b.i : b.t - a.t))
    .slice(0, Math.max(0, n))
    .map((x) => x.r)
}

// ---------------------------------------------------------------------------------------------------------------
// Pages and filters

export type PageKind = { kind: 'meal'; meal: Meal } | { kind: 'everything' } | { kind: 'favourites' }
export type FilterKey = 'meal' | 'food' | 'time' | 'by'

/** The filters each page offers, in display order. */
export function filtersFor(page: PageKind): FilterKey[] {
  switch (page.kind) {
    case 'meal':
      return ['food', 'time', 'by']
    case 'everything':
      return ['meal', 'food', 'time', 'by']
    case 'favourites':
      return ['meal', 'time']
  }
}

export interface Filters {
  meal?: Meal
  food?: FoodType
  /** The stored TimeTag value (for example "Less than 30 mins"), not the short label. */
  time?: TimeTag
  /** A first name as carried on recipes (`addedBy`). */
  by?: string
}

/** Longest "by" value kept while the names are not loaded yet. */
const MAX_BY_LENGTH = 50

const oneOf = <T extends string>(list: readonly T[], value: string | null): T | undefined => list.find((v) => v === value)

/**
 * Reads filters from the URL query. Only keys the page offers are read; unknown keys, unknown values and empty
 * values are ignored. Values are matched exactly (case-sensitive) against the fixed lists, and only the list's own
 * value is returned, never the raw string.
 *
 * `by` is checked against `people` (the loaded first names). When `people` is null the names have not loaded yet,
 * so a non-empty value of up to 50 characters is kept as-is. That is safe because it is only ever compared for
 * equality with `addedBy` and shown as React text; the caller should parse again once the names load, which drops
 * a name nobody has.
 */
export function parseFilters(searchParams: URLSearchParams, page: PageKind, people: readonly string[] | null): Filters {
  const allowed = filtersFor(page)
  const out: Filters = {}
  if (allowed.includes('meal')) {
    const v = oneOf(MEALS, searchParams.get('meal'))
    if (v) out.meal = v
  }
  if (allowed.includes('food')) {
    const v = oneOf(FOOD_TYPES, searchParams.get('food'))
    if (v) out.food = v
  }
  if (allowed.includes('time')) {
    const v = oneOf(TIME_TAGS, searchParams.get('time'))
    if (v) out.time = v
  }
  if (allowed.includes('by')) {
    const raw = searchParams.get('by')
    if (raw) {
      if (people === null ? raw.length <= MAX_BY_LENGTH : people.includes(raw)) out.by = raw
    }
  }
  return out
}

/** A fresh query containing only the filters that are set, in a fixed order. Empty when none are set. */
export function writeFilters(searchParams: URLSearchParams, filters: Filters): URLSearchParams {
  void searchParams // Present so callers can pass the current query; unrelated keys are deliberately dropped.
  const out = new URLSearchParams()
  if (filters.meal) out.set('meal', filters.meal)
  if (filters.food) out.set('food', filters.food)
  if (filters.time) out.set('time', filters.time)
  if (filters.by) out.set('by', filters.by)
  return out
}

/**
 * Every set filter must match (AND), plus a case-insensitive "title contains" search, trimmed, as the list API does.
 * On a meal page the caller adds the page's meal: `applyFilters(list, { ...filters, meal }, search)`.
 */
export function applyFilters(recipes: readonly RecipeSummary[], filters: Filters, search: string): RecipeSummary[] {
  const q = search.trim().toLowerCase()
  return recipes.filter(
    (r) =>
      (!filters.meal || r.meals.includes(filters.meal)) &&
      (!filters.food || r.foodTypes.includes(filters.food)) &&
      (!filters.time || r.timeTag === filters.time) &&
      (!filters.by || r.addedBy === filters.by) &&
      (!q || r.title.toLowerCase().includes(q)),
  )
}

/**
 * The small line under a recipe title. Meal pages: "time · food type(s) · added-by". Elsewhere: "time · meals · added-by".
 * Missing parts are left out with no stray separators.
 */
export function rowLine(recipe: RecipeSummary, mode: 'meal-page' | 'with-meals'): string {
  const middle = mode === 'meal-page' ? recipe.foodTypes : recipe.meals
  return [timeLabel(recipe.timeTag), middle.join(', '), recipe.addedBy.trim()].filter((p) => p).join(' · ')
}

// ---------------------------------------------------------------------------------------------------------------
// Back link

export type BackLabel = 'All meals' | Meal | 'Favourites' | 'Everything'
export interface BackTarget {
  label: BackLabel
  /** An in-app path, with the filter query when there is one. */
  to: string
}
/** The shape put in router state when opening a recipe: `navigate(path, { state: { from } })`. */
export interface BackState {
  from: BackTarget
}

export const DEFAULT_BACK: BackTarget = { label: 'All meals', to: '/' }

/** No fragment, backslash or control characters. */
function isPlainQuery(value: string): boolean {
  return [...value].every((c) => c !== '#' && c !== '\\' && c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f)
}

function pathFor(label: BackLabel): string {
  if (label === 'All meals') return '/'
  if (label === 'Favourites') return FAVOURITES_PATH
  if (label === 'Everything') return EVERYTHING_PATH
  return mealPath(label)
}

/**
 * Validates untrusted router state (it survives reloads and can be set by a crafted history entry). The label must
 * be a known one and `to` must be exactly that label's path, optionally followed by a query string. Anything else
 * (other paths, absolute or protocol-relative URLs, fragments, backslashes, wrong path for the label) falls back
 * to "All meals" at "/".
 */
export function backTargetFromState(state: unknown): BackTarget {
  if (typeof state !== 'object' || state === null) return DEFAULT_BACK
  const from = (state as { from?: unknown }).from
  if (typeof from !== 'object' || from === null) return DEFAULT_BACK
  const { label, to } = from as { label?: unknown; to?: unknown }
  if (typeof label !== 'string' || typeof to !== 'string') return DEFAULT_BACK
  const known: BackLabel[] = ['All meals', ...MEALS, 'Favourites', 'Everything']
  const matched = known.find((l) => l === label)
  if (!matched) return DEFAULT_BACK
  const path = pathFor(matched)
  if (to === path) return { label: matched, to }
  // A query is only allowed on list pages, never on "/", and must be plain (no fragment, backslash or control characters).
  if (matched !== 'All meals' && to.startsWith(`${path}?`) && isPlainQuery(to)) return { label: matched, to }
  return DEFAULT_BACK
}
