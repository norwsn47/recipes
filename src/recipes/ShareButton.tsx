import { share } from './noticeStore'

/** Share icon button. A real button; 44px tap target. Pass the icon size via `iconClassName`. */
export function ShareButton({ recipe, iconClassName = 'size-6', className = '', onClick }: {
  recipe: { id: string; title: string }
  iconClassName?: string
  className?: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      aria-label={`Share ${recipe.title}`}
      onClick={(e) => {
        onClick?.(e)
        void share(recipe)
      }}
      className={
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-accent ' +
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring ' + className
      }
    >
      <svg viewBox="0 0 24 24" className={iconClassName} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Box open at the top with an arrow rising out of it. Same icon style as the heart: 24px grid, 2px stroke, round caps and joins. */}
        <path d="M8 9H6.5A2.5 2.5 0 0 0 4 11.5v8A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 17.5 9H16" />
        <path d="M12 15V2.5M7.5 7 12 2.5 16.5 7" />
      </svg>
    </button>
  )
}
