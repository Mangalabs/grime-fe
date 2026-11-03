import { useEffect, useState } from 'react'
import type { Slot } from '../../api/contracts'
import { loadSceneDrafts, type SceneDraft } from '../../features/manuscript/loadSceneTexts'
import { orderScenes } from '../../features/scenes/sceneStatus'

export interface LoadedScene {
  slot: Slot
  draft: SceneDraft
}

export type SceneLoad =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'ready'; scenes: LoadedScene[] }
  | { kind: 'error'; message: string }

/**
 * Reads and decrypts the scenes once, in reading order, as they were when the
 * dialog opened (later list updates don't restart it). Scenes without text
 * are left out.
 */
export function useSceneDrafts(slots: Slot[], projectKey: CryptoKey): SceneLoad {
  const [scanned] = useState(slots)
  const [load, setLoad] = useState<SceneLoad>({ kind: 'loading', done: 0, total: slots.length })

  useEffect(() => {
    let isCurrent = true
    const ordered = orderScenes(scanned)
    loadSceneDrafts(projectKey, ordered, (done, total) => {
      if (isCurrent) setLoad({ kind: 'loading', done, total })
    })
      .then((drafts) => {
        if (!isCurrent) return
        setLoad({ kind: 'ready', scenes: drafts.flatMap((draft, index) => (draft ? [{ slot: ordered[index], draft }] : [])) })
      })
      .catch((reason) => {
        if (isCurrent) setLoad({ kind: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível ler as cenas.' })
      })
    return () => {
      isCurrent = false
    }
  }, [projectKey, scanned])

  return load
}

/** The keys the reviewer unticked; everything else is applied. */
export function useExclusions() {
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const toggle = (keys: string[], include: boolean) =>
    setExcluded((current) => {
      const next = new Set(current)
      for (const key of keys) {
        if (include) next.delete(key)
        else next.add(key)
      }
      return next
    })
  return { excluded, setExcluded, toggle }
}
