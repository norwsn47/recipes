// Recipe types, the fixed lists, client-side validation (mirrors worker/recipe-validation.ts) and
// the API calls for recipes. All requests go through apiFetch so CSRF headers and 401 handling apply.
import { apiFetch } from './api'

export const TIME_TAGS = ['Less than 30 mins', 'Around 1 hr', 'Extensive prep'] as const
export type TimeTag = (typeof TIME_TAGS)[number]

/** What people see for each time tag. The stored and API values above never change. */
export const TIME_LABELS: Record<TimeTag, string> = {
  'Less than 30 mins': '< 30 mins',
  'Around 1 hr': '1 hr',
  'Extensive prep': '1 hr +',
}
export const timeLabel = (tag: TimeTag): string => TIME_LABELS[tag]

export const CATEGORIES = ['Breakfast', 'Chicken', 'Fish', 'Pork', 'Beef', 'Lamb', 'Dessert', 'Baking', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

export const MAX_TITLE = 100
export const MAX_LINK = 2000
export const MAX_NOTES = 2000

// File limits, mirroring the server (which also checks the real content and is authoritative).
export const MB = 1_048_576
export const MAX_FILES = 5
export const MAX_FILE_BYTES = 10 * MB
export const MAX_RECIPE_FILE_BYTES = 25 * MB
export const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.heic,application/pdf,image/png,image/jpeg,image/heic'

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('en-GB')} KB`
}

const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'heic']
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic']

/** A friendly reason a chosen file cannot be used, or null. Type and size only; count and total are checked by the caller. */
export function checkFile(file: { name: string; type: string; size: number }): string | null {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME.includes(file.type.toLowerCase())) {
    return `${file.name} is not a PDF, PNG, JPG or HEIC file.`
  }
  if (file.size === 0) return `${file.name} is empty.`
  if (file.size > MAX_FILE_BYTES) return `${file.name} is ${formatBytes(file.size)}. Each file can be up to 10 MB.`
  return null
}

export interface RecipeFile {
  id: string
  name: string
  contentType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/heic'
  size: number
  url: string
}

export interface RecipeSummary {
  id: string
  title: string
  timeTag: TimeTag
  categories: Category[]
  /** The author's first name only. */
  addedBy: string
  canEdit: boolean
  createdAt: string
  /** The stored web link (http or https), or null. Validated server-side on save. */
  link: string | null
  hasFiles: boolean
  /** The signed-in user's own favourite state. */
  favourite: boolean
}

export interface RecipeDetail extends RecipeSummary {
  notes: string | null
  files: RecipeFile[]
}

export interface RecipeInput {
  title: string
  timeTag: TimeTag | ''
  categories: Category[]
  link: string
  notes: string
}

export type FieldErrors = Partial<Record<'title' | 'timeTag' | 'categories' | 'link' | 'notes' | 'content' | 'body' | 'removeFileIds', string>>

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
  favourites?: boolean
}

export async function listRecipes(filters: ListFilters, signal?: AbortSignal): Promise<RecipeSummary[]> {
  const params = new URLSearchParams()
  if (filters.time) params.set('time', filters.time)
  if (filters.categories.length > 0) params.set('categories', filters.categories.join(','))
  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.favourites) params.set('favourites', '1')
  const qs = params.toString()
  const res = await apiFetch(`/api/recipes${qs ? `?${qs}` : ''}`, { signal })
  return (await readJson<{ recipes: RecipeSummary[] }>(res)).recipes
}

/** Sets or clears the signed-in user's favourite. Idempotent on the server. Resolves to the confirmed state. */
export async function setFavourite(id: string, on: boolean): Promise<boolean> {
  const res = await apiFetch(`/api/recipes/${encodeURIComponent(id)}/favourite`, { method: on ? 'PUT' : 'DELETE' })
  return (await readJson<{ favourite: boolean }>(res)).favourite
}

/**
 * Asks the server for a page title to suggest as the name. Never throws: any failure (bad link, rate limit,
 * network, signed out, aborted) returns null so the caller keeps its own guess and may try again.
 * A 200 returns the title, which can legitimately be ''. A 401 does not open the sign-in overlay
 * for this background call.
 */
export async function fetchLinkTitle(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await apiFetch('/api/link-title', { method: 'POST', json: { url }, signal, handleUnauthorised: true })
    if (!res.ok) return null
    const data = (await res.json()) as { title?: unknown }
    return typeof data.title === 'string' ? data.title.slice(0, MAX_TITLE) : ''
  } catch {
    return null
  }
}

export function isWebLink(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function getRecipe(id: string, signal?: AbortSignal): Promise<RecipeDetail> {
  const res = await apiFetch(`/api/recipes/${encodeURIComponent(id)}`, { signal })
  return (await readJson<{ recipe: RecipeDetail }>(res)).recipe
}

function body(input: RecipeInput) {
  return { title: input.title.trim(), timeTag: input.timeTag, categories: input.categories, link: input.link.trim(), notes: input.notes.trim() }
}

/** JSON when there are no new files; multipart (`recipe` text field plus one `files` part each) when there are. */
function payload(input: RecipeInput, files: File[], removeFileIds?: string[]): { json: unknown } | { form: FormData } {
  const recipe = removeFileIds && removeFileIds.length > 0 ? { ...body(input), removeFileIds } : body(input)
  if (files.length === 0) return { json: recipe }
  const form = new FormData()
  form.append('recipe', JSON.stringify(recipe))
  for (const f of files) form.append('files', f, f.name)
  return { form }
}

export async function createRecipe(input: RecipeInput, files: File[] = []): Promise<RecipeDetail> {
  const res = await apiFetch('/api/recipes', { method: 'POST', ...payload(input, files) })
  return (await readJson<{ recipe: RecipeDetail }>(res)).recipe
}

export async function updateRecipe(id: string, input: RecipeInput, files: File[] = [], removeFileIds: string[] = []): Promise<RecipeDetail> {
  const res = await apiFetch(`/api/recipes/${encodeURIComponent(id)}`, { method: 'PUT', ...payload(input, files, removeFileIds) })
  return (await readJson<{ recipe: RecipeDetail }>(res)).recipe
}

export async function deleteRecipe(id: string): Promise<void> {
  const res = await apiFetch(`/api/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw await toApiError(res)
}

/**
 * Mirrors the server rules. `fileCount` is the number of files the recipe will have after saving (kept plus new).
 */
export function validateRecipe(input: RecipeInput, fileCount = 0): FieldErrors {
  const errors: FieldErrors = {}
  const title = input.title.trim()
  const link = input.link.trim()
  const notes = input.notes.trim()
  if (!title) errors.title = 'Give the recipe a name.'
  else if (title.length > MAX_TITLE) errors.title = `Keep the name to ${MAX_TITLE} characters or fewer.`
  if (!input.timeTag) errors.timeTag = 'Choose how long it takes.'
  if (input.categories.length === 0) errors.categories = 'Choose at least one category.'
  if (link.length > MAX_LINK) errors.link = `Keep the link to ${MAX_LINK.toLocaleString('en-GB')} characters or fewer.`
  else if (link && !isWebLink(link)) errors.link = 'The link needs to be a web address starting with http:// or https://.'
  if (notes.length > MAX_NOTES) errors.notes = `Keep the notes to ${MAX_NOTES.toLocaleString('en-GB')} characters or fewer.`
  if (!errors.link && !errors.notes && !link && !notes && fileCount === 0) {
    errors.content = 'Add a link, some notes or a photo or PDF so there is something to cook from.'
  }
  return errors
}
