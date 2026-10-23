import { useRef, useState, type CSSProperties } from 'react'
import './SceneStrip.css'
import type { Slot } from '../api/contracts'
import { sceneTitle } from '../features/scenes/sceneStatus'

interface SceneStripProps {
  // Anchored scenes in timeline order.
  scenes: Slot[]
  selectedId: string | null
  // Colour of each segment: a `state-*` class suffix from SceneStrip.css.
  stateOf: (slot: Slot) => string
  // Third tooltip line, e.g. the scene's review state.
  describe: (slot: Slot) => string
  onSelect: (slot: Slot) => void
  label: string
  // Labelled bands above the bar (scene groups), in scene-index columns.
  bands?: StripBand[]
  onBandClick?: (key: string) => void
  // Scenes picked with Shift+click, e.g. to assign them to a group.
  rangeIds?: Set<string>
  onRangeSelect?: (index: number) => void
}

export interface StripBand {
  key: string
  start: number
  length: number
  label: string
  // A `group-*` class that sets --group-color.
  colorClass: string
  title: string
}

/**
 * The book on one line: one segment per scene. Hovered segments swell like a
 * dock and a single tooltip glides along; arrow keys move between scenes.
 */
export function SceneStrip({
  scenes,
  selectedId,
  stateOf,
  describe,
  onSelect,
  label,
  bands = [],
  onBandClick,
  rangeIds,
  onRangeSelect,
}: SceneStripProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  // Keeps the last scene in the tooltip while it fades out.
  const [tooltipIndex, setTooltipIndex] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)

  const selectedIndex = scenes.findIndex((slot) => slot.id === selectedId)
  const tooltipScene = scenes[Math.min(tooltipIndex, scenes.length - 1)]
  // Hide an end label when the current-scene label would overlap it.
  const selectedShare = (selectedIndex + 0.5) / scenes.length
  const showStart =
    selectedIndex < 0 || (selectedIndex > 0 && selectedShare > 0.06)
  const showEnd =
    selectedIndex < 0 ||
    (selectedIndex < scenes.length - 1 && selectedShare < 0.94)
  const share = (index: number) => `${((index + 0.5) / scenes.length) * 100}%`

  function activate(index: number) {
    setActiveIndex(index)
    setTooltipIndex(index)
  }

  function focusSegment(index: number) {
    const clamped = Math.max(0, Math.min(scenes.length - 1, index))
    barRef.current
      ?.querySelectorAll<HTMLButtonElement>('.overview-segment')
      [clamped]?.focus()
  }

  if (scenes.length === 0) {
    return null
  }

  return (
    <div className="overview" style={{ '--scene-count': scenes.length } as CSSProperties}>
      {bands.length > 0 && (
        <div className="overview-bands" aria-label="Grupos de cenas">
          {bands.map((band) => (
            <button
              className={`overview-band ${band.colorClass}`}
              key={`${band.key}-${band.start}`}
              style={{ gridColumn: `${band.start + 1} / span ${band.length}` }}
              title={band.title}
              type="button"
              onClick={() => onBandClick?.(band.key)}
            >
              <span>{band.label}</span>
            </button>
          ))}
        </div>
      )}
      {tooltipScene && (
        <div
          aria-hidden="true"
          className={`overview-tooltip${activeIndex !== null ? ' is-visible' : ''}`}
          style={{ '--tip-x': share(tooltipIndex) } as CSSProperties}
        >
          <span className="overview-tooltip-number">
            Cena {tooltipIndex + 1} de {scenes.length}
          </span>
          <strong>{sceneTitle(tooltipScene)}</strong>
          <span className="overview-tooltip-state">
            <span className={`state-swatch state-${stateOf(tooltipScene)}`} />
            {describe(tooltipScene)}
          </span>
        </div>
      )}
      <div
        aria-label={label}
        className="overview-bar"
        ref={barRef}
        role="group"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {scenes.map((slot, index) => {
          const isSelected = slot.id === selectedId
          // One tab stop for the whole bar; arrows move between scenes.
          const isTabStop = index === (selectedIndex >= 0 ? selectedIndex : 0)
          return (
            <button
              aria-current={isSelected ? 'true' : undefined}
              aria-label={`Cena ${index + 1}: ${sceneTitle(slot)} — ${describe(slot)}`}
              className={`overview-segment state-${stateOf(slot)}${isSelected ? ' overview-segment-selected' : ''}${rangeIds?.has(slot.id) ? ' is-in-range' : ''}`}
              key={slot.id}
              tabIndex={isTabStop ? 0 : -1}
              type="button"
              onBlur={() => setActiveIndex(null)}
              onClick={(event) => {
                if (event.shiftKey && onRangeSelect) onRangeSelect(index)
                else onSelect(slot)
              }}
              onFocus={() => activate(index)}
              onKeyDown={(event) => {
                const target =
                  event.key === 'ArrowRight' ? index + 1
                  : event.key === 'ArrowLeft' ? index - 1
                  : event.key === 'Home' ? 0
                  : event.key === 'End' ? scenes.length - 1
                  : null
                if (event.key === 'Enter' && event.shiftKey && onRangeSelect) {
                  event.preventDefault()
                  onRangeSelect(index)
                  return
                }
                if (target === null) return
                event.preventDefault()
                focusSegment(target)
              }}
              onMouseEnter={() => activate(index)}
            />
          )
        })}
      </div>
      <div className="overview-axis" aria-hidden="true">
        <span>{showStart && 1}</span>
        {selectedIndex >= 0 && (
          <span
            className="overview-axis-current"
            style={{ '--tip-x': share(selectedIndex) } as CSSProperties}
          >
            {selectedIndex + 1}
          </span>
        )}
        <span>{showEnd && scenes.length}</span>
      </div>
    </div>
  )
}
