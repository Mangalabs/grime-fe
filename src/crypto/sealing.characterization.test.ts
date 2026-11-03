import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Characterization of how text and versions are sealed: with a fixed key and
// fixed IVs the ciphertext is reproducible, so a change in the format (which
// would make stored data unreadable) shows up here.

const createVersion = vi.fn(async (_projectId: string, payload: unknown) => payload)
const getVersion = vi.fn()

vi.mock('../api/client', () => ({
  api: {
    createVersion: (projectId: string, payload: unknown) => createVersion(projectId, payload),
    getVersion: (projectId: string, versionId: string) => getVersion(projectId, versionId),
  },
}))

const { decryptScene, encryptScene, decryptSceneDraft, encryptSceneDraft } = await import('./projectEncryption')
const { openVersion, saveVersion } = await import('../features/versions/versions')

const key = await crypto.subtle.importKey('raw', new Uint8Array(32).map((_, index) => index), 'AES-GCM', false, ['encrypt', 'decrypt'])

const sha256 = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (byte) => byte.toString(16).padStart(2, '0')).join('')

// Each IV is 12 bytes counting up from the last one.
let counter = 0
beforeEach(() => {
  counter = 0
  // gzip stamps the current time in its header.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-30T12:00:00.000Z'))
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
    const bytes = array as unknown as Uint8Array
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (counter + index) % 256
    counter += 1
    return array
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('sealing (characterization)', () => {
  it('seals scene text the same way', async () => {
    const sealed = await encryptScene(key, 'Ela chegou à casa. Ação!')
    expect(sealed).toMatchSnapshot()
    expect(await decryptScene(key, sealed.ciphertext, sealed.iv)).toBe('Ela chegou à casa. Ação!')
  })

  it('seals a scene draft the same way', async () => {
    const sealed = await encryptSceneDraft(key, { content: 'Texto', genre: 'Drama', focusMode: 'GENERAL' })
    expect(sealed).toMatchSnapshot()
    expect(await decryptSceneDraft(key, sealed.ciphertext, sealed.iv)).toMatchSnapshot()
  })

  it('seals a version the same way, and opens it', async () => {
    const scenes = [
      { slotId: 's1', title: 'Um', content: 'Primeira cena, com acentuação.' },
      // Large enough to need more than one base64 chunk once packed.
      { slotId: 's2', title: 'Dois', content: Array.from({ length: 30_000 }, (_, index) => `palavra${index}`).join(' ') },
    ]
    const payload = (await saveVersion('p1', key, 'MANUAL', 'Antes da revisão', scenes as never)) as unknown as Record<string, unknown>
    expect({ ...payload, ciphertext: `${String(payload.ciphertext).length} chars`, ciphertextHead: String(payload.ciphertext).slice(0, 120), ciphertextSha256: await sha256(String(payload.ciphertext)) }).toMatchSnapshot()

    getVersion.mockResolvedValue({ ciphertext: payload.ciphertext, iv: payload.iv })
    const opened = await openVersion('p1', key, 'v1')
    expect(opened.scenes.map((scene: { slotId: string; content: string }) => [scene.slotId, scene.content.length])).toEqual([
      ['s1', 30],
      ['s2', scenes[1].content.length],
    ])
  })
})
