import type {
  AuthSession,
} from '../contracts'
import { apiBaseUrl, clearSession, startSession } from '../../auth/session'
import { readResponse, authRequest } from '../http'

export const auth = {
  register: async (details: { name: string; email: string; password: string; inviteCode?: string }) => {
    const session = await authRequest<AuthSession>('register', details)
    startSession(session)
    return session.user
  },

  login: async (credentials: { email: string; password: string }) => {
    const session = await authRequest<AuthSession>('login', credentials)
    startSession(session)
    return session.user
  },

  logout: async () => {
    try {
      await authRequest<void>('logout')
    } finally {
      clearSession()
    }
  },
}

// Public: asking for an invite from the registration page.
export async function joinWaitlist(details: { name: string; email: string; message?: string }) {
  const response = await fetch(`${apiBaseUrl}/api/v1/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
  return readResponse<void>(response)
}
