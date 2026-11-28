// The one Tiptap configuration for notes, shared by the editor and the read-only view so they cannot drift.
// Only document, paragraph, text, bold, bullet list, ordered list, list item, hard break and undo/redo exist,
// which is exactly the HTML subset the server accepts. Anything else (headings, links, italic, images, styles)
// has no place in the schema, so it is dropped when pasted or loaded.
import StarterKit from '@tiptap/starter-kit'
import { ListItem, OrderedList } from '@tiptap/extension-list'
import type { Extensions } from '@tiptap/react'

// Same as the stock list item, but without Tab and Shift-Tab (sink and lift), so Tab always leaves the editor.
const SimpleListItem = ListItem.extend({
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.splitListItem(this.name) }
  },
})

// Same as the stock numbered list, but without its start and type attributes. Typing "3. " or pasting <ol start="3">
// would otherwise write <ol start="3">, and the server accepts no attributes at all.
const PlainOrderedList = OrderedList.extend({
  addAttributes() {
    return {}
  },
})

export const notesExtensions: Extensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: false,
    horizontalRule: false,
    italic: false,
    link: false,
    listItem: false,
    orderedList: false,
    // Its only extra behaviour is Tab handling, which would trap focus; plain ProseMirror Backspace and Enter still work.
    listKeymap: false,
    strike: false,
    trailingNode: false,
    underline: false,
  }),
  SimpleListItem,
  PlainOrderedList,
]
