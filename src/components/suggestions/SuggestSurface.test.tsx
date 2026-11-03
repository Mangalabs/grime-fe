// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SuggestSurface } from './SuggestSurface'

const send = vi.fn()
vi.mock('../../features/suggestions/sendSuggestions', () => ({
  sendSuggestions: (options: unknown) => send(options),
  rememberedSuggester: () => 'Ana',
  rememberSuggester: vi.fn(),
}))

const text = 'Ela andou pela rua escura.'
const key = {} as CryptoKey

function show() {
  const onPendingChange = vi.fn()
  const onDone = vi.fn()
  render(
    <SuggestSurface
      isLinked
      projectId="p1"
      projectKey={key}
      slotId="s1"
      text={text}
      onDone={onDone}
      onPendingChange={onPendingChange}
    />,
  )
  return { onPendingChange, onDone, surface: screen.getByLabelText('Texto da cena: escreva para sugerir') }
}

// Puts the selection at visual positions of the surface's text.
function select(surface: HTMLElement, from: number, to = from) {
  const place = (position: number) => {
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
    let seen = 0
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (position <= seen + node.length) return { node, offset: position - seen }
      seen += node.length
    }
    throw new Error('outside the text')
  }
  const start = place(from)
  const end = place(to)
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

function input(surface: HTMLElement, inputType: string, data: string | null = null) {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true })
  act(() => {
    surface.dispatchEvent(event)
  })
  return event
}

// The surface as text with marks: +[added] and -[struck].
const shown = (surface: HTMLElement) =>
  [...surface.childNodes]
    .map((node) => (node.nodeName === 'INS' ? `+[${node.textContent}]` : node.nodeName === 'DEL' ? `-[${node.textContent}]` : node.textContent))
    .join('')

beforeEach(() => {
  send.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('SuggestSurface', () => {
  it('shows typed text as an addition, and the browser’s own edit never happens', () => {
    const { surface } = show()
    select(surface, text.indexOf(' pela'))
    const event = input(surface, 'insertText', ' devagar')
    expect(event.defaultPrevented).toBe(true)
    expect(shown(surface)).toBe('Ela andou+[ devagar] pela rua escura.')
  })

  it('strikes original text on backspace, and replaces a selection after it', () => {
    const { surface } = show()
    select(surface, text.indexOf('.'))
    input(surface, 'deleteContentBackward')
    expect(shown(surface)).toBe('Ela andou pela rua escur-[a].')

    const from = text.indexOf('rua')
    select(surface, from, from + 3)
    input(surface, 'insertText', 'viela')
    expect(shown(surface)).toBe('Ela andou pela -[rua]+[viela] escur-[a].')
  })

  it('undoes the last change', () => {
    const { surface } = show()
    select(surface, 0)
    input(surface, 'insertText', 'Então ')
    input(surface, 'historyUndo')
    expect(shown(surface)).toBe(text)
  })

  it('takes accents composed by the keyboard', () => {
    const { surface } = show()
    select(surface, text.indexOf(' pela'))
    act(() => {
      surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      surface.dispatchEvent(new CompositionEvent('compositionend', { data: ' já', bubbles: true }))
    })
    // Composing remounts the text (what the browser typed is dropped): look again.
    const redrawn = screen.getByLabelText('Texto da cena: escreva para sugerir')
    expect(redrawn).not.toBe(surface)
    expect(shown(redrawn)).toBe('Ela andou+[ já] pela rua escura.')
    // And the caret is where the accent ended, ready for the next key.
    expect(document.activeElement).toBe(redrawn)
  })

  it('tells how many changes wait, and sends them with the name', async () => {
    const { surface, onPendingChange, onDone } = show()
    select(surface, text.indexOf('rua'), text.indexOf('rua') + 3)
    input(surface, 'insertText', 'viela')
    expect(onPendingChange).toHaveBeenLastCalledWith(1)
    expect(screen.getByText('1 alteração')).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Google Docs' })))
    expect(send).toHaveBeenCalledWith({
      projectId: 'p1',
      projectKey: key,
      slotId: 's1',
      text,
      edits: [{ start: 15, end: 18, removed: 'rua', inserted: 'viela' }],
      author: 'Ana',
      isLinked: true,
    })
    expect(onDone).toHaveBeenCalledWith(1)
  })

  it('needs a name to send', () => {
    const { surface } = show()
    select(surface, 0)
    input(surface, 'insertText', 'x')
    fireEvent.change(screen.getByPlaceholderText('Seu nome'), { target: { value: ' ' } })
    expect((screen.getByRole('button', { name: 'Enviar ao Google Docs' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('leaves without asking when nothing changed', () => {
    const { onDone } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(onDone).toHaveBeenCalledWith(0)
  })
})
