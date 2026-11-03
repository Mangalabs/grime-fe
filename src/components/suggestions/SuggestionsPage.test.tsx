// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleDocSuggestionSection, Slot } from '../../api/contracts'
import type { GoogleDocSyncState } from '../../features/googleDocs/useGoogleDocSync'
import type { PetricorSuggestion } from '../../features/suggestions/petricorSuggestions'
import { SuggestionsPage } from './SuggestionsPage'

const listDocSuggestions = vi.fn()
const decideDocSuggestions = vi.fn()
const listPetricor = vi.fn()
const decidePetricor = vi.fn()
const updateSuggestions = vi.fn()

vi.mock('../../api/client', () => ({
  google: {
    listSuggestions: (projectId: string) => listDocSuggestions(projectId),
    decideSuggestions: (projectId: string, decisions: unknown) => decideDocSuggestions(projectId, decisions),
  },
  api: {
    getSlotReview: vi.fn(async () => ({ content: { ciphertext: JSON.stringify({ content: petricorText }), iv: 'iv' } })),
    updateSuggestions: (projectId: string, updates: unknown) => updateSuggestions(projectId, updates),
  },
}))

vi.mock('../../crypto/projectEncryption', () => ({
  // Names come sealed as "sealed:<name>"; scene drafts as JSON.
  decryptScene: vi.fn(async (_key: CryptoKey, ciphertext: string) => ciphertext.replace(/^sealed:/, '')),
  decryptSceneDraft: vi.fn(async (_key: CryptoKey, ciphertext: string) => JSON.parse(ciphertext)),
}))

vi.mock('../../features/suggestions/petricorSuggestions', async (original) => ({
  ...(await original<typeof import('../../features/suggestions/petricorSuggestions')>()),
  listSuggestions: (projectId: string) => listPetricor(projectId),
  decideSuggestions: (projectId: string, _key: CryptoKey, decisions: unknown) => decidePetricor(projectId, decisions),
}))

const key = {} as CryptoKey
const text = 'Ela andou pela rua escura. Depois voltou.'
const at = (passage: string) => text.indexOf(passage)
const section: GoogleDocSuggestionSection = {
  key: 'h.um',
  title: 'O retorno',
  slotId: 's1',
  text,
  suggestions: [
    // A replacement made from Petricor: Google keeps a removal and an insertion.
    { id: 'del', start: at('rua escura'), end: at('rua escura') + 10, inserted: '', author: { ciphertext: 'sealed:Ana', iv: 'iv' } },
    { id: 'add', start: at('rua escura') + 10, end: at('rua escura') + 10, inserted: 'viela', author: { ciphertext: 'sealed:Ana', iv: 'iv' } },
    { id: 'docs', start: at(' voltou'), end: at(' voltou'), inserted: ' enfim', author: null },
  ],
}
const slots = [
  { id: 's1', projectId: 'p1', title: 'O retorno', isUnanchored: false, timelinePosition: 2 },
  { id: 's2', projectId: 'p1', title: 'A carta', isUnanchored: false, timelinePosition: 4 },
] as Slot[]

const petricorText = 'Marta guardou a carta antiga na gaveta.'
const petricorSuggestion = (id: string, removed: string, inserted: string): PetricorSuggestion => {
  const start = petricorText.indexOf(removed)
  return {
    id,
    slotId: 's2',
    status: 'OPEN',
    createdAt: '2026-11-03T12:00:00.000Z',
    author: 'Bia',
    start,
    end: start + removed.length,
    removed,
    inserted,
    before: petricorText.slice(Math.max(0, start - 40), start),
    after: petricorText.slice(start + removed.length, start + removed.length + 40),
  }
}

