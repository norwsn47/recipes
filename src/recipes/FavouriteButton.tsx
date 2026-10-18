import { useFavourite } from './favouritesStore'

/**
 * The heart. A real button: the accessible name is a stable "Favourite" and only aria-pressed carries the state.
 * Filled vs outline is a shape difference, not only colour. 44px tap target.
 */
export function FavouriteButton({ recipeId, favourite, describedBy, className = '', iconClassName = 'size-6' }: {
  recipeId: string
  /** The value from the latest fetch; the shared store may show a newer one. */
  favourite: boolean
  /** Id of the element holding the recipe title, so the button is announced with it. */
  describedBy?: string
  className?: string
  /** Icon size; cards use 18px to match the share icon (owner decision). */
  iconClassName?: string
}) {
  const [on, toggle] = useFavourite(recipeId, favourite)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Favourite"
      aria-describedby={describedBy}
      onClick={toggle}
      className={
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-accent ' +
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring ' + className
      }
    >
      {/* Same icon style as ShareButton: 24px grid, 2px stroke, round caps and joins (Lucide "heart", ISC licence). */}
      <svg viewBox="0 0 24 24" className={iconClassName} aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill={on ? 'currentColor' : 'none'}>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    </button>
  )
}
