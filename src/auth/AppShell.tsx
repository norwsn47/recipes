import { Outlet } from 'react-router-dom'
import { Banner, Button, PageHeader } from '@design-system/components'
import { useAuth } from './AuthContext'
import { SignInScreen } from './SignInScreen'
import { shellKey } from './shellKey'

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
        <PageHeader
          title={APP_NAME}
          right={
            <div className="flex items-center gap-2">
              <span className="max-w-28 truncate text-sm text-muted-foreground">{user.name}</span>
              <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
            </div>
          }
        />
        <Outlet />
      </div>
      {expired && <SignInScreen overlay appName={APP_NAME} />}
    </>
  )
}
