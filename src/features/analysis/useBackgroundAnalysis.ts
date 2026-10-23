import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { focusModes, type FocusMode } from '../../api/contracts'
import { decryptSceneDraft } from '../../crypto/projectEncryption'

/**
 * Analyses scenes one after another (a few at a time) while the person keeps
 * working. Scene text is decrypted here and sent for analysis exactly as in a
 * manual analysis, so the queue lives in this tab: it keeps going across
 * pages, survives a reload (it offers to resume) and warns before closing.
 */

export type AnalysisStatus = 'idle' | 'running' | 'waiting' | 'paused' | 'done'

export interface AnalysisFailure {
  slotId: string
  message: string
}

export interface AnalysisState {
  projectId: string
  status: AnalysisStatus
  total: number
  queue: string[]
  inFlight: string[]
  done: string[]
  // Analysed, but one of the agents reported a problem.
  partial: AnalysisFailure[]
  failed: AnalysisFailure[]
  skipped: string[]
  concurrency: number
  startedAt: number | null
  // Time spent analysing (excludes pauses), for the estimate.
  activeMs: number
  // When the current running stretch began; null while not running.
  runningSince: number | null
  waitUntil: number | null
  pauseReason: string | null
  // Restored from a previous session: waits for "Retomar".
  isRestored: boolean
  // Stopped by "Cancelar" before the queue ran out.
  wasCancelled: boolean
}

const storageKey = (projectId: string) => `petricor-analysis:${projectId}`
const QUOTA_WAIT_MS = 60_000
const MAX_QUOTA_RETRIES = 3
const REFRESH_EVERY_MS = 8_000

const idle = (projectId: string): AnalysisState => ({
  projectId,
  status: 'idle',
  total: 0,
  queue: [],
  inFlight: [],
  done: [],
  partial: [],
  failed: [],
  skipped: [],
  concurrency: 2,
  startedAt: null,
  activeMs: 0,
  runningSince: null,
  waitUntil: null,
  pauseReason: null,
  isRestored: false,
  wasCancelled: false,
})

function restore(projectId: string): AnalysisState {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return idle(projectId)
    const saved = JSON.parse(raw) as Partial<AnalysisState>
    const queue = [...(saved.inFlight ?? []), ...(saved.queue ?? [])]
    if (queue.length === 0) return idle(projectId)
    return {
      ...idle(projectId),
      ...saved,
      projectId,
      queue,
      inFlight: [],
      status: 'paused',
      waitUntil: null,
      runningSince: null,
      startedAt: null,
      pauseReason: 'A análise foi interrompida quando a página foi fechada.',
      isRestored: true,
    }
  } catch {
    return idle(projectId)
  }
}

interface Options {
  projectId: string
  projectKey: CryptoKey | null
  // Called after each scene is analysed.
  onSceneAnalysed: (slotId: string) => void
  // Called at most every few seconds while scenes complete, to refresh lists.
  onRefresh: () => void
  onFinished: (state: AnalysisState) => void
}

