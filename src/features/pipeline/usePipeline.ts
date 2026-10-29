import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { decryptScene, encryptScene } from '../../crypto/projectEncryption'
import { createPipeline, normalizePipeline, type Pipeline } from './pipeline'

interface Loaded {
  projectId: string
  pipeline: Pipeline
}

interface Pending {
  projectId: string
  projectKey: CryptoKey
  pipeline: Pipeline
}

export type SaveState = 'salvo' | 'salvando' | 'erro'

// Typing in a notebook saves after a short pause, not on every key.
const SAVE_DELAY_MS = 700

/**
 * The project's editorial pipeline, decrypted in the browser. Changes show at
 * once and are saved shortly after, one save at a time, each based on the
 * version the previous one returned. A conflict (another window saved) loads
 * the current version instead.
 */
export function usePipeline(projectId: string, projectKey: CryptoKey | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // False on backends without pipelines: the feature then stays hidden.
  const [isAvailable, setIsAvailable] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('salvo')
  const latest = useRef<Loaded | null>(null)
  // Server version per project; null while the project has no pipeline yet.
  const versions = useRef(new Map<string, number | null>())
  const pending = useRef<Pending | null>(null)
  const timer = useRef<number | null>(null)
  const saving = useRef<Promise<void> | null>(null)

  const show = (next: Loaded | null) => {
    latest.current = next
    setLoaded(next)
  }

  const reload = useCallback(async () => {
    if (!projectId || !projectKey) return
    try {
      const stored = await api.getPipeline(projectId)
      const pipeline = normalizePipeline(JSON.parse(await decryptScene(projectKey, stored.ciphertext, stored.iv)))
      versions.current.set(projectId, stored.version)
      show({ projectId, pipeline })
      setIsAvailable(true)
      setError(null)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        // No pipeline yet; a 404 without our message means an older backend.
        setIsAvailable(reason.message.toLowerCase().includes('pipeline'))
        versions.current.set(projectId, null)
        show({ projectId, pipeline: createPipeline() })
        setError(null)
        return
      }
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir as etapas do projeto.')
    }
  }, [projectId, projectKey])

  useEffect(() => {
    void Promise.resolve().then(reload)
  }, [reload])

  const flush = useCallback(async function flushPending(): Promise<void> {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (saving.current) {
      await saving.current
      return flushPending()
    }
    const job = pending.current
    if (!job) return
    pending.current = null
    setSaveState('salvando')
    saving.current = (async () => {
      try {
        const sealed = await encryptScene(job.projectKey, JSON.stringify(job.pipeline))
        const stored = await api.savePipeline(job.projectId, sealed, versions.current.get(job.projectId) ?? null)
        versions.current.set(job.projectId, stored.version)
        setSaveState(pending.current ? 'salvando' : 'salvo')
      } catch (reason) {
        setSaveState('erro')
        if (reason instanceof ApiError && reason.status === 409) {
          pending.current = null
          setError('As etapas foram alteradas em outra janela. Carregamos a versão atual; refaça a última alteração.')
          if (job.projectId === latest.current?.projectId) await reload()
          return
        }
        setError(reason instanceof Error ? reason.message : 'Não foi possível salvar as etapas.')
      } finally {
        saving.current = null
      }
    })()
    await saving.current
    if (pending.current) return flushPending()
  }, [reload])

  // Whatever is still waiting is saved when the project changes or the tab hides.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      void flush()
    }
  }, [flush, projectId])

  const current = loaded?.projectId === projectId ? loaded : null

  function update(change: (pipeline: Pipeline) => Pipeline, options: { immediate?: boolean } = {}) {
    const base = latest.current
    if (!projectKey || !base || base.projectId !== projectId) return
    const pipeline = change(base.pipeline)
    if (pipeline === base.pipeline) return
    show({ projectId, pipeline })
    pending.current = { projectId, projectKey, pipeline }
    setError(null)
    setSaveState('salvando')
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), options.immediate ? 0 : SAVE_DELAY_MS)
  }

  return {
    pipeline: current?.pipeline ?? null,
    isLoading: Boolean(projectId && projectKey) && !current && !error,
    isAvailable,
    error,
    saveState,
    update,
    reload,
  }
}
