import type { AuthSession } from '../api/contracts'

// Without a trailing slash, so paths starting with / don't make //api/...
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

// The access token lives only in memory; the refresh token is an httpOnly
// cookie the page never sees. A reload restores the session with refreshSession().
let accessToken: string | null = null
let pendingRefresh: Promise<AuthSession | null> | null = null
const expiryListeners = new Set<() => void>()

export function getAccessToken(): string | null {
  return accessToken
}

export function startSession(session: AuthSession) {
  accessToken = session.accessToken
}

export function clearSession() {
  accessToken = null
}

// Called when the session can't be renewed; the app returns to the login page.
export function expireSession() {
  clearSession()
  for (const listener of expiryListeners) listener()
}

export function onSessionExpired(listener: () => void): () => void {
  expiryListeners.add(listener)
  return () => {
    expiryListeners.delete(listener)
  }
}

// Concurrent callers share one request: the server rotates the refresh token,
// so a second parallel refresh would present an already-used one.
export function refreshSession(): Promise<AuthSession | null> {
  pendingRefresh ??= (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        clearSession()
        return null
      }
      const session = (await response.json()) as AuthSession
      startSession(session)
      return session
    } catch {
      return null
    } finally {
      pendingRefresh = null
    }
  })()
  return pendingRefresh
}
