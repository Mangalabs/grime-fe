import { api } from '../../api/client'
import type { Slot } from '../../api/contracts'
import { decryptSceneDraft } from '../../crypto/projectEncryption'

/**
 * Fetches and decrypts the text of each scene, a few at a time. Scenes
 * without stored text come back as ''. Results keep the order of `slots`.
 */
export async function loadSceneTexts(
  projectKey: CryptoKey,
  slots: Slot[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 6,
): Promise<string[]> {
  const texts = new Array<string>(slots.length).fill('')
  let next = 0
  let done = 0

  async function worker() {
    while (next < slots.length) {
      const index = next
      next += 1
      const review = await api.getSlotReview(slots[index].id)
      if (review.content) {
        const draft = await decryptSceneDraft(projectKey, review.content.ciphertext, review.content.iv)
        texts[index] = draft.content?.trim() ?? ''
      }
      done += 1
      onProgress?.(done, slots.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, slots.length) }, worker))
  return texts
}
