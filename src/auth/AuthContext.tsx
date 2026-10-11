import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchMe, onSessionEnded, signInWithGoogle, signOutRequest } from '../lib/api'
import type { User } from '../lib/api'

// loading: checking /api/auth/me. signed-out: never signed in this visit. signed-in: has a user.
// expired: was signed in, a call returned 401. The route tree stays mounted behind a sign-in overlay.
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'expired' | 'check-failed'

interface AuthValue {
  status: AuthStatus
  /** The last signed-in user; kept while expired so the tree behind the overlay still renders. */
  user: User | null
  signIn(credential: string): Promise<boolean>
  signOut(): Promise<void>
  retry(): void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchMe().then(
      (me) => {
        if (cancelled) return
        setUser(me)
        setStatus(me ? 'signed-in' : 'signed-out')
      },
      () => {
        if (!cancelled) setStatus('check-failed')
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(
    () => onSessionEnded(() => setStatus((s) => (s === 'signed-in' ? 'expired' : s))),
    [],
  )

  const signIn = useCallback(async (credential: string) => {
    try {
      const me = await signInWithGoogle(credential)
      if (!me) return false
      // A different account is a new user: AppShell remounts the tree on the user id (see shellKey).
      setUser(me)
      setStatus('signed-in')
      return true
    } catch {
      return false
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await signOutRequest()
    } finally {
      setUser(null)
      setStatus('signed-out')
    }
  }, [])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

  const value = useMemo(() => ({ status, user, signIn, signOut, retry }), [status, user, signIn, signOut, retry])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