function docs(overrides: Partial<GoogleDocSyncState> = {}) {
  return {
    status: { available: true, connected: true, email: 'a@x.com', canComment: true },
    link: { url: 'https://docs.google.com/document/d/doc/edit' },
    syncNow: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as GoogleDocSyncState
}

async function show(googleDocs = docs(), onTextChanged = vi.fn()) {
  await act(async () => {
    render(
      <SuggestionsPage
        googleDocs={googleDocs}
        projectId="p1"
        projectKey={key}
        projectTitle="Livro"
        slots={slots}
        onTextChanged={onTextChanged}
      />,
    )
  })
  return { googleDocs, onTextChanged }
}

beforeEach(() => {
  listDocSuggestions.mockReset().mockResolvedValue({ sections: [section] })
  decideDocSuggestions.mockReset().mockResolvedValue({ accepted: 1, rejected: 0 })
  listPetricor.mockReset().mockResolvedValue([])
  decidePetricor.mockReset().mockResolvedValue({ changedSlotIds: ['s2'], notFound: [] })
  updateSuggestions.mockReset().mockResolvedValue([])
})

afterEach(() => {
  cleanup()
})

describe('SuggestionsPage with a linked Google Doc', () => {
  it('shows each suggestion as the text is and as it would be, with who made it', async () => {
    await show()
    expect(screen.getByText('O retorno')).toBeTruthy()
    expect(screen.getByText('Cena 3')).toBeTruthy()
    expect([...document.querySelectorAll('del')].map((node) => node.textContent)).toEqual(['rua escura'])
    expect([...document.querySelectorAll('ins')].map((node) => node.textContent)).toEqual(['viela', ' enfim'])
    expect(screen.getByText('de Ana')).toBeTruthy()
    expect(screen.getByText('do Docs')).toBeTruthy()
    expect(screen.getByText('Troca')).toBeTruthy()
    expect(screen.getByText('Inclusão')).toBeTruthy()
  })

  it('decides a replacement’s two parts together, syncs, then lists what is still open', async () => {
    const { googleDocs } = await show()
    listDocSuggestions.mockResolvedValue({ sections: [{ ...section, suggestions: [section.suggestions[2]] }] })
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Aceitar' })[0]))

    expect(decideDocSuggestions).toHaveBeenCalledWith('p1', [
      { suggestionId: 'del', accept: true },
      { suggestionId: 'add', accept: true },
    ])
    expect(googleDocs.syncNow).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toBe('1 sugestão aceita no Google Docs.')
    expect(screen.getAllByRole('button', { name: 'Aceitar' })).toHaveLength(1)
  })

  it('asks for permission to edit before deciding', async () => {
    const { googleDocs } = await show(docs({ status: { available: true, connected: true, email: null, canComment: false } }))
    expect((screen.getAllByRole('button', { name: 'Aceitar' })[0] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Permitir no Google' }))
    expect(googleDocs.connect).toHaveBeenCalledWith('comment')
  })

  it('shows why the doc could not be read', async () => {
    listDocSuggestions.mockRejectedValue(new Error('Sem acesso ao documento.'))
    await show()
    expect(screen.getByText('Sem acesso ao documento.')).toBeTruthy()
  })
})

describe('SuggestionsPage without a linked doc', () => {
  it('lists Petricor’s suggestions on the scene’s current text and applies the accepted ones', async () => {
    listPetricor.mockResolvedValue([
      petricorSuggestion('a', 'antiga', 'velha'),
      { ...petricorSuggestion('b', 'na gaveta', 'no cofre'), status: 'ACCEPTED' },
    ])
    const { onTextChanged } = await show(docs({ link: null }))
    expect(listDocSuggestions).not.toHaveBeenCalled()
    expect(screen.getByText('Cena 5')).toBeTruthy()
    expect([...document.querySelectorAll('del')].map((node) => node.textContent)).toEqual(['antiga'])
    expect(screen.getByText('de Bia')).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Aceitar' })))
    expect(decidePetricor).toHaveBeenCalledWith('p1', [{ suggestion: expect.objectContaining({ id: 'a' }), accept: true }])
    expect(onTextChanged).toHaveBeenCalledWith(['s2'])
  })

  it('sets apart suggestions whose passage was rewritten, to discard', async () => {
    listPetricor.mockResolvedValue([{ ...petricorSuggestion('c', 'antiga', 'velha'), removed: 'nova', before: 'x', after: 'y' }])
    await show(docs({ link: null }))
    expect(screen.getByText('Não encontradas no texto atual')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Descartar' })))
    expect(updateSuggestions).toHaveBeenCalledWith('p1', [{ suggestionId: 'c', status: 'CHANGED' }])
  })
})
