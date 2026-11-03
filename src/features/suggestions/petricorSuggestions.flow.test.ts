import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredSuggestion } from '../../api/contracts'
import { editsBetween } from './edits'
import { decideSuggestions, describeEdit, followSuggestions } from './petricorSuggestions'

// The cipher is a reversible stand-in: "sealed:" + JSON.
const stored: StoredSuggestion[] = []
const scenes = new Map<string, string>()
const updateSuggestions = vi.fn()
const saveSceneContent = vi.fn()

vi.mock('../../api/client', () => ({
  api: {
    listSuggestions: vi.fn(async () => stored),
    updateSuggestions: (projectId: string, updates: unknown) => updateSuggestions(projectId, updates),
    getSlotReview: vi.fn(async (slotId: string) => ({ content: { ciphertext: JSON.stringify({ content: scenes.get(slotId), genre: 'Drama' }), iv: 'iv' } })),
    saveSceneContent: (slotId: string, sealed: unknown) => saveSceneContent(slotId, sealed),
  },
}))
vi.mock('../../crypto/projectEncryption', () => ({
  encryptScene: vi.fn(async (_key: CryptoKey, text: string) => ({ ciphertext: `sealed:${text}`, iv: 'iv' })),
  decryptScene: vi.fn(async (_key: CryptoKey, ciphertext: string) => ciphertext.replace(/^sealed:/, '')),
  decryptSceneDraft: vi.fn(async (_key: CryptoKey, ciphertext: string) => JSON.parse(ciphertext)),
  encryptSceneDraft: vi.fn(async (_key: CryptoKey, draft: unknown) => ({ draft })),
}))

const key = {} as CryptoKey
const original = 'Marta guardou a carta antiga na gaveta. Lá fora chovia muito forte. Ela não dormiu.'

function suggest(id: string, slotId: string, from: string, to: string) {
  const [edit] = editsBetween(original, original.replace(from, to))
  const body = describeEdit(original, edit, 'Ana')
  stored.push({ id, slotId, status: 'OPEN', ciphertext: `sealed:${JSON.stringify(body)}`, iv: 'iv', createdAt: '', decidedAt: null })
}

beforeEach(() => {
  stored.length = 0
  scenes.clear()
  updateSuggestions.mockReset().mockResolvedValue([])
  saveSceneContent.mockReset().mockResolvedValue(undefined)
  suggest('moved', 's1', 'antiga', 'velha')
  suggest('applied', 's1', 'muito forte', 'sem parar')
  suggest('cut', 's1', 'não dormiu', 'adormeceu')
  suggest('elsewhere', 's2', 'antiga', 'velha')
})

describe('followSuggestions after an import', () => {
  it('settles each open suggestion on the changed scenes', async () => {
    const revised = `Prólogo novo. ${original.replace('muito forte', 'sem parar').replace(' Ela não dormiu.', '')}`
    const counts = await followSuggestions('p1', key, new Map([['s1', revised]]))

    expect(counts).toMatchObject({ OPEN: 1, ACCEPTED: 1, GONE: 1, CHANGED: 0 })
    const [, updates] = updateSuggestions.mock.calls[0] as [string, Array<{ suggestionId: string; status: string; ciphertext?: string }>]
    expect(updates.map(({ suggestionId, status }) => [suggestionId, status])).toEqual([
      ['moved', 'OPEN'],
      ['applied', 'ACCEPTED'],
      ['cut', 'GONE'],
    ])
    // The moved one is sealed again at its new place.
    const moved = JSON.parse(updates[0].ciphertext!.replace(/^sealed:/, ''))
    expect(revised.slice(moved.start, moved.end)).toBe('antiga')
  })
})

describe('decideSuggestions', () => {
  it('applies the accepted ones of a scene in one save, and records every decision', async () => {
    scenes.set('s1', original)
    const opened = stored.slice(0, 3).map((row) => ({ ...JSON.parse(row.ciphertext.replace(/^sealed:/, '')), id: row.id, slotId: row.slotId, status: row.status, createdAt: '' }))
    const result = await decideSuggestions('p1', key, [
      { suggestion: opened[0], accept: true },
      { suggestion: opened[1], accept: true },
      { suggestion: opened[2], accept: false },
    ])

    expect(result).toEqual({ changedSlotIds: ['s1'], notFound: [] })
    expect(saveSceneContent).toHaveBeenCalledOnce()
    expect(saveSceneContent.mock.calls[0][1]).toEqual({
      draft: { content: original.replace('antiga', 'velha').replace('muito forte', 'sem parar'), genre: 'Drama', focusMode: 'GENERAL' },
    })
    expect(updateSuggestions).toHaveBeenCalledWith('p1', [
      { suggestionId: 'moved', status: 'ACCEPTED' },
      { suggestionId: 'applied', status: 'ACCEPTED' },
      { suggestionId: 'cut', status: 'DECLINED' },
    ])
  })

  it('leaves open an accepted one that can no longer be found', async () => {
    scenes.set('s1', original.replace('carta antiga', 'carta'))
    const [first] = stored.map((row) => ({ ...JSON.parse(row.ciphertext.replace(/^sealed:/, '')), id: row.id, slotId: row.slotId, status: row.status, createdAt: '' }))
    const result = await decideSuggestions('p1', key, [{ suggestion: first, accept: true }])
    expect(result).toEqual({ changedSlotIds: [], notFound: ['moved'] })
    expect(saveSceneContent).not.toHaveBeenCalled()
    expect(updateSuggestions).not.toHaveBeenCalled()
  })
})
