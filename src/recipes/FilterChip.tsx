import type { ReactNode } from 'react'

/** A toggle chip for filters. Pressed state is announced with aria-pressed; looks 36px tall, taps as 44px. */
export function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={
        'relative inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold transition-colors ' +
        // Visually 36px, but an invisible 4px band above and below keeps the tap target 44px.
        "after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] " +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
        (pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-foreground hover:bg-accent')
      }
    >
      {children}
    </button>
  )
}
