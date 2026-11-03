// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SuggestEditor } from './SuggestEditor'

const createDocSuggestions = vi.fn()
const createPetricor = vi.fn()

vi.mock('../../api/client', () => ({
  google: { createSuggestions: (projectId: string, body: unknown) => createDocSuggestions(projectId, body) },
}))
vi.mock('../../crypto/projectEncryption', () => ({
  encryptScene: vi.fn(async (_key: CryptoKey, text: string) => ({ ciphertext: `sealed:${text}`, iv: 'iv' })),
}))
vi.mock('../../features/suggestions/petricorSuggestions', () => ({
  createSuggestions: (...args: unknown[]) => createPetricor(...args),
}))

const text = 'Ela andou pela rua escura e voltou.'
const key = {} as CryptoKey

function show(isLinked: boolean) {
  const onSent = vi.fn()
  render(
    <SuggestEditor
      isLinked={isLinked}
      projectId="p1"
      projectKey={key}
      sceneTitle="O retorno"
      slotId="s1"
      text={text}
      onClose={vi.fn()}
      onSent={onSent}
    />,
  )
  return onSent
}

const edit = (value: string) => fireEvent.change(screen.getByLabelText('Texto com as suas sugestões'), { target: { value } })
const name = (value: string) => fireEvent.change(screen.getByPlaceholderText('Quem está sugerindo'), { target: { value } })

beforeEach(() => {
  createDocSuggestions.mockReset().mockResolvedValue({ created: 2 })
  createPetricor.mockReset().mockResolvedValue([])
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('SuggestEditor', () => {
  it('turns the edits into suggestions shown as they would read', () => {
    show(true)
    edit('Ela andou pela viela e voltou cansada.')
    expect(screen.getByText('2 sugestões')).toBeTruthy()
    expect([...document.querySelectorAll('del')].map((node) => node.textContent?.trim())).toEqual(['rua escura', 'voltou.'])
  })

  it('needs a name and a change before sending', () => {
    show(true)
    const send = () => screen.getByRole('button', { name: /^Sugerir/ }) as HTMLButtonElement
    expect(send().disabled).toBe(true)
    edit('Ela andou pela viela e voltou.')
    expect(send().disabled).toBe(true)
    name('Ana')
    expect(send().disabled).toBe(false)
  })

  it('makes them suggestions in the linked doc, with the name sealed', async () => {
    const onSent = show(true)
    edit('Ela andou pela viela e voltou.')
    name(' Ana ')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sugerir 1 alteração' })))
    expect(createDocSuggestions).toHaveBeenCalledWith('p1', {
      slotId: 's1',
      edits: [{ start: 15, end: 25, removed: 'rua escura', inserted: 'viela' }],
      author: { ciphertext: 'sealed:Ana', iv: 'iv' },
    })
    expect(onSent).toHaveBeenCalledWith(1)
    expect(localStorage.getItem('petricor:suggester-name')).toBe('Ana')
  })

  it('keeps them in Petricor without a doc', async () => {
    show(false)
    edit('Ela andou pela viela e voltou.')
    name('Ana')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sugerir 1 alteração' })))
    expect(createPetricor).toHaveBeenCalledWith('p1', key, 's1', text, [{ start: 15, end: 25, removed: 'rua escura', inserted: 'viela' }], 'Ana')
    expect(createDocSuggestions).not.toHaveBeenCalled()
  })

  it('says why sending failed, and stays open', async () => {
    createDocSuggestions.mockRejectedValue(new Error('O texto desta cena mudou no Google Docs.'))
    const onSent = show(true)
    edit('Ela andou pela viela e voltou.')
    name('Ana')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sugerir 1 alteração' })))
    expect(screen.getByText('O texto desta cena mudou no Google Docs.')).toBeTruthy()
    expect(onSent).not.toHaveBeenCalled()
  })
})
