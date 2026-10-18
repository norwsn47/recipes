// Keeping the screen on while cooking, via the Screen Wake Lock API. The browser is injected, so
// this is free of the DOM at import and can be unit tested with fakes. The browser drops the lock
// whenever the page is hidden, so it is asked for again when the page is visible again.

export const WAKE_LOCK_ERROR = 'Couldn’t keep screen on'
export const WAKE_LOCK_SOURCE = 'wake-lock'

/** The part of a WakeLockSentinel used here (declared locally so the test project needs no DOM lib). */
export interface Sentinel {
  readonly released?: boolean
  release?(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

export interface WakeLockEnv {
  request(): Promise<Sentinel>
  isVisible(): boolean
  /** Called only when the toggle has to go back off (a failed request). */
  onStateChange(on: boolean): void
  onError(): void
}

export interface WakeLockController {
  setOn(on: boolean): void
  onVisibilityChange(): void
  dispose(): void
}

export function isWakeLockSupported(nav: { wakeLock?: unknown } | undefined): boolean {
  return typeof nav === 'object' && nav !== null && 'wakeLock' in nav && !!nav.wakeLock
}

function releaseQuietly(s: Sentinel): void {
  try {
    const p = s.release?.()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {
    // Already released, or release is absent: nothing to do.
  }
}

export function createWakeLock(env: WakeLockEnv): WakeLockController {
  let on = false
  let disposed = false
  let gen = 0 // bumped on every on/off/dispose, so older requests know they are superseded
  let pending = false
  let visibleWhilePending = false // a visible event was swallowed by an in-flight request
  let sentinel: Sentinel | null = null
  // The device let go while the page was still visible (e.g. iPhone Low Power Mode): ask again once;
  // if it lets go again before the page is hidden, turn the switch off so it never shows On wrongly.
  let retriedVisibleRelease = false

  function drop() {
    const s = sentinel
    sentinel = null // before releasing, so our own 'release' event is ignored
    if (s) releaseQuietly(s)
  }

  function acquire() {
    if (disposed || !on || pending || sentinel || !env.isVisible()) return
    pending = true
    const mine = gen
    let request: Promise<Sentinel>
    try {
      request = env.request()
    } catch (err) {
      request = Promise.reject(err)
    }
    request.then(
      (s) => {
        if (mine !== gen) {
          releaseQuietly(s)
          return
        }
        pending = false
        const swallowed = visibleWhilePending
        visibleWhilePending = false
        if (s.released) {
          // Already let go by the browser (page hidden meanwhile). If the page became visible while
          // this request was in flight, that event was swallowed, so ask once more. Without a
          // swallowed event, wait for the next visible event (this also prevents a retry loop).
          if (swallowed) acquire()
          return
        }
        sentinel = s
        s.addEventListener('release', () => {
          if (sentinel !== s) return // our own release, or superseded
          sentinel = null
          if (disposed || !on || !env.isVisible()) return // hidden: re-requested on the next visible event
          if (!retriedVisibleRelease) {
            retriedVisibleRelease = true
            acquire()
            return
          }
          on = false
          gen++
          env.onStateChange(false)
          env.onError()
        })
      },
      () => {
        if (mine !== gen) return
        pending = false
        visibleWhilePending = false
        on = false
        gen++
        env.onStateChange(false)
        env.onError()
      },
    )
  }

  return {
    setOn(next) {
      if (disposed || next === on) return
      on = next
      gen++
      pending = false
      visibleWhilePending = false
      retriedVisibleRelease = false
      if (next) acquire()
      else drop()
    },
    onVisibilityChange() {
      if (!env.isVisible()) retriedVisibleRelease = false // a hide/show cycle starts afresh
      if (pending && env.isVisible()) visibleWhilePending = true
      acquire()
    },
    dispose() {
      if (disposed) return
      disposed = true
      on = false
      gen++
      pending = false
      visibleWhilePending = false
      drop()
    },
  }
}
