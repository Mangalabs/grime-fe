import {
  spoilerLevelDescriptions,
  spoilerLevelLabels,
  spoilerLevels,
  type Resolved,
  type SpoilerLevel,
} from './marketingKit'

export function LevelChip({ level }: { level: SpoilerLevel }) {
  return <span className={`mk-level-chip is-${level.toLowerCase()}`}>{spoilerLevelLabels[level]}</span>
}

/**
 * Three-way choice of level. Shows whether it follows the default or was
 * chosen; a chosen level can go back to the default.
 */
export function LevelPicker({
  label,
  resolved,
  onChange,
}: {
  label: string
  resolved: Resolved
  onChange: (level: SpoilerLevel | null) => void
}) {
  return (
    <span className="mk-level-picker">
      <span aria-label={label} className="mk-level-options" role="radiogroup">
        {spoilerLevels.map((level) => (
          <button
            aria-checked={resolved.level === level}
            className={`is-${level.toLowerCase()}`}
            key={level}
            role="radio"
            title={spoilerLevelDescriptions[level]}
            type="button"
            onClick={() => onChange(level === resolved.fallback ? null : level)}
          >
            {spoilerLevelLabels[level]}
          </button>
        ))}
      </span>
      {resolved.isChosen ? (
        <button
          className="text-button mk-level-reset"
          title={`Voltar ao padrão: ${spoilerLevelLabels[resolved.fallback]}`}
          type="button"
          onClick={() => onChange(null)}
        >
          Padrão
        </button>
      ) : (
        <span className="mk-level-default">padrão</span>
      )}
    </span>
  )
}
