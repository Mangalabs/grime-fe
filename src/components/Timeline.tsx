import { useEffect, useState } from 'react'
import './Timeline.css'
import type { SceneGroup, Slot } from '../api/contracts'
import { groupRuns } from '../features/scenes/groups'
import {
  orderScenes,
  sceneState,
  sceneStateLabels,
  sceneTitle,
  type SceneState,
} from '../features/scenes/sceneStatus'
import { HistoryIcon, SearchIcon } from './icons'
import { SceneStrip, type StripBand } from './SceneStrip'

interface TimelineProps {
  projectId: string
  slots: Slot[]
  error: string | null
  selectedSlotId: string
  onSelect: (slot: Slot) => void
  onCreate: () => void
  onOpenFinder: () => void
  // The history button appears once any move exists; the badge counts
  // the ones that can still be undone.
  hasMoveHistory: boolean
  undoableMoveCount: number
  onOpenHistory: () => void
  groups: SceneGroup[]
  onOpenStructure: (focusGroupId: string | null) => void
  onAssignGroup: (slotIds: string[], groupId: string | null) => Promise<void>
  onCreateGroupAndAssign: (name: string, slotIds: string[]) => Promise<void>
  // Background analysis; absent when the backend doesn't track analyses.
  analysis?: { pending: number; isBusy: boolean; onStart: () => void }
}

const legendOrder: SceneState[] = ['critical', 'alert', 'facts', 'clean', 'unanalyzed']

