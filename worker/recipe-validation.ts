// Server-side validation for recipe writes. Pure functions: nothing here touches the database.

export const TIME_TAGS = ['Less than 30 mins', 'Around 1 hr', 'Extensive prep'] as const
export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Baking'] as const
export const FOOD_TYPES = ['Chicken', 'Fish', 'Pork', 'Beef', 'Lamb', 'Vegetarian'] as const

export type TimeTag = (typeof TIME_TAGS)[number]
export type Meal = (typeof MEALS)[number]
export type FoodType = (typeof FOOD_TYPES)[number]

export const MAX_TITLE = 100
export const MAX_LINK = 2000
/** Limit on the visible text of the notes (markup does not count). */
export const MAX_NOTES = 2000
/** Limit on the stored string of rich-text notes, markup included. Stops abuse such as thousands of tags. */
export const MAX_NOTES_RAW = 8000
/**
 * Sanity ceiling on the raw JSON body. Worst case in bytes: title 100 + link 2,000 + rich notes 8,000
 * characters, each written as up to 6 bytes (a \uXXXX escape) is about 61 KB, so 64 KB leaves headroom.
 */
export const MAX_BODY_BYTES = 64 * 1024

export interface RecipeInput {
  title: string
  timeTag: TimeTag
  meals: Meal[]
  foodTypes: FoodType[]
  link: string | null
  notes: string | null
}

export type FieldErrors = Record<string, string>

export const isTimeTag = (v: unknown): v is TimeTag => TIME_TAGS.includes(v as TimeTag)
export const isMeal = (v: unknown): v is Meal => MEALS.includes(v as Meal)
export const isFoodType = (v: unknown): v is FoodType => FOOD_TYPES.includes(v as FoodType)

/** Tags in the fixed list's order (stable output regardless of request or row order). */
export const sortMeals = (meals: readonly string[]): Meal[] => MEALS.filter((m) => meals.includes(m))
export const sortFoodTypes = (types: readonly string[]): FoodType[] => FOOD_TYPES.filter((t) => types.includes(t))

/** Validates one tag list: array, known values, no duplicates. Returns an error message or null. */
function tagListError(raw: unknown[], known: readonly string[], label: string): string | null {
  if (!raw.every((v) => typeof v === 'string' && known.includes(v))) {
    return `${label} must come from: ${known.join(', ')}.`
  }
  if (new Set(raw).size !== raw.length) return `${label} must not repeat a value.`
  return null
}

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

const NOTES_RICH_ERROR = 'Notes can only use bold, bullet lists and numbered lists.'
const NOTES_RAW_ERROR = 'Those notes have too much formatting. Remove some and try again.'
const MAX_LIST_DEPTH = 6

