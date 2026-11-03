import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl, clearSession, onSessionExpired, startSession } from '../auth/session'
import type { AuthSession } from './contracts'
import * as client from './client'

// Characterization: every client call keeps the request it sends (method,
// path, headers and body). Arguments are stand-ins that print as their place
// ("arg0", "arg1.field") wherever the call reads them.
function standIn(path: string): unknown {
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (key === Symbol.toPrimitive || key === 'toString' || key === 'toJSON') return () => path
        if (typeof key === 'symbol') return undefined
        return standIn(`${path}.${key}`)
      },
    },
  )
}

interface Recorded {
  url: string
  method: string
  headers: Record<string, string>
  credentials?: string
  body?: unknown
}

let calls: Recorded[] = []

function readBody(body: unknown) {
  if (body === undefined) return undefined
  if (typeof body === 'string') return JSON.parse(body)
  if (body instanceof FormData) return { formData: [...body.entries()].map(([key, value]) => [key, String(value)]) }
  return Object.prototype.toString.call(body)
}

// The base URL comes from the local .env; the snapshots keep only the path.
const pathOf = (url: string) => (url.startsWith(apiBaseUrl) ? url.slice(apiBaseUrl.length) : url)

// Uploads go through XMLHttpRequest (for progress); this one answers at once.
class FakeXhr {
  status = 200
  response: unknown = {}
  responseType = ''
  upload = {}
  onload?: () => void
  private request: Recorded = { url: '', method: '', headers: {} }
  open(method: string, url: string) {
    this.request = { url: pathOf(url), method, headers: {} }
  }
  setRequestHeader(name: string, value: string) {
    this.request.headers[name] = value
  }
  send(body: unknown) {
    calls.push({ ...this.request, body: readBody(body) })
    this.onload?.()
  }
}

beforeEach(() => {
  calls = []
  clearSession()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url: pathOf(url),
        method: init.method ?? 'GET',
        headers: (init.headers ?? {}) as Record<string, string>,
        ...(init.credentials ? { credentials: init.credentials } : {}),
        ...(init.body === undefined ? {} : { body: readBody(init.body) }),
      })
      return new Response(JSON.stringify({ accessToken: 'token', user: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function record(call: (...args: unknown[]) => unknown, arity: number) {
  const args = Array.from({ length: Math.max(arity, 4) }, (_, index) => standIn(`arg${index}`))
  try {
    await call(...args)
    return calls
  } catch (error) {
    return { calls, threw: error instanceof Error ? error.constructor.name : String(error) }
  }
}

const groups = {
  api: client.api,
  auth: client.auth,
  admin: client.admin,
  google: client.google,
} as Record<string, Record<string, (...args: unknown[]) => unknown>>

describe('api client', () => {
  it('exports the same names', () => {
    expect(Object.keys(client).sort()).toMatchSnapshot()
    expect(Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, Object.keys(group).sort()]))).toMatchSnapshot()
  })

  for (const [group, methods] of Object.entries(groups)) {
    for (const name of Object.keys(methods).sort()) {
      it(`${group}.${name} sends the same request`, async () => {
        const method = methods[name]
        expect(await record(method, method.length)).toMatchSnapshot()
      })
    }
  }

  it('joinWaitlist sends the same request', async () => {
    expect(await record(client.joinWaitlist as (...args: unknown[]) => unknown, 1)).toMatchSnapshot()
  })

  it('turns an error response into an ApiError with the server message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Nope' }), { status: 409 })))
    await expect(client.api.getUsage()).rejects.toMatchObject({ name: 'ApiError', status: 409, message: 'Nope' })
  })

  it('falls back to a generic message without one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    await expect(client.api.getUsage()).rejects.toMatchObject({
      status: 500,
      message: 'Não foi possível concluir a solicitação.',
    })
  })

  it('sends the access token, and renews it once on a 401', async () => {
    startSession({ accessToken: 'old' } as AuthSession)
    const seen: Array<[string, string | undefined]> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const authorization = (init.headers as Record<string, string> | undefined)?.Authorization
        seen.push([pathOf(url), authorization])
        if (pathOf(url) === '/api/v1/auth/refresh') return new Response(JSON.stringify({ accessToken: 'new' }))
        return authorization === 'Bearer old'
          ? new Response(JSON.stringify({ message: 'expired' }), { status: 401 })
          : new Response(JSON.stringify({ ok: true }))
      }),
    )
    await expect(client.api.getUsage()).resolves.toEqual({ ok: true })
    expect(seen).toEqual([
      ['/api/v1/usage', 'Bearer old'],
      ['/api/v1/auth/refresh', undefined],
      ['/api/v1/usage', 'Bearer new'],
    ])
  })

  it('expires the session when the token cannot be renewed', async () => {
    startSession({ accessToken: 'old' } as AuthSession)
    const expired = vi.fn()
    const stop = onSessionExpired(expired)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'no' }), { status: 401 })))
    await expect(client.api.getUsage()).rejects.toMatchObject({ status: 401, message: 'no' })
    expect(expired).toHaveBeenCalledOnce()
    stop()
  })

  it('returns undefined for 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(client.api.getUsage()).resolves.toBeUndefined()
  })
})
