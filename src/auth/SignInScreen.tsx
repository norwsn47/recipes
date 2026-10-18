import { useEffect, useRef, useState } from 'react'
import { Banner } from '@design-system/components'
import { useAuth } from './AuthContext'
import { initGoogle, loadGoogle } from '../lib/google'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

/** The only thing a signed-out visitor sees: the app name and the Google button. */
export function SignInScreen({ overlay = false, appName }: { overlay?: boolean; appName: string }) {
  const { signIn } = useAuth()
  const buttonRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const signInRef = useRef(signIn)
  useEffect(() => {
    signInRef.current = signIn
  }, [signIn])

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false
    loadGoogle().then(
      (id) => {
        if (cancelled || !buttonRef.current) return
        initGoogle(id, CLIENT_ID, (credential) => {
          setFailed(false)
          if (!credential) return setFailed(true)
          signInRef.current(credential).then((ok) => {
            if (!ok) setFailed(true)
          })
        })
        id.renderButton(buttonRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 280 })
      },
      () => {
        if (!cancelled) setLoadError(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const wrapper = overlay
    ? 'fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-4'
    : 'flex min-h-screen items-center justify-center px-4'

  return (
    <div className={wrapper} role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label={overlay ? 'Sign in again' : undefined}>
      <main className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <h1>{appName}</h1>
        {overlay && <p className="text-muted-foreground">You were signed out. Sign in again to carry on where you were.</p>}
        {!CLIENT_ID ? (
          <Banner tone="error">
            Google sign-in is not set up. Developer: set VITE_GOOGLE_CLIENT_ID in your environment and rebuild.
          </Banner>
        ) : loadError ? (
          <Banner tone="error">Could not reach Google. Check your connection and reload the page.</Banner>
        ) : (
          <div ref={buttonRef} className="flex min-h-11 justify-center" />
        )}
        <p className="text-sm text-muted-foreground">Only available to members added by the site owner.</p>
        {failed && <Banner tone="error" className="w-full">Sign-in failed, please try again.</Banner>}
      </main>
    </div>
  )
}
