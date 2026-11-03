// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleDocSuggestionSection, Slot } from '../../api/contracts'
import type { GoogleDocSyncState } from '../../features/googleDocs/useGoogleDocSync'
import { SuggestionsPage } from './SuggestionsPage'

const listSuggestions = vi.fn()
const decideSuggestions = vi.fn()

vi.mock('../../api/client', () => ({
  google: {
    listSuggestions: (projectId: string) => listSuggestions(projectId),
    decideSuggestions: (projectId: string, decisions: unknown) => decideSuggestions(projectId, decisions),
  },
}))

const text = 'Ela andou pela rua escura. Depois voltou.'
const section: GoogleDocSuggestionSection = {
  key: 'h.um',
  title: 'O retorno',
  slotId: 's1',
  text,
  suggestions: [
    { id: 'troca', start: text.indexOf('rua escura'), end: text.indexOf('rua escura') + 10, inserted: 'viela' },
    { id: 'mais', start: text.indexOf(' voltou'), end: text.indexOf(' voltou'), inserted: ' enfim' },
  ],
}
const slots = [{ id: 's1', projectId: 'p1', title: 'O retorno', isUnanchored: false, timelinePosition: 2 }] as Slot[]

function docs(overrides: Partial<GoogleDocSyncState> = {}) {
  return {
    status: { available: true, connected: true, email: 'a@x.com', canComment: true },
    link: { url: 'https://docs.google.com/document/d/doc/edit' },
    syncNow: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as GoogleDocSyncState
}

async function show(googleDocs = docs()) {
  await act(async () => {
    render(<SuggestionsPage googleDocs={googleDocs} projectId="p1" projectTitle="Livro" slots={slots} />)
  })
  return googleDocs
}

beforeEach(() => {
  listSuggestions.mockReset().mockResolvedValue({ sections: [section] })
  decideSuggestions.mockReset().mockResolvedValue({ accepted: 1, rejected: 0 })
})

afterEach(() => {
  cleanup()
})

describe('SuggestionsPage', () => {
  it('shows each suggestion as the text is and as it would be', async () => {
    await show()
    expect(screen.getByText('O retorno')).toBeTruthy()
    expect(screen.getByText('Cena 3')).toBeTruthy()
    expect([...document.querySelectorAll('del')].map((node) => node.textContent)).toEqual(['rua escura'])
    expect([...document.querySelectorAll('ins')].map((node) => node.textContent)).toEqual(['viela', ' enfim'])
    expect(screen.getAllByText('do Docs')).toHaveLength(2)
    expect(screen.getByText('Troca')).toBeTruthy()
    expect(screen.getByText('Inclusão')).toBeTruthy()
  })

  it('accepts in the doc, syncs, then lists what is still open', async () => {
    const googleDocs = await show()
    listSuggestions.mockResolvedValue({ sections: [{ ...section, suggestions: [section.suggestions[1]] }] })
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Aceitar' })[0]))

    expect(decideSuggestions).toHaveBeenCalledWith('p1', [{ suggestionId: 'troca', accept: true }])
    expect(googleDocs.syncNow).toHaveBeenCalledOnce()
    expect(listSuggestions).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status').textContent).toBe('1 sugestão aceita no Google Docs.')
    expect(screen.getAllByRole('button', { name: 'Aceitar' })).toHaveLength(1)
  })

  it('decides a whole scene at once', async () => {
    await show()
    decideSuggestions.mockResolvedValue({ accepted: 0, rejected: 2 })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Recusar todas' })))
    expect(decideSuggestions).toHaveBeenCalledWith('p1', [
      { suggestionId: 'troca', accept: false },
      { suggestionId: 'mais', accept: false },
    ])
  })

  it('asks for permission to edit before deciding', async () => {
    const googleDocs = await show(docs({ status: { available: true, connected: true, email: null, canComment: false } }))
    expect((screen.getAllByRole('button', { name: 'Aceitar' })[0] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Permitir no Google' }))
    expect(googleDocs.connect).toHaveBeenCalledWith('comment')
  })

  it('explains what to do without a linked doc', async () => {
    await show(docs({ link: null }))
    expect(listSuggestions).not.toHaveBeenCalled()
    expect(screen.getByText(/Vincule um Google Doc/)).toBeTruthy()
  })

  it('shows why the doc could not be read', async () => {
    listSuggestions.mockRejectedValue(new Error('Sem acesso ao documento.'))
    await show()
    expect(screen.getByText('Sem acesso ao documento.')).toBeTruthy()
  })
})
