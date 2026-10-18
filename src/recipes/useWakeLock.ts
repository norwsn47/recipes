import { useCallback, useEffect, useRef, useState } from 'react'
import { WAKE_LOCK_ERROR, WAKE_LOCK_SOURCE, createWakeLock, isWakeLockSupported } from '../lib/wakeLock'
import type { WakeLockController } from '../lib/wakeLock'
import { notice } from './noticeStore'

/** Whether this browser can keep the screen on. Safe where there is no navigator. */
export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && isWakeLockSupported(navigator)
}

/** The toggle state plus a way to flip it, wired to the real browser. Nothing is stored. */
export function useWakeLock() {
  const [on, setOn] = useState(false)
  const controller = useRef<WakeLockController | null>(null)

  useEffect(() => {
    if (!wakeLockSupported()) return
    const c = createWakeLock({
      request: () => navigator.wakeLock.request('screen'),
      isVisible: () => document.visibilityState === 'visible',
      onStateChange: setOn,
      onError: () => notice.show(WAKE_LOCK_ERROR, { source: WAKE_LOCK_SOURCE }),
    })
    controller.current = c
    const onVisibility = () => c.onVisibilityChange()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      c.dispose()
      controller.current = null
      // Only our own message, so it does not follow the cook to another screen.
      notice.clear(WAKE_LOCK_SOURCE)
    }
  }, [])

  const toggle = useCallback(() => {
    const next = !on
    setOn(next)
    controller.current?.setOn(next)
  }, [on])

  return { on, toggle }
}