export function useBackgroundAnalysis({ projectId, projectKey, onSceneAnalysed, onRefresh, onFinished }: Options) {
  const [state, setState] = useState<AnalysisState>(() => (projectId ? restore(projectId) : idle('')))
  // The workers read and write the latest state through this ref.
  const stateRef = useRef(state)
  const callbacks = useRef({ onSceneAnalysed, onRefresh, onFinished, projectKey })
  useEffect(() => {
    callbacks.current = { onSceneAnalysed, onRefresh, onFinished, projectKey }
  })
  const lastRefresh = useRef(0)
  const quotaStrikes = useRef(0)
  const workers = useRef(0)

  const commit = useCallback((next: AnalysisState) => {
    stateRef.current = next
    setState(next)
    try {
      if (next.queue.length || next.inFlight.length) {
        localStorage.setItem(
          storageKey(next.projectId),
          JSON.stringify({ ...next, status: next.status, isRestored: false }),
        )
      } else {
        localStorage.removeItem(storageKey(next.projectId))
      }
    } catch {
      // Without storage the queue simply can't be resumed after a reload.
    }
  }, [])

  const update = useCallback(
    (change: (current: AnalysisState) => AnalysisState) => commit(change(stateRef.current)),
    [commit],
  )

  // Another project: load its own (possibly interrupted) queue. Workers of
  // the previous project ignore their results (they check the project id).
  useEffect(() => {
    if (stateRef.current.projectId === projectId) return
    workers.current = 0
    commit(projectId ? restore(projectId) : idle(''))
  }, [projectId, commit])

  // Adds the running stretch to activeMs and stops the clock.
  const stopped = (current: AnalysisState) => ({
    activeMs: current.activeMs + (current.runningSince !== null ? Date.now() - current.runningSince : 0),
    runningSince: null,
  })

  const finishIfDone = useCallback(() => {
    const current = stateRef.current
    if (current.queue.length === 0 && current.inFlight.length === 0 && current.status === 'running') {
      const next = { ...current, status: 'done' as const, ...stopped(current) }
      commit(next)
      callbacks.current.onFinished(next)
    }
  }, [commit])

  const analyseOne = useCallback(
    async (slotId: string, key: CryptoKey) => {
      const review = await api.getSlotReview(slotId)
      if (!review.content) return 'skipped' as const
      const draft = await decryptSceneDraft(key, review.content.ciphertext, review.content.iv)
      if (!draft.content?.trim()) return 'skipped' as const
      const report = await api.submitScene({
        projectId: stateRef.current.projectId,
        slotId,
        rawContent: draft.content,
        genreOverride: draft.genre?.trim() || undefined,
        focusMode: focusModes.includes(draft.focusMode as FocusMode) ? (draft.focusMode as FocusMode) : 'GENERAL',
      })
      return report.analysisErrors.length ? { partial: report.analysisErrors.join(' ') } : ('done' as const)
    },
    [],
  )

  // Workers start the next scene through this ref (pump can't name itself).
  const pumpRef = useRef(() => {})
  const pump = useCallback(() => {
    const key = callbacks.current.projectKey
    const projectAtStart = stateRef.current.projectId
    if (!key) return
    while (
      stateRef.current.status === 'running' &&
      stateRef.current.queue.length > 0 &&
      workers.current < stateRef.current.concurrency
    ) {
      const [slotId, ...rest] = stateRef.current.queue
      workers.current += 1
      update((current) => ({ ...current, queue: rest, inFlight: [...current.inFlight, slotId] }))
      void analyseOne(slotId, key)
        .then((outcome) => {
          if (stateRef.current.projectId !== projectAtStart) return
          quotaStrikes.current = 0
          update((current) => ({
            ...current,
            inFlight: current.inFlight.filter((id) => id !== slotId),
            done: outcome === 'skipped' ? current.done : [...current.done, slotId],
            skipped: outcome === 'skipped' ? [...current.skipped, slotId] : current.skipped,
            partial: typeof outcome === 'object' ? [...current.partial, { slotId, message: outcome.partial }] : current.partial,
          }))
          if (outcome !== 'skipped') callbacks.current.onSceneAnalysed(slotId)
          // Lists catch up every few seconds, not on every scene.
          if (Date.now() - lastRefresh.current > REFRESH_EVERY_MS) {
            lastRefresh.current = Date.now()
            callbacks.current.onRefresh()
          }
        })
        .catch((reason: unknown) => {
          if (stateRef.current.projectId !== projectAtStart) return
          const message = reason instanceof Error ? reason.message : 'A análise falhou.'
          if (reason instanceof ApiError && (reason.status === 429 || reason.status === 402)) {
            // Usage limit: put the scene back and wait, unless waiting can't help.
            // 402 is the account's monthly allowance, which only the reset renews.
            quotaStrikes.current += 1
            const hopeless = reason.status === 402 || /esperar não resolve|limite diário/i.test(message)
            if (hopeless || quotaStrikes.current >= MAX_QUOTA_RETRIES) {
              update((current) => ({
                ...current,
                status: 'paused',
                inFlight: current.inFlight.filter((id) => id !== slotId),
                queue: [slotId, ...current.queue],
                pauseReason: message,
                ...stopped(current),
              }))
              return
            }
            update((current) => ({
              ...current,
              status: current.status === 'running' ? 'waiting' : current.status,
              inFlight: current.inFlight.filter((id) => id !== slotId),
              queue: [slotId, ...current.queue],
              waitUntil: Date.now() + QUOTA_WAIT_MS,
              pauseReason: message,
              ...stopped(current),
            }))
            return
          }
          update((current) => ({
            ...current,
            inFlight: current.inFlight.filter((id) => id !== slotId),
            failed: [...current.failed, { slotId, message }],
          }))
        })
        .finally(() => {
          if (stateRef.current.projectId !== projectAtStart) return
          workers.current -= 1
          finishIfDone()
          pumpRef.current()
        })
    }
  }, [analyseOne, finishIfDone, update])

  useEffect(() => {
    pumpRef.current = pump
  }, [pump])

  // After a usage-limit pause, resume on its own.
  useEffect(() => {
    if (state.status !== 'waiting' || !state.waitUntil) return
    const timer = window.setTimeout(() => {
      if (stateRef.current.status !== 'waiting') return
      update((current) => ({ ...current, status: 'running', waitUntil: null, runningSince: Date.now() }))
      pump()
    }, Math.max(0, state.waitUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [state.status, state.waitUntil, pump, update])

  // Closing the tab stops the analysis: ask first.
  const isActive = state.status === 'running' || state.status === 'waiting'
  useEffect(() => {
    if (!isActive) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isActive])

  // Progress in the tab title, visible from another tab.
  const processed = state.done.length + state.failed.length + state.skipped.length
  useEffect(() => {
    if (!isActive) return
    const base = document.title.replace(/^\(\d+\/\d+\) /, '')
    document.title = `(${processed}/${state.total}) ${base}`
    return () => {
      document.title = document.title.replace(/^\(\d+\/\d+\) /, '')
    }
  }, [isActive, processed, state.total])

  const start = useCallback(
    (slotIds: string[], concurrency: number) => {
      if (!slotIds.length) return
      quotaStrikes.current = 0
      commit({
        ...idle(stateRef.current.projectId),
        status: 'running',
        total: slotIds.length,
        queue: slotIds,
        concurrency,
        startedAt: Date.now(),
        runningSince: Date.now(),
      })
      pump()
    },
    [commit, pump],
  )

  const pause = useCallback(() => {
    update((current) => ({
      ...current,
      status: 'paused',
      waitUntil: null,
      pauseReason: null,
      ...stopped(current),
    }))
  }, [update])

  const resume = useCallback(() => {
    quotaStrikes.current = 0
    update((current) => ({
      ...current,
      status: 'running',
      runningSince: current.runningSince ?? Date.now(),
      waitUntil: null,
      pauseReason: null,
      isRestored: false,
      startedAt: current.startedAt ?? Date.now(),
    }))
    pump()
    finishIfDone()
  }, [finishIfDone, pump, update])

  // Stops launching new scenes; ones already being analysed finish.
  const cancel = useCallback(() => {
    update((current) => ({
      ...current,
      status: current.inFlight.length ? 'running' : 'done',
      wasCancelled: current.queue.length > 0,
      queue: [],
      waitUntil: null,
      pauseReason: null,
      ...(current.inFlight.length ? {} : stopped(current)),
    }))
    finishIfDone()
  }, [finishIfDone, update])

  const retryFailed = useCallback(() => {
    const ids = stateRef.current.failed.map((failure) => failure.slotId)
    if (!ids.length) return
    quotaStrikes.current = 0
    update((current) => ({
      ...current,
      status: 'running',
      runningSince: current.runningSince ?? Date.now(),
      failed: [],
      queue: [...current.queue, ...ids],
    }))
    pump()
  }, [pump, update])

  /** A scene analysed by hand meanwhile doesn't need to wait in the queue. */
  const forget = useCallback(
    (slotId: string) => {
      if (!stateRef.current.queue.includes(slotId)) return
      update((current) => ({
        ...current,
        queue: current.queue.filter((id) => id !== slotId),
        done: [...current.done, slotId],
      }))
      finishIfDone()
    },
    [finishIfDone, update],
  )

  const dismiss = useCallback(() => {
    commit(idle(stateRef.current.projectId))
  }, [commit])

  return { state, processed, start, pause, resume, cancel, retryFailed, forget, dismiss }
}

/** Time left from the pace so far (analysing time only), at time `now`. */
export function estimateRemaining(state: AnalysisState, now: number): number | null {
  const elapsed = state.activeMs + (state.runningSince !== null ? now - state.runningSince : 0)
  const completed = state.done.length + state.failed.length
  const remaining = state.queue.length + state.inFlight.length
  return completed > 0 && remaining > 0 ? (elapsed / completed) * remaining : null
}
