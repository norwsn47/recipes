// Recipe types, the fixed lists, client-side validation (mirrors worker/recipe-validation.ts) and
// the API calls for recipes. All requests go through apiFetch so CSRF headers and 401 handling apply.
import { apiFetch } from './api'

export const TIME_TAGS = ['Less than 30 mins', 'Around 1 hr', 'Extensive prep'] as const
export type TimeTag = (typeof TIME_TAGS)[number]

export const CATEGORIES = ['Breakfast', 'Chicken', 'Fish', 'Pork', 'Beef', 'Lamb', 'Dessert', 'Baking', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

export const MAX_TITLE = 100
export const MAX_LINK = 2000
export const MAX_NOTES = 2000

export interface RecipeSummary {
  id: string
  title: string
  timeTag: TimeTag
  categories: Category[]
  addedBy: string
  ownerId: string
  canEdit: boolean
  createdAt: string
  hasLink: boolean
  hasNotes: boolean
  hasFiles: boolean
}

export interface RecipeDetail extends RecipeSummary {
  link: string | null
  notes: string | null
  updatedAt: string
  files: unknown[]
}

export interface RecipeInput {
  title: string
  timeTag: TimeTag | ''
  categories: Category[]
  link: string
  notes: string
}

export type FieldErrors = Partial<Record<'title' | 'timeTag' | 'categories' | 'link' | 'notes' | 'content' | 'body', string>>

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldErrors = {},
  ) {
    super(message)
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string; fields?: FieldErrors } }
    return new ApiError(res.status, data.error?.code ?? 'error', data.error?.message ?? 'Something went wrong.', data.error?.fields ?? {})
  } catch {
    return new ApiError(res.status, 'error', 'Something went wrong.')
  }
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}

export interface ListFilters {
  time: TimeTag | null
  categories: Category[]
  q: string
}

export async function listRecipes(filters: ListFilters, signal?: AbortSignal): Promise<RecipeSummary[]> {
  const params = new URLSearchParams()
  if (filters.time) params.set('time', filters.time)
  if (filters.categories.length > 0) params.set('categories', filters.categories.join(','))
  if (filters.q.trim()) params.set('q', filters.q.trim())
  const qs = params.toString()
  const res = await apiFetch(`/api/recipes${qs ? `?${qs}` : ''}`, { signal })
  return (await readJson<{ recipes: RecipeSummary[] }>(res)).recipes
}

export async function getRecipe(id: string, signal?: AbortSignal): Promise<RecipeDetail> {
  const res = await apiFetch(`/api/recipes/${encodeURIComponent(id)}`, { signal })
  return (await readJson<{ recipe: RecipeDetail }>(res)).recipe
}

function body(input: RecipeInput) {
  return { title: input.title.trim(), timeTag: input.timeTag, categories: input.categories, link: input.link.trim(), notes: input.notes.trim() }
}

export async function createRecipe(input: RecipeInput): Promise<RecipeDetail> {
  const res = await apiFetch('/api/recipes', { method: 'POST', json: body(input) })
  return (await readJson<{ recipe: RecipeDetail }>(res)).recipe
}

export async function updateRecipe(id: string, input: RecipeInput): Promise<RecipeDetail> {
  const res = await apiFetch(`/api/recipes/${encodeURIComponent(id)}`, { method: 'PUT', json: body(input) })
  return (await readJson<{ recipe: RecipeDetail }>(res)).recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  const res = await apiFetch(`/api/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw await toApiError(res)
}

function isWebLink(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Mirrors the server rules. `fileCount` is for stage B (files count towards the content rule).
 */
export function validateRecipe(input: RecipeInput, fileCount = 0): FieldErrors {
  const errors: FieldErrors = {}
  const title = input.title.trim()
  const link = input.link.trim()
  const notes = input.notes.trim()
  if (!title) errors.title = 'Give the recipe a title.'
  else if (title.length > MAX_TITLE) errors.title = `Keep the title to ${MAX_TITLE} characters or fewer.`
  if (!input.timeTag) errors.timeTag = 'Choose how long it takes.'
  if (input.categories.length === 0) errors.categories = 'Choose at least one category.'
  if (link.length > MAX_LINK) errors.link = `Keep the link to ${MAX_LINK.toLocaleString('en-GB')} characters or fewer.`
  else if (link && !isWebLink(link)) errors.link = 'The link needs to be a web address starting with http:// or https://.'
  if (notes.length > MAX_NOTES) errors.notes = `Keep the notes to ${MAX_NOTES.toLocaleString('en-GB')} characters or fewer.`
  if (!errors.link && !errors.notes && !link && !notes && fileCount === 0) {
    errors.content = 'Add a link or some notes so there is something to cook from.'
  }
  return errors
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
