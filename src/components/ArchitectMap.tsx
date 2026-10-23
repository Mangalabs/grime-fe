import type { CSSProperties } from 'react'
import type { MacroDiagnostic, Slot } from '../api/contracts'
import { diagnosticTypes, severityLabels } from '../features/architect/architect'
import { sceneTitle } from '../features/scenes/sceneStatus'
import type { StripBand } from './SceneStrip'

export interface MapFinding {
  key: string
  diagnostic: MacroDiagnostic
  // Current timeline indexes (0-based) of the scenes the finding cites.
  positions: number[]
}

interface ArchitectMapProps {
  scenes: Slot[]
  findings: MapFinding[]
  bands: StripBand[]
  activeKey: string | null
  onSelectFinding: (key: string) => void
}

// Consecutive positions become one bar.
function runs(positions: number[]) {
  const sorted = [...new Set(positions)].sort((a, b) => a - b)
  const result: Array<{ start: number; length: number }> = []
  for (const position of sorted) {
    const last = result[result.length - 1]
    if (last && last.start + last.length === position) last.length += 1
    else result.push({ start: position, length: 1 })
  }
  return result
}

function rangeLabel(start: number, length: number) {
  return length === 1 ? `Cena ${start + 1}` : `Cenas ${start + 1}–${start + length}`
}

/** Where each finding falls in the work: one row per finding over the scenes. */
export function ArchitectMap({ scenes, findings, bands, activeKey, onSelectFinding }: ArchitectMapProps) {
  const count = Math.max(scenes.length, 1)
  const style = { '--scene-count': count } as CSSProperties
  const ticks = [...new Set([0, ...Array.from({ length: Math.floor((count - 1) / 10) }, (_, i) => (i + 1) * 10 - 1), count - 1])]

  return (
    <section className="panel architect-map" aria-labelledby="architect-map-title">
      <div className="architect-map-heading">
        <h2 id="architect-map-title">Mapa da obra</h2>
        <p>Onde cada achado aparece na timeline atual. Clique numa linha para ver o achado.</p>
      </div>
      <div className="architect-map-grid">
        {bands.length > 0 && (
          <>
            <span className="architect-map-label architect-map-label-muted">Estrutura</span>
            <div className="overview-bands architect-map-track" style={style}>
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
          </>
        )}
        {findings.map(({ key, diagnostic, positions }) => {
          const label = diagnosticTypes[diagnostic.type].label
          return (
            <button
              aria-label={`${label}, ${severityLabels[diagnostic.severity]}: ${
                positions.length ? runs(positions).map((run) => rangeLabel(run.start, run.length)).join(', ') : diagnostic.affectedScope
              }`}
              className={`architect-map-row severity-${diagnostic.severity.toLowerCase()}${key === activeKey ? ' is-active' : ''}`}
              key={key}
              type="button"
              onClick={() => onSelectFinding(key)}
            >
              <span className="architect-map-label">
                <span className="severity-dot" aria-hidden="true" />
                {label}
              </span>
              <span className="architect-map-track architect-map-lane" style={style} aria-hidden="true">
                {positions.length === 0 ? (
                  <span className="architect-map-scope" style={{ gridColumn: '1 / -1' }}>
                    {diagnostic.affectedScope}
                  </span>
                ) : (
                  runs(positions).map((run) => (
                    <span
                      className="architect-map-bar"
                      key={run.start}
                      style={{ gridColumn: `${run.start + 1} / span ${run.length}` }}
                      title={`${rangeLabel(run.start, run.length)}: ${scenes
                        .slice(run.start, run.start + run.length)
                        .map((slot) => sceneTitle(slot))
                        .join(' · ')}`}
                    />
                  ))
                )}
              </span>
            </button>
          )
        })}
        <span />
        <div className="architect-map-axis architect-map-track" style={style} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ gridColumn: `${tick + 1} / span 1` }}>
              {tick + 1}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
