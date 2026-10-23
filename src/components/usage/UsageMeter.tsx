import type { UsageSummary } from '../../api/contracts'
import { formatResetDate, formatWords, usageLevel } from '../../features/usage/usage'
import './Usage.css'

// The month's allowance as a bar with what's used, left and when it renews.
export function UsageMeter({ usage, compact = false }: { usage: UsageSummary; compact?: boolean }) {
  const share = usage.limit > 0 ? Math.min(1, usage.used / usage.limit) : 1
  const level = usageLevel(usage)

  return (
    <div className={`usage-meter is-${level}${compact ? ' is-compact' : ''}`}>
      <div className="usage-meter-figures">
        <strong>{usage.used.toLocaleString('pt-BR')}</strong>
        <span>de {formatWords(usage.limit)}</span>
      </div>
      <div
        aria-label="Uso do limite mensal"
        aria-valuemax={usage.limit}
        aria-valuemin={0}
        aria-valuenow={usage.used}
        aria-valuetext={`${formatWords(usage.used)} de ${formatWords(usage.limit)}`}
        className="usage-bar"
        role="meter"
      >
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <p className="usage-meter-caption">
        {level === 'exhausted'
          ? `Limite esgotado · renova em ${formatResetDate(usage.resetsAt)}`
          : `Restam ${formatWords(usage.remaining)} · renova em ${formatResetDate(usage.resetsAt)}`}
      </p>
    </div>
  )
}
