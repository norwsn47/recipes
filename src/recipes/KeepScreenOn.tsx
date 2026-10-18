import { useWakeLock, wakeLockSupported } from './useWakeLock'

/** "Keep screen on" switch for the recipe page. Hidden where the browser cannot do it. */
export function KeepScreenOn() {
  if (!wakeLockSupported()) return null
  return <Switch />
}

function Switch() {
  const { on, toggle } = useWakeLock()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg text-left text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-primary" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <span>Keep screen on</span>
      <span
        aria-hidden="true"
        className={
          'relative inline-block h-7 w-12 shrink-0 rounded-full border-2 transition-colors motion-reduce:transition-none ' +
          (on ? 'border-primary bg-primary' : 'border-input bg-background')
        }
      >
        <span
          className={
            'absolute top-0.5 left-0.5 size-5 rounded-full transition-transform motion-reduce:transition-none ' +
            (on ? 'translate-x-5 bg-primary-foreground' : 'translate-x-0 bg-muted-foreground')
          }
        />
      </span>
    </button>
  )
}
