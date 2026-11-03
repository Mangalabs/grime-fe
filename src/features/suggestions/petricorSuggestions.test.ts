import { describe, expect, it } from 'vitest'
import { editsBetween } from './edits'
import { describeEdit, followSuggestion, locate } from './petricorSuggestions'

const text = 'Primeiro parágrafo. Ela andou pela rua escura e voltou cansada para casa.'
const [edit] = editsBetween(text, text.replace('rua escura', 'viela'))
const suggestion = describeEdit(text, edit, 'Ana')

describe('locate', () => {
  it('finds the passage at its place', () => {
    expect(locate(text, suggestion)).toEqual({ start: edit.start, end: edit.end })
  })

  it('finds it again after text was added before it', () => {
    const moved = `Um novo começo. ${text}`
    const place = locate(moved, suggestion)!
    expect(moved.slice(place.start, place.end)).toBe('rua escura')
  })

  it('does not guess when the passage changed', () => {
    expect(locate(text.replace('rua escura', 'rua clara'), suggestion)).toBeNull()
  })
})

describe('followSuggestion', () => {
  it('stays open when the passage is still there', () => {
    expect(followSuggestion(`Antes. ${text}`, suggestion)).toMatchObject({ status: 'OPEN' })
  })

  it('is accepted when the text now reads as suggested', () => {
    expect(followSuggestion(text.replace('rua escura', 'viela'), suggestion)).toEqual({ status: 'ACCEPTED' })
  })

  it('changed when its surroundings are there but rewritten otherwise', () => {
    expect(followSuggestion(text.replace('rua escura', 'estrada'), suggestion)).toEqual({ status: 'CHANGED' })
  })

  it('is gone when the whole passage was cut', () => {
    expect(followSuggestion('Um texto inteiramente diferente agora.', suggestion)).toEqual({ status: 'GONE' })
  })

  it('handles a pure insertion and a pure deletion', () => {
    const [insertion] = editsBetween(text, text.replace('voltou', 'enfim voltou'))
    const added = describeEdit(text, insertion, 'Bia')
    expect(followSuggestion(text, added)).toMatchObject({ status: 'OPEN' })
    expect(followSuggestion(text.replace('voltou', 'enfim voltou'), added)).toEqual({ status: 'ACCEPTED' })

    const [deletion] = editsBetween(text, text.replace(' cansada', ''))
    const removed = describeEdit(text, deletion, 'Bia')
    expect(followSuggestion(text.replace(' cansada', ''), removed)).toEqual({ status: 'ACCEPTED' })
  })
})
