import { useEffect, useState } from 'react'
import { formatResetDate, formatWords, useUsage } from '../../features/usage/usage'
import type { Slot } from '../../api/contracts'
import { estimateRemaining, type AnalysisState } from '../../features/analysis/useBackgroundAnalysis'
import { orderScenes, sceneTitle } from '../../features/scenes/sceneStatus'
import '../Modal.css'
import './BackgroundAnalysis.css'

function formatRemaining(ms: number) {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'menos de 1 min restante'
  if (minutes < 60) return `cerca de ${minutes} min restantes`
  const hours = Math.floor(minutes / 60)
  return `cerca de ${hours} h ${String(minutes % 60).padStart(2, '0')} min restantes`
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

interface StartDialogProps {
  slots: Slot[]
  // Scenes offered first, e.g. the ones an author's revision changed.
  preselected?: string[] | null
  onStart: (slotIds: string[], concurrency: number) => void
  onClose: () => void
}

/** Chooses which scenes to analyse in the background, and how many at a time. */
export function AnalysisStartDialog({ slots, preselected, onStart, onClose }: StartDialogProps) {
  const ordered = orderScenes(slots)
  const { usage } = useUsage()
  const pending = ordered.filter((slot) => slot.status?.lastAnalyzedAt === null)
  const wanted = new Set(preselected ?? [])
  const changed = ordered.filter((slot) => wanted.has(slot.id))
  const [scope, setScope] = useState<'changed' | 'pending' | 'all'>(
    changed.length ? 'changed' : pending.length ? 'pending' : 'all',
  )
  const [concurrency, setConcurrency] = useState(2)
  const chosen = scope === 'changed' ? changed : scope === 'pending' ? pending : ordered

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="analysis-start-title"
        aria-modal="true"
        className="modal analysis-start"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Revisor</p>
        <h2 id="analysis-start-title">Analisar em segundo plano</h2>
        <p>
          As cenas são analisadas uma após a outra enquanto você continua trabalhando, em qualquer página. Você pode
          pausar ou cancelar a qualquer momento.
        </p>
        <fieldset className="analysis-scope">
          <legend>Quais cenas</legend>
          {changed.length > 0 && (
            <label className="checkbox-label">
              <input checked={scope === 'changed'} name="analysis-scope" type="radio" onChange={() => setScope('changed')} />
              <span>
                <strong>As que mudaram na revisão</strong>
                <small>{plural(changed.length, 'cena', 'cenas')}</small>
              </span>
            </label>
          )}
          <label className="checkbox-label">
            <input
              checked={scope === 'pending'}
              disabled={pending.length === 0}
              name="analysis-scope"
              type="radio"
              onChange={() => setScope('pending')}
            />
            <span>
              <strong>Ainda não analisadas</strong>
              <small>{plural(pending.length, 'cena', 'cenas')}</small>
            </span>
          </label>
          <label className="checkbox-label">
            <input checked={scope === 'all'} name="analysis-scope" type="radio" onChange={() => setScope('all')} />
            <span>
              <strong>Todas, de novo</strong>
              <small>{plural(ordered.length, 'cena', 'cenas')}: substitui os diagnósticos atuais</small>
            </span>
          </label>
        </fieldset>
        <label className="analysis-concurrency">
          <span>Cenas ao mesmo tempo</span>
          <select value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))}>
            <option value={1}>1 (mais lento, menos sujeito a esperas)</option>
            <option value={2}>2 (recomendado)</option>
            <option value={3}>3 (mais rápido)</option>
          </select>
        </label>
        <p className="analysis-fineprint">
          Cada cena usa o dobro das palavras dela do seu limite mensal: o Revisor e o Arquivista leem a cena inteira.
          {usage && ` Restam ${formatWords(usage.remaining)} até ${formatResetDate(usage.resetsAt)}.`} Como na análise
          manual, o texto de cada cena é decifrado neste navegador e enviado para análise. Mantenha esta aba aberta; os
          fatos propostos ficam aguardando sua aprovação em cada cena.
        </p>
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={chosen.length === 0}
            type="button"
            onClick={() => onStart(chosen.map((slot) => slot.id), concurrency)}
          >
            Analisar {plural(chosen.length, 'cena', 'cenas')}
          </button>
        </div>
      </section>
    </div>
  )
}

interface WidgetProps {
  state: AnalysisState
  processed: number
  slots: Slot[]
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRetryFailed: () => void
  onDismiss: () => void
  onOpenScene: (slot: Slot) => void
}

