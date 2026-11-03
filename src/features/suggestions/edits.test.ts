import { describe, expect, it } from 'vitest'
import { applyEdits, editsBetween } from './edits'

const original = 'Ela andou pela rua escura. Depois voltou cansada.\n\nFim.'

describe('editsBetween', () => {
  it('finds a replacement, an insertion and a deletion', () => {
    const edited = 'Ela andou pela viela. Depois enfim voltou.\n\nFim.'
    const edits = editsBetween(original, edited)
    expect(edits.map(({ removed, inserted }) => [removed, inserted])).toEqual([
      ['rua escura. ', 'viela. '],
      ['voltou cansada.', 'enfim voltou.'],
    ])
    for (const edit of edits) expect(original.slice(edit.start, edit.end)).toBe(edit.removed)
  })

  it('joins changes with only a space between them', () => {
    const edits = editsBetween('a rua escura e fria', 'a viela clara e fria')
    expect(edits).toEqual([{ start: 2, end: 12, removed: 'rua escura', inserted: 'viela clara' }])
  })

  it('treats a change of spacing or line breaks as a change', () => {
    expect(editsBetween('um  dois', 'um dois')).toEqual([{ start: 2, end: 4, removed: '  ', inserted: ' ' }])
    expect(editsBetween('um\ndois', 'um\n\ndois').map((edit) => edit.inserted)).toEqual(['\n\n'])
  })

  it('finds nothing in an unchanged text', () => {
    expect(editsBetween(original, original)).toEqual([])
  })

  it('always gives the edited text back when applied', () => {
    const samples = [
      ['', 'Novo texto.'],
      ['Texto inteiro.', ''],
      [original, 'Outra coisa completamente diferente.'],
      [original, original.replace('Fim.', 'Fim, enfim.').replace('Ela', 'Ana')],
      ['a b c d e f', 'a x c y e z'],
    ]
    for (const [before, after] of samples) {
      expect(applyEdits(before, editsBetween(before, after))).toBe(after)
    }
  })
})
