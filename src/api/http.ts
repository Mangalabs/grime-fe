// The transport every endpoint uses: the session token, one renewal on a
// 401, and server errors turned into ApiError.
import { apiBaseUrl, expireSession, getAccessToken, refreshSession } from '../auth/session'

export class ApiError extends Error {
  public readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function authorizationHeader(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Runs `send`; when the access token has expired, renews it once and retries.
// If the session can't be renewed the app goes back to the login page.
export async function withSession<R extends { status: number }>(send: () => Promise<R>): Promise<R> {
  const response = await send()
  if (response.status !== 401) {
    return response
  }
  if (!(await refreshSession())) {
    expireSession()
    return response
  }
  const retried = await send()
  if (retried.status === 401) {
    expireSession()
  }
  return retried
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await withSession(() =>
    fetch(`${apiBaseUrl}${path}`, {
      ...options,
      signal,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...authorizationHeader(),
        ...options.headers,
      },
    }),
  )

  return readResponse<T>(response)
}

export async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'Não foi possível concluir a solicitação.'
    throw new ApiError(message, response.status)
  }

  return body as T
}

export function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body) }
}

// Auth calls carry the refresh cookie and never trigger a token refresh.
export async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return readResponse<T>(response)
}
