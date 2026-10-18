// Server-side validation for recipe writes. Pure functions: nothing here touches the database.

export const TIME_TAGS = ['Less than 30 mins', 'Around 1 hr', 'Extensive prep'] as const
export const CATEGORIES = [
  'Breakfast', 'Chicken', 'Fish', 'Pork', 'Beef', 'Lamb', 'Dessert', 'Baking', 'Other',
] as const

export type TimeTag = (typeof TIME_TAGS)[number]
export type Category = (typeof CATEGORIES)[number]

export const MAX_TITLE = 100
export const MAX_LINK = 2000
export const MAX_NOTES = 2000
/** Sanity ceiling on the raw JSON body (generous: the fields above total about 4 KB). */
export const MAX_BODY_BYTES = 16 * 1024

export interface RecipeInput {
  title: string
  timeTag: TimeTag
  categories: Category[]
  link: string | null
  notes: string | null
}

export type FieldErrors = Record<string, string>

export const isTimeTag = (v: unknown): v is TimeTag => TIME_TAGS.includes(v as TimeTag)
export const isCategory = (v: unknown): v is Category => CATEGORIES.includes(v as Category)

/** Categories in the fixed list's order (stable output regardless of request order). */
export const sortCategories = (cats: readonly string[]): Category[] =>
  CATEGORIES.filter((c) => cats.includes(c))

/**
 * Content rule: at least one of link, notes or files. Stage B passes the file count (on edit,
 * the files that will remain after the edit); until then there are never any files.
 */
export const meetsContentRule = (link: string | null, notes: string | null, fileCount: number): boolean =>
  link !== null || notes !== null || fileCount > 0

const NO_CONTENT_MESSAGE = 'Add a link, notes or a file. A recipe needs at least one of them.'

function optionalText(
  raw: unknown,
  field: string,
  label: string,
  max: number,
  errors: FieldErrors,
): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') {
    errors[field] = `${label} must be text.`
    return null
  }
  const text = raw.trim()
  if (text.length > max) {
    errors[field] = `${label} must be ${max.toLocaleString('en-GB')} characters or fewer.`
    return null
  }
  return text === '' ? null : text
}

function validLink(link: string): boolean {
  try {
    const u = new URL(link)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validates a create/replace body. Unknown keys (addedBy, userId, createdAt, ...) are ignored
 * because only the named fields are read. Returns the cleaned input or a map of field errors.
 */
export function validateRecipeInput(
  body: unknown,
  existingFileCount = 0,
): { ok: true; value: RecipeInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: { body: 'Send the recipe as a JSON object.' } }
  }
  const b = body as Record<string, unknown>

  let title = ''
  if (typeof b.title !== 'string' || b.title.trim() === '') errors.title = 'Enter a title.'
  else if (b.title.trim().length > MAX_TITLE) errors.title = `Title must be ${MAX_TITLE} characters or fewer.`
  else title = b.title.trim()

  let timeTag: TimeTag = TIME_TAGS[0]
  if (!isTimeTag(b.timeTag)) errors.timeTag = `Choose one time: ${TIME_TAGS.join(', ')}.`
  else timeTag = b.timeTag

  let categories: Category[] = []
  if (!Array.isArray(b.categories) || b.categories.length === 0) {
    errors.categories = 'Choose at least one category.'
  } else if (b.categories.length > CATEGORIES.length * 4) {
    errors.categories = 'Too many categories.'
  } else if (!b.categories.every(isCategory)) {
    errors.categories = `Categories must come from: ${CATEGORIES.join(', ')}.`
  } else {
    categories = sortCategories(b.categories) // duplicates collapse
  }

  const link = optionalText(b.link, 'link', 'Link', MAX_LINK, errors)
  if (link !== null && !errors.link && !validLink(link)) {
    errors.link = 'Link must be a web address starting with http:// or https://.'
  }
  const notes = optionalText(b.notes, 'notes', 'Notes', MAX_NOTES, errors)

  // Only report the content rule when the link/notes themselves were not already invalid.
  if (!errors.link && !errors.notes && !meetsContentRule(link, notes, existingFileCount)) {
    errors.content = NO_CONTENT_MESSAGE
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { title, timeTag, categories, link, notes } }
}
