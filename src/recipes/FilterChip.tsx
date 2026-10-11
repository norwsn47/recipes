import type { ReactNode } from 'react'

/** A toggle chip for filters. Pressed state is announced with aria-pressed; 44px tall. */
export function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={
        'inline-flex min-h-11 items-center rounded-full border px-4 text-base font-semibold transition-colors ' +
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
