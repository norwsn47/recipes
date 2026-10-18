import { useEffect, useId, useRef, useState } from 'react'

type MenuAction = { label: string; onSelect: () => void }

/**
 * A "..." button that opens a small menu of less-used actions.
 * Focus moves to the first item on open; Escape, Tab or a click outside closes it.
 * Escape returns focus to the button, and picking an item hands focus back to the button first,
 * so a dialog opened by the action returns focus there when it closes.
 */
export function OverflowMenu({ label = 'More actions', actions }: { label?: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return undefined
    items.current[0]?.focus()
    function onPointerDown(e: PointerEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) button.current?.focus()
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const list = items.current.filter((el): el is HTMLButtonElement => el !== null)
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') {
      // Let focus move on naturally; just close the menu.
      setOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      if (list.length === 0) return
      let next: number
      if (e.key === 'ArrowDown') next = (index + 1) % list.length
      else if (e.key === 'ArrowUp') next = (index - 1 + list.length) % list.length
      else if (e.key === 'Home') next = 0
      else next = list.length - 1
      list[next].focus()
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-lg border border-input text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-full z-20 mt-1 min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-float"
        >
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={(el) => {
                items.current[i] = el
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                close(true)
                a.onSelect()
              }}
              className="flex min-h-11 w-full items-center rounded-lg px-3 text-left font-medium hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
