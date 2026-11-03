import { describe, expect, it } from 'vitest'
import { buildHunks, decisionIds, mergeReplacements, suggestionKind } from './hunks'

const text = 'Primeiro parágrafo.\nEla andou pela rua escura e voltou.\nÚltimo.'
const at = (passage: string) => text.indexOf(passage)

describe('buildHunks', () => {
  it('shows the paragraph as it is and as it would be', () => {
    const start = at('rua escura')
    const [hunk] = buildHunks(text, [{ id: 's1', start, end: start + 'rua escura'.length, inserted: 'viela' }])
    expect(hunk.before).toEqual([
      { text: 'Ela andou pela ', change: 'same' },
      { text: 'rua escura', change: 'removed' },
      { text: ' e voltou.', change: 'same' },
    ])
    expect(hunk.after).toEqual([
      { text: 'Ela andou pela ', change: 'same' },
      { text: 'viela', change: 'added' },
      { text: ' e voltou.', change: 'same' },
    ])
  })

  it('handles insertions at the very start and deletions at the very end', () => {
    const hunks = buildHunks(text, [
      { id: 'end', start: at('Último.'), end: text.length, inserted: '' },
      { id: 'start', start: 0, end: 0, inserted: 'Antes. ' },
    ])
    expect(hunks.map((hunk) => hunk.suggestion.id)).toEqual(['start', 'end'])
    expect(hunks[0].after).toEqual([
      { text: 'Antes. ', change: 'added' },
      { text: 'Primeiro parágrafo.', change: 'same' },
    ])
    expect(hunks[1].before).toEqual([{ text: 'Último.', change: 'removed' }])
    expect(hunks[1].after).toEqual([])
  })

  it('cuts long paragraphs around the change', () => {
    const long = `${'a'.repeat(400)}X${'b'.repeat(400)}`
    const [hunk] = buildHunks(long, [{ id: 's', start: 400, end: 401, inserted: 'Y' }])
    expect(hunk.before[0].text.startsWith('…')).toBe(true)
    expect(hunk.before[2].text.endsWith('…')).toBe(true)
  })

  it('stays inside the text when it changed since', () => {
    const [hunk] = buildHunks('Curto.', [{ id: 's', start: 50, end: 60, inserted: 'x' }])
    expect(hunk.after).toEqual([
      { text: 'Curto.', change: 'same' },
      { text: 'x', change: 'added' },
    ])
  })
})

describe('suggestionKind', () => {
  it('names what the suggestion does', () => {
    expect(suggestionKind({ id: 'a', start: 1, end: 3, inserted: 'x' })).toBe('replace')
    expect(suggestionKind({ id: 'b', start: 1, end: 1, inserted: 'x' })).toBe('insert')
    expect(suggestionKind({ id: 'c', start: 1, end: 3, inserted: '' })).toBe('delete')
  })
})

describe('mergeReplacements', () => {
  it('joins a removal and the insertion right after it, by the same person', () => {
    const merged = mergeReplacements([
      { id: 'add', start: 10, end: 10, inserted: 'viela', author: 'Ana' },
      { id: 'del', start: 0, end: 10, inserted: '', author: 'Ana' },
      { id: 'other', start: 10, end: 10, inserted: 'x', author: 'Bia' },
    ])
    expect(merged).toEqual([
      { id: 'del', ids: ['del', 'add'], start: 0, end: 10, inserted: 'viela', author: 'Ana' },
      { id: 'other', start: 10, end: 10, inserted: 'x', author: 'Bia' },
    ])
    expect(decisionIds(merged[0])).toEqual(['del', 'add'])
    expect(decisionIds(merged[1])).toEqual(['other'])
  })

  it('keeps apart neighbouring suggestions typed in Docs', () => {
    const fromDocs = [
      { id: 'del', start: 0, end: 10, inserted: '', author: null },
      { id: 'add', start: 10, end: 10, inserted: 'viela', author: null },
    ]
    expect(mergeReplacements(fromDocs)).toEqual(fromDocs)
  })

  it('keeps apart changes that only touch', () => {
    const apart = [
      { id: 'a', start: 0, end: 5, inserted: 'x' },
      { id: 'b', start: 5, end: 5, inserted: 'y' },
    ]
    expect(mergeReplacements(apart)).toEqual(apart)
  })
})
