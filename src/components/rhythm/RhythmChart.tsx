import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import type { SceneMetric, Slot } from '../../api/contracts'
import type { CastRow, SceneTextMetrics } from '../../features/rhythm/metrics'
import { sceneTitle } from '../../features/scenes/sceneStatus'
import type { StripBand } from '../SceneStrip'

interface RhythmChartProps {
  scenes: Slot[]
  metrics: SceneTextMetrics[]
  // Tension per scene index; null where the report has no score for it.
  tension: Array<SceneMetric | null> | null
  cast: CastRow[]
  facts: number[] | null
  bands: StripBand[]
  selected: number | null
  onSelect: (index: number) => void
  onHover: (index: number | null) => void
}

/** Bars scaled to the lane's maximum, one column per scene. */
function BarLane({
  values,
  className,
  describe,
}: {
  values: number[]
  className: string
  describe: (value: number) => string
}) {
  const max = Math.max(...values, 1e-9)
  return (
    <div className={`rhythm-lane rhythm-bars ${className}`}>
      {values.map((value, index) => (
        <span key={index} title={describe(value)}>
          <span style={{ height: `${Math.max(value > 0 ? 4 : 0, (value / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  )
}

function TensionLane({ tension, count }: { tension: Array<SceneMetric | null>; count: number }) {
  // The line breaks where a scene has no score (scenes added after the report).
  const segments: string[] = []
  let current: string[] = []
  tension.forEach((metric, index) => {
    if (metric) current.push(`${index + 0.5},${10 - metric.tension}`)
    else if (current.length) {
      segments.push(current.join(' '))
      current = []
    }
  })
  if (current.length) segments.push(current.join(' '))

  return (
    <div className="rhythm-lane rhythm-tension">
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${count} 10`}>
        {[3, 7].map((level) => (
          <line className="rhythm-gridline" key={level} x1="0" x2={count} y1={10 - level} y2={10 - level} />
        ))}
        {segments.map((points) => {
          const first = points.split(' ')[0].split(',')[0]
          const last = points.split(' ').at(-1)!.split(',')[0]
          return (
            <g key={points}>
              <polygon className="rhythm-tension-area" points={`${first},10 ${points} ${last},10`} />
              <polyline className="rhythm-tension-line" points={points} />
            </g>
          )
        })}
      </svg>
      <div className="rhythm-tension-dots">
        {tension.map((metric, index) =>
          metric ? (
            <span
              className={`beat-${metric.beat.toLowerCase()}`}
              key={index}
              style={{ gridColumn: `${index + 1}`, bottom: `${metric.tension * 10}%` }}
            />
          ) : null,
        )}
      </div>
    </div>
  )
}

export function RhythmChart({
  scenes,
  metrics,
  tension,
  cast,
  facts,
  bands,
  selected,
  onSelect,
  onHover,
}: RhythmChartProps) {
  const count = scenes.length
  const overlayRef = useRef<HTMLDivElement>(null)
  const style = { '--scene-count': count, '--plot-min': `${count * 9}px` } as CSSProperties

  function focusColumn(index: number) {
    const target = Math.max(0, Math.min(count - 1, index))
    onSelect(target)
    overlayRef.current?.querySelectorAll<HTMLButtonElement>('button')[target]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: count - 1,
      PageUp: index - 10,
      PageDown: index + 10,
    }
    if (event.key in moves) {
      event.preventDefault()
      focusColumn(moves[event.key])
    }
  }

  // Every tenth scene, without crowding the last one.
  const ticks = [
    0,
    ...Array.from({ length: Math.floor((count - 1) / 10) }, (_, i) => (i + 1) * 10 - 1).filter((tick) => tick < count - 4),
    count - 1,
  ].filter((tick, index, all) => all.indexOf(tick) === index)

  return (
    <div className="rhythm-chart" style={style}>
      <div className="rhythm-labels" aria-hidden="true">
        {bands.length > 0 && <span className="rhythm-label rhythm-label-bands">Estrutura</span>}
        {tension && (
          <span className="rhythm-label rhythm-label-tension">
            Tensão
            <small>0–10 · Arquiteto</small>
          </span>
        )}
        <span className="rhythm-label rhythm-label-bars">
          Extensão
          <small>palavras</small>
        </span>
        <span className="rhythm-label rhythm-label-bars">
          Diálogo
          <small>% do texto</small>
        </span>
        <span className="rhythm-label rhythm-label-bars">
          Frases
          <small>palavras/frase</small>
        </span>
        {facts && (
          <span className="rhythm-label rhythm-label-bars">
            Mudanças
            <small>fatos aprovados</small>
          </span>
        )}
        {cast.map((row) => (
          <span className="rhythm-label rhythm-label-cast" key={row.entityId} title={row.name}>
            {row.name}
          </span>
        ))}
        <span className="rhythm-label rhythm-label-axis" />
      </div>

      <div className="rhythm-plot">
        {selected !== null && (
          <span
            aria-hidden="true"
            className="rhythm-column-highlight"
            style={{ left: `calc(${selected} * 100% / ${count})`, width: `calc(100% / ${count})` }}
          />
        )}
        {bands.length > 0 && (
          <div className="overview-bands rhythm-lane rhythm-lane-bands">
            {bands.map((band) => (
              <span
                className={`overview-band ${band.colorClass}`}
                key={`${band.key}-${band.start}`}
                style={{ gridColumn: `${band.start + 1} / span ${band.length}` }}
                title={band.title}
              >
                <span>{band.label}</span>
              </span>
            ))}
          </div>
        )}
        {tension && <TensionLane count={count} tension={tension} />}
        <BarLane
          className="lane-words"
          describe={(value) => `${value.toLocaleString('pt-BR')} palavras`}
          values={metrics.map((metric) => metric.words)}
        />
        <BarLane
          className="lane-dialogue"
          describe={(value) => `${Math.round(value * 100)}% em diálogo`}
          values={metrics.map((metric) => metric.dialogueShare)}
        />
        <BarLane
          className="lane-sentences"
          describe={(value) => `${value.toFixed(1)} palavras por frase`}
          values={metrics.map((metric) => metric.avgSentenceWords)}
        />
        {facts && (
          <BarLane className="lane-facts" describe={(value) => `${value} fato(s)`} values={facts} />
        )}
        {cast.map((row) => {
          const max = Math.max(...row.mentions, 1)
          return (
            <div className="rhythm-lane rhythm-cast" key={row.entityId}>
              {row.mentions.map((mentions, index) => (
                <span
                  key={index}
                  style={{ opacity: mentions ? 0.25 + 0.75 * (mentions / max) : 0 }}
                  title={`${row.name}: ${mentions} menção(ões)`}
                />
              ))}
            </div>
          )
        })}
        <div className="rhythm-lane rhythm-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ gridColumn: `${tick + 1}` }}>
              {tick + 1}
            </span>
          ))}
        </div>

        {/* One focusable column per scene; arrows move between them. */}
        <div
          aria-label="Cenas: use as setas para percorrer"
          className="rhythm-overlay"
          ref={overlayRef}
          role="toolbar"
          onMouseLeave={() => onHover(null)}
        >
          {scenes.map((slot, index) => (
            <button
              aria-label={`Cena ${index + 1}: ${sceneTitle(slot)}`}
              aria-pressed={selected === index}
              key={slot.id}
              tabIndex={index === (selected ?? 0) ? 0 : -1}
              type="button"
              onClick={() => onSelect(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onMouseEnter={() => onHover(index)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
