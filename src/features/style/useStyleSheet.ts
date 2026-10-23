import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { decryptScene, encryptScene } from '../../crypto/projectEncryption'
import { normalizeStyleSheet, type StyleSheet } from './styleSheet'

interface Loaded {
  projectId: string
  sheet: StyleSheet
  // Version on the server; null while the project has no sheet yet.
  version: number | null
}

/**
 * The project's style sheet, decrypted in the browser. Saves are based on
 * the version that was loaded: if someone else saved meanwhile, the save is
 * refused and the current version is loaded instead.
 */
export function useStyleSheet(projectId: string, projectKey: CryptoKey | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // False on backends without style sheets: the feature then stays hidden.
  const [isAvailable, setIsAvailable] = useState(true)

  const reload = useCallback(async () => {
    if (!projectId || !projectKey) return
    try {
      const stored = await api.getStyleSheet(projectId)
      const sheet = normalizeStyleSheet(JSON.parse(await decryptScene(projectKey, stored.ciphertext, stored.iv)))
      setLoaded({ projectId, sheet, version: stored.version })
      setIsAvailable(true)
      setError(null)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        // No sheet yet; a 404 without our message means an older backend.
        const isMissingRoute = !reason.message.toLowerCase().includes('style sheet')
        setIsAvailable(!isMissingRoute)
        setLoaded({ projectId, sheet: normalizeStyleSheet(null), version: null })
        setError(null)
        return
      }
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a folha de estilo.')
    }
  }, [projectId, projectKey])

  useEffect(() => {
    void Promise.resolve().then(reload)
  }, [reload])

  const current = loaded?.projectId === projectId ? loaded : null

  async function save(next: StyleSheet) {
    if (!projectKey || !current) throw new Error('Desbloqueie o projeto para editar a folha de estilo.')
    const sealed = await encryptScene(projectKey, JSON.stringify(next))
    try {
      const stored = await api.saveStyleSheet(projectId, sealed, current.version)
      setLoaded({ projectId, sheet: next, version: stored.version })
      setError(null)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        await reload()
        throw new Error('Outra pessoa alterou a folha de estilo. Carregamos a versão atual; refaça a alteração.')
      }
      throw reason
    }
  }

  return {
    sheet: current?.sheet ?? null,
    isLoading: Boolean(projectId && projectKey) && !current && !error,
    isAvailable,
    error,
    save,
    reload,
  }
}
