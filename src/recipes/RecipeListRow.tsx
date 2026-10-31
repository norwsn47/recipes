import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { BackState } from '../lib/grouping'

/**
 * A plain list row: title (17px semibold), a muted line under it, and an optional trailing slot (for example the
 * heart). The whole text block is the link; the trailing slot is a sibling, never nested in the link.
 * Rows are at least 44px tall and separated by a hairline divider.
 */
export function RecipeListRow({ id, title, line, backState, trailing }: {
  id: string
  title: string
  line: string
  /** Put in router state so the recipe page's back link returns to the list the visitor came from. */
  backState?: BackState
  trailing?: ReactNode
}) {
  return (
    <li className="flex items-center gap-2 border-b border-border last:border-b-0">
      <Link
        to={`/recipes/${id}`}
        state={backState}
        className="flex min-h-16 min-w-0 flex-1 flex-col justify-center rounded-lg py-3.5 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
      >
        <span className="text-[17px] font-semibold leading-tight [overflow-wrap:anywhere]">{title}</span>
        {line && <span className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{line}</span>}
      </Link>
      {trailing}
    </li>
  )
}
