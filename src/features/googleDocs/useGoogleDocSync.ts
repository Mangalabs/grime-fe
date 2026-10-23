import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, google } from '../../api/client'
import { apiBaseUrl } from '../../auth/session'
import type {
  GoogleCommentSummary,
  GoogleDocLink,
  GoogleHeadingLevel,
  GoogleStatus,
  Slot,
} from '../../api/contracts'
import type { Note } from '../notes/notes'
import type { StyleSheet } from '../style/styleSheet'
import { buildCommentItems, type CommentSource } from './buildComments'
import { syncGoogleDoc, type GoogleSyncResult } from './syncGoogleDoc'

// While a linked project is open, the doc is checked this often.
const autoSyncEveryMs = 10 * 60 * 1000

// Google returns the popup to the API's callback: on this origin behind a
// proxy, or on the API's own domain when VITE_API_BASE_URL points there.
const popupOrigins = new Set([window.location.origin, new URL(apiBaseUrl || '/', window.location.origin).origin])

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

export function useGoogleDocSync({
  projectId,
  projectKey,
  onSynced,
}: {
  projectId: string
  projectKey: CryptoKey | null
  // Scenes were created or changed: lists and colours need a refresh.
  onSynced: (result: GoogleSyncResult, automatic: boolean) => void
}) {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  // Kept with the project they belong to, so switching projects shows nothing stale.
  const [forProject, setForProject] = useState<{
    projectId: string
    link: GoogleDocLink | null
    lastResult: GoogleSyncResult | null
  }>({ projectId: '', link: null, lastResult: null })
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState<{ done: number; total: number } | null>(null)
  const [commentResult, setCommentResult] = useState<{ projectId: string; summary: GoogleCommentSummary } | null>(null)
  const commentSummary = commentResult?.projectId === projectId ? commentResult.summary : null
  const link = forProject.projectId === projectId ? forProject.link : null
  const lastResult = forProject.projectId === projectId ? forProject.lastResult : null
  const setLink = useCallback(
    (next: GoogleDocLink | null) =>
      setForProject((current) => ({
        projectId,
        link: next,
        lastResult: current.projectId === projectId ? current.lastResult : null,
      })),
    [projectId],
  )
  const setLastResult = useCallback(
    (next: GoogleSyncResult | null) =>
      setForProject((current) => ({
        projectId,
        link: current.projectId === projectId ? current.link : null,
        lastResult: next,
      })),
    [projectId],
  )
  const onSyncedRef = useRef(onSynced)
  useEffect(() => {
    onSyncedRef.current = onSynced
  })

  const reloadStatus = useCallback(() => {
    void google.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(reloadStatus, [reloadStatus])

  // The link belongs to the project; load it again when the project changes.
  useEffect(() => {
    let isCurrent = true
    if (!projectId || !status?.available) return
    void google
      .getLink(projectId)
      .then((response) => isCurrent && setLink(response.link))
      .catch(() => undefined)
    return () => {
      isCurrent = false
    }
  }, [projectId, status?.available, setLink])

  // A run already under way absorbs the next request: the automatic sync and
  // a click (or linking) would otherwise report the same result twice.
  const runningRef = useRef<Promise<void> | null>(null)

  const sync = useCallback(
    (automatic: boolean) => {
      if (!projectId || !projectKey) return Promise.resolve()
      runningRef.current ??= run(automatic, projectKey).finally(() => {
        runningRef.current = null
      })
      return runningRef.current

      async function run(automatic: boolean, key: CryptoKey) {
        setIsSyncing(true)
        setError('')
        try {
          const result = await syncGoogleDoc(projectId, key)
          setLastResult(result)
          if (result.link) setLink(result.link)
          if (!result.upToDate) onSyncedRef.current(result, automatic)
        } catch (reason) {
          setError(messageOf(reason, 'Não foi possível sincronizar com o Google Docs.'))
          // The connection expired or was revoked: show the connect step again.
          if (reason instanceof ApiError && reason.status === 409) reloadStatus()
        } finally {
          setIsSyncing(false)
        }
      }
    },
    [projectId, projectKey, reloadStatus, setLink, setLastResult],
  )

  const canAutoSync = Boolean(projectKey && link && status?.connected)
  useEffect(() => {
    if (!canAutoSync) return
    // On the next tick: the project renders first, then the doc is checked.
    const first = window.setTimeout(() => void sync(true), 0)
    const timer = window.setInterval(() => void sync(true), autoSyncEveryMs)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [canAutoSync, sync])

  // Opened on the click itself (pop-up blockers allow that), then pointed at
  // Google once the server answers. A popup keeps the unlocked project open.
  // 'comment' asks Google for the extra permission to write comments.
  async function connect(permission: 'read' | 'comment' = 'read') {
    setError('')
    const popup = window.open('', 'petricor-google', 'width=520,height=680')
    if (!popup) {
      setError('O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente de novo.')
      return
    }
    try {
      popup.location.href = (await google.connect(permission)).authUrl
    } catch (reason) {
      popup.close()
      setError(messageOf(reason, 'Não foi possível abrir a conexão com o Google.'))
      return
    }
    function stopListening() {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('focus', onFocus)
    }
    function onMessage(event: MessageEvent) {
      if (!popupOrigins.has(event.origin) || event.data?.source !== 'petricor-google') return
      stopListening()
      if (!event.data.ok) setError('O Google não concluiu a conexão. Tente de novo.')
      reloadStatus()
    }
    // Some browsers cut the popup off from this window once it has been on
    // Google's pages, so its message never arrives: ask again on coming back.
    function onFocus() {
      if (!popup!.closed) return
      stopListening()
      reloadStatus()
    }
    window.addEventListener('message', onMessage)
    window.addEventListener('focus', onFocus)
  }

  // Findings and notes as comments on their passages in the doc.
  async function publishComments(input: {
    slots: Slot[]
    notes: Note[]
    styleSheet: StyleSheet | null
    sources: Set<CommentSource>
  }) {
    if (!projectKey || !link) return
    setError('')
    setCommentResult(null)
    setPublishing({ done: 0, total: 0 })
    try {
      const items = await buildCommentItems({
        projectId,
        projectKey,
        link,
        ...input,
        onProgress: (done, total) => setPublishing({ done, total }),
      })
      setCommentResult({ projectId, summary: await google.publishComments(projectId, items) })
      void google.getLink(projectId).then((response) => setLink(response.link))
    } catch (reason) {
      setError(messageOf(reason, 'Não foi possível enviar os comentários.'))
      if (reason instanceof ApiError && reason.status === 409) reloadStatus()
    } finally {
      setPublishing(null)
    }
  }

  async function disconnect() {
    setError('')
    try {
      await google.disconnect()
      reloadStatus()
    } catch (reason) {
      setError(messageOf(reason, 'Não foi possível desconectar.'))
    }
  }

  // Linking imports right away: the doc's scenes appear in the timeline.
  async function linkDocument(document: string, headingLevel: GoogleHeadingLevel) {
    setError('')
    try {
      setLink(await google.link(projectId, document, headingLevel))
    } catch (reason) {
      setError(messageOf(reason, 'Não foi possível vincular o documento.'))
      throw reason
    }
  }

  async function unlink() {
    setError('')
    try {
      await google.unlink(projectId)
      setLink(null)
      setLastResult(null)
    } catch (reason) {
      setError(messageOf(reason, 'Não foi possível desvincular.'))
    }
  }

  return {
    status,
    link,
    isSyncing,
    lastResult,
    error,
    syncNow: () => sync(false),
    connect,
    publishing,
    commentSummary,
    publishComments,
    disconnect,
    linkDocument,
    unlink,
  }
}

export type GoogleDocSyncState = ReturnType<typeof useGoogleDocSync>
