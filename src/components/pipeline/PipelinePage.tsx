import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { NoteStatus, Slot, TimeEntry } from '../../api/contracts'
import { formatDuration, IDLE_AFTER_MS } from '../../features/time/useActiveTime'
import { noteKindLabels, type Note } from '../../features/notes/notes'
import {
  createStage,
  daysBetween,
  enteredAt,
  moveStage,
  moveTo,
  nextStage,
  removeStage,
  roundOf,
  stageKinds,
  stageState,
  updateStage,
  type Pipeline,
  type Stage,
  type StageKind,
  type StageState,
  type StageTool,
} from '../../features/pipeline/pipeline'
import type { SaveState } from '../../features/pipeline/usePipeline'
import { orderScenes, sceneNumberLabel, sceneTitle } from '../../features/scenes/sceneStatus'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CloseIcon } from '../icons'
import './PipelinePage.css'

type Update = (change: (pipeline: Pipeline) => Pipeline, options?: { immediate?: boolean }) => void
export type WorkspaceTool = Exclude<StageTool, 'producao'>

interface PipelinePageProps {
  projectId: string
  projectTitle: string
  pipeline: Pipeline | null
  isLoading: boolean
  error: string | null
  saveState: SaveState
  slots: Slot[]
  notes: Note[]
  canUseProduction: boolean
  onUpdate: Update
  // After the project moved stage (null: finished); a version is saved then.
  onMoved?: (stage: Stage | null) => void
  onGoTo: (tool: WorkspaceTool) => void
  onOpenScene: (slot: Slot) => void
  onOpenNotes: () => void
  onLocateNote: (note: Note) => void
  onSetNoteStatus: (note: Note, status: NoteStatus) => Promise<void>
}

const toolLabels: Record<StageTool, { label: string; detail: string }> = {
  review: { label: 'Editor e timeline', detail: 'Ler e anotar cena a cena' },
  archive: { label: 'Arquivo', detail: 'Personagens, lugares e fatos' },
  'style-sheet': { label: 'Folha de estilo', detail: 'Grafias e padrões do livro' },
  'architectural-review': { label: 'Revisão arquitetural', detail: 'Estrutura, atos e arcos' },
  rhythm: { label: 'Ritmo e tensão', detail: 'Curva de tensão e presença' },
  export: { label: 'Exportar revisões', detail: 'Relatório, checklist, manuscrito anotado' },
  producao: { label: 'Produção', detail: 'Formato, páginas, Affinity e custos' },
}

