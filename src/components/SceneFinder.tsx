import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import './SceneFinder.css'
import './SceneStrip.css'
import './Modal.css'
import type { SceneGroup, Slot } from '../api/contracts'
import {
  normalizeForSearch,
  orderScenes,
  sceneNumberLabel,
  sceneState,
  sceneStateLabels,
  sceneTitle,
  searchScenes,
  supportsAnalysisTracking,
  type SceneState,
} from '../features/scenes/sceneStatus'
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from './icons'

interface SceneFinderProps {
  slots: Slot[]
  groups?: SceneGroup[]
  selectedSlotId: string
  onSelect: (slot: Slot) => void
  onReorder: (slotId: string, targetPosition: number, isUnanchored: boolean) => void
  onClose: () => void
}

type Filter = 'all' | 'unanalyzed' | 'critical' | 'alert' | 'facts' | 'notes'

const filterLabels: Record<Filter, string> = {
  all: 'Todas',
  unanalyzed: 'Não analisadas',
  critical: 'Com crítico',
  alert: 'Revalidar',
  facts: 'Fatos pendentes',
  notes: 'Com notas',
}

function matchesFilter(slot: Slot, filter: Filter): boolean {
  const status = slot.status
  switch (filter) {
    case 'all':
      return true
    case 'unanalyzed':
      return status?.lastAnalyzedAt === null
    case 'critical':
      return (status?.criticalDiagnostics ?? 0) > 0
    case 'alert':
      return (status?.pendingAlerts ?? 0) > 0
    case 'facts':
      return Boolean(status?.hasPendingFacts)
    case 'notes':
      return (status?.openNotes ?? 0) > 0
  }
}

// Wraps the parts of `text` that match any query word, ignoring accents.
function highlight(text: string, query: string): ReactNode {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return text

  // Normalize per character so match positions map back to the original.
  let normalized = ''
  const sourceIndex: number[] = []
  Array.from(text).forEach((char, index) => {
    for (const part of normalizeForSearch(char) || char.toLocaleLowerCase('pt-BR')) {
      normalized += part
      sourceIndex.push(index)
    }
  })
  const chars = Array.from(text)
  const marked = new Array<boolean>(chars.length).fill(false)
  words.forEach((word) => {
    let from = normalized.indexOf(word)
    while (from >= 0) {
      for (let i = from; i < from + word.length; i++) marked[sourceIndex[i]] = true
      from = normalized.indexOf(word, from + word.length)
    }
  })

  const parts: ReactNode[] = []
  let run = ''
  let runMarked = marked[0]
  chars.forEach((char, index) => {
    if (marked[index] !== runMarked) {
      parts.push(runMarked ? <mark key={index}>{run}</mark> : run)
      run = ''
      runMarked = marked[index]
    }
    run += char
  })
  parts.push(runMarked ? <mark key="end">{run}</mark> : run)
  return parts
}

