import { useEffect } from 'react'
import './Modal.css'
import './MoveHistory.css'
import type { Slot, TimelineMove } from '../api/contracts'
import { sceneTitle } from '../features/scenes/sceneStatus'
import { describeMove, formatRelative } from '../features/scenes/timelineMoves'

interface MoveHistoryProps {
  moves: TimelineMove[]
  slots: Slot[]
  undoingMoveId: string | null
  onUndo: (moveId: string) => void
  onSelectSlot: (slot: Slot) => void
  onClose: () => void
}

export function MoveHistory({
  moves,
  slots,
  undoingMoveId,
  onUndo,
  onSelectSlot,
  onClose,
}: MoveHistoryProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="move-history-title"
        aria-modal="true"
        className="modal move-history"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Linha do tempo</p>
        <h2 id="move-history-title">Movimentos recentes</h2>
        <p>
          Desfazer devolve a cena para depois da cena que a precedia e remove os
          alertas que o movimento criou.
        </p>
        {moves.length === 0 ? (
          <p className="move-history-empty">Nenhuma cena foi movida ainda.</p>
        ) : (
          <ul className="move-history-list">
            {moves.map((move) => {
              const slot = slots.find((item) => item.id === move.slotId)
              return (
                <li className={move.undoneAt ? 'is-undone' : ''} key={move.id}>
                  <div className="move-history-main">
                    {slot ? (
                      <button
                        className="inline-link move-history-scene"
                        type="button"
                        onClick={() => onSelectSlot(slot)}
                      >
                        {sceneTitle(slot)}
                      </button>
                    ) : (
                      <span className="move-history-scene">Cena removida</span>
                    )}
                    <span className="move-history-meta">
                      {describeMove(move)} · {formatRelative(move.createdAt)}
                      {move.alertIds.length > 0 &&
                        ` · ${move.alertIds.length} ${move.alertIds.length === 1 ? 'alerta' : 'alertas'}`}
                    </span>
                  </div>
                  {move.undoneAt ? (
                    <span className="move-history-status">Desfeito</span>
                  ) : (
                    <button
                      className="button button-secondary button-small"
                      disabled={undoingMoveId !== null}
                      type="button"
                      onClick={() => onUndo(move.id)}
                    >
                      {undoingMoveId === move.id ? 'Desfazendo…' : 'Desfazer'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>
    </div>
  )
}
