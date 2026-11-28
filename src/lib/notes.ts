// Pure helpers for recipe notes. Notes are stored either as a small HTML subset (rich text written by the
// editor: p, strong, ul, ol, li, br, no attributes) or as legacy plain text. These mirror the rules in
// worker/recipe-validation.ts, which is authoritative. No Tiptap import here, so tests can load it cheaply.

/** Limit on the visible text (markup does not count). */
export const MAX_NOTES = 2000
/** Limit on the stored HTML string, markup included. */
export const MAX_NOTES_RAW = 8000

/** True when the (trimmed) notes are rich text: they start with exactly <p>, <ul> or <ol>. Else legacy plain text. */
export const isHtmlNotes = (notes: string): boolean => /^<(?:p|ul|ol)>/.test(notes.trim())

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', '#39': "'" }

const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The notes' visible text: plain text as it is (trimmed), or for rich text the text with tags removed and
 * entities decoded, with nothing added between blocks (the same as ProseMirror's doc.textContent and the server).
 * Rich text here always comes from the editor or the server, so no strict parse is needed.
 */
export function notesVisibleText(notes: string): string {
  const t = notes.trim()
  if (!isHtmlNotes(t)) return t
  return t.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|nbsp|quot|#39);/g, (_m, name: string) => ENTITIES[name])
}

/** UTF-16 length of the visible text. */
export const notesVisibleLength = (notes: string): number => notesVisibleText(notes).length

/** Whether there is anything to read: visible text that is not only whitespace. */
export const hasVisibleNotes = (notes: string): boolean => notesVisibleText(notes).trim() !== ''

/**
 * Turns legacy plain text into rich-text HTML for the editor, losing no text.
 * Text is escaped (&, <, >), so "<3" and "< 30 mins" stay as written. Every non-empty line becomes its own
 * paragraph, so single newlines and blank lines both become a paragraph break (blank lines are not kept as
 * empty paragraphs). Whitespace-only lines are dropped. Rich text passes through unchanged.
 */
export function legacyPlainToHtml(notes: string): string {
  if (isHtmlNotes(notes)) return notes
  return notes
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => `<p>${escapeText(line)}</p>`)
    .join('')
}

/** What to keep in the form and send to the server for the editor's HTML: '' when there is no visible text. */
export const normaliseEditorNotes = (html: string): string => (hasVisibleNotes(html) ? html.trim() : '')
