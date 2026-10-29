import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { BoardProject } from '../../api/contracts'
import { decryptScene } from '../../crypto/projectEncryption'
import { recallProjectKey } from '../../crypto/projectKeyCache'
import {
  daysBetween,
  enteredAt,
  normalizePipeline,
  roundOf,
  stageKinds,
  type Pipeline,
  type StageKind,
} from '../../features/pipeline/pipeline'
import { formatDuration } from '../../features/time/useActiveTime'
import './BoardPage.css'

interface BoardPageProps {
  // The open project's key is in memory; others come from "Lembrar".
  openProjectId: string
  openProjectKey: CryptoKey | null
  onOpenProject: (projectId: string) => void
}

type Card = BoardProject & {
  // null: the pipeline couldn't be read here (locked) or doesn't exist.
  pipeline: BoardProject['pipeline']
  opened: Pipeline | null
  locked: boolean
}

type Column = { id: string; label: string; cards: Card[] }

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const daysLabel = (days: number) => (days === 0 ? 'desde hoje' : `há ${plural(days, 'dia', 'dias')}`)
const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

async function openPipeline(project: BoardProject, key: CryptoKey | null): Promise<Card> {
  if (!project.pipeline) return { ...project, opened: null, locked: false }
  const usable = key ?? (await recallProjectKey(project.id))
  if (!usable) return { ...project, opened: null, locked: true }
  try {
    const opened = normalizePipeline(JSON.parse(await decryptScene(usable, project.pipeline.ciphertext, project.pipeline.iv)))
    return { ...project, opened, locked: false }
  } catch {
    return { ...project, opened: null, locked: true }
  }
}

function columnsOf(cards: Card[]): Column[] {
  const kinds = Object.keys(stageKinds) as StageKind[]
  const byKind = new Map<StageKind, Card[]>()
  const unstaged: Card[] = []
  const finished: Card[] = []
  const locked: Card[] = []
  for (const card of cards) {
    if (card.locked) {
      locked.push(card)
      continue
    }
    const pipeline = card.opened
    if (pipeline?.finishedAt) {
      finished.push(card)
      continue
    }
    const stage = pipeline?.stages.find((item) => item.id === pipeline.currentStageId)
    if (!stage) {
      unstaged.push(card)
      continue
    }
    byKind.set(stage.kind, [...(byKind.get(stage.kind) ?? []), card])
  }
  const columns: Column[] = []
  if (unstaged.length) columns.push({ id: 'none', label: 'Fora do fluxo', cards: unstaged })
  for (const kind of kinds) {
    const list = byKind.get(kind)
    if (list) columns.push({ id: kind, label: stageKinds[kind].label, cards: list })
  }
  if (finished.length) columns.push({ id: 'done', label: 'Concluídos', cards: finished })
  if (locked.length) columns.push({ id: 'locked', label: 'Bloqueados', cards: locked })
  return columns
}

/**
 * Every project by the stage it is in. Stages are encrypted per project, so
 * only projects unlocked here (or remembered) show where they are.
 */
export function BoardPage({ openProjectId, openProjectKey, onOpenProject }: BoardPageProps) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Day counts are relative to when the page opened.
  const [now] = useState(() => new Date())

  useEffect(() => {
    let isCurrent = true
    void (async () => {
      try {
        const projects = await api.listBoard()
        const opened = await Promise.all(
          projects.map((project) => openPipeline(project, project.id === openProjectId ? openProjectKey : null)),
        )
        if (isCurrent) {
          setCards(opened)
          setError(null)
        }
      } catch (reason) {
        if (isCurrent) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os projetos.')
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [openProjectId, openProjectKey])

  const columns = cards ? columnsOf(cards) : []
  const totalQuestions = cards?.reduce((sum, card) => sum + card.openNotes.QUESTION, 0) ?? 0

  return (
    <section className="board-page">
      <header className="page-intro">
        <p className="eyebrow">Todos os projetos</p>
        <h1>Quadro</h1>
        <p>
          Onde cada livro está no fluxo editorial.
          {cards && ` ${plural(cards.length, 'projeto', 'projetos')}`}
          {totalQuestions > 0 && `, ${plural(totalQuestions, 'pergunta aberta', 'perguntas abertas')} ao todo`}.
        </p>
      </header>

      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
      {!cards && !error && <p className="board-muted">Carregando os projetos…</p>}
      {cards && cards.length === 0 && <p className="board-muted">Nenhum projeto ainda.</p>}

      {columns.length > 0 && (
        <div className="board-columns">
          {columns.map((column) => (
            <section className={`board-column is-${column.id}`} key={column.id} aria-label={column.label}>
              <h2>
                {column.label} <span>{column.cards.length}</span>
              </h2>
              {column.id === 'locked' && (
                <p className="board-muted">
                  As etapas ficam criptografadas. Abra o projeto (ou marque “Lembrar” ao desbloquear) para ver onde ele
                  está.
                </p>
              )}
              <ul>
                {column.cards.map((card) => (
                  <li key={card.id}>
                    <BoardCard card={card} isOpen={card.id === openProjectId} now={now} onOpen={() => onOpenProject(card.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function BoardCard({ card, isOpen, now, onOpen }: { card: Card; isOpen: boolean; now: Date; onOpen: () => void }) {
  const pipeline = card.opened
  const stage = pipeline?.stages.find((item) => item.id === pipeline.currentStageId) ?? null
  const round = pipeline && stage ? roundOf(pipeline, stage.id) : 0
  const since = pipeline ? enteredAt(pipeline) : null
  const days = since ? daysBetween(since, now) : null
  const today = now.toISOString().slice(0, 10)
  const isLate = Boolean(stage?.dueOn && stage.dueOn < today)
  const { QUESTION: questions, FIX: fixes } = card.openNotes

  return (
    <button className={`board-card${isOpen ? ' is-open' : ''}`} type="button" onClick={onOpen}>
      <strong className="board-card-title">{card.title}</strong>
      {pipeline?.author && <span className="board-card-author">{pipeline.author}</span>}
      {stage && (
        <span className="board-card-stage">
          {stage.name !== stageKinds[stage.kind].label && <>{stage.name} · </>}
          {round > 1 && <>{round}ª rodada · </>}
          {days !== null && daysLabel(days)}
        </span>
      )}
      {stage?.dueOn && (
        <span className={`board-card-due${isLate ? ' is-late' : ''}`}>
          {isLate ? 'Atrasado: ' : 'Prazo: '}
          {formatDate(stage.dueOn)}
        </span>
      )}
      <span className="board-card-meta">
        {questions > 0 && <span className="board-chip is-question">{plural(questions, 'pergunta', 'perguntas')}</span>}
        {fixes > 0 && <span className="board-chip is-fix">{plural(fixes, 'correção', 'correções')}</span>}
        <span>{plural(card.sceneCount, 'cena', 'cenas')}</span>
        {card.seconds > 0 && <span>{formatDuration(card.seconds)}</span>}
      </span>
    </button>
  )
}
