import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { ManuscriptImportProgress, ManuscriptImportStatus } from '../api/contracts'
import { encryptScene } from '../crypto/projectEncryption'
import { formatResetDate, formatWords, useUsage } from '../features/usage/usage'
import { RevisionImportReview, type RevisionResult } from './versions/RevisionImportReview'
import './Modal.css'
import './ManuscriptImportModal.css'

const maxFileSize = 25 * 1024 * 1024

type FileKind = 'pdf' | 'docx'

function kindOf(file: File): FileKind | 'doc' | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.doc')) return 'doc'
  return null
}

// How a .docx is split: at its headings of one level, or by the Importador.
type SplitChoice = 1 | 2 | 3 | 'auto'

function importStorageKey(projectId: string) {
  return `grime:manuscript-import:${projectId}`
}

// Replace: the file becomes the timeline. Revision: the author's new version
// updates the scenes it matches, and everything else (notes, facts) stays.
type ImportMode = 'replace' | 'revision'

function readMode(projectId: string): ImportMode | null {
  const stored = localStorage.getItem(`${importStorageKey(projectId)}:mode`)
  return stored === 'revision' || stored === 'replace' ? stored : null
}

type StepState = 'done' | 'active' | 'waiting' | 'failed'

function formatRemaining(ms: number) {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'menos de 1 min restante'
  return minutes === 1 ? 'cerca de 1 min restante' : `cerca de ${minutes} min restantes`
}

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export function ManuscriptImportModal({
  projectId,
  projectKey,
  hasScenes = false,
  initialMode = 'replace',
  onClose,
  onCompleted,
  onRevisionApplied,
}: {
  projectId: string
  projectKey: CryptoKey
  hasScenes?: boolean
  initialMode?: ImportMode
  onClose: () => void
  onCompleted: () => void
  onRevisionApplied?: (result: RevisionResult) => void
}) {
  const [mode, setMode] = useState<ImportMode>(() => readMode(projectId) ?? (hasScenes ? initialMode : 'replace'))
  const isRevision = mode === 'revision'
  // The scenes identified in a revision, waiting for the matching step.
  const [revisionScenes, setRevisionScenes] = useState<Array<{ sequence: number; title: string; rawContent: string }> | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [split, setSplit] = useState<SplitChoice>(1)
  const fileKind = file ? kindOf(file) : null
  // Every PDF goes through the Importador; a .docx only when the author asks.
  const usesImporter = fileKind !== 'docx' || split === 'auto'
  const { usage } = useUsage()
  const [confirmed, setConfirmed] = useState(false)
  const [importId, setImportId] = useState<string | null>(() =>
    localStorage.getItem(importStorageKey(projectId)),
  )
  const [status, setStatus] = useState<ManuscriptImportStatus | null>(null)
  const [progress, setProgress] = useState<ManuscriptImportProgress | null>(null)
  const [upload, setUpload] = useState<{ loaded: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const finalizingRef = useRef(false)
  // Saving the identified scenes is the browser's job; when it fails, the
  // import stays parked on the server and can be saved again without
  // reprocessing the file.
  const [finalizing, setFinalizing] = useState<
    | { phase: 'encrypting'; scenes: number; done: number }
    | { phase: 'saving'; scenes: number }
    | { phase: 'failed' }
    | null
  >(null)
  const finalizeFailed = finalizing?.phase === 'failed'
  // Block pace as seen from this browser, for the time estimate.
  const [pace, setPace] = useState<{ at: number; blocks: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Finalizing outlives a poll: its result applies while the modal is open,
  // even if the poll that started it has been replaced.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!importId || status === 'COMPLETED' || status === 'FAILED' || finalizeFailed || revisionScenes) {
      return
    }

    const currentImportId = importId
    let isCurrent = true
    async function poll() {
      try {
        const manuscriptImport = await api.getManuscriptImport(projectId, currentImportId)
        if (!isCurrent) {
          return
        }
        setStatus(manuscriptImport.status)
        setNow(Date.now())
        if (manuscriptImport.progress) {
          const next = manuscriptImport.progress
          if (next.totalBlocks !== null) {
            setPace((current) => current ?? { at: Date.now(), blocks: next.processedBlocks })
          }
          setProgress(next)
        }
        if (manuscriptImport.status === 'FAILED') {
          setError(
            manuscriptImport.errorMessage ??
              'Não foi possível processar este arquivo.',
          )
        }
        if (manuscriptImport.status === 'AWAITING_FINALIZATION' && manuscriptImport.scenes && isRevision) {
          setRevisionScenes(manuscriptImport.scenes)
          return
        }
        if (
          manuscriptImport.status === 'AWAITING_FINALIZATION' &&
          manuscriptImport.scenes &&
          !finalizingRef.current
        ) {
          finalizingRef.current = true
          const sceneCount = manuscriptImport.scenes.length
          setFinalizing({ phase: 'encrypting', scenes: sceneCount, done: 0 })
          try {
            let done = 0
            const encryptedScenes = await Promise.all(
              manuscriptImport.scenes.map(async (scene) => {
                const sealed = await encryptScene(projectKey, scene.rawContent)
                done += 1
                // A few updates are enough for the bar; not one per scene.
                if (isMountedRef.current && (done % 10 === 0 || done === sceneCount)) {
                  setFinalizing({ phase: 'encrypting', scenes: sceneCount, done })
                }
                return { sequence: scene.sequence, title: scene.title, ...sealed }
              }),
            )
            if (isMountedRef.current) setFinalizing({ phase: 'saving', scenes: sceneCount })
            const completedImport = await api.finalizeManuscriptImport(
              projectId,
              currentImportId,
              encryptedScenes,
            )
            if (isMountedRef.current) {
              setFinalizing(null)
              setStatus(completedImport.status)
              localStorage.removeItem(importStorageKey(projectId))
              localStorage.removeItem(`${importStorageKey(projectId)}:mode`)
              onCompleted()
            }
          } catch (reason) {
            // Stop here instead of retrying on every poll; the person decides.
            if (isMountedRef.current) {
              setFinalizing({ phase: 'failed' })
              setError(
                reason instanceof Error
                  ? `Não foi possível salvar as cenas: ${reason.message}`
                  : 'Não foi possível salvar as cenas.',
              )
            }
            return
          }
        }
      } catch (reason) {
        if (isCurrent) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Não foi possível acompanhar a importação.',
          )
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 2_000)
    return () => {
      isCurrent = false
      window.clearInterval(timer)
    }
  }, [importId, onCompleted, projectId, projectKey, status, finalizeFailed, revisionScenes, isRevision])

  function retryFinalize() {
    finalizingRef.current = false
    setError('')
    setFinalizing(null)
  }

  async function startImport() {
    if (!file || (!confirmed && !isRevision)) {
      setError('Selecione um arquivo e confirme a substituição da timeline.')
      return
    }
    const kind = kindOf(file)
    if (kind === 'doc') {
      setError('Arquivos .doc antigos não são aceitos. No Word, use Salvar como > Documento do Word (.docx).')
      return
    }
    if (!kind || file.size > maxFileSize) {
      setError('Selecione um PDF ou um arquivo do Word (.docx) de até 25 MB.')
      return
    }

    setError('')
    setUpload({ loaded: 0, total: file.size })
    try {
      const manuscriptImport = await api.createManuscriptImport(
        projectId,
        file,
        (loaded, total) => setUpload({ loaded, total }),
        kind === 'docx' && split !== 'auto' ? split : null,
      )
      localStorage.setItem(importStorageKey(projectId), manuscriptImport.id)
      localStorage.setItem(`${importStorageKey(projectId)}:mode`, mode)
      setPace(null)
      setProgress(manuscriptImport.progress ?? null)
      setImportId(manuscriptImport.id)
      setStatus(manuscriptImport.status)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível iniciar a importação.',
      )
    } finally {
      setUpload(null)
    }
  }

  function retryImport() {
    localStorage.removeItem(importStorageKey(projectId))
    localStorage.removeItem(`${importStorageKey(projectId)}:mode`)
    finalizingRef.current = false
    setPace(null)
    setError('')
    setImportId(null)
    setStatus(null)
    setProgress(null)

    if (file && (confirmed || isRevision)) {
      void startImport()
    }
  }

  const isUploading = upload !== null
  const isBrowserWorking = finalizing?.phase === 'encrypting' || finalizing?.phase === 'saving'
  const isServerWorking = !finalizeFailed && (status === 'PENDING' || status === 'PROCESSING')
  const showProgress = isUploading || (importId !== null && status !== null)

  // One bar for the whole import, weighted by how long each step usually takes.
  const blocks = progress?.totalBlocks ? progress.processedBlocks / progress.totalBlocks : 0
  let percent = 0
  if (isUploading) percent = (upload.loaded / Math.max(upload.total, 1)) * 5
  else if (status === 'PENDING') percent = 5
  else if (status === 'PROCESSING') percent = 6 + blocks * 80
  else if (status === 'AWAITING_FINALIZATION') {
    percent =
      finalizing?.phase === 'encrypting'
        ? 86 + (finalizing.done / Math.max(finalizing.scenes, 1)) * 8
        : finalizing?.phase === 'saving' || finalizeFailed
          ? 95
          : 86
  } else if (status === 'COMPLETED') percent = 100
  percent = Math.round(percent)

  // Time left while blocks are read, from the pace seen in this window.
  let remaining: string | null = null
  if (status === 'PROCESSING' && progress?.totalBlocks && pace) {
    const doneSince = progress.processedBlocks - pace.blocks
    const elapsed = now - pace.at
    if (doneSince > 0 && elapsed > 0) {
      remaining = formatRemaining(((progress.totalBlocks - progress.processedBlocks) * elapsed) / doneSince)
    }
  }

  const failedAtServer = status === 'FAILED'
  const step = (index: number): StepState => {
    // 0 upload, 1 identify scenes, 2 encrypt, 3 save
    const current = isUploading
      ? 0
      : status === 'PENDING' || status === 'PROCESSING'
        ? 1
        : status === 'AWAITING_FINALIZATION'
          ? finalizing?.phase === 'saving' || finalizeFailed
            ? 3
            : 2
          : status === 'COMPLETED'
            ? 4
            : 1
    if (index < current) return 'done'
    if (index > current) return 'waiting'
    if ((failedAtServer && index === 1) || (finalizeFailed && index === 3)) return 'failed'
    return 'active'
  }

  const identifyDetail =
    status === 'PENDING'
      ? progress?.queuePosition
        ? `Na fila: ${progress.queuePosition === 1 ? '1 importação' : `${progress.queuePosition} importações`} antes desta`
        : 'Na fila'
      : status === 'PROCESSING' && progress?.totalBlocks
        ? `Trecho ${Math.min(progress.processedBlocks + 1, progress.totalBlocks)} de ${progress.totalBlocks} · ${progress.scenesFound} ${progress.scenesFound === 1 ? 'cena encontrada' : 'cenas encontradas'}${remaining ? ` · ${remaining}` : ''}`
        : status === 'PROCESSING'
          ? 'Lendo o texto do arquivo'
          : progress && progress.scenesFound > 0
            ? `${progress.scenesFound} cenas encontradas`
            : null

  const steps: Array<{ label: string; detail: string | null }> = [
    {
      label: 'Enviar o arquivo',
      detail: isUploading ? `${megabytes(upload.loaded)} de ${megabytes(upload.total)} MB` : null,
    },
    { label: 'Identificar as cenas', detail: identifyDetail },
    {
      label: 'Cifrar neste navegador',
      detail: finalizing?.phase === 'encrypting' ? `${finalizing.done} de ${finalizing.scenes} cenas` : null,
    },
    {
      label: 'Salvar no projeto',
      detail: finalizing?.phase === 'saving' ? `${finalizing.scenes} cenas cifradas` : null,
    },
  ]

  if (revisionScenes && importId) {
    return (
      <div className="modal-backdrop">
        <section aria-labelledby="import-manuscript-title" aria-modal="true" className="modal import-modal revision-modal" role="dialog">
          <p className="eyebrow">Nova versão do autor</p>
          <h2 id="import-manuscript-title">Conferir as cenas antes de atualizar</h2>
          <RevisionImportReview
            fileName={file?.name ?? 'o arquivo'}
            importId={importId}
            imported={revisionScenes}
            projectId={projectId}
            projectKey={projectKey}
            onCancel={onClose}
            onApplied={(result) => {
              localStorage.removeItem(importStorageKey(projectId))
              localStorage.removeItem(`${importStorageKey(projectId)}:mode`)
              onRevisionApplied?.(result)
            }}
          />
        </section>
      </div>
    )
  }

  return (
    <div className="modal-backdrop">
      <section aria-labelledby="import-manuscript-title" aria-modal="true" className="modal import-modal" role="dialog">
        <p className="eyebrow">{isRevision ? 'Nova versão do autor' : 'Importar manuscrito'}</p>
        <h2 id="import-manuscript-title">
          {isRevision ? 'Atualizar as cenas com a revisão do autor' : 'Criar cenas a partir de um PDF ou Word'}
        </h2>
        {!importId && !isUploading ? (
          <>
            {hasScenes && (
              <fieldset className="import-mode">
                <legend>O que fazer com o arquivo</legend>
                <label className="checkbox-label">
                  <input checked={isRevision} name="import-mode" type="radio" onChange={() => setMode('revision')} />
                  <span>
                    <strong>É uma nova versão deste livro</strong>
                    <small>
                      Atualiza as cenas que encontrar, cria as novas e guarda uma versão antes, para comparar. Notas,
                      fatos e diagnósticos ficam.
                    </small>
                  </span>
                </label>
                <label className="checkbox-label">
                  <input checked={!isRevision} name="import-mode" type="radio" onChange={() => setMode('replace')} />
                  <span>
                    <strong>Substituir tudo</strong>
                    <small>Apaga as cenas atuais (com suas notas e fatos) e recria a timeline a partir do arquivo.</small>
                  </span>
                </label>
              </fieldset>
            )}
            <label>
              <span>Arquivo PDF ou Word (.docx), de até 25 MB</span>
              <input
                accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  setError('')
                  setFile(event.target.files?.[0] ?? null)
                }}
                type="file"
              />
            </label>
            {fileKind === 'docx' && (
              <label>
                <span>Como encontrar as cenas</span>
                <select
                  value={split}
                  onChange={(event) =>
                    setSplit(event.target.value === 'auto' ? 'auto' : (Number(event.target.value) as 1 | 2 | 3))
                  }
                >
                  {([1, 2, 3] as const).map((level) => (
                    <option key={level} value={level}>
                      Cada cena começa em um Título {level}
                    </option>
                  ))}
                  <option value="auto">O Importador lê o texto e encontra as cenas</option>
                </select>
              </label>
            )}
            {!isRevision && (
              <label className="checkbox-label">
                <input
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>Entendo que as cenas atuais serão substituídas após a importação.</span>
              </label>
            )}
            {usesImporter ? (
              <p className="import-note">
                O Importador lê o {fileKind === 'docx' ? 'documento' : 'PDF'} inteiro: a importação usa do seu limite
                mensal tantas palavras quanto o texto tem.
                {usage && ` Restam ${formatWords(usage.remaining)} até ${formatResetDate(usage.resetsAt)}.`}
              </p>
            ) : (
              <p className="import-note">
                Cada Título {split} do documento vira uma cena, com o título como nome. Títulos de nível acima ficam
                de fora do texto. Dividir pelos títulos não usa palavras do seu limite.
              </p>
            )}
          </>
        ) : (
          showProgress && (
            <div className="import-progress">
              <div className="import-progress-heading">
                <span>{status === 'COMPLETED' ? 'Importação concluída' : failedAtServer ? 'A importação falhou' : 'Importando'}</span>
                <strong>{percent}%</strong>
              </div>
              <div
                aria-label="Progresso da importação"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={percent}
                className={`import-bar${failedAtServer || finalizeFailed ? ' is-failed' : ''}${finalizing?.phase === 'saving' ? ' is-busy' : ''}`}
                role="progressbar"
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <ol className="import-steps">
                {steps.map((item, index) => {
                  const state = step(index)
                  return (
                    <li className={`import-step is-${state}`} key={item.label}>
                      <span className="import-step-icon" aria-hidden="true">
                        {state === 'done' ? '✓' : state === 'failed' ? '✕' : ''}
                      </span>
                      <span className="import-step-text">
                        <span>{item.label}</span>
                        {item.detail && state !== 'waiting' && <small>{item.detail}</small>}
                      </span>
                      <span className="sr-only">
                        {state === 'done' ? 'concluído' : state === 'active' ? 'em andamento' : state === 'failed' ? 'falhou' : 'a seguir'}
                      </span>
                    </li>
                  )
                })}
              </ol>
              {isServerWorking && (
                <p className="import-note">
                  A leitura acontece no servidor: você pode fechar esta janela e voltar depois em Importar manuscrito.
                </p>
              )}
              {finalizeFailed && (
                <p className="import-note">
                  As cenas já foram identificadas e estão guardadas no servidor. Salvar de novo não reprocessa o arquivo.
                </p>
              )}
              {failedAtServer && (
                <p className="import-note">
                  {file
                    ? 'Você pode tentar novamente com o mesmo arquivo.'
                    : 'Selecione o arquivo para tentar novamente.'}
                </p>
              )}
            </div>
          )
        )}
        {error && <p className="form-message">{error}</p>}
        <div className="modal-actions">
          <button
            className="button button-secondary"
            disabled={isUploading || isBrowserWorking}
            onClick={onClose}
            type="button"
          >
            {status === 'COMPLETED'
              ? 'Fechar'
              : finalizeFailed || isServerWorking
                ? 'Fechar e continuar depois'
                : 'Cancelar'}
          </button>
          {finalizeFailed && (
            <button className="button button-primary" onClick={retryFinalize} type="button">
              Salvar as cenas de novo
            </button>
          )}
          {!importId && !isUploading && (
            <button
              className="button button-primary"
              disabled={!file || (!confirmed && !isRevision)}
              onClick={() => void startImport()}
              type="button"
            >
              {isRevision ? 'Ler a nova versão' : 'Iniciar importação'}
            </button>
          )}
          {failedAtServer && (
            <button
              className="button button-primary"
              onClick={retryImport}
              type="button"
            >
              Tentar novamente
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
