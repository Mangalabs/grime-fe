import { describe, expect, it } from 'vitest'
import { applyEdits } from './edits'
import {
  deleteBackward,
  deleteForward,
  deleteRange,
  draftEdits,
  draftPieces,
  insertText,
  startDraft,
  visualLength,
  type DraftChange,
  type SuggestDraft,
} from './suggestDraft'

const original = 'Ela andou pela rua escura.'
const visual = (draft: SuggestDraft) => draftPieces(draft).map((piece) => piece.text).join('')
const shown = (draft: SuggestDraft) =>
  draftPieces(draft)
    .map((piece) => (piece.kind === 'added' ? `+[${piece.text}]` : piece.kind === 'removed' ? `-[${piece.text}]` : piece.text))
    .join('')

// Runs a sequence of keystroke-like steps from the caret's place each time.
function type(start: SuggestDraft, caret: number, steps: Array<(draft: SuggestDraft, caret: number) => DraftChange>) {
  return steps.reduce((change, step) => step(change.draft, change.caret), { draft: start, caret })
}

describe('suggesting mode', () => {
  it('adds typed text without touching the original', () => {
    const at = original.indexOf(' pela')
    const { draft, caret } = insertText(startDraft(original), at, ' devagar')
    expect(shown(draft)).toBe('Ela andou+[ devagar] pela rua escura.')
    expect(caret).toBe(at + 8)
    expect(visual(draft).length).toBe(visualLength(draft))
  })

  it('keeps typing in the same addition', () => {
    const at = original.indexOf(' pela')
    const { draft } = type(startDraft(original), at, [
      (d, c) => insertText(d, c, ' de'),
      (d, c) => insertText(d, c, 'vagar'),
    ])
    expect(shown(draft)).toBe('Ela andou+[ devagar] pela rua escura.')
  })

  it('strikes the selection and writes the new text after it', () => {
    const from = original.indexOf('rua escura')
    const { draft } = type(startDraft(original), 0, [
      (d) => deleteRange(d, from, from + 'rua escura'.length),
      (d, c) => insertText(d, c, 'viela'),
    ])
    expect(shown(draft)).toBe('Ela andou pela -[rua escura]+[viela].')
    expect(draftEdits(draft)).toEqual([{ start: from, end: from + 10, removed: 'rua escura', inserted: 'viela' }])
  })

  it('backspace marks original text and steps over what is already struck', () => {
    const end = original.indexOf('.')
    const { draft, caret } = type(startDraft(original), end, [
      (d, c) => deleteBackward(d, c),
      (d, c) => deleteBackward(d, c),
    ])
    expect(shown(draft)).toBe('Ela andou pela rua escu-[ra].')
    expect(caret).toBe(end - 2)
    // From after the struck text, the next backspace strikes the "u" before it.
    expect(shown(deleteBackward(draft, end).draft)).toBe('Ela andou pela rua esc-[ura].')
  })

  it('backspace and delete really remove the reviewer’s own text', () => {
    const at = original.indexOf(' pela')
    const typed = insertText(startDraft(original), at, ' xy')
    expect(shown(deleteBackward(typed.draft, typed.caret).draft)).toBe('Ela andou+[ x] pela rua escura.')
    expect(shown(deleteForward(typed.draft, at).draft)).toBe('Ela andou+[xy] pela rua escura.')
  })

  it('delete strikes forward, skipping struck text', () => {
    const at = original.indexOf('rua')
    const { draft, caret } = type(startDraft(original), at, [
      (d, c) => deleteForward(d, c),
      (d, c) => deleteForward(d, c),
    ])
    expect(shown(draft)).toBe('Ela andou pela -[ru]a escura.')
    expect(caret).toBe(at + 2)
  })

  it('does nothing past the ends', () => {
    const draft = startDraft(original)
    expect(deleteBackward(draft, 0)).toEqual({ draft, caret: 0 })
    expect(deleteForward(draft, original.length)).toEqual({ draft, caret: original.length })
  })

  it('a selection over added and original text removes one and strikes the other', () => {
    const at = original.indexOf(' pela')
    const typed = insertText(startDraft(original), at, ' devagar')
    // From inside " devagar" to the end of "pela".
    const from = at + 4
    const to = at + ' devagar'.length + ' pela'.length
    const { draft } = deleteRange(typed.draft, from, to)
    expect(shown(draft)).toBe('Ela andou+[ dev]-[ pela] rua escura.')
  })

  it('turns any mix of changes into edits that rebuild the reviewer’s text', () => {
    const { draft } = type(startDraft(original), 0, [
      (d, c) => insertText(d, c, 'Então '),
      (d) => deleteRange(d, 'Então Ela andou pela '.length, 'Então Ela andou pela rua'.length),
      (d, c) => insertText(d, c, 'viela'),
      (d) => deleteBackward(d, visualLength(d)),
      (d, c) => insertText(d, c, '!\nFim'),
    ])
    const accepted = draftPieces(draft)
      .filter((piece) => piece.kind !== 'removed')
      .map((piece) => piece.text)
      .join('')
    expect(accepted).toBe('Então Ela andou pela viela escura!\nFim')
    const edits = draftEdits(draft)
    expect(applyEdits(original, edits)).toBe(accepted)
    for (const edit of edits) expect(original.slice(edit.start, edit.end)).toBe(edit.removed)
  })

  it('has no edits until something changes', () => {
    expect(draftEdits(startDraft(original))).toEqual([])
    expect(draftEdits(startDraft(''))).toEqual([])
    expect(draftEdits(insertText(startDraft(''), 0, 'Novo').draft)).toEqual([{ start: 0, end: 0, removed: '', inserted: 'Novo' }])
  })
})
