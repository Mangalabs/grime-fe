import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { NoteStatus, Slot } from '../../api/contracts'
import { noteKindLabels, type Note } from '../../features/notes/notes'
import { sceneTitle } from '../../features/scenes/sceneStatus'
import {
  compareScenes,
  followNotes,
  noteFateLabels,
  sceneDiff,
  type NoteFate,
  type SceneChange,
} from '../../features/versions/compare'
import type { ParagraphDiff } from '../../features/versions/diff'
import {
  currentScenes,
  listVersions,
  openVersion,
  saveVersion,
  versionKindLabels,
  type OpenedVersionSummary,
  type VersionScene,
} from '../../features/versions/versions'
import { CloseIcon } from '../icons'
import './VersionsPage.css'

interface VersionsPageProps {
  projectId: string
  projectKey: CryptoKey | null
  projectTitle: string
  slots: Slot[]
  notes: Note[]
  onOpenScene: (slot: Slot) => void
  onLocateNote: (note: Note) => void
  onSetNoteStatus: (note: Note, status: NoteStatus) => Promise<void>
  // Opens the background analysis with these scenes already chosen.
  onAnalyse?: (slotIds: string[]) => void
  // Opens the import of a revised manuscript over the existing scenes.
  onImportRevision?: () => void
}

const CURRENT = 'current'
// Unchanged paragraphs in a row beyond this fold away in the diff.
const FOLD_AFTER = 3
type Tab = 'scenes' | 'notes'

const statusLabels: Record<SceneChange['status'], string> = {
  same: 'Igual',
  changed: 'Alterada',
  added: 'Nova',
  removed: 'Removida',
}

const fateOrder: NoteFate[] = ['changed', 'removed', 'kept', 'untouched', 'unknown']

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const formatWhen = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const formatNumber = (value: number) => value.toLocaleString('pt-BR')

/**
 * Versions of the manuscript and what changed between them: per scene, word
 * by word, and for each note, whether its passage was touched.
 */
