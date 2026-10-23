import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { decryptScene, encryptScene } from '../../crypto/projectEncryption'
import { normalizeLibrary, normalizePage, type WikiPage, type WikiTemplateLibrary } from './wikiModel'

export interface LoadedPage {
  page: WikiPage | null
  // Version on the server; null while the entity has no page.
  version: number | null
}

const conflictMessage = (what: string) =>
  `Outra pessoa alterou ${what}. Carregamos a versão atual; refaça a alteração.`

/**
 * The project's wiki: its templates (the built-in ones until it saves its
 * own) and which entities have a page. Pages are loaded one at a time with
 * `loadPage`. Everything is decrypted in the browser; saves are refused when
 * someone else saved meanwhile.
 */
export function useWiki(projectId: string, projectKey: CryptoKey | null) {
  const [library, setLibrary] = useState<{ projectId: string; value: WikiTemplateLibrary; version: number | null } | null>(null)
  const [pageIds, setPageIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  // False on backends without the wiki: the feature then stays hidden.
  const [isAvailable, setIsAvailable] = useState(true)

  const reload = useCallback(async () => {
    if (!projectId || !projectKey) return
    try {
      const pages = await api.listEntityPages(projectId)
      setPageIds(new Set(pages.map((page) => page.entityId)))
      try {
        const stored = await api.getWikiTemplates(projectId)
        const value = normalizeLibrary(JSON.parse(await decryptScene(projectKey, stored.ciphertext, stored.iv)))
        setLibrary({ projectId, value, version: stored.version })
      } catch (reason) {
        if (!(reason instanceof ApiError && reason.status === 404)) throw reason
        setLibrary({ projectId, value: normalizeLibrary(null), version: null })
      }
      setIsAvailable(true)
      setError(null)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        setIsAvailable(false)
        return
      }
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir as fichas do Arquivo.')
    }
  }, [projectId, projectKey])

  useEffect(() => {
    void Promise.resolve().then(reload)
  }, [reload])

  const current = library?.projectId === projectId ? library : null

  async function saveLibrary(next: WikiTemplateLibrary) {
    if (!projectKey || !current) throw new Error('Desbloqueie o projeto para editar os modelos.')
    const sealed = await encryptScene(projectKey, JSON.stringify(next))
    try {
      const stored = await api.saveWikiTemplates(projectId, sealed, current.version)
      setLibrary({ projectId, value: next, version: stored.version })
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        await reload()
        throw new Error(conflictMessage('os modelos'))
      }
      throw reason
    }
  }

  const loadPage = useCallback(
    async (entityId: string): Promise<LoadedPage> => {
      if (!projectKey) throw new Error('Desbloqueie o projeto para ver as fichas.')
      try {
        const stored = await api.getEntityPage(entityId)
        const page = normalizePage(JSON.parse(await decryptScene(projectKey, stored.ciphertext, stored.iv)))
        return { page, version: stored.version }
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 404) return { page: null, version: null }
        throw reason
      }
    },
    [projectKey],
  )

  /** Saves against `version`; returns the new one. */
  async function savePage(entityId: string, page: WikiPage, version: number | null): Promise<number> {
    if (!projectKey) throw new Error('Desbloqueie o projeto para editar as fichas.')
    const sealed = await encryptScene(projectKey, JSON.stringify(page))
    try {
      const stored = await api.saveEntityPage(entityId, sealed, version)
      setPageIds((ids) => new Set(ids).add(entityId))
      return stored.version
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) throw new PageConflictError(conflictMessage('esta ficha'))
      throw reason
    }
  }

  async function deletePage(entityId: string) {
    await api.deleteEntityPage(entityId)
    setPageIds((ids) => {
      const next = new Set(ids)
      next.delete(entityId)
      return next
    })
  }

  return {
    library: current?.value ?? null,
    pageIds,
    isAvailable,
    error,
    reload,
    saveLibrary,
    loadPage,
    savePage,
    deletePage,
  }
}

export type Wiki = ReturnType<typeof useWiki>

/** Someone else saved the page; the caller reloads it. */
export class PageConflictError extends Error {}
