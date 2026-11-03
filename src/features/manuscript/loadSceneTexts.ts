import { api } from '../../api/client'
import type { Slot } from '../../api/contracts'
import { decryptSceneDraft } from '../../crypto/projectEncryption'
import { mapWithConcurrency } from './concurrency'

/** A scene's stored draft, with the defaults a scene without them uses. */
export interface SceneDraft {
  content: string
  genre: string
  focusMode: string
}

/**
 * Fetches and decrypts each scene's draft, a few at a time. Scenes without
 * stored text come back as null. Results keep the order of `slots`.
 */
export function loadSceneDrafts(
  projectKey: CryptoKey,
  slots: Slot[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 6,
): Promise<Array<SceneDraft | null>> {
  let done = 0
  return mapWithConcurrency(
    slots,
    concurrency,
    async (slot) => {
      const review = await api.getSlotReview(slot.id)
      if (!review.content) return null
      const draft = await decryptSceneDraft(projectKey, review.content.ciphertext, review.content.iv)
      return { content: draft.content ?? '', genre: draft.genre ?? '', focusMode: draft.focusMode ?? 'GENERAL' }
    },
    () => {
      done += 1
      onProgress?.(done, slots.length)
    },
  )
}

/**
 * Each scene's text, trimmed; '' for scenes without stored text. Results keep
 * the order of `slots`.
 */
export async function loadSceneTexts(
  projectKey: CryptoKey,
  slots: Slot[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 6,
): Promise<string[]> {
  const drafts = await loadSceneDrafts(projectKey, slots, onProgress, concurrency)
  return drafts.map((draft) => draft?.content.trim() ?? '')
}
