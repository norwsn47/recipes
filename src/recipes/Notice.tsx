import { useEffect, useRef } from 'react'
import { Banner } from '@design-system/components'
import { notice, useNotice } from './noticeStore'

const DISMISS_MS = 6000

/**
 * A brief message (a favourite that could not be saved, a link copied). The live region stays
 * mounted so it is announced. Fades after a few seconds unless the message asks to stay.
 */
export function Notice() {
  const current = useNotice()
  const latest = useRef(current)
  useEffect(() => {
    latest.current = current
  }, [current])
  const mounted = useRef(false)
  // When the page goes away, drop its message so it cannot reappear on another page. The check is
  // deferred: StrictMode's dev-only unmount/remount reuses this instance and sets `mounted` again
  // before the timer fires, while a real navigation leaves it false. Only the message that was
  // showing at unmount is cleared, never a newer one.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const snapshot = latest.current
      setTimeout(() => {
        if (!mounted.current) notice.clearIf(snapshot)
      }, 0)
    }
  }, [])
  useEffect(() => {
    if (!current.message || current.persist) return
    const t = setTimeout(() => notice.clear(), DISMISS_MS)
    return () => clearTimeout(t)
  }, [current])
  return (
    // Leaves room on the right for the floating add button on the list.
    <div className="pointer-events-none fixed inset-x-4 z-20" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      <div className="mx-auto max-w-xl pr-16">
        <div role="status">
          {current.message && (
            <Banner tone="info" role={undefined} className="pointer-events-auto flex items-center justify-between gap-3">
              <span className="min-w-0 select-text [overflow-wrap:anywhere]">{current.message}</span>
              <button
                type="button"
                onClick={() => notice.clear()}
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
