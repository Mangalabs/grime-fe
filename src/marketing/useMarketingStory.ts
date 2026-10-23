import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api/client'
import { decryptScene, encryptScene } from '../crypto/projectEncryption'
import { buildArchive } from '../features/archive/entityModel'
import { normalizeLibrary, normalizePage, type WikiPage } from '../features/wiki/wikiModel'
import { emptyKit, normalizeKit, type MarketingKit } from './marketingKit'
import type { StoryData } from './worldPack'

// Pages are fetched one request each; a few at a time keeps a big wiki quick.
const PAGE_CONCURRENCY = 6

async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.all(items.slice(index, index + size).map(work))))
  }
  return results
}

async function orDefault<T>(load: Promise<T>, fallback: T): Promise<T> {
  try {
    return await load
  } catch (reason) {
    if (reason instanceof ApiError && reason.status === 404) return fallback
    throw reason
  }
}

/**
 * Everything the marketing workspace reads from an unlocked project — the
 * archive, the wiki and the timeline — decrypted in the browser, plus the
 * project's marketing kit. Nothing here is written back except the kit.
 */
export function useMarketingStory(projectId: string, title: string, projectKey: CryptoKey) {
  const [story, setStory] = useState<StoryData | null>(null)
  const [kit, setKit] = useState<{ value: MarketingKit; version: number | null } | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setError('')
    try {
      const open = async (stored: { ciphertext: string; iv: string }) =>
        JSON.parse(await decryptScene(projectKey, stored.ciphertext, stored.iv))
      const [slots, groups, entities, facts, pageList, storedLibrary, storedKit] = await Promise.all([
        api.listProjectSlots(projectId),
        api.listGroups(projectId),
        api.listProjectEntities(projectId),
        api.listProjectFacts(projectId),
        api.listEntityPages(projectId),
        orDefault(api.getWikiTemplates(projectId), null),
        orDefault(api.getMarketingKit(projectId), null),
      ])
      const pages = new Map<string, WikiPage>()
      await inBatches(pageList, PAGE_CONCURRENCY, async ({ entityId }) => {
        pages.set(entityId, normalizePage(await open(await api.getEntityPage(entityId))))
      })
      setStory({
        title,
        slots,
        groups,
        entities: buildArchive(entities, facts, slots),
        library: normalizeLibrary(storedLibrary ? await open(storedLibrary) : null),
        pages,
      })
      setKit(
        storedKit
          ? { value: normalizeKit(await open(storedKit)), version: storedKit.version }
          : { value: emptyKit(), version: null },
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o projeto.')
    }
  }, [projectId, title, projectKey])

  useEffect(() => {
    void Promise.resolve().then(reload)
  }, [reload])

  async function saveKit(next: MarketingKit) {
    if (!kit) return
    const sealed = await encryptScene(projectKey, JSON.stringify(next))
    try {
      const stored = await api.saveMarketingKit(projectId, sealed, kit.version)
      setKit({ value: next, version: stored.version })
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        await reload()
        throw new Error('O kit foi alterado em outra janela. Carregamos a versão atual; refaça a alteração.')
      }
      throw reason
    }
  }

  return { story, kit: kit?.value ?? null, error, reload, saveKit }
}