const stateLabels: Record<StageState, string> = {
  atual: 'Etapa atual',
  feita: 'Concluída',
  pendente: 'A fazer',
  pulada: 'Pulada',
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const roundLabel = (round: number) => `${round}ª rodada`
const daysLabel = (days: number) => (days === 0 ? 'hoje' : plural(days, 'dia', 'dias'))

/**
 * Where the project is in the editorial flow, and the work of each stage:
 * checklist, notebook, scene progress, dates and the stage's notes.
 */
export function PipelinePage(props: PipelinePageProps) {
  const { projectTitle, pipeline, isLoading, error, saveState, onUpdate } = props
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  // Day counts are relative to when the page opened.
  const [now] = useState(() => new Date())

  if (!pipeline) {
    return (
      <section className="pipeline-page">
        <header className="page-intro">
          <p className="eyebrow">{projectTitle}</p>
          <h1>Etapas do projeto</h1>
        </header>
        <section className="panel pipeline-empty">
          {error ? (
            <p role="alert">{error}</p>
          ) : isLoading ? (
            <p>Abrindo as etapas…</p>
          ) : (
            <p>Desbloqueie o projeto para ver e editar as etapas. Elas ficam criptografadas com a senha do projeto.</p>
          )}
        </section>
      </section>
    )
  }

  const current = pipeline.stages.find((stage) => stage.id === pipeline.currentStageId) ?? null
  const selected =
    pipeline.stages.find((stage) => stage.id === selectedId) ?? current ?? pipeline.stages.find((stage) => !stage.skipped) ?? null
  const since = enteredAt(pipeline)

  return (
    <section className="pipeline-page">
      <header className="pipeline-header">
        <div className="page-intro">
          <p className="eyebrow">{projectTitle}</p>
          <h1>Etapas do projeto</h1>
          <p>
            {pipeline.finishedAt
              ? `Projeto concluído em ${formatDate(pipeline.finishedAt)}.`
              : current
                ? `Em ${current.name}${since ? ` desde ${formatDate(since)} (${daysLabel(daysBetween(since, now))})` : ''}${
                    roundOf(pipeline, current.id) > 1 ? `, ${roundLabel(roundOf(pipeline, current.id))}` : ''
                  }.`
                : 'O projeto ainda não entrou no fluxo. Escolha a etapa em que ele está para começar.'}
          </p>
        </div>
        <div className="pipeline-header-actions">
          <span className={`pipeline-save is-${saveState}`} role="status">
            {saveState === 'salvando' ? 'Salvando…' : saveState === 'erro' ? 'Não salvo' : 'Salvo'}
          </span>
          <label className="pipeline-author">
            <span>Autor(a)</span>
            <input
              placeholder="Nome de quem escreveu"
              type="text"
              value={pipeline.author}
              onChange={(event) => onUpdate((value) => ({ ...value, author: event.target.value }))}
            />
          </label>
          <button
            aria-pressed={isEditing}
            className="button button-secondary"
            type="button"
            onClick={() => setIsEditing((value) => !value)}
          >
            {isEditing ? 'Concluir edição' : 'Editar etapas'}
          </button>
        </div>
      </header>

      {error && (
        <p className="pipeline-error" role="alert">
          {error}
        </p>
      )}

      {isEditing ? (
        <StageEditor notes={props.notes} pipeline={pipeline} onUpdate={onUpdate} />
      ) : (
        <Stepper pipeline={pipeline} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      )}

      {selected && !isEditing && <StageWork {...props} now={now} pipeline={pipeline} stage={selected} />}

      <History now={now} pipeline={pipeline} />
      <WorkTime pipeline={pipeline} projectId={props.projectId} />
    </section>
  )
}

function Stepper({ pipeline, selectedId, onSelect }: { pipeline: Pipeline; selectedId: string | null; onSelect: (id: string) => void }) {
  // Skipped stages get no number.
  const numbers = pipeline.stages.reduce<number[]>((list, stage) => [...list, (list.at(-1) ?? 0) + (stage.skipped ? 0 : 1)], [])
  return (
    <nav aria-label="Etapas" className="pipeline-stepper">
      <ol>
        {pipeline.stages.map((stage, index) => {
          const state = stageState(pipeline, stage)
          const round = roundOf(pipeline, stage.id)
          return (
            <li className={`pipeline-step is-${state}${stage.id === selectedId ? ' is-selected' : ''}`} key={stage.id}>
              <button
                aria-current={state === 'atual' ? 'step' : undefined}
                aria-pressed={stage.id === selectedId}
                type="button"
                onClick={() => onSelect(stage.id)}
              >
                <span aria-hidden="true" className="pipeline-step-mark">
                  {state === 'feita' ? <CheckIcon /> : stage.skipped ? '–' : numbers[index]}
                </span>
                <span className="pipeline-step-text">
                  <strong>{stage.name}</strong>
                  <small>
                    {stateLabels[state]}
                    {round > 1 ? ` · ${roundLabel(round)}` : ''}
                  </small>
                </span>
              </button>
            </li>
          )
        })}
        <li className={`pipeline-step pipeline-step-end${pipeline.finishedAt ? ' is-feita' : ''}`}>
          <span className="pipeline-step-static">
            <span aria-hidden="true" className="pipeline-step-mark">
              {pipeline.finishedAt ? <CheckIcon /> : '★'}
            </span>
            <span className="pipeline-step-text">
              <strong>Concluído</strong>
              <small>{pipeline.finishedAt ? formatDate(pipeline.finishedAt) : 'Livro pronto'}</small>
            </span>
          </span>
        </li>
      </ol>
    </nav>
  )
}

function StageWork({
  pipeline,
  stage,
  now,
  slots,
  notes,
  canUseProduction,
  onUpdate,
  onMoved,
  onGoTo,
  onOpenScene,
  onOpenNotes,
  onLocateNote,
  onSetNoteStatus,
}: PipelinePageProps & { pipeline: Pipeline; stage: Stage; now: Date }) {
  const info = stageKinds[stage.kind]
  const state = stageState(pipeline, stage)
  const round = roundOf(pipeline, stage.id)
  const next = state === 'atual' ? nextStage(pipeline) : null
  const change = (patch: Partial<Stage>, immediate = true) =>
    onUpdate((current) => updateStage(current, stage.id, (item) => ({ ...item, ...patch })), { immediate })
  const pendingItems = stage.checklist.filter((item) => !item.done).length
  const tools = info.tools.filter((tool) => tool !== 'producao' || canUseProduction)

  return (
    <div className="pipeline-work">
      <section className="panel pipeline-stage-head">
        <div>
          <p className="eyebrow">
            {stateLabels[state]}
            {round > 1 ? ` · ${roundLabel(round)}` : ''}
          </p>
          <h2>{stage.name}</h2>
          <p className="panel-description">{info.description}</p>
        </div>
        <div className="pipeline-stage-actions">
          {state === 'atual' ? (
            <>
              {pendingItems > 0 && <span className="pipeline-muted">{plural(pendingItems, 'item pendente', 'itens pendentes')} no checklist</span>}
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  onUpdate((current) => moveTo(current, next?.id ?? null), { immediate: true })
                  onMoved?.(next)
                }}
              >
                {next ? `Avançar para ${next.name}` : 'Concluir o projeto'}
              </button>
            </>
          ) : (
            <button
              className={pipeline.currentStageId ? 'button button-secondary' : 'button button-primary'}
              type="button"
              onClick={() => {
                onUpdate((current) => moveTo(current, stage.id), { immediate: true })
                onMoved?.(stage)
              }}
            >
              {round > 0 ? `Voltar para esta etapa (${roundLabel(round + 1)})` : 'Mover o projeto para esta etapa'}
            </button>
          )}
        </div>
      </section>

      <div className="pipeline-columns">
        <div className="pipeline-column">
          <Checklist stage={stage} onChange={(checklist) => change({ checklist })} />
          {info.dates && <Dates labels={info.dates} now={now} stage={stage} isCurrent={state === 'atual'} onChange={(patch) => change(patch)} />}
          {info.scenesLabel && (
            <SceneProgress label={info.scenesLabel} slots={slots} stage={stage} onChange={(doneSlotIds) => change({ doneSlotIds })} onOpenScene={onOpenScene} />
          )}
        </div>
        <div className="pipeline-column">
          <section className="panel pipeline-card">
            <div className="panel-heading">
              <h3>Caderno da etapa</h3>
            </div>
            <textarea
              aria-label={`Caderno de ${stage.name}`}
              className="pipeline-notebook"
              placeholder={info.notebookHint}
              rows={10}
              value={stage.notebook}
              onChange={(event) => change({ notebook: event.target.value }, false)}
            />
            <p className="panel-description">Só você lê. Fica criptografado com a senha do projeto.</p>
          </section>
          {tools.length > 0 && (
            <section className="panel pipeline-card">
              <h3>Ferramentas desta etapa</h3>
              <ul className="pipeline-tools">
                {tools.map((tool) => (
                  <li key={tool}>
                    {tool === 'producao' ? (
                      <a className="pipeline-tool" href="/producao">
                        <strong>{toolLabels[tool].label}</strong>
                        <small>{toolLabels[tool].detail}</small>
                      </a>
                    ) : (
                      <button className="pipeline-tool" type="button" onClick={() => onGoTo(tool)}>
                        <strong>{toolLabels[tool].label}</strong>
                        <small>{toolLabels[tool].detail}</small>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <StageNotes
            carriesNotes={!!info.carriesNotes}
            notes={notes}
            pipeline={pipeline}
            slots={slots}
            stage={stage}
            onLocate={onLocateNote}
            onOpenNotes={onOpenNotes}
            onSetStatus={onSetNoteStatus}
          />
          {(stage.kind === 'carta' || stage.kind === 'aguardando') && (
            <AuthorQuestions notes={notes} slots={slots} onLocate={onLocateNote} />
          )}
        </div>
      </div>
    </div>
  )
}

function Checklist({ stage, onChange }: { stage: Stage; onChange: (checklist: Stage['checklist']) => void }) {
  const [draft, setDraft] = useState('')
  const done = stage.checklist.filter((item) => item.done).length
  const add = () => {
    const label = draft.trim()
    if (!label) return
    onChange([...stage.checklist, { id: crypto.randomUUID(), label, done: false }])
    setDraft('')
  }

  return (
    <section className="panel pipeline-card">
      <div className="panel-heading">
        <h3>Checklist</h3>
        <span className="pipeline-muted">
          {done} de {stage.checklist.length}
        </span>
      </div>
      {stage.checklist.length > 0 && <Progress done={done} total={stage.checklist.length} />}
      <ul className="pipeline-checklist">
        {stage.checklist.map((item) => (
          <li className={item.done ? 'is-done' : undefined} key={item.id}>
            <label>
              <input
                checked={item.done}
                type="checkbox"
                onChange={(event) =>
                  onChange(stage.checklist.map((other) => (other.id === item.id ? { ...other, done: event.target.checked } : other)))
                }
              />
              <span>{item.label}</span>
            </label>
            <button
              aria-label={`Remover "${item.label}"`}
              className="pipeline-icon-button"
              title="Remover item"
              type="button"
              onClick={() => onChange(stage.checklist.filter((other) => other.id !== item.id))}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="pipeline-inline-form"
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <input aria-label="Novo item do checklist" placeholder="Novo item" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button className="button button-secondary button-small" disabled={!draft.trim()} type="submit">
          Adicionar
        </button>
      </form>
    </section>
  )
}

function Dates({
  labels,
  now,
  stage,
  isCurrent,
  onChange,
}: {
  labels: { sent: string; due: string }
  now: Date
  stage: Stage
  isCurrent: boolean
  onChange: (patch: Partial<Stage>) => void
}) {
  const waiting = stage.sentOn ? daysBetween(stage.sentOn, now) : null
  const left = stage.dueOn ? daysBetween(now, stage.dueOn) : null

  return (
    <section className="panel pipeline-card">
      <h3>Prazos</h3>
      <div className="pipeline-dates">
        <label>
          <span>{labels.sent}</span>
          <input type="date" value={stage.sentOn ?? ''} onChange={(event) => onChange({ sentOn: event.target.value || null })} />
        </label>
        <label>
          <span>{labels.due}</span>
          <input type="date" value={stage.dueOn ?? ''} onChange={(event) => onChange({ dueOn: event.target.value || null })} />
        </label>
      </div>
      {isCurrent && (waiting !== null || left !== null) && (
        <p className={`pipeline-deadline${left !== null && left < 0 ? ' is-late' : left !== null && left <= 3 ? ' is-near' : ''}`}>
          {waiting !== null && `Aguardando há ${plural(waiting, 'dia', 'dias')}. `}
          {left !== null &&
            (left < 0 ? `Prazo vencido há ${plural(-left, 'dia', 'dias')}.` : left === 0 ? 'O prazo é hoje.' : `Faltam ${plural(left, 'dia', 'dias')} para o prazo.`)}
        </p>
      )}
    </section>
  )
}

function SceneProgress({
  label,
  slots,
  stage,
  onChange,
  onOpenScene,
}: {
  label: string
  slots: Slot[]
  stage: Stage
  onChange: (doneSlotIds: string[]) => void
  onOpenScene: (slot: Slot) => void
}) {
  const scenes = useMemo(() => orderScenes(slots), [slots])
  const done = new Set(stage.doneSlotIds)
  const count = scenes.filter((slot) => done.has(slot.id)).length
  const nextScene = scenes.find((slot) => !done.has(slot.id))
  const toggle = (slotId: string, isDone: boolean) =>
    onChange(isDone ? [...stage.doneSlotIds, slotId] : stage.doneSlotIds.filter((id) => id !== slotId))

  return (
    <section className="panel pipeline-card">
      <div className="panel-heading">
        <h3>{label}</h3>
        <span className="pipeline-muted">
          {count} de {scenes.length}
        </span>
      </div>
      {scenes.length === 0 ? (
        <p className="panel-description">O projeto ainda não tem cenas.</p>
      ) : (
        <>
          <Progress done={count} total={scenes.length} />
          {nextScene && (
            <button className="button button-secondary button-small pipeline-continue" type="button" onClick={() => onOpenScene(nextScene)}>
              Continuar: cena {sceneNumberLabel(nextScene)} · {sceneTitle(nextScene)}
            </button>
          )}
          <ul className="pipeline-scenes">
            {scenes.map((slot) => (
              <li className={done.has(slot.id) ? 'is-done' : undefined} key={slot.id}>
                <input
                  aria-label={`${label}: ${sceneTitle(slot)}`}
                  checked={done.has(slot.id)}
                  type="checkbox"
                  onChange={(event) => toggle(slot.id, event.target.checked)}
                />
                <button className="pipeline-scene-link" type="button" onClick={() => onOpenScene(slot)}>
                  <span className="pipeline-scene-number">{sceneNumberLabel(slot)}</span>
                  {sceneTitle(slot)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function StageNotes({
  pipeline,
  stage,
  notes,
  slots,
  carriesNotes,
  onOpenNotes,
  onLocate,
  onSetStatus,
}: {
  pipeline: Pipeline
  stage: Stage
  notes: Note[]
  slots: Slot[]
  carriesNotes: boolean
  onOpenNotes: () => void
  onLocate: (note: Note) => void
  onSetStatus: (note: Note, status: NoteStatus) => Promise<void>
}) {
  const [showResolved, setShowResolved] = useState(false)
  const own = notes.filter((note) => note.stageId === stage.id)
  const ownOpen = own.filter((note) => note.status === 'OPEN')
  // Still open from other stages (or from before the pipeline): the letter's items.
  const carried = carriesNotes ? notes.filter((note) => note.status === 'OPEN' && note.stageId !== stage.id) : []
  const stageNames = new Map(pipeline.stages.map((item) => [item.id, item.name]))
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const isCurrent = pipeline.currentStageId === stage.id

  const row = (note: Note, showStage: boolean) => {
    const slot = note.slotId ? slotById.get(note.slotId) : null
    return (
      <li className={`pipeline-note kind-${note.kind.toLowerCase()}${note.status === 'RESOLVED' ? ' is-resolved' : ''}`} key={note.id}>
        <div className="pipeline-note-meta">
          <span className="pipeline-note-kind">{noteKindLabels[note.kind]}</span>
          <span>{slot ? `Cena ${sceneNumberLabel(slot)} · ${sceneTitle(slot)}` : note.slotId ? 'Cena removida' : 'Projeto'}</span>
          {showStage && <span>· {note.stageId ? (stageNames.get(note.stageId) ?? 'Etapa removida') : 'Antes das etapas'}</span>}
        </div>
        <p>{note.isUnreadable ? 'Não foi possível ler esta nota.' : note.excerpt ? `“${note.excerpt.quote}” — ${note.body}` : note.body}</p>
        <div className="pipeline-note-actions">
          <button className="text-button" type="button" onClick={() => onLocate(note)}>
            Abrir
          </button>
          <button className="text-button" type="button" onClick={() => void onSetStatus(note, note.status === 'OPEN' ? 'RESOLVED' : 'OPEN')}>
            {note.status === 'OPEN' ? 'Resolver' : 'Reabrir'}
          </button>
        </div>
      </li>
    )
  }

  const listed = showResolved ? own : ownOpen
  return (
    <section className="panel pipeline-card">
      <div className="panel-heading">
        <h3>Notas desta etapa</h3>
        <span className="pipeline-muted">
          {plural(ownOpen.length, 'aberta', 'abertas')} · {plural(own.length - ownOpen.length, 'resolvida', 'resolvidas')}
        </span>
      </div>
      <p className="panel-description">
        {isCurrent
          ? 'As notas novas, no editor ou no painel de notas, entram nesta etapa.'
          : 'Notas escritas enquanto o projeto estava nesta etapa.'}
      </p>
      {listed.length > 0 ? (
        <ul className="pipeline-notes">{listed.map((note) => row(note, false))}</ul>
      ) : (
        <p className="pipeline-empty-line">{own.length ? 'Nenhuma nota aberta.' : 'Nenhuma nota ainda.'}</p>
      )}
      <div className="pipeline-note-footer">
        {own.length > ownOpen.length && (
          <button className="text-button" type="button" onClick={() => setShowResolved((value) => !value)}>
            {showResolved ? 'Esconder resolvidas' : 'Mostrar resolvidas'}
          </button>
        )}
        <button className="text-button" type="button" onClick={onOpenNotes}>
          Abrir o painel de notas
        </button>
      </div>

      {carriesNotes && (
        <>
          <div className="panel-heading pipeline-carried-head">
            <h3>Pendentes de outras etapas</h3>
            <span className="pipeline-muted">{carried.length}</span>
          </div>
          {carried.length > 0 ? (
            <ul className="pipeline-notes">{carried.map((note) => row(note, true))}</ul>
          ) : (
            <p className="pipeline-empty-line">Nada pendente.</p>
          )}
        </>
      )}
    </section>
  )
}

/** Every open "Pergunta" note of the project, to send with the letter or ask while waiting. */
function AuthorQuestions({ notes, slots, onLocate }: { notes: Note[]; slots: Slot[]; onLocate: (note: Note) => void }) {
  const [copied, setCopied] = useState(false)
  const order = new Map(orderScenes(slots).map((slot, index) => [slot.id, index]))
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  // Project questions first, then in reading order.
  const questions = notes
    .filter((note) => note.kind === 'QUESTION' && note.status === 'OPEN' && !note.isUnreadable)
    .sort((a, b) => (a.slotId ? (order.get(a.slotId) ?? 1e6) + 1 : 0) - (b.slotId ? (order.get(b.slotId) ?? 1e6) + 1 : 0))
  const where = (note: Note) => {
    const slot = note.slotId ? slotById.get(note.slotId) : null
    return slot ? `Cena ${sceneNumberLabel(slot)} · ${sceneTitle(slot)}` : note.slotId ? 'Cena removida' : 'Sobre o livro'
  }
  const asText = questions
    .map((note, index) => `${index + 1}. ${note.body}${note.excerpt ? `\n   Trecho: “${note.excerpt.quote}”` : ''}\n   (${where(note)})`)
    .join('\n\n')

  return (
    <section className="panel pipeline-card">
      <div className="panel-heading">
        <h3>Perguntas para o autor</h3>
        <span className="pipeline-muted">{questions.length}</span>
      </div>
      <p className="panel-description">As notas “Pergunta” ainda abertas, de todas as etapas, para mandar com a carta.</p>
      {questions.length === 0 ? (
        <p className="pipeline-empty-line">Nenhuma pergunta aberta.</p>
      ) : (
        <>
          <ol className="pipeline-questions">
            {questions.map((note) => (
              <li key={note.id}>
                <p>{note.body}</p>
                <button className="inline-link" type="button" onClick={() => onLocate(note)}>
                  {where(note)}
                </button>
              </li>
            ))}
          </ol>
          <button
            className="button button-secondary button-small pipeline-continue"
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(asText).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              })
            }
          >
            {copied ? 'Copiado' : 'Copiar como texto'}
          </button>
        </>
      )}
    </section>
  )
}

function StageEditor({ pipeline, notes, onUpdate }: { pipeline: Pipeline; notes: Note[]; onUpdate: Update }) {
  const [kind, setKind] = useState<StageKind>('livre')
  const [name, setName] = useState('')

  return (
    <section className="panel pipeline-editor">
      <div className="panel-heading">
        <h2>Editar etapas</h2>
      </div>
      <p className="panel-description">
        Renomeie, reordene, pule ou remova etapas só deste projeto. Uma etapa pulada continua aqui e pode voltar ao fluxo.
      </p>
      <ol className="pipeline-editor-list">
        {pipeline.stages.map((stage, index) => {
          const noteCount = notes.filter((note) => note.stageId === stage.id).length
          return (
            <li className={stage.skipped ? 'is-skipped' : undefined} key={stage.id}>
              <input
                aria-label={`Nome da etapa ${index + 1}`}
                value={stage.name}
                onChange={(event) => onUpdate((current) => updateStage(current, stage.id, (item) => ({ ...item, name: event.target.value })))}
                onBlur={(event) => {
                  if (!event.target.value.trim())
                    onUpdate((current) => updateStage(current, stage.id, (item) => ({ ...item, name: stageKinds[item.kind].label })), { immediate: true })
                }}
              />
              <span className="pipeline-editor-kind">{stage.name.trim() === stageKinds[stage.kind].label ? '' : stageKinds[stage.kind].label}</span>
              <div className="pipeline-editor-actions">
                <button
                  aria-label="Subir"
                  className="pipeline-icon-button"
                  disabled={index === 0}
                  title="Subir"
                  type="button"
                  onClick={() => onUpdate((current) => moveStage(current, stage.id, -1), { immediate: true })}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  aria-label="Descer"
                  className="pipeline-icon-button"
                  disabled={index === pipeline.stages.length - 1}
                  title="Descer"
                  type="button"
                  onClick={() => onUpdate((current) => moveStage(current, stage.id, 1), { immediate: true })}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  className="text-button"
                  disabled={pipeline.currentStageId === stage.id}
                  title={pipeline.currentStageId === stage.id ? 'O projeto está nesta etapa' : undefined}
                  type="button"
                  onClick={() => onUpdate((current) => updateStage(current, stage.id, (item) => ({ ...item, skipped: !item.skipped })), { immediate: true })}
                >
                  {stage.skipped ? 'Incluir' : 'Pular'}
                </button>
                <button
                  className="text-button destructive"
                  disabled={pipeline.stages.length === 1}
                  type="button"
                  onClick={() => {
                    const warnings = [
                      pipeline.currentStageId === stage.id && 'o projeto está nesta etapa',
                      noteCount > 0 && `${plural(noteCount, 'nota fica', 'notas ficam')} marcada${noteCount === 1 ? '' : 's'} como "Etapa removida"`,
                      (stage.notebook.trim() || stage.checklist.some((item) => item.done)) && 'o caderno e o checklist serão apagados',
                    ].filter(Boolean)
                    const message = `Remover a etapa "${stage.name}"?${warnings.length ? `\n\nAtenção: ${warnings.join('; ')}.` : ''}`
                    if (window.confirm(message)) onUpdate((current) => removeStage(current, stage.id), { immediate: true })
                  }}
                >
                  Remover
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <form
        className="pipeline-inline-form pipeline-add-stage"
        onSubmit={(event) => {
          event.preventDefault()
          onUpdate((current) => ({ ...current, stages: [...current.stages, createStage(kind, name)] }), { immediate: true })
          setName('')
        }}
      >
        <select aria-label="Tipo da nova etapa" value={kind} onChange={(event) => setKind(event.target.value as StageKind)}>
          {(Object.keys(stageKinds) as StageKind[]).map((value) => (
            <option key={value} value={value}>
              {stageKinds[value].label}
            </option>
          ))}
        </select>
        <input aria-label="Nome da nova etapa" placeholder={stageKinds[kind].label} value={name} onChange={(event) => setName(event.target.value)} />
        <button className="button button-secondary button-small" type="submit">
          Adicionar etapa
        </button>
      </form>
      <p className="panel-description">O tipo define o checklist inicial, as ferramentas sugeridas e se a etapa acompanha cenas ou prazos.</p>
    </section>
  )
}

function History({ pipeline, now }: { pipeline: Pipeline; now: Date }) {
  if (pipeline.history.length === 0) return null
  const names = new Map(pipeline.stages.map((stage) => [stage.id, stage.name]))
  const rounds = new Map<string, number>()
  const rows = pipeline.history.map((event, index) => {
    const round = event.stageId ? (rounds.get(event.stageId) ?? 0) + 1 : 0
    if (event.stageId) rounds.set(event.stageId, round)
    const until = pipeline.history[index + 1]?.at ?? (event.stageId ? now.toISOString() : null)
    return { event, round, days: until ? daysBetween(event.at, until) : null }
  })

  return (
    <section className="panel pipeline-history">
      <h2>Histórico</h2>
      <ol>
        {rows.reverse().map(({ event, round, days }) => (
          <li key={event.id}>
            <time dateTime={event.at}>{formatDate(event.at)}</time>
            <span>
              {event.stageId ? (
                <>
                  Entrou em <strong>{names.get(event.stageId) ?? 'etapa removida'}</strong>
                  {round > 1 ? ` (${roundLabel(round)})` : ''}
                </>
              ) : (
                <strong>Projeto concluído</strong>
              )}
            </span>
            {event.stageId && days !== null && <span className="pipeline-muted">{daysLabel(days)}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

// Active time counted while the project was open, per stage and per day.
function WorkTime({ pipeline, projectId }: { pipeline: Pipeline; projectId: string }) {
  const [entries, setEntries] = useState<TimeEntry[] | null>(null)
  const [showDays, setShowDays] = useState(false)
  useEffect(() => {
    let isCurrent = true
    api
      .listTime(projectId)
      .then((list) => isCurrent && setEntries(list))
      .catch(() => isCurrent && setEntries([]))
    return () => {
      isCurrent = false
    }
  }, [projectId])
  if (!entries || entries.length === 0) return null

  const names = new Map(pipeline.stages.map((stage) => [stage.id, stage.name]))
  const stageName = (stageId: string) => (stageId ? (names.get(stageId) ?? 'Etapa removida') : 'Antes das etapas')
  const total = entries.reduce((sum, entry) => sum + entry.seconds, 0)
  const byStage = new Map<string, number>()
  for (const entry of entries) byStage.set(entry.stageId, (byStage.get(entry.stageId) ?? 0) + entry.seconds)
  const stageRows = [...byStage].sort(
    ([a], [b]) =>
      (pipeline.stages.findIndex((stage) => stage.id === a) + 1 || 999) -
      (pipeline.stages.findIndex((stage) => stage.id === b) + 1 || 999),
  )

  async function remove(entry: TimeEntry) {
    const label = `${formatDay(entry.day)} em ${stageName(entry.stageId)}`
    if (!window.confirm(`Apagar ${formatDuration(entry.seconds)} contados em ${label}?`)) return
    await api.deleteTime(projectId, entry.day, entry.stageId)
    setEntries((list) => list?.filter((item) => item !== entry) ?? null)
  }

  return (
    <section className="panel pipeline-time">
      <div className="pipeline-time-head">
        <h2>Tempo de trabalho</h2>
        <strong>{formatDuration(total)}</strong>
      </div>
      <p className="panel-description">
        Contado sozinho enquanto o projeto está aberto e você está ativo; pausa depois de {IDLE_AFTER_MS / 60000} minutos sem
        mexer no teclado ou no mouse.
      </p>
      <ul className="pipeline-time-stages">
        {stageRows.map(([stageId, seconds]) => (
          <li key={stageId}>
            <span>{stageName(stageId)}</span>
            <Progress done={seconds} total={total} />
            <span className="pipeline-muted">{formatDuration(seconds)}</span>
          </li>
        ))}
      </ul>
      <button className="text-button" type="button" onClick={() => setShowDays((value) => !value)}>
        {showDays ? 'Esconder os dias' : 'Ver dia a dia'}
      </button>
      {showDays && (
        <ol className="pipeline-time-days">
          {entries.map((entry) => (
            <li key={`${entry.day}|${entry.stageId}`}>
              <time dateTime={entry.day}>{formatDay(entry.day)}</time>
              <span>{stageName(entry.stageId)}</span>
              <span className="pipeline-muted">{formatDuration(entry.seconds)}</span>
              <button
                aria-label={`Apagar o tempo de ${formatDay(entry.day)}`}
                className="icon-button"
                title="Apagar (contado por engano)"
                type="button"
                onClick={() => void remove(entry)}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const formatDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div aria-hidden="true" className="pipeline-progress">
      <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </div>
  )
}
