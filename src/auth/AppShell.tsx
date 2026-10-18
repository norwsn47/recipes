import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Banner, Button, Dialog } from '@design-system/components'
import { useAuth } from './AuthContext'
import { SignInScreen } from './SignInScreen'
import { shellKey } from './shellKey'
import { favourites } from '../recipes/favouritesStore'

export const APP_NAME = 'Family Recipes'

/**
 * Route guard and shell. Signed out: only the sign-in screen, rendered at the current URL, so
 * after signing in the visitor is already on the page they asked for (nothing to redirect, so no
 * open redirect). Expired mid-use: the route tree stays mounted (form state survives) and the
 * sign-in appears as an overlay; the content behind is inert. If a different account signs in
 * from the overlay, the content is keyed on the user id so it remounts and the previous user's
 * unsaved state is not carried over; the same account keeps it mounted.
 */
export function AppShell() {
  const { status, user, signOut, retry } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Stable onClose: the Dialog refocuses its first control whenever onClose changes.
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  // Drop the shared favourites state whenever the signed-in user changes (A to B) or signs out.
  // Expiry keeps the same user, so it does not reset.
  const userId = user?.id ?? null
  useEffect(() => {
    favourites.reset()
  }, [userId])

  if (status === 'loading') {
    return <p role="status" className="p-6 text-muted-foreground">Opening {APP_NAME}...</p>
  }
  if (status === 'check-failed') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
        <Banner tone="error" className="w-full">Could not reach the server. Check your connection and try again.</Banner>
        <Button onClick={retry}>Try again</Button>
      </main>
    )
  }
  if (status === 'signed-out' || !user) return <SignInScreen appName={APP_NAME} />

  const expired = status === 'expired'
  return (
    <>
      <div key={shellKey(user)} className="mx-auto w-full max-w-xl px-4" ref={(el) => { if (el) el.inert = expired }}>
        {/* App name left, settings right. PageHeader centres its title, so this follows its rules
            (min-h-14, truncating title that never overlaps the button) with left alignment.
            Design-system candidate: a left-aligned PageHeader variant. */}
        <header className="flex min-h-14 items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-lg">{APP_NAME}</h1>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <SettingsIcon />
          </button>
        </header>
        <Dialog open={settingsOpen} onClose={closeSettings} title={APP_NAME}>
          <p className="mb-3 text-muted-foreground">
            A shared place for the family to keep recipes: a link, a photo or a PDF, tagged by how
            long it takes and what kind of dish it is. Everyone who can sign in sees every recipe.
          </p>
          <p className="mb-5 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            Signed in as {user.name} ({user.email})
          </p>
          <div className="flex flex-col gap-3">
            <Button variant="secondary" onClick={() => { setSettingsOpen(false); void signOut() }}>Sign out</Button>
            <Button variant="ghost" onClick={closeSettings}>Close</Button>
          </div>
        </Dialog>
        <Outlet />
      </div>
      {expired && <SignInScreen overlay appName={APP_NAME} />}
    </>
  )
}

/** Gear icon, 24px, inherits the text colour. Decorative: the button carries the label. */
function SettingsIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