/** True when the (trimmed) notes are rich text: they start with exactly <p>, <ul> or <ol>. Else legacy plain text. */
export const isHtmlNotes = (notes: string): boolean => /^<(?:p|ul|ol)>/.test(notes.trim())

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: '\u00a0', quot: '"', '#39': "'" }
const TAG_RE = /<(\/?)(p|strong|ul|ol|li|br)>/y
const ENTITY_RE = /&(amp|lt|gt|nbsp|quot|#39);/y

/** Whether a new tag may open inside the current parent ('' means top level). */
function mayOpen(tag: string, parent: string): boolean {
  switch (tag) {
    case 'p': case 'ul': case 'ol': return parent === '' || parent === 'li'
    case 'li': return parent === 'ul' || parent === 'ol'
    case 'strong': return parent === 'p'
    default: return parent === 'p' || parent === 'strong' // br
  }
}

/**
 * Strictly parses the rich-text subset. Returns the visible text (tags removed, entities decoded,
 * nothing added between blocks, the same as ProseMirror's doc.textContent) or null if the markup
 * is outside the subset. Text is only allowed inside p and strong.
 */
export function parseNotesHtml(html: string): string | null {
  const stack: string[] = []
  let text = ''
  let lists = 0
  let i = 0
  while (i < html.length) {
    const ch = html[i]
    if (ch === '<') {
      TAG_RE.lastIndex = i
      const m = TAG_RE.exec(html)
      if (!m) return null
      const [whole, slash, tag] = m
      if (tag === 'br') {
        if (slash || !mayOpen('br', stack[stack.length - 1] ?? '')) return null
      } else if (slash) {
        if (stack.pop() !== tag) return null
        if (tag === 'ul' || tag === 'ol') lists--
      } else {
        if (!mayOpen(tag, stack[stack.length - 1] ?? '')) return null
        stack.push(tag)
        if (tag === 'ul' || tag === 'ol') {
          lists++
          if (lists > MAX_LIST_DEPTH) return null
        }
      }
      i += whole.length
    } else {
      const parent = stack[stack.length - 1]
      if (parent !== 'p' && parent !== 'strong') return null
      if (ch === '&') {
        ENTITY_RE.lastIndex = i
        const m = ENTITY_RE.exec(html)
        if (!m) return null
        text += ENTITIES[m[1]]
        i += m[0].length
      } else {
        text += ch
        i++
      }
    }
  }
  return stack.length === 0 ? text : null
}

/** The notes' visible text (trimmed plain text, or decoded rich text), or null for invalid rich text. */
export function notesVisibleText(notes: string): string | null {
  const t = notes.trim()
  return isHtmlNotes(t) ? parseNotesHtml(t) : t
}

/** UTF-16 length of the visible text, or null for invalid rich text. */
export const notesVisibleLength = (notes: string): number | null => notesVisibleText(notes)?.length ?? null

/** Validates the notes field. Returns the value to store (exactly as submitted, trimmed) or null. */
function validNotes(raw: unknown, errors: FieldErrors): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') {
    errors.notes = 'Notes must be text.'
    return null
  }
  const notes = raw.trim()
  if (isHtmlNotes(notes) && notes.length > MAX_NOTES_RAW) {
    errors.notes = NOTES_RAW_ERROR
    return null
  }
  const visible = notesVisibleText(notes)
  if (visible === null) {
    errors.notes = NOTES_RICH_ERROR
    return null
  }
  if (visible.length > MAX_NOTES) {
    errors.notes = `Notes must be ${MAX_NOTES.toLocaleString('en-GB')} characters or fewer.`
    return null
  }
  return visible.trim() === '' ? null : notes
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

  if ('categories' in b) {
    errors.categories = 'Categories are no longer used. Send meals and foodTypes instead.'
  }

  let meals: Meal[] = []
  if (!Array.isArray(b.meals) || b.meals.length === 0) {
    errors.meals = 'Choose at least one meal.'
  } else {
    const bad = tagListError(b.meals, MEALS, 'Meals')
    if (bad) errors.meals = bad
    else meals = sortMeals(b.meals as string[])
  }

  let foodTypes: FoodType[] = []
  if (b.foodTypes !== undefined && b.foodTypes !== null) {
    if (!Array.isArray(b.foodTypes)) {
      errors.foodTypes = 'Food types must be a list.'
    } else {
      const bad = tagListError(b.foodTypes, FOOD_TYPES, 'Food types')
      if (bad) errors.foodTypes = bad
      else foodTypes = sortFoodTypes(b.foodTypes as string[])
    }
  }

  const link = optionalText(b.link, 'link', 'Link', MAX_LINK, errors)
  if (link !== null && !errors.link && !validLink(link)) {
    errors.link = 'Link must be a web address starting with http:// or https://.'
  }
  const notes = validNotes(b.notes, errors)

  // Only report the content rule when the link/notes themselves were not already invalid.
  if (!errors.link && !errors.notes && !meetsContentRule(link, notes, existingFileCount)) {
    errors.content = NO_CONTENT_MESSAGE
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { title, timeTag, meals, foodTypes, link, notes } }
}
