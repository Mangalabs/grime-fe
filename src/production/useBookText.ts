import { useEffect, useState } from 'react'
import { ApiError, api } from '../api/client'
import { decryptScene } from '../crypto/projectEncryption'
import { loadSceneTexts } from '../features/manuscript/loadSceneTexts'
import { normalizeKit } from '../marketing/marketingKit'
import { timeline } from '../marketing/worldPack'
import { textStats, type TextStats } from './estimate'

export type BookTextState =
  | { status: 'loading'; progress: string }
  | { status: 'ready'; stats: TextStats; genre: string }
  | { status: 'error'; message: string }

const orNull = <T,>(load: Promise<T>) =>
  load.catch((reason: unknown) => {
    if (reason instanceof ApiError && reason.status === 404) return null
    throw reason
  })

/**
 * The manuscript as production needs it: characters, paragraphs and scenes in
 * reading order, decrypted here in the browser (nothing is sent anywhere),
 * and the genre, to suggest a format.
 */
export function useBookText(projectId: string, projectKey: CryptoKey) {
  const [state, setState] = useState<BookTextState>({ status: 'loading', progress: 'Abrindo o projeto…' })

  useEffect(() => {
    let isCurrent = true
    const run = async () => {
      const [slots, review, storedKit] = await Promise.all([
        api.listProjectSlots(projectId),
        orNull(api.getLatestArchitecturalReview(projectId)),
        orNull(api.getMarketingKit(projectId)),
      ])
      const ordered = timeline(slots)
      const texts = await loadSceneTexts(projectKey, ordered, (done, total) => {
        if (isCurrent) setState({ status: 'loading', progress: `Lendo as cenas: ${done} de ${total}` })
      })
      // The genre written in /marketing wins over the one the review detected.
      const kitGenre = storedKit
        ? normalizeKit(JSON.parse(await decryptScene(projectKey, storedKit.ciphertext, storedKit.iv))).book.genre
        : ''
      if (!isCurrent) return
      setState({
        status: 'ready',
        stats: textStats(ordered.map((slot, index) => ({ text: texts[index], groupId: slot.groupId ?? null }))),
        genre: kitGenre || review?.genre || '',
      })
    }
    run().catch((reason: unknown) => {
      if (isCurrent) setState({ status: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível ler o livro.' })
    })
    return () => {
      isCurrent = false
    }
  }, [projectId, projectKey])

  return state
}
