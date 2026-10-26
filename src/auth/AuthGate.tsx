import { lazy, Suspense, useEffect, useState } from 'react'
import { auth } from '../api/client'
import type { AuthUser } from '../api/contracts'
import App from '../App'
import { AdminApp, AdminForbidden } from '../admin/AdminApp'
import { AuthPage } from './AuthPage'
import { onSessionExpired, refreshSession } from './session'
import { forgetAllProjectKeys, setProjectKeyOwner } from '../crypto/projectKeyCache'
import './AuthPage.css'

const MarketingApp = lazy(() => import('../marketing/MarketingApp'))

type GateState =
  | { status: 'restoring' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; user: AuthUser }

// Shows the app only with a session. On load the refresh cookie, if any,
// restores the previous session without asking for the password again.
export function AuthGate() {
  const [state, setState] = useState<GateState>({ status: 'restoring' })
  // Remembered project keys belong to the signed-in account only.
  setProjectKeyOwner(state.status === 'signedIn' ? state.user.id : null)

  useEffect(() => {
    let isActive = true
    void refreshSession().then((session) => {
      if (isActive) {
        setState(session ? { status: 'signedIn', user: session.user } : { status: 'signedOut' })
      }
    })
    const unsubscribe = onSessionExpired(() => {
      void forgetAllProjectKeys()
      setState({ status: 'signedOut', notice: 'Sua sessão expirou. Entre novamente.' })
    })
    return () => {
      isActive = false
      unsubscribe()
    }
  }, [])

  async function logout() {
    try {
      await Promise.all([auth.logout(), forgetAllProjectKeys()])
    } finally {
      setState({ status: 'signedOut' })
    }
  }

  if (state.status === 'restoring') {
    return <div className="auth-loading" role="status">Carregando…</div>
  }

  if (state.status === 'signedOut') {
    return (
      <AuthPage
        notice={state.notice}
        onAuthenticated={(user) => setState({ status: 'signedIn', user })}
      />
    )
  }

  // Marketing has its own shell; its code loads only when it is opened.
  if (isPath('/marketing')) {
    return state.user.marketingEnabled ? (
      <Suspense fallback={<div className="auth-loading" role="status">Carregando…</div>}>
        <MarketingApp key={state.user.id} user={state.user} onLogout={() => void logout()} />
      </Suspense>
    ) : (
      <AdminForbidden eyebrow="Marketing" message="O marketing não está liberado para a sua conta. Peça a um admin." />
    )
  }

  // The administration lives at /admin, in the same app and session.
  if (isPath('/admin')) {
    return state.user.role === 'ADMIN' ? (
      <AdminApp key={state.user.id} user={state.user} onLogout={() => void logout()} />
    ) : (
      <AdminForbidden />
    )
  }

  // Keyed by user so nothing from one account's session survives into the next.
  return <App key={state.user.id} user={state.user} onLogout={() => void logout()} />
}

function isPath(path: string) {
  return window.location.pathname.replace(/\/+$/, '') === path
}
