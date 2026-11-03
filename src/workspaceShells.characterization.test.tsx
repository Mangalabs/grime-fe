// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from './api/contracts'

// Characterization of the /marketing and /producao shells: what they render
// at each step of choosing, unlocking and switching projects and sections.

const listProjects = vi.fn()

vi.mock('./api/client', () => ({
  api: {
    listProjects: () => listProjects(),
    deleteMarketingAsset: vi.fn(async () => undefined),
  },
}))

vi.mock('./components/ProjectUnlockModal', () => ({
  ProjectUnlockModal: ({ projectId, onClose, onUnlocked }: { projectId: string; onClose: () => void; onUnlocked: (id: string, key: CryptoKey) => void }) => (
    <div data-testid="unlock">
      unlock {projectId}
      <button type="button" onClick={() => onUnlocked(projectId, {} as CryptoKey)}>
        do-unlock
      </button>
      <button type="button" onClick={onClose}>
        do-close
      </button>
    </div>
  ),
}))

vi.mock('./components/AccountMenu', () => ({
  AccountMenu: ({ user }: { user: AuthUser }) => <span data-testid="account">{user.name}</span>,
}))

// The workspaces' own data stays out of the shell: these hooks are inert.
vi.mock('./marketing/useMarketingStory', () => ({
  useMarketingStory: () => ({ story: null, kit: null, error: '', saveKit: vi.fn() }),
}))
vi.mock('./marketing/useMoodboardImages', () => ({ useMoodboardImages: () => ({}) }))
vi.mock('./marketing/useBookMetadata', () => ({ useBookMetadata: () => null }))
vi.mock('./production/useBookText', () => ({
  useBookText: (projectId: string) => ({ status: 'loading', progress: `Lendo ${projectId}…` }),
}))
vi.mock('./production/plan', () => ({
  useProductionPlan: () => ({ plan: { layout: {}, formatId: null }, update: vi.fn(), reset: vi.fn() }),
}))

const user = { id: 'u1', name: 'Ana', email: 'ana@example.com', completedTours: [], role: 'USER', marketingEnabled: true } as AuthUser
const projects = [
  { id: 'p1', title: 'Livro A' },
  { id: 'p2', title: 'Livro B' },
]

const apps = {
  marketing: async () => (await import('./marketing/MarketingApp')).default,
  production: async () => (await import('./production/ProductionApp')).default,
}

async function show(name: keyof typeof apps) {
  const App = await apps[name]()
  const onLogout = vi.fn()
  await act(async () => {
    render(<App user={user} onLogout={onLogout} />)
  })
  return onLogout
}

const state = () => ({
  title: document.title,
  theme: document.documentElement.dataset.theme,
  html: document.body.innerHTML,
})

beforeEach(() => {
  listProjects.mockReset()
  // A light system theme.
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia
  document.title = ''
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  cleanup()
})

describe.each(Object.keys(apps) as Array<keyof typeof apps>)('%s shell (characterization)', (name) => {
  it('walks from choosing a project to switching sections and projects', async () => {
    listProjects.mockResolvedValue(projects)
    await show(name)
    expect(state()).toMatchSnapshot('before choosing')

    fireEvent.change(screen.getByLabelText('Projeto'), { target: { value: 'p1' } })
    expect(state()).toMatchSnapshot('unlocking')

    await act(async () => fireEvent.click(screen.getByText('do-unlock')))
    expect(state()).toMatchSnapshot('opened')

    const tabs = screen.getAllByRole('button').filter((button) => button.closest('nav'))
    await act(async () => fireEvent.click(tabs[tabs.length - 1]))
    expect(state()).toMatchSnapshot('last section')

    fireEvent.change(screen.getByLabelText('Projeto'), { target: { value: 'p2' } })
    await act(async () => fireEvent.click(screen.getByText('do-unlock')))
    expect(state()).toMatchSnapshot('other project, first section again')
  })

  it('closes the unlock dialog without opening anything', async () => {
    listProjects.mockResolvedValue(projects)
    await show(name)
    fireEvent.change(screen.getByLabelText('Projeto'), { target: { value: 'p2' } })
    fireEvent.click(screen.getByText('do-close'))
    expect(state()).toMatchSnapshot()
  })

  it('says when there are no projects', async () => {
    listProjects.mockResolvedValue([])
    await show(name)
    expect(state()).toMatchSnapshot()
  })

  it('shows why projects could not be listed', async () => {
    listProjects.mockRejectedValue(new Error('Sem rede'))
    await show(name)
    expect(state()).toMatchSnapshot()
  })

  it('has a generic message for an odd failure', async () => {
    listProjects.mockRejectedValue('?')
    await show(name)
    expect(state()).toMatchSnapshot()
  })

  it('logs out from the account menu', async () => {
    listProjects.mockResolvedValue(projects)
    await show(name)
    expect(screen.getByTestId('account').textContent).toBe('Ana')
  })
})
