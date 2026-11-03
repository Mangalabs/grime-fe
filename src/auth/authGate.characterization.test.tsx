// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '../api/contracts'

// Characterization of which workspace the gate opens for each path and account.

const session = { user: null as AuthUser | null }

vi.mock('./session', () => ({
  refreshSession: vi.fn(async () => (session.user ? { user: session.user } : null)),
  onSessionExpired: vi.fn(() => () => undefined),
}))
vi.mock('../crypto/projectKeyCache', () => ({ forgetAllProjectKeys: vi.fn(), setProjectKeyOwner: vi.fn() }))
vi.mock('../api/client', () => ({ auth: { logout: vi.fn() } }))
vi.mock('../App', () => ({ default: () => <p>main app</p> }))
vi.mock('../marketing/MarketingApp', () => ({ default: () => <p>marketing app</p> }))
vi.mock('../production/ProductionApp', () => ({ default: () => <p>production app</p> }))
vi.mock('../admin/AdminApp', () => ({
  AdminApp: () => <p>admin app</p>,
  AdminForbidden: ({ eyebrow, message }: { eyebrow?: string; message?: string }) => (
    <p>
      forbidden {eyebrow ?? '-'} {message ?? '-'}
    </p>
  ),
}))

const { AuthGate } = await import('./AuthGate')

const user = (overrides: Partial<AuthUser>) =>
  ({ id: 'u1', name: 'Ana', email: 'a@x.com', completedTours: [], role: 'USER', marketingEnabled: false, ...overrides }) as AuthUser

afterEach(() => {
  cleanup()
})

const cases: Array<[string, Partial<AuthUser>]> = [
  ['/marketing', { marketingEnabled: true }],
  ['/marketing', { marketingEnabled: false }],
  ['/producao', { marketingEnabled: true }],
  ['/producao', { marketingEnabled: false }],
  ['/admin', { role: 'ADMIN' }],
  ['/admin', { role: 'USER' }],
  ['/', {}],
]

describe('AuthGate (characterization)', () => {
  it.each(cases)('%s for %o', async (path, overrides) => {
    window.history.pushState({}, '', path)
    session.user = user(overrides)
    await act(async () => {
      render(<AuthGate />)
    })
    // Lazy workspaces resolve on the next ticks.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.innerHTML).toMatchSnapshot()
  })
})
