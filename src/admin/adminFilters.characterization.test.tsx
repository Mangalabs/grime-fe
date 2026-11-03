// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvitesSection } from './InvitesSection'
import { WaitlistSection } from './WaitlistSection'

// Characterization of the admin lists' status tabs: their counts, and which
// rows each tab shows.

vi.mock('../api/client', () => ({
  admin: {
    invites: vi.fn(async () => [
      { id: 'i1', code: 'AAA', email: null, note: null, status: 'AVAILABLE', createdAt: '2026-10-01T00:00:00.000Z', usedAt: null, usedBy: null, revokedAt: null, createdBy: null },
      { id: 'i2', code: 'BBB', email: 'b@x.com', note: null, status: 'USED', createdAt: '2026-10-02T00:00:00.000Z', usedAt: '2026-10-03T00:00:00.000Z', usedBy: { id: 'u', name: 'Bia', email: 'b@x.com' }, revokedAt: null, createdBy: null },
      { id: 'i3', code: 'CCC', email: null, note: 'x', status: 'AVAILABLE', createdAt: '2026-10-04T00:00:00.000Z', usedAt: null, usedBy: null, revokedAt: null, createdBy: null },
    ]),
    waitlist: vi.fn(async () => [
      { id: 'w1', name: 'Ana', email: 'a@x.com', message: null, status: 'WAITING', createdAt: '2026-10-01T00:00:00.000Z', invite: null },
      { id: 'w2', name: 'Caio', email: 'c@x.com', message: 'oi', status: 'INVITED', createdAt: '2026-10-02T00:00:00.000Z', invite: { code: 'DDD', status: 'AVAILABLE' } },
    ]),
  },
}))

afterEach(() => {
  cleanup()
})

const tabs = () => document.querySelector('.admin-filters')!.outerHTML
const rows = () => [...document.querySelectorAll('tbody tr, .admin-card')].map((row) => row.textContent)

describe.each([
  ['invites', () => <InvitesSection />],
  ['waitlist', () => <WaitlistSection />],
])('%s tabs (characterization)', (_name, section) => {
  it('counts each status and filters the rows', async () => {
    await act(async () => {
      render(section())
    })
    expect({ tabs: tabs(), rows: rows() }).toMatchSnapshot('first tab')
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: /Todos/ })))
    expect({ tabs: tabs(), rows: rows() }).toMatchSnapshot('all')
  })
})