export function SceneFinder({
  slots,
  groups = [],
  selectedSlotId,
  onSelect,
  onReorder,
  onClose,
}: SceneFinderProps) {
  const ordered = useMemo(() => orderScenes(slots), [slots])
  const anchoredCount = ordered.filter((slot) => !slot.isUnanchored).length
  const tracksAnalysis = supportsAnalysisTracking(slots)
  const filters = (Object.keys(filterLabels) as Filter[]).filter(
    (filter) =>
      (filter !== 'unanalyzed' || tracksAnalysis) &&
      (filter !== 'notes' || slots.some((slot) => slot.status?.openNotes !== undefined)),
  )

  const [query, setQuery] = useState('')
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const [filter, setFilter] = useState<Filter>('all')
  const results = useMemo(
    () =>
      searchScenes(
        ordered.filter((slot) => matchesFilter(slot, filter)),
        query,
        (slot) => groupById.get(slot.groupId ?? '')?.name ?? '',
      ),
    [ordered, filter, query, groupById],
  )
  // Tracked by id so the highlight stays on the same scene after a reorder.
  const [activeId, setActiveId] = useState<string | null>(selectedSlotId || null)
  const activeIndex = Math.max(
    0,
    results.findIndex((slot) => slot.id === activeId),
  )
  const active = results[activeIndex]

  useEffect(() => {
    if (active) {
      document
        .getElementById(`scene-option-${active.id}`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  function move(slot: Slot, direction: -1 | 1) {
    if (slot.isUnanchored || slot.timelinePosition === null) return
    const target = slot.timelinePosition + direction
    if (target < 0 || target >= anchoredCount) return
    onReorder(slot.id, target, false)
  }

  function anchorAtEnd(slot: Slot) {
    onReorder(slot.id, anchoredCount, false)
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    // List keys only apply while typing; filter buttons keep their own Enter.
    if (!active || event.target !== event.currentTarget.querySelector('input')) return

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      move(active, event.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveId(results[(activeIndex + step + results.length) % results.length].id)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.altKey && active.isUnanchored) {
        anchorAtEnd(active)
      } else {
        onSelect(active)
      }
    }
  }

  const counts = useMemo(
    () =>
      Object.fromEntries(
        filters.map((item) => [item, ordered.filter((slot) => matchesFilter(slot, item)).length]),
      ) as Record<Filter, number>,
    [filters, ordered],
  )

  return (
    <div className="modal-backdrop finder-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="Encontrar cena"
        aria-modal="true"
        className="modal finder"
        role="dialog"
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="finder-search">
          <SearchIcon />
          <input
            aria-activedescendant={active ? `scene-option-${active.id}` : undefined}
            aria-autocomplete="list"
            aria-controls="scene-finder-list"
            aria-expanded="true"
            aria-label="Buscar cena por título ou número"
            autoFocus
            placeholder="Buscar por título, número ou grupo…"
            role="combobox"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveId(null)
            }}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="finder-filters" role="radiogroup" aria-label="Filtrar cenas">
          {filters.map((item) => (
            <button
              aria-checked={filter === item}
              className={`finder-filter${filter === item ? ' is-active' : ''}`}
              key={item}
              role="radio"
              type="button"
              onClick={() => {
                setFilter(item)
                setActiveId(null)
              }}
            >
              {item !== 'all' && item !== 'notes' && <span className={`state-swatch state-${item}`} aria-hidden="true" />}
              {filterLabels[item]}
              <span className="finder-filter-count">{counts[item]}</span>
            </button>
          ))}
        </div>

        {results.length === 0 ? (
          <p className="finder-empty">Nenhuma cena encontrada.</p>
        ) : (
          <ul className="finder-list" id="scene-finder-list" role="listbox">
            {results.map((slot) => {
              const state: SceneState = sceneState(slot)
              const isActive = slot.id === active?.id
              const isCurrent = slot.id === selectedSlotId
              return (
                <li
                  aria-selected={isActive}
                  className={`finder-option${isActive ? ' is-active' : ''}${isCurrent ? ' is-current' : ''}`}
                  id={`scene-option-${slot.id}`}
                  key={slot.id}
                  role="option"
                  onClick={() => onSelect(slot)}
                  onMouseMove={() => {
                    if (!isActive) setActiveId(slot.id)
                  }}
                >
                  <span className="finder-number">{sceneNumberLabel(slot)}</span>
                  <span className="finder-title">{highlight(sceneTitle(slot), query)}</span>
                  {slot.groupId && groupById.has(slot.groupId) && (
                    <span className={`finder-group group-${groupById.get(slot.groupId)!.color}`}>
                      {highlight(groupById.get(slot.groupId)!.name, query)}
                    </span>
                  )}
                  {(slot.status?.openNotes ?? 0) > 0 && (
                    <span className="finder-notes" title="Notas abertas">
                      ✎ {slot.status!.openNotes}
                    </span>
                  )}
                  {isCurrent && <span className="finder-current">atual</span>}
                  <span className={`finder-state state-${state}`} title={sceneStateLabels[state]}>
                    <span className={`state-swatch state-${state}`} aria-hidden="true" />
                    <span className="sr-only">{sceneStateLabels[state]}</span>
                  </span>
                  {/* Mouse shortcuts; the keyboard uses Alt+↑/↓ and Alt+Enter. */}
                  <span className="finder-actions" aria-hidden="true">
                    {slot.isUnanchored ? (
                      <button
                        className="finder-action finder-action-text"
                        tabIndex={-1}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          anchorAtEnd(slot)
                        }}
                      >
                        Ancorar no fim
                      </button>
                    ) : (
                      <>
                        <button
                          className="finder-action"
                          disabled={slot.timelinePosition === 0}
                          tabIndex={-1}
                          title="Mover para antes (Alt+↑)"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            move(slot, -1)
                          }}
                        >
                          <ArrowUpIcon />
                        </button>
                        <button
                          className="finder-action"
                          disabled={slot.timelinePosition === anchoredCount - 1}
                          tabIndex={-1}
                          title="Mover para depois (Alt+↓)"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            move(slot, 1)
                          }}
                        >
                          <ArrowDownIcon />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <p className="finder-hint">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Alt</kbd> + <kbd>↑</kbd> <kbd>↓</kbd> mover na timeline</span>
          {active?.isUnanchored && (
            <span><kbd>Alt</kbd> + <kbd>Enter</kbd> ancorar no fim</span>
          )}
        </p>
      </section>
    </div>
  )
}
