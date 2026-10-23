import { useEffect, useState } from 'react'
import { auth } from '../api/client'
import type { AuthUser } from '../api/contracts'
import App from '../App'
import { AdminApp, AdminForbidden } from '../admin/AdminApp'
import { AuthPage } from './AuthPage'
import { onSessionExpired, refreshSession } from './session'
import './AuthPage.css'

type GateState =
  | { status: 'restoring' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; user: AuthUser }

// Shows the app only with a session. On load the refresh cookie, if any,
// restores the previous session without asking for the password again.
export function AuthGate() {
  const [state, setState] = useState<GateState>({ status: 'restoring' })

  useEffect(() => {
    let isActive = true
    void refreshSession().then((session) => {
      if (isActive) {
        setState(session ? { status: 'signedIn', user: session.user } : { status: 'signedOut' })
      }
    })
    const unsubscribe = onSessionExpired(() =>
      setState({ status: 'signedOut', notice: 'Sua sessão expirou. Entre novamente.' }),
    )
    return () => {
      isActive = false
      unsubscribe()
    }
  }, [])

  async function logout() {
    try {
      await auth.logout()
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

  // The administration lives at /admin, in the same app and session.
  if (isAdminPath()) {
    return state.user.role === 'ADMIN' ? (
      <AdminApp key={state.user.id} user={state.user} onLogout={() => void logout()} />
    ) : (
      <AdminForbidden />
    )
  }

  // Keyed by user so nothing from one account's session survives into the next.
  return <App key={state.user.id} user={state.user} onLogout={() => void logout()} />
}

function isAdminPath() {
  return window.location.pathname.replace(/\/+$/, '') === '/admin'
}