// The book's timeline: overview bar, unanchored scenes and scene actions.
export function Timeline({
  projectId,
  slots,
  error,
  selectedSlotId,
  onSelect,
  onCreate,
  onOpenFinder,
  hasMoveHistory,
  undoableMoveCount,
  onOpenHistory,
  groups,
  onOpenStructure,
  onAssignGroup,
  onCreateGroupAndAssign,
  analysis,
}: TimelineProps) {
  // Shift+click picks a range of scenes (anchor → end) to group them.
  const [range, setRange] = useState<{ anchor: number; end: number } | null>(null)
  const [newGroupName, setNewGroupName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!range) return
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRange(null)
        setNewGroupName(null)
      }
    }
    document.addEventListener('keydown', clear)
    return () => document.removeEventListener('keydown', clear)
  }, [range])

  if (!projectId) {
    return null
  }

  const scenes = orderScenes(slots).filter((slot) => !slot.isUnanchored)
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const bands: StripBand[] = groupRuns(scenes)
    .filter((run) => groupById.has(run.groupId))
    .map((run) => {
      const group = groupById.get(run.groupId)!
      return {
        key: group.id,
        start: run.start,
        length: run.length,
        label: group.name,
        colorClass: `group-${group.color}`,
        title: `${group.name} · ${run.length === 1 ? `cena ${run.start + 1}` : `cenas ${run.start + 1}–${run.start + run.length}`}`,
      }
    })
  const selectedIndex = scenes.findIndex((slot) => slot.id === selectedSlotId)
  const [from, to] = range
    ? [Math.min(range.anchor, range.end), Math.max(range.anchor, range.end)]
    : [0, -1]
  const rangeSlots = range ? scenes.slice(from, to + 1) : []
  const rangeIds = new Set(rangeSlots.map((slot) => slot.id))

  function selectRange(index: number) {
    setRange((current) => ({
      // The first Shift+click starts from the open scene, if any.
      anchor: current?.anchor ?? (selectedIndex >= 0 ? selectedIndex : index),
      end: index,
    }))
  }

  async function assign(groupId: string | null) {
    setBusy(true)
    try {
      await onAssignGroup(rangeSlots.map((slot) => slot.id), groupId)
      setRange(null)
    } finally {
      setBusy(false)
    }
  }

  async function createAndAssign() {
    const name = newGroupName?.trim()
    if (!name) return
    setBusy(true)
    try {
      await onCreateGroupAndAssign(name, rangeSlots.map((slot) => slot.id))
      setRange(null)
      setNewGroupName(null)
    } finally {
      setBusy(false)
    }
  }
  const unanchoredSlots = slots.filter((slot) => slot.isUnanchored)
  const statesPresent = new Set(slots.map(sceneState))

  return (
    <section className="timeline-strip" aria-labelledby="timeline-heading" data-tour="timeline">
      <div className="timeline-strip-header">
        <h2 id="timeline-heading">
          Linha do tempo <span>{scenes.length} cenas</span>
        </h2>
        <ul className="status-legend" aria-label="Legenda">
          {legendOrder
            .filter((state) => statesPresent.has(state))
            .map((state) => (
              <li key={state}>
                <span className={`state-swatch state-${state}`} aria-hidden="true" />
                {sceneStateLabels[state]}
              </li>
            ))}
        </ul>
        {analysis && analysis.pending > 0 && !analysis.isBusy && (
          <button
            className="button button-secondary button-small finder-trigger"
            title="Analisar em segundo plano as cenas que ainda não foram analisadas"
            type="button"
            onClick={analysis.onStart}
          >
            Analisar pendentes<span className="history-count">{analysis.pending}</span>
          </button>
        )}
        <button
          className="button button-secondary button-small finder-trigger"
          title="Grupos de cenas: atos, etapas, batidas"
          type="button"
          onClick={() => onOpenStructure(null)}
        >
          Estrutura{groups.length > 0 && <span className="history-count">{groups.length}</span>}
        </button>
        <button
          aria-keyshortcuts="Control+K"
          className="button button-secondary button-small finder-trigger"
          type="button"
          onClick={onOpenFinder}
        >
          <SearchIcon />
          Encontrar cena
          <kbd>Ctrl K</kbd>
        </button>
        {hasMoveHistory && (
          <button
            className="button button-secondary button-small finder-trigger"
            type="button"
            onClick={onOpenHistory}
          >
            <HistoryIcon />
            Movimentos
            {undoableMoveCount > 0 && (
              <span className="history-count">{undoableMoveCount}</span>
            )}
          </button>
        )}
        <button
          aria-keyshortcuts="Alt+N"
          className="button button-secondary button-small finder-trigger"
          data-tour="new-scene"
          type="button"
          onClick={onCreate}
        >
          + Nova cena
          <kbd>Alt N</kbd>
        </button>
      </div>
      {error && <p className="form-message">{error}</p>}
      {scenes.length === 0 ? (
        <p className="timeline-empty">A primeira cena entrará no início da timeline.</p>
      ) : (
        <>
          <SceneStrip
            bands={bands}
            describe={(slot) => {
              const group = slot.groupId ? groupById.get(slot.groupId) : undefined
              return `${sceneStateLabels[sceneState(slot)]}${group ? ` · ${group.name}` : ''}`
            }}
            label="Cenas da linha do tempo. Shift + clique seleciona um intervalo para agrupar."
            rangeIds={rangeIds}
            scenes={scenes}
            selectedId={selectedSlotId || null}
            stateOf={sceneState}
            onBandClick={(groupId) => onOpenStructure(groupId)}
            onRangeSelect={selectRange}
            onSelect={(slot) => {
              setRange(null)
              onSelect(slot)
            }}
          />
          {range && (
            <div className="range-bar" role="region" aria-label="Cenas selecionadas">
              <strong>
                {rangeSlots.length === 1
                  ? `Cena ${from + 1}`
                  : `Cenas ${from + 1}–${to + 1}`}
              </strong>
              {newGroupName === null ? (
                <>
                  <label className="range-assign">
                    <span>Atribuir a</span>
                    <select
                      disabled={busy}
                      value=""
                      onChange={(event) => {
                        if (event.target.value === '__new__') setNewGroupName('')
                        else if (event.target.value) void assign(event.target.value)
                      }}
                    >
                      <option value="" disabled>
                        Escolha um grupo
                      </option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                      <option value="__new__">+ Novo grupo…</option>
                    </select>
                  </label>
                  {rangeSlots.some((slot) => slot.groupId) && (
                    <button className="text-button" disabled={busy} type="button" onClick={() => void assign(null)}>
                      Remover do grupo
                    </button>
                  )}
                </>
              ) : (
                <form
                  className="range-new-group"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void createAndAssign()
                  }}
                >
                  <input
                    aria-label="Nome do novo grupo"
                    autoFocus
                    placeholder="Ex.: Ato I"
                    value={newGroupName}
                    onChange={(event) => setNewGroupName(event.target.value)}
                  />
                  <button className="button button-primary button-small" disabled={busy || !newGroupName.trim()} type="submit">
                    Criar e atribuir
                  </button>
                </form>
              )}
              <button
                className="text-button range-cancel"
                type="button"
                onClick={() => {
                  setRange(null)
                  setNewGroupName(null)
                }}
              >
                Cancelar (Esc)
              </button>
            </div>
          )}
        </>
      )}
      {unanchoredSlots.length > 0 && (
        <div className="unanchored-list">
          <strong>Cenas avulsas</strong>
          {unanchoredSlots.map((slot) => {
            const state = sceneState(slot)
            return (
              <button
                aria-current={slot.id === selectedSlotId ? 'true' : undefined}
                className={slot.id === selectedSlotId ? 'unanchored-selected' : ''}
                key={slot.id}
                title={sceneStateLabels[state]}
                type="button"
                onClick={() => onSelect(slot)}
              >
                <span className={`state-swatch state-${state}`} aria-hidden="true" />
                {sceneTitle(slot)}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
