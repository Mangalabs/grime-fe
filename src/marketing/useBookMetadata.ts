import { useCallback, useRef, useState } from 'react'
import { ApiError, api } from '../api/client'
import { loadSceneTexts } from '../features/manuscript/loadSceneTexts'
import { bookMetadata, type BookMetadata } from './bookMetadata'
import { timeline, type StoryData } from './worldPack'

export type MetadataState =
  | { status: 'idle' }
  | { status: 'loading'; progress: string }
  | { status: 'ready'; metadata: BookMetadata }
  | { status: 'error'; message: string }

/**
 * The book's figures, computed once per session when first needed: the
 * scenes are decrypted here, in the browser, and nothing is sent anywhere.
 */
export function useBookMetadata(projectId: string, projectKey: CryptoKey, story: StoryData | null) {
  const [state, setState] = useState<MetadataState>({ status: 'idle' })
  const running = useRef(false)

  const load = useCallback(async () => {
    if (!story || running.current) return
    running.current = true
    setState({ status: 'loading', progress: 'Abrindo as cenas…' })
    try {
      const ordered = timeline(story.slots)
      const texts = await loadSceneTexts(projectKey, ordered, (done, total) =>
        setState({ status: 'loading', progress: `Lendo as cenas: ${done} de ${total}` }),
      )
      const review = await api.getLatestArchitecturalReview(projectId).catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 404) return null
        throw reason
      })
      setState({
        status: 'ready',
        metadata: bookMetadata(
          story,
          ordered.map((slot, index) => ({ order: index + 1, title: slot.title, text: texts[index] })),
          review,
        ),
      })
    } catch (reason) {
      setState({ status: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível ler o livro.' })
    } finally {
      running.current = false
    }
  }, [projectId, projectKey, story])

  return { state, load }
}

export type BookMetadataHandle = ReturnType<typeof useBookMetadata>
