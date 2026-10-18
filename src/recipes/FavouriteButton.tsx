import { useFavourite } from './favouritesStore'

/**
 * The heart. A real button: the accessible name is a stable "Favourite" and only aria-pressed carries the state.
 * Filled vs outline is a shape difference, not only colour. 44px tap target.
 */
export function FavouriteButton({ recipeId, favourite, describedBy, className = '' }: {
  recipeId: string
  /** The value from the latest fetch; the shared store may show a newer one. */
  favourite: boolean
  /** Id of the element holding the recipe title, so the button is announced with it. */
  describedBy?: string
  className?: string
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
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" strokeWidth="2" strokeLinejoin="round" stroke="currentColor" fill={on ? 'currentColor' : 'none'}>
        <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.7 7.9 3.6 4.5 7 4.5c2.2 0 3.8 1.2 5 3 1.2-1.8 2.8-3 5-3 3.4 0 5.3 3.4 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />
      </svg>
    </button>
  )
}
