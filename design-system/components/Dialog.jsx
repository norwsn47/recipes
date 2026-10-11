import { useEffect, useId, useRef } from 'react'

// A confirmation sheet / modal with the accessibility basics done once:
// role="dialog", aria-modal, aria-labelledby, autofocus, Escape and backdrop close,
// a Tab focus trap, and focus returned to whatever opened it. A bottom sheet on phones.
const focusable = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({ open, onClose, title, children }) {
  const titleId = useId()
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const first = panel.current?.querySelector(focusable)
    ;(first || panel.current)?.focus()

    function onKey(e) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = panel.current?.querySelectorAll(focusable)
      if (!items || items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-t-lg bg-popover p-6 text-popover-foreground shadow-float sm:rounded-lg"
      >
        <h2 id={titleId} className="mb-3 text-2xl">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
