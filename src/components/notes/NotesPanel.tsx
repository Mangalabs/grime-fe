import { useEffect, useMemo, useRef, useState } from 'react'
import './NotesPanel.css'
import { noteKinds, type NoteKind, type NoteStatus, type Slot } from '../../api/contracts'
import { noteKindLabels, readAuthorName, writeAuthorName, type Note } from '../../features/notes/notes'
import type { NewNote } from '../../features/notes/useNotes'
import { orderScenes, sceneTitle } from '../../features/scenes/sceneStatus'
import { formatRelative } from '../../features/scenes/timelineMoves'
import { CloseIcon } from '../icons'

export type NotesTab = 'scene' | 'project' | 'all'

export interface AttachedExcerpt {
  slotId: string
  quote: string
  start: number
  end: number
}

interface NotesPanelProps {
  notes: Note[]
  slots: Slot[]
  currentSlotId: string
  isOpen: boolean
  tab: NotesTab
  attachedExcerpt: AttachedExcerpt | null
  focusedNoteId: string | null
  error: string | null
  // A kind picked with the excerpt (from the reading view); `at` makes each request new.
  requestedKind?: { kind: NoteKind; at: number } | null
  // Pipeline stages by id, to tag notes; the current one enables the stage filter.
  stageNames?: Map<string, string>
  currentStageId?: string | null
  onOpenChange: (isOpen: boolean) => void
  onTabChange: (tab: NotesTab) => void
  onDetachExcerpt: () => void
  onCreate: (note: NewNote) => Promise<void>
  onEdit: (note: Note, changes: { kind?: NoteKind; body?: string }) => Promise<void>
  onSetStatus: (note: Note, status: NoteStatus) => Promise<void>
  onRemove: (note: Note) => Promise<void>
  onLocate: (note: Note) => void
  onOpenScene: (slotId: string) => void
}

type StatusFilter = 'OPEN' | 'RESOLVED' | 'ALL'

function sceneLabel(slot: Slot | undefined): string {
  if (!slot) return 'Cena removida'
  return slot.isUnanchored || slot.timelinePosition === null
    ? `Cena avulsa · ${sceneTitle(slot)}`
    : `Cena ${slot.timelinePosition + 1} · ${sceneTitle(slot)}`
}

/**
 * Floating review notes: about the open scene (whole or an excerpt), about the
 * project, or across every scene. Collapses to a pill with the open count.
 */
