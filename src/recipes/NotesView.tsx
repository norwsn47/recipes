import { EditorContent, useEditor } from '@tiptap/react'
import { legacyPlainToHtml } from '../lib/notes'
import { notesExtensions } from '../lib/notesExtensions'

/**
 * Shows a recipe's notes. Rich text and legacy plain text both go through the editor's schema (read-only),
 * so only paragraphs, bold and lists can appear, and never raw HTML. Use `key={notes}` so a new recipe gets a fresh editor.
 */
export function NotesView({ notes }: { notes: string }) {
  const editor = useEditor({
    extensions: notesExtensions,
    content: legacyPlainToHtml(notes),
    parseOptions: { preserveWhitespace: 'full' },
    editable: false,
    injectCSS: false,
    // A read-only block of text, not a text box; contenteditable=false means it is not a tab stop.
    editorProps: { attributes: { role: 'document', class: 'notes-doc [overflow-wrap:anywhere]' } },
  })
  return <EditorContent editor={editor} />
}
