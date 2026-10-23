import type { TimelineMove } from '../../api/contracts'

export function positionLabel(position: number | null): string {
  return position === null ? 'fora da timeline' : `posição ${position + 1}`
}

export function describeMove(move: Pick<TimelineMove, 'fromPosition' | 'toPosition'>): string {
  return `${positionLabel(move.fromPosition)} → ${positionLabel(move.toPosition)}`
}

// The move that created or reopened an alert, while it can still be undone.
export function undoableMoveForAlert(
  moves: TimelineMove[],
  alertId: string,
): TimelineMove | undefined {
  return moves.find((move) => !move.undoneAt && move.alertIds.includes(alertId))
}

const relativeTime = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit)
    }
  }
  return 'agora mesmo'
}