export function NotesPanel({
  notes,
  slots,
  currentSlotId,
  isOpen,
  tab,
  attachedExcerpt,
  focusedNoteId,
  error,
  stageNames,
  currentStageId = null,
  requestedKind = null,
  onOpenChange,
  onTabChange,
  onDetachExcerpt,
  onCreate,
  onEdit,
  onSetStatus,
  onRemove,
  onLocate,
  onOpenScene,
}: NotesPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN')
  const [onlyStage, setOnlyStage] = useState(false)
  const [kind, setKind] = useState<NoteKind>('NOTE')
  const [appliedRequest, setAppliedRequest] = useState<number | null>(null)
  if (requestedKind && requestedKind.at !== appliedRequest) {
    setAppliedRequest(requestedKind.at)
    setKind(requestedKind.kind)
  }
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState(readAuthorName)
  const [isEditingAuthor, setIsEditingAuthor] = useState(() => !readAuthorName())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const effectiveTab: NotesTab = tab === 'scene' && !currentSlotId ? 'project' : tab
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots])
  const currentSlot = slotById.get(currentSlotId)
  const countOpen = (predicate: (note: Note) => boolean) =>
    notes.filter((note) => note.status === 'OPEN' && predicate(note)).length

  const stageFilter = onlyStage && currentStageId ? currentStageId : null
  const matchesStatus = (note: Note) =>
    (statusFilter === 'ALL' || note.status === statusFilter) && (!stageFilter || note.stageId === stageFilter)
  const visible = notes.filter((note) => {
    if (!matchesStatus(note)) return false
    if (effectiveTab === 'scene') return note.slotId === currentSlotId
    if (effectiveTab === 'project') return note.slotId === null
    return note.slotId !== null
  })
  // "Todas as cenas" groups notes by scene, in timeline order.
  const groups = useMemo(() => {
    if (effectiveTab !== 'all') return []
    const order = orderScenes(slots).map((slot) => slot.id)
    const bySlot = new Map<string, Note[]>()
    visible.forEach((note) => bySlot.set(note.slotId!, [...(bySlot.get(note.slotId!) ?? []), note]))
    return [...bySlot.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
  }, [effectiveTab, slots, visible])

  const excerptForComposer =
    effectiveTab === 'scene' && attachedExcerpt?.slotId === currentSlotId ? attachedExcerpt : null

  // A new excerpt or a shortcut-open puts the cursor in the composer.
  useEffect(() => {
    if (isOpen) composerRef.current?.focus()
  }, [isOpen, attachedExcerpt])

  useEffect(() => {
    if (!focusedNoteId) return
    listRef.current
      ?.querySelector(`[data-note-id="${focusedNoteId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusedNoteId, effectiveTab])

  async function submit() {
    const text = body.trim()
    if (!text || effectiveTab === 'all') return
    setBusy(true)
    setFormError(null)
    try {
      await onCreate({
        slotId: effectiveTab === 'scene' ? currentSlotId : null,
        kind,
        payload: { body: text, author: author.trim(), excerpt: excerptForComposer ? {
          quote: excerptForComposer.quote,
          start: excerptForComposer.start,
          end: excerptForComposer.end,
        } : null },
      })
      setBody('')
      if (excerptForComposer) onDetachExcerpt()
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Não foi possível salvar a nota.')
    } finally {
      setBusy(false)
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setFormError(null)
    try {
      await action()
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a nota.')
    } finally {
      setBusy(false)
    }
  }

  function noteCard(note: Note) {
    const isEditing = editingId === note.id
    return (
      <li
        className={`note-card kind-${note.kind.toLowerCase()}${note.status === 'RESOLVED' ? ' is-resolved' : ''}${focusedNoteId === note.id ? ' is-focused' : ''}`}
        data-note-id={note.id}
        key={note.id}
      >
        <div className="note-meta">
          <span className="note-kind">{noteKindLabels[note.kind]}</span>
          <span>
            {note.author || 'Sem assinatura'} · {formatRelative(note.createdAt)}
          </span>
          {note.stageId && stageNames && (
            <span className="note-stage" title="Etapa em que a nota foi escrita">
              {stageNames.get(note.stageId) ?? 'Etapa removida'}
            </span>
          )}
          {note.status === 'RESOLVED' && <span className="note-resolved">Resolvida</span>}
        </div>
        {note.excerpt && (
          <button
            className="note-excerpt"
            title="Mostrar o trecho na cena"
            type="button"
            onClick={() => onLocate(note)}
          >
            “{note.excerpt.quote}”
          </button>
        )}
        {note.isUnreadable ? (
          <p className="note-body is-unreadable">Não foi possível ler esta nota com a chave deste projeto.</p>
        ) : isEditing ? (
          <div className="note-edit">
            <textarea
              aria-label="Editar nota"
              rows={3}
              value={editBody}
              onChange={(event) => setEditBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void run(async () => {
                    await onEdit(note, { body: editBody.trim() })
                    setEditingId(null)
                  })
                }
              }}
            />
            <div className="note-actions">
              <button className="text-button" type="button" onClick={() => setEditingId(null)}>
                Cancelar
              </button>
              <button
                className="button button-primary button-small"
                disabled={busy || !editBody.trim()}
                type="button"
                onClick={() =>
                  void run(async () => {
                    await onEdit(note, { body: editBody.trim() })
                    setEditingId(null)
                  })
                }
              >
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <p className="note-body">{note.body}</p>
        )}
        {!isEditing && (
          <div className="note-actions">
            <button
              className="text-button"
              disabled={busy}
              type="button"
              onClick={() => void run(() => onSetStatus(note, note.status === 'OPEN' ? 'RESOLVED' : 'OPEN'))}
            >
              {note.status === 'OPEN' ? 'Resolver' : 'Reabrir'}
            </button>
            {!note.isUnreadable && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setEditingId(note.id)
                  setEditBody(note.body)
                }}
              >
                Editar
              </button>
            )}
            <button
              className="text-button destructive"
              disabled={busy}
              type="button"
              onClick={() => {
                if (window.confirm('Excluir esta nota?')) void run(() => onRemove(note))
              }}
            >
              Excluir
            </button>
          </div>
        )}
      </li>
    )
  }

  // Closed, the panel is reached from the "Notas" button in the top bar (Alt+A).
  if (!isOpen) return null

  return (
    <section
      aria-label="Notas de revisão"
      className="notes-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !editingId) {
          event.stopPropagation()
          onOpenChange(false)
        }
      }}
    >
      <header className="notes-header">
        <h2>Notas</h2>
        <div className="notes-tabs" role="tablist" aria-label="Escopo das notas">
          {currentSlotId && (
            <button
              aria-selected={effectiveTab === 'scene'}
              className={effectiveTab === 'scene' ? 'is-active' : ''}
              role="tab"
              title={sceneLabel(currentSlot)}
              type="button"
              onClick={() => onTabChange('scene')}
            >
              Esta cena <span>{countOpen((note) => note.slotId === currentSlotId)}</span>
            </button>
          )}
          <button
            aria-selected={effectiveTab === 'project'}
            className={effectiveTab === 'project' ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => onTabChange('project')}
          >
            Projeto <span>{countOpen((note) => note.slotId === null)}</span>
          </button>
          <button
            aria-selected={effectiveTab === 'all'}
            className={effectiveTab === 'all' ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => onTabChange('all')}
          >
            Todas as cenas <span>{countOpen((note) => note.slotId !== null)}</span>
          </button>
        </div>
        <button
          aria-label="Recolher notas (Esc)"
          className="notes-collapse"
          title="Recolher (Esc)"
          type="button"
          onClick={() => onOpenChange(false)}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="notes-filter" role="radiogroup" aria-label="Status">
        {(['OPEN', 'RESOLVED', 'ALL'] as StatusFilter[]).map((value) => (
          <button
            aria-checked={statusFilter === value}
            className={statusFilter === value ? 'is-active' : ''}
            key={value}
            role="radio"
            type="button"
            onClick={() => setStatusFilter(value)}
          >
            {value === 'OPEN' ? 'Abertas' : value === 'RESOLVED' ? 'Resolvidas' : 'Todas'}
          </button>
        ))}
        {currentStageId && stageNames?.has(currentStageId) && (
          <label className="notes-stage-filter" title="Mostrar só as notas escritas na etapa atual">
            <input checked={onlyStage} type="checkbox" onChange={(event) => setOnlyStage(event.target.checked)} />
            {stageNames.get(currentStageId)}
          </label>
        )}
        {effectiveTab === 'scene' && currentSlot && (
          <span className="notes-scope">{sceneLabel(currentSlot)}</span>
        )}
      </div>

      <div className="notes-list" ref={listRef}>
        {error ? (
          <p className="notes-empty">Notas indisponíveis: {error}</p>
        ) : effectiveTab === 'all' ? (
          groups.length === 0 ? (
            <p className="notes-empty">Nenhuma nota {statusFilter === 'RESOLVED' ? 'resolvida' : 'aberta'} nas cenas.</p>
          ) : (
            groups.map(([slotId, group]) => (
              <section className="notes-group" key={slotId}>
                <button className="notes-group-title" type="button" onClick={() => onOpenScene(slotId)}>
                  {sceneLabel(slotById.get(slotId))}
                </button>
                <ul>{group.map(noteCard)}</ul>
              </section>
            ))
          )
        ) : visible.length === 0 ? (
          <p className="notes-empty">
            {effectiveTab === 'scene'
              ? 'Nenhuma nota nesta cena. Selecione um trecho do texto para anotá-lo, ou escreva sobre a cena inteira.'
              : 'Nenhuma nota sobre o projeto ainda.'}
          </p>
        ) : (
          <ul>{visible.map(noteCard)}</ul>
        )}
      </div>

      {effectiveTab !== 'all' && (
        <form
          className="notes-composer"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {excerptForComposer && (
            <div className="composer-excerpt">
              <span>Sobre o trecho</span>
              <q>{excerptForComposer.quote}</q>
              <button aria-label="Remover trecho" className="notes-collapse" type="button" onClick={onDetachExcerpt}>
                <CloseIcon />
              </button>
            </div>
          )}
          <div className="composer-kinds" role="radiogroup" aria-label="Tipo da nota">
            {noteKinds.map((value) => (
              <button
                aria-checked={kind === value}
                className={`kind-${value.toLowerCase()}${kind === value ? ' is-active' : ''}`}
                key={value}
                role="radio"
                type="button"
                onClick={() => setKind(value)}
              >
                {noteKindLabels[value]}
              </button>
            ))}
          </div>
          <textarea
            aria-label={
              effectiveTab === 'scene'
                ? excerptForComposer
                  ? 'Nota sobre o trecho'
                  : 'Nota sobre a cena'
                : 'Nota sobre o projeto'
            }
            placeholder={
              effectiveTab === 'scene'
                ? excerptForComposer
                  ? 'O que você quer dizer sobre este trecho?'
                  : 'Uma nota sobre esta cena…'
                : 'Uma nota sobre o projeto…'
            }
            ref={composerRef}
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <div className="composer-footer">
            {isEditingAuthor ? (
              <label className="composer-author">
                <span>Assinar como</span>
                <input
                  placeholder="Ex.: Ana · revisora"
                  value={author}
                  onBlur={() => {
                    writeAuthorName(author.trim())
                    if (author.trim()) setIsEditingAuthor(false)
                  }}
                  onChange={(event) => setAuthor(event.target.value)}
                />
              </label>
            ) : (
              <button className="text-button composer-signature" type="button" onClick={() => setIsEditingAuthor(true)}>
                Assinado: {author}
              </button>
            )}
            <button className="button button-primary button-small" disabled={busy || !body.trim()} type="submit">
              Adicionar <kbd>Ctrl ↵</kbd>
            </button>
          </div>
          {formError && <p className="form-message">{formError}</p>}
        </form>
      )}
    </section>
  )
}
