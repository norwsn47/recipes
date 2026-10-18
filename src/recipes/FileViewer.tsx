import { useEffect, useId, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@design-system/components'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Full-screen viewer for one file. The content scrolls natively and pinch-zoom is left to the
 * browser (touch-action allows it; index.html does not block user scaling). Escape or the Close
 * button closes it; focus is trapped inside and returned to the trigger; page scroll is locked.
 */
export function FileViewer({
  title,
  onClose,
  returnFocusTo,
  children,
}: {
  title: string
  onClose: () => void
  /** The element that opened the viewer; focused on close if it is still in the page. */
  returnFocusTo: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const opener = returnFocusTo.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root.current?.querySelector<HTMLElement>('button')?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = root.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!items || items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!root.current?.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [returnFocusTo])

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">{title}</p>
        <Button variant="secondary" onClick={onClose} aria-label="Close" className="min-w-11 shrink-0">
          Close
        </Button>
      </div>
      <div
        tabIndex={0}
        aria-label={`${title}, scrollable`}
        className="min-h-0 flex-1 overflow-auto bg-muted p-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        style={{ touchAction: 'pan-x pan-y pinch-zoom', overscrollBehavior: 'contain' }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
