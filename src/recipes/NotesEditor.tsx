import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { legacyPlainToHtml, normaliseEditorNotes } from '../lib/notes'
import { notesExtensions } from '../lib/notesExtensions'

interface Props {
  /** Stored notes (rich text or legacy plain text). Read once, when the editor opens. */
  initial: string
  /** Called on every edit with the rich text, or '' when there is no visible text. */
  onChange(html: string): void
  autoFocus?: boolean
  // Passed in by Field.
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

// Small, plain icon buttons in a slim bar inside the box (owner's choice, 28 November 2026: smaller than the
// system's 44px touch target, so not the design-system Button). The icon is the visible label; aria-label carries the name.
const toolButton =
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors ' +
  'hover:bg-muted hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring'

const iconProps = {
  'aria-hidden': true,
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Outline capital B, in the same line style as the list icons. Decorative: the button carries the label. */
function BoldIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h6.5a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  )
}

/** Bulleted list: three dots and three lines. Decorative. */
function BulletListIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="0.9" fill="currentColor" />
      <circle cx="4.5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="4.5" cy="18" r="0.9" fill="currentColor" />
    </svg>
  )
}

/** Numbered list: a small 1 and 2 beside three lines. Decorative. */
function NumberedListIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M3.75 4.75 5 4v5" strokeWidth={1.5} />
      <path d="M3.5 14.5a1.25 1.25 0 0 1 2.5 0c0 1-2.5 2-2.5 4H6" strokeWidth={1.5} />
    </svg>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e.isActive('bold'), bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList') }),
  })
  // onMouseDown stops the tap taking focus (and the selection) away from the text. Keyboard use goes through click.
  const keep = (e: React.MouseEvent) => e.preventDefault()
  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 border-b border-border bg-muted/50 px-1.5 py-1">
      <button type="button" className={toolButton} aria-label="Bold" title="Bold (Ctrl or Cmd + B)" aria-pressed={active.bold} onMouseDown={keep} onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon />
      </button>
      <div aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      <button type="button" className={toolButton} aria-label="Bulleted list" title="Bulleted list" aria-pressed={active.bullet} onMouseDown={keep} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <BulletListIcon />
      </button>
      <button type="button" className={toolButton} aria-label="Numbered list" title="Numbered list" aria-pressed={active.ordered} onMouseDown={keep} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <NumberedListIcon />
      </button>
    </div>
  )
}

/** A small rich-text box for recipe notes: bold, bullets and numbers only. Looks like the design system's Textarea. */
export function NotesEditor({ initial, onChange, autoFocus, id, 'aria-describedby': describedBy, 'aria-invalid': invalid }: Props) {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  const editor = useEditor({
    extensions: notesExtensions,
    // Legacy plain text is converted for editing. Nothing is sent back until the person edits.
    content: legacyPlainToHtml(initial),
    // Whitespace kept as typed (the HTML has none between tags).
    parseOptions: { preserveWhitespace: 'full' },
    autofocus: autoFocus ? 'end' : false,
    // The default style tag would be blocked by our CSP; the unlayered .notes-doc rules in index.css (after Tailwind, so they beat preflight) replace it.
    injectCSS: false,
    editorProps: {
      attributes: { ...(id ? { id } : {}), 'aria-label': 'Notes', 'aria-multiline': 'true', class: 'notes-doc min-h-40 px-3 py-2 outline-none' },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(normaliseEditorNotes(e.getHTML())),
  })

  // Field's hint and error wiring lives on the editable element itself.
  useEffect(() => {
    const dom = editor.view.dom
    if (describedBy) dom.setAttribute('aria-describedby', describedBy)
    else dom.removeAttribute('aria-describedby')
    if (invalid) dom.setAttribute('aria-invalid', 'true')
    else dom.removeAttribute('aria-invalid')
  }, [editor, describedBy, invalid])

  return (
    // One box: the toolbar sits along the top edge, the text below it.
    <div className="overflow-hidden rounded-lg border border-input bg-background text-base text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring has-[[aria-invalid=true]]:border-destructive">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
