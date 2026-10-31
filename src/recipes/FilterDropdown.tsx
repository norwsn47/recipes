import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Option = { value: string; label: string }

const MENU_WIDTH = 224 // min-w-56
const EDGE = 16

/**
 * A filter chip that opens a dropdown ticklist below it: "All" plus each option, the current one ticked.
 * Picking an option applies it and closes the list. The chip sits in a sideways-scrolling row, which would
 * clip an absolutely positioned list, so the list is portalled and placed against the viewport; it closes on
 * scroll or resize rather than drifting. Escape returns focus to the chip; Tab or a click outside closes it.
 */
export function FilterDropdown({ label, value, shownValue, options, onChange }: {
  label: string
  value: string | undefined
  /** The chip text when a value is set (e.g. a short time label); defaults to the value. */
  shownValue?: string
  options: Option[]
  onChange(value: string | undefined): void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const menuId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const all: Option[] = [{ value: '', label: 'All' }, ...options]
  const selected = value ?? ''

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - MENU_WIDTH - EDGE))
    setPos({ top: r.bottom + 4, left })
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const index = Math.max(0, all.findIndex((o) => o.value === selected))
    items.current[index]?.focus()
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false)
    }
    function onScroll(e: Event) {
      if (!menu.current?.contains(e.target as Node)) setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
    // Focus the ticked item only when the list opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pick(v: string) {
    setOpen(false)
    button.current?.focus()
    onChange(v === '' ? undefined : v)
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const list = items.current.filter((el): el is HTMLButtonElement => el !== null)
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      button.current?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
      e.preventDefault()
      button.current?.focus()
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
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={
          'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors outline-none [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring ' +
          (value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background text-foreground hover:bg-accent')
        }
      >
        {value ? <><span className="sr-only">{label}: </span>{shownValue ?? value}</> : label}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={open ? 'rotate-180' : undefined}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="fixed z-30 max-h-[60vh] min-w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-float"
          style={{ top: pos.top, left: pos.left }}
        >
          {all.map((o, i) => {
            const checked = o.value === selected
            return (
              <button
                key={o.value || '__all'}
                ref={(el) => {
                  items.current[i] = el
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                onClick={() => pick(o.value)}
                className={'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-medium hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ' + (checked ? 'text-primary' : '')}
              >
                <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center">
                  {checked && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5 10 17.5 19 7" />
                    </svg>
                  )}
                </span>
                {o.label}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
