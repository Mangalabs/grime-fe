import type { RegressionAlert, Slot, TimelineMove } from '../api/contracts'
import './AlertPanel.css'
import { describeMove, undoableMoveForAlert } from '../features/scenes/timelineMoves'

interface AlertPanelProps {
  alerts: RegressionAlert[]
  slots: Slot[]
  isLoading: boolean
  onAcknowledge: (alertId: string) => void
  onRefresh: () => void
  onSelectSlot: (slot: Slot) => void
  moves: TimelineMove[]
  undoingMoveId: string | null
  onUndoMove: (moveId: string) => void
}

function slotLabel(slot: Slot): string {
  const title = slot.title ?? 'Cena sem título'
  return slot.isUnanchored || slot.timelinePosition === null
    ? `Cena avulsa · ${title}`
    : `Cena ${slot.timelinePosition + 1} · ${title}`
}

export function AlertPanel({
  alerts,
  slots,
  isLoading,
  onAcknowledge,
  onRefresh,
  onSelectSlot,
  moves,
  undoingMoveId,
  onUndoMove,
}: AlertPanelProps) {
  const pendingAlerts = alerts.filter((alert) => alert.status === 'PENDING')

  return (
    <section className="panel alerts-panel" aria-labelledby="alerts-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Regressões</p>
          <h2 id="alerts-heading">Alertas da Cena</h2>
        </div>
        <button
          aria-label="Atualizar alertas"
          className="icon-button"
          disabled={isLoading}
          type="button"
          onClick={onRefresh}
        >
          ↻
        </button>
      </div>
      <p className="panel-description">
        {pendingAlerts.length
          ? `${pendingAlerts.length} alerta(s) pendente(s) de revalidação.`
          : 'Nenhum alerta pendente de revalidação.'}
      </p>
      {isLoading ? (
        <p className="empty-state">Carregando alertas…</p>
      ) : alerts.length === 0 ? (
        <p className="empty-state">Nenhum alerta persistido para esta Cena.</p>
      ) : (
        <div className="alert-list">
          {alerts.map((alert) => {
            const sourceSlot = slots.find((slot) => slot.id === alert.sourceSlotId)
            const move = undoableMoveForAlert(moves, alert.id)
            return (
              <article className="alert-card" key={alert.id}>
                <div className="alert-heading">
                  <span className={`alert-status status-${alert.status.toLowerCase()}`}>
                    {alert.status === 'PENDING' ? 'Pendente' : 'Reconhecido'}
                  </span>
                  <time dateTime={alert.createdAt}>
                    {formatDate(alert.createdAt)}
                  </time>
                </div>
                <p>{move ? `Ordem alterada (${describeMove(move)}):` : 'Alteração em'}</p>
                {sourceSlot ? (
                  <button
                    className="alert-source"
                    type="button"
                    onClick={() => onSelectSlot(sourceSlot)}
                  >
                    {slotLabel(sourceSlot)}
                  </button>
                ) : (
                  <span className="alert-source alert-source-missing">
                    Cena não encontrada na timeline
                  </span>
                )}
                {move && (
                  <button
                    className="text-button alert-undo"
                    disabled={undoingMoveId !== null}
                    type="button"
                    onClick={() => onUndoMove(move.id)}
                  >
                    {undoingMoveId === move.id ? 'Desfazendo…' : 'Desfazer movimento'}
                  </button>
                )}
                {alert.status === 'PENDING' && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => onAcknowledge(alert.id)}
                  >
                    Reconhecer alerta
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
}