export function VersionsPage({
  projectId,
  projectKey,
  projectTitle,
  slots,
  notes,
  onOpenScene,
  onLocateNote,
  onSetNoteStatus,
  onAnalyse,
  onImportRevision,
}: VersionsPageProps) {
  const [versions, setVersions] = useState<OpenedVersionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [baseId, setBaseId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string>(CURRENT)
  const [comparison, setComparison] = useState<{ key: string; changes: SceneChange[] } | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('scenes')
  const [onlyChanged, setOnlyChanged] = useState(true)
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [label, setLabel] = useState('')
  const [showList, setShowList] = useState(false)

  const reload = useCallback(async () => {
    if (!projectKey) return
    try {
      const list = await listVersions(projectId, projectKey)
      setVersions(list)
      setError(null)
      setBaseId((current) => (current && list.some((version) => version.id === current) ? current : (list[0]?.id ?? null)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as versões.')
    }
  }, [projectId, projectKey])

  useEffect(() => {
    void Promise.resolve().then(reload)
  }, [reload])

  const comparisonKey = baseId ? `${baseId}>${targetId}` : null
  useEffect(() => {
    if (!projectKey || !baseId || !comparisonKey || baseId === targetId) return
    let isCurrent = true
    const key = projectKey
    async function load(id: string): Promise<VersionScene[]> {
      if (id !== CURRENT) return (await openVersion(projectId, key, id)).scenes
      return currentScenes(projectId, key, undefined, (done, total) => {
        if (isCurrent) setProgress(`Lendo o texto atual: ${done} de ${total} cenas`)
      })
    }
    void (async () => {
      setProgress('Abrindo as versões…')
      try {
        const [before, after] = await Promise.all([load(baseId), load(targetId)])
        if (!isCurrent) return
        setComparison({ key: comparisonKey, changes: compareScenes(before, after) })
        setError(null)
      } catch (reason) {
        if (isCurrent) setError(reason instanceof Error ? reason.message : 'Não foi possível comparar as versões.')
      } finally {
        if (isCurrent) setProgress(null)
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [projectId, projectKey, baseId, targetId, comparisonKey])

  const changes = comparison?.key === comparisonKey ? comparison.changes : null
  const counts = useMemo(() => {
    const result = { changed: 0, added: 0, removed: 0, same: 0, wordsAdded: 0, wordsRemoved: 0 }
    for (const change of changes ?? []) {
      result[change.status] += 1
      result.wordsAdded += change.added
      result.wordsRemoved += change.removed
    }
    return result
  }, [changes])
  const followUps = useMemo(
    () => (changes ? followNotes(onlyOpen ? notes.filter((note) => note.status === 'OPEN') : notes, changes) : []),
    [changes, notes, onlyOpen],
  )
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots])
  const visible = (changes ?? []).filter((change) => !onlyChanged || change.status !== 'same')
  const selected = changes?.find((change) => change.slotId === selectedSlotId) ?? visible.find((change) => change.status !== 'same') ?? null
  const toReanalyse =
    targetId === CURRENT
      ? (changes ?? []).filter((change) => (change.status === 'changed' || change.status === 'added') && slotById.has(change.slotId))
      : []
  const toCheck = followUps.filter((item) => item.fate === 'changed' || item.fate === 'removed').length

  async function saveNow() {
    if (!projectKey) return
    setIsSaving(true)
    try {
      await saveVersion(projectId, projectKey, 'MANUAL', label.trim() || `Versão de ${formatWhen(new Date().toISOString())}`)
      setLabel('')
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a versão.')
    } finally {
      setIsSaving(false)
    }
  }

  async function remove(version: OpenedVersionSummary) {
    if (!window.confirm(`Apagar a versão “${version.label}”? O texto atual não muda.`)) return
    try {
      await api.deleteVersion(projectId, version.id)
      if (targetId === version.id) setTargetId(CURRENT)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível apagar a versão.')
    }
  }

  if (!projectKey) {
    return (
      <section className="versions-page">
        <header className="page-intro">
          <p className="eyebrow">{projectTitle}</p>
          <h1>Versões</h1>
          <p>Desbloqueie o projeto para ver as versões. Elas ficam criptografadas com a senha do projeto.</p>
        </header>
      </section>
    )
  }

  return (
    <section className="versions-page">
      <header className="versions-header">
        <div className="page-intro">
          <p className="eyebrow">{projectTitle}</p>
          <h1>Versões</h1>
          <p>
            Cópias do livro inteiro para comparar com a revisão do autor. Uma versão é salva sozinha a cada mudança de
            etapa, antes de o Google Docs trocar o texto e antes de importar uma nova versão.
          </p>
        </div>
        <div className="versions-header-actions">
          {onImportRevision && (
            <button className="button button-secondary" type="button" onClick={onImportRevision}>
              Importar nova versão do autor…
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="versions-error" role="alert">
          {error}
        </p>
      )}

      <section className="panel versions-save">
        <label>
          <span>Salvar o texto de agora como versão</span>
          <input
            maxLength={120}
            placeholder="Nome (opcional), ex.: Manuscrito enviado pela autora"
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isSaving) void saveNow()
            }}
          />
        </label>
        <button className="button button-primary" disabled={isSaving} type="button" onClick={() => void saveNow()}>
          {isSaving ? 'Salvando…' : 'Salvar versão'}
        </button>
      </section>

      {versions && versions.length === 0 && (
        <section className="panel versions-empty">
          <h2>Nenhuma versão ainda</h2>
          <p>
            Salve uma versão antes de mandar a carta ao autor. Quando a revisão voltar (pelo Google Docs, por um novo
            arquivo ou colando as cenas), esta página mostra o que mudou.
          </p>
        </section>
      )}

      {versions && versions.length > 0 && (
        <>
          <section className="panel versions-compare">
            <div className="versions-pickers">
              <label>
                <span>Comparar</span>
                <select value={baseId ?? ''} onChange={(event) => setBaseId(event.target.value)}>
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.label} · {formatWhen(version.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>com</span>
                <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                  <option value={CURRENT}>O texto atual</option>
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.label} · {formatWhen(version.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="text-button" type="button" onClick={() => setShowList((value) => !value)}>
                {showList ? 'Esconder a lista' : `Ver as ${plural(versions.length, 'versão', 'versões')}`}
              </button>
            </div>
            {showList && (
              <ol className="versions-list">
                {versions.map((version) => (
                  <li key={version.id}>
                    <span className={`versions-kind is-${version.kind.toLowerCase()}`}>{versionKindLabels[version.kind]}</span>
                    <strong>{version.label}</strong>
                    <span className="versions-muted">
                      {formatWhen(version.createdAt)} · {plural(version.sceneCount, 'cena', 'cenas')} ·{' '}
                      {formatNumber(version.wordCount)} palavras
                    </span>
                    <button
                      aria-label={`Apagar a versão ${version.label}`}
                      className="icon-button"
                      title="Apagar esta versão"
                      type="button"
                      onClick={() => void remove(version)}
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {baseId === targetId && <p className="versions-muted">Escolha duas versões diferentes para comparar.</p>}
          {progress && (
            <p className="versions-muted" role="status">
              {progress}
            </p>
          )}

          {changes && baseId !== targetId && (
            <>
              <ul className="versions-tiles">
                <li>
                  <span>Alteradas</span>
                  <strong>{counts.changed}</strong>
                </li>
                <li>
                  <span>Novas</span>
                  <strong>{counts.added}</strong>
                </li>
                <li>
                  <span>Removidas</span>
                  <strong>{counts.removed}</strong>
                </li>
                <li>
                  <span>Palavras</span>
                  <strong>
                    <ins>+{formatNumber(counts.wordsAdded)}</ins> <del>−{formatNumber(counts.wordsRemoved)}</del>
                  </strong>
                </li>
              </ul>

              {onAnalyse && toReanalyse.length > 0 && (
                <section className="panel versions-reanalyse">
                  <p>
                    Só {plural(toReanalyse.length, 'cena mudou', 'cenas mudaram')} desde esta versão. Analisar só essas
                    gasta menos do seu limite do que o livro inteiro.
                  </p>
                  <button className="button button-secondary" type="button" onClick={() => onAnalyse(toReanalyse.map((change) => change.slotId))}>
                    Reanalisar {plural(toReanalyse.length, 'a alterada', 'as alteradas')}
                  </button>
                </section>
              )}

              <div className="versions-tabs" role="tablist">
                <button aria-selected={tab === 'scenes'} role="tab" type="button" onClick={() => setTab('scenes')}>
                  Cenas
                </button>
                <button aria-selected={tab === 'notes'} role="tab" type="button" onClick={() => setTab('notes')}>
                  Notas {toCheck > 0 && <span className="versions-badge">{toCheck}</span>}
                </button>
              </div>

              {tab === 'scenes' && (
                <div className="versions-scenes">
                  <div className="versions-scene-list">
                    <label className="checkbox-label">
                      <input checked={onlyChanged} type="checkbox" onChange={(event) => setOnlyChanged(event.target.checked)} />
                      <span>Só as que mudaram</span>
                    </label>
                    {visible.length === 0 && <p className="versions-muted">Nenhuma cena mudou entre estas versões.</p>}
                    <ol>
                      {visible.map((change) => (
                        <li key={change.slotId}>
                          <button
                            aria-pressed={selected?.slotId === change.slotId}
                            className={`versions-scene is-${change.status}`}
                            type="button"
                            onClick={() => setSelectedSlotId(change.slotId)}
                          >
                            <span className="versions-scene-title">{change.title || 'Cena sem título'}</span>
                            <span className="versions-scene-meta">
                              <span className={`versions-status is-${change.status}`}>{statusLabels[change.status]}</span>
                              {change.status === 'changed' && (
                                <>
                                  <ins>+{change.added}</ins> <del>−{change.removed}</del>
                                </>
                              )}
                            </span>
                            {change.status === 'changed' && (
                              <span aria-hidden="true" className="versions-bar">
                                <span style={{ width: `${Math.max(change.share * 100, 3)}%` }} />
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="versions-diff-pane">
                    {selected ? (
                      <SceneDiffView change={selected} slot={slotById.get(selected.slotId) ?? null} onOpenScene={onOpenScene} />
                    ) : (
                      <p className="versions-muted">Escolha uma cena para ver o que mudou.</p>
                    )}
                  </div>
                </div>
              )}

              {tab === 'notes' && (
                <section className="versions-notes">
                  <p className="versions-muted">
                    Para cada nota, o que a revisão fez com o trecho dela. “Trecho alterado” quer dizer que o autor mexeu
                    ali: confira se a nota foi atendida e marque como resolvida.
                  </p>
                  <label className="checkbox-label">
                    <input checked={onlyOpen} type="checkbox" onChange={(event) => setOnlyOpen(event.target.checked)} />
                    <span>Só notas abertas</span>
                  </label>
                  {followUps.length === 0 && <p className="versions-muted">Nenhuma nota presa a uma cena.</p>}
                  {fateOrder.map((fate) => {
                    const items = followUps.filter((item) => item.fate === fate)
                    if (items.length === 0) return null
                    return (
                      <div className="versions-fate" key={fate}>
                        <h3>
                          {noteFateLabels[fate]} <span className="versions-muted">{items.length}</span>
                        </h3>
                        <ul>
                          {items.map(({ note }) => {
                            const slot = note.slotId ? slotById.get(note.slotId) : undefined
                            return (
                              <li className={`versions-note is-${note.kind.toLowerCase()}`} key={note.id}>
                                <div className="versions-note-head">
                                  <span className="versions-note-kind">{noteKindLabels[note.kind]}</span>
                                  <span className="versions-muted">{slot ? sceneTitle(slot) : 'Cena removida'}</span>
                                  {note.status === 'RESOLVED' && <span className="versions-muted">· resolvida</span>}
                                </div>
                                {note.excerpt?.quote && <q>{note.excerpt.quote}</q>}
                                {note.body && <p>{note.body}</p>}
                                <div className="versions-note-actions">
                                  {slot && (
                                    <button className="text-button" type="button" onClick={() => onLocateNote(note)}>
                                      Ver na cena
                                    </button>
                                  )}
                                  {note.status === 'OPEN' && (
                                    <button className="text-button" type="button" onClick={() => void onSetNoteStatus(note, 'RESOLVED')}>
                                      Marcar resolvida
                                    </button>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function SceneDiffView({
  change,
  slot,
  onOpenScene,
}: {
  change: SceneChange
  slot: Slot | null
  onOpenScene: (slot: Slot) => void
}) {
  const paragraphs = useMemo(() => sceneDiff(change), [change])
  const [openFolds, setOpenFolds] = useState<{ slotId: string; folds: Set<number> }>({ slotId: '', folds: new Set() })
  const opened = openFolds.slotId === change.slotId ? openFolds.folds : new Set<number>()
  // Long unchanged stretches fold away, keeping a paragraph of context on each side.
  const items: Array<{ index: number; paragraph: ParagraphDiff } | { fold: number; count: number }> = []
  for (let index = 0; index < paragraphs.length; ) {
    let end = index
    while (end < paragraphs.length && paragraphs[end].type === 'same') end += 1
    const run = end - index
    if (run > FOLD_AFTER && change.status === 'changed' && !opened.has(index)) {
      const keepStart = index === 0 ? 0 : 1
      const keepEnd = end === paragraphs.length ? 0 : 1
      for (let at = index; at < index + keepStart; at += 1) items.push({ index: at, paragraph: paragraphs[at] })
      items.push({ fold: index, count: run - keepStart - keepEnd })
      for (let at = end - keepEnd; at < end; at += 1) items.push({ index: at, paragraph: paragraphs[at] })
      index = end
      continue
    }
    if (run === 0) {
      items.push({ index, paragraph: paragraphs[index] })
      index += 1
      continue
    }
    for (let at = index; at < end; at += 1) items.push({ index: at, paragraph: paragraphs[at] })
    index = end
  }
  return (
    <article className="versions-diff">
      <header>
        <div>
          <span className={`versions-status is-${change.status}`}>{statusLabels[change.status]}</span>
          <h2>{change.title || 'Cena sem título'}</h2>
        </div>
        {slot && (
          <button className="button button-secondary" type="button" onClick={() => onOpenScene(slot)}>
            Abrir a cena
          </button>
        )}
      </header>
      <div className="versions-diff-text">
        {items.map((item) => {
          if ('fold' in item) {
            return (
              <button
                className="versions-fold"
                key={`fold-${item.fold}`}
                type="button"
                onClick={() => setOpenFolds({ slotId: change.slotId, folds: new Set([...opened, item.fold]) })}
              >
                {plural(item.count, 'parágrafo igual', 'parágrafos iguais')} · mostrar
              </button>
            )
          }
          const { index, paragraph } = item
          return paragraph.type === 'edit' ? (
            <p className="is-edit" key={index}>
              {paragraph.segments.map((segment, position) =>
                segment.type === 'add' ? (
                  <ins key={position}>{segment.text}</ins>
                ) : segment.type === 'del' ? (
                  <del key={position}>{segment.text}</del>
                ) : (
                  <span key={position}>{segment.text}</span>
                ),
              )}
            </p>
          ) : paragraph.type === 'same' ? (
            <p key={index}>{paragraph.text}</p>
          ) : paragraph.type === 'add' ? (
            <p className="is-add" key={index}>
              <ins>{paragraph.text}</ins>
            </p>
          ) : (
            <p className="is-del" key={index}>
              <del>{paragraph.text}</del>
            </p>
          )
        })}
      </div>
    </article>
  )
}
