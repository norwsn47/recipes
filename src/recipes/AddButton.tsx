import { Link } from 'react-router-dom'
import type { Meal } from '../lib/recipes'

/**
 * Floating add button. Right edge: the content column's right edge (36rem = max-w-xl) on wide screens,
 * the viewport edge on phones. From a meal page, `meal` pre-selects that meal on the add form.
 */
export function AddButton({ meal }: { meal?: Meal | null }) {
  return (
    <Link
      to={meal ? `/recipes/new?meal=${encodeURIComponent(meal)}` : '/recipes/new'}
      aria-label={meal ? `Add ${meal.toLowerCase()} recipe` : 'Add recipe'}
      className="fixed z-10 flex size-14 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        right: 'max(calc(1rem + env(safe-area-inset-right)), calc((100vw - 36rem) / 2 + 1rem))',
      }}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  )
}