/** The running analysis: a pill that opens into a small panel. */
export function BackgroundAnalysisWidget({
  state,
  processed,
  slots,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onDismiss,
  onOpenScene,
}: WidgetProps) {
  const [isOpen, setIsOpen] = useState(state.isRestored)
  // An interrupted run restored after a reload opens the panel once, so
  // "Retomar" is right there (adjusted while rendering, not in an effect).
  const [shownRestore, setShownRestore] = useState(state.isRestored)
  if (state.isRestored && !shownRestore) {
    setShownRestore(true)
    setIsOpen(true)
  }
  const [now, setNow] = useState(() => Date.now())
  const isActive = state.status === 'running' || state.status === 'waiting'

  useEffect(() => {
    if (!isActive) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isActive])

  if (state.status === 'idle') return null

  const byId = new Map(slots.map((slot) => [slot.id, slot]))
  const label = (slotId: string) => {
    const slot = byId.get(slotId)
    if (!slot) return 'Cena removida'
    const number = slot.isUnanchored || slot.timelinePosition === null ? '' : `${slot.timelinePosition + 1} · `
    return `${number}${sceneTitle(slot)}`
  }
  const percent = state.total ? Math.round((processed / state.total) * 100) : 0
  const eta = isActive ? estimateRemaining(state, now) : null
  const waitLeft = state.status === 'waiting' && state.waitUntil ? Math.max(0, state.waitUntil - now) : null

  const summary =
    state.status === 'done'
      ? `Análise ${state.wasCancelled ? 'cancelada' : 'concluída'} · ${plural(state.done.length, 'cena analisada', 'cenas analisadas')}`
      : state.status === 'paused'
        ? `Análise pausada · ${processed} de ${state.total}`
        : state.status === 'waiting'
          ? `Aguardando o serviço de análise · ${Math.ceil((waitLeft ?? 0) / 1000)} s`
          : `Analisando · ${processed} de ${state.total}`

  return (
    <aside className={`analysis-widget is-${state.status}${isOpen ? ' is-open' : ''}`} aria-label="Análise em segundo plano">
      {isOpen && (
        <div className="analysis-panel">
          <header>
            <h2>Análise em segundo plano</h2>
            <button aria-label="Recolher" className="analysis-collapse" type="button" onClick={() => setIsOpen(false)}>
              ▾
            </button>
          </header>
          <div
            aria-label="Progresso da análise"
            aria-valuemax={state.total}
            aria-valuemin={0}
            aria-valuenow={processed}
            className="analysis-bar"
            role="progressbar"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="analysis-line">
            <strong>
              {processed} de {plural(state.total, 'cena', 'cenas')}
            </strong>
            {eta !== null && ` · ${formatRemaining(eta)}`}
          </p>
          <ul className="analysis-counts">
            <li>
              <span>Analisadas</span> {state.done.length}
            </li>
            <li>
              <span>Na fila</span> {state.queue.length}
            </li>
            {state.partial.length > 0 && (
              <li title="Analisadas, mas um dos agentes relatou um problema">
                <span>Com aviso</span> {state.partial.length}
              </li>
            )}
            {state.failed.length > 0 && (
              <li className="is-failed">
                <span>Falharam</span> {state.failed.length}
              </li>
            )}
            {state.skipped.length > 0 && (
              <li title="Cenas sem texto salvo">
                <span>Sem texto</span> {state.skipped.length}
              </li>
            )}
          </ul>

          {state.inFlight.length > 0 && (
            <div className="analysis-now">
              <span>Agora</span>
              <ul>
                {state.inFlight.map((slotId) => (
                  <li key={slotId}>{label(slotId)}</li>
                ))}
              </ul>
            </div>
          )}

          {state.pauseReason && <p className="analysis-reason">{state.pauseReason}</p>}

          {state.failed.length > 0 && (
            <div className="analysis-failures">
              <span>Falharam</span>
              <ul>
                {state.failed.slice(0, 4).map((failure) => (
                  <li key={failure.slotId}>
                    <button
                      type="button"
                      onClick={() => {
                        const slot = byId.get(failure.slotId)
                        if (slot) onOpenScene(slot)
                      }}
                    >
                      {label(failure.slotId)}
                    </button>
                    <small>{failure.message}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="analysis-actions">
            {state.status === 'running' || state.status === 'waiting' ? (
              <button className="button button-secondary button-small" type="button" onClick={onPause}>
                Pausar
              </button>
            ) : state.status === 'paused' ? (
              <button className="button button-primary button-small" type="button" onClick={onResume}>
                Retomar
              </button>
            ) : null}
            {state.failed.length > 0 && state.status !== 'paused' && (
              <button className="button button-secondary button-small" type="button" onClick={onRetryFailed}>
                Tentar falhas de novo
              </button>
            )}
            {state.status === 'done' ? (
              <button className="text-button" type="button" onClick={onDismiss}>
                Fechar
              </button>
            ) : (
              <button
                className="text-button destructive"
                type="button"
                onClick={() => {
                  if (window.confirm(`Cancelar a análise? ${plural(state.queue.length, 'cena fica', 'cenas ficam')} sem analisar.`)) {
                    onCancel()
                  }
                }}
              >
                Cancelar
              </button>
            )}
          </div>
          {state.status !== 'done' && (
            <p className="analysis-fineprint">
              Mantenha esta aba aberta. Pausar e cancelar deixam terminar as cenas que já estão em análise.
            </p>
          )}
        </div>
      )}
      <button
        aria-expanded={isOpen}
        className="analysis-pill"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="analysis-pill-icon" aria-hidden="true">
          {state.status === 'done' ? '✓' : state.status === 'paused' ? 'II' : ''}
        </span>
        <span className="analysis-pill-text">{summary}</span>
        {state.status !== 'done' && (
          <span className="analysis-pill-bar" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
        )}
      </button>
    </aside>
  )
}
