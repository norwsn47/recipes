import { useEffect } from 'react'
import { Banner } from '@design-system/components'
import { favourites, useFavouriteNotice } from './favouritesStore'

const DISMISS_MS = 6000

/** A brief message when a favourite could not be saved. The live region stays mounted so it is announced. */
export function FavouriteNotice() {
  const notice = useFavouriteNotice()
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => favourites.clearNotice(), DISMISS_MS)
    return () => clearTimeout(t)
  }, [notice])
  return (
    // Leaves room on the right for the floating add button on the list.
    <div className="pointer-events-none fixed inset-x-4 z-20" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      <div className="mx-auto max-w-xl pr-16">
        <div role="status">
          {notice && (
            <Banner tone="info" role={undefined} className="pointer-events-auto flex items-center justify-between gap-3">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => favourites.clearNotice()}
                className="-my-2 -mr-2 min-h-11 shrink-0 rounded-lg px-3 underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Dismiss
              </button>
            </Banner>
          )}
        </div>
      </div>
    </div>
  )
}
