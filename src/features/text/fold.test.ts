import { describe, expect, it } from 'vitest'
import { foldText } from './fold'
import { plural } from './plural'

// The expressions foldText replaced, kept here to prove nothing changed.
const searchFold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')
const slugFold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Portuguese and other accents, ligatures, Turkish and Lithuanian letters
// (where lower-casing can depend on the locale), symbols and random code points.
const fixed = ['Ação', 'ÉVORA', 'Coração', 'İstanbul', 'IĞDIR', 'Įėjimas', 'Straße', 'ǅemal', 'ﬁm', 'ΣΊΣΥΦΟΣ', 'Ññ', 'é', '¨^`´', '']
let seed = 7
const random = () => (seed = (seed * 48271) % 2147483647)
const randomText = () => String.fromCodePoint(...Array.from({ length: 12 }, () => random() % 0x2fff))
const corpus = [...fixed, ...Array.from({ length: 2000 }, randomText)]

describe('foldText', () => {
  it('equals the search fold it replaced', () => {
    for (const text of corpus) expect(foldText(text)).toBe(searchFold(text))
  })

  it('equals the file-name fold it replaced', () => {
    for (const text of corpus) expect(foldText(text)).toBe(slugFold(text))
  })
})

describe('plural', () => {
  it('agrees and writes pt-BR digits', () => {
    expect(plural(1, 'cena', 'cenas')).toBe('1 cena')
    expect(plural(0, 'cena', 'cenas')).toBe('0 cenas')
    expect(plural(1234, 'cena', 'cenas')).toBe('1.234 cenas')
  })
})
