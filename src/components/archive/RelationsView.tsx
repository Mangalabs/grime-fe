import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { CreateRelation, SceneGroup, Slot } from '../../api/contracts'
import { entityTypeLabel, type ArchiveEntity } from '../../features/archive/entityModel'
import { attributeLabel } from '../../features/archive/attributes'
import {
  allRelations,
  filterRelations,
  pairKey,
  pairLabel,
  pairRelations,
  relationsInTime,
  suggestTargets,
  type Relation,
  type RelationFilter,
  type TargetSuggestion,
} from '../../features/archive/relations'
import { groupRuns } from '../../features/scenes/groups'
import { orderScenes, sceneTitle } from '../../features/scenes/sceneStatus'
import { CloseIcon } from '../icons'
import { SceneStrip } from '../SceneStrip'
import { RelationDialog } from './RelationDialog'
import { RelationMap } from './RelationMap'

interface RelationsViewProps {
  projectId: string
  archive: ArchiveEntity[]
  slots: Slot[]
  groups: SceneGroup[]
  onOpenEntity: (entityId: string) => void
  onOpenScene: (slotId: string) => void
  onRefresh: () => Promise<void>
  onError: (message: string) => void
}

const ignoredKey = (projectId: string) => `petricor-ignored-links-${projectId}`
const filterKey = (projectId: string) => `petricor-relation-filter-${projectId}`

// Ignored suggestions and filters are per-browser conveniences; storage may be unavailable.
function readIgnored(projectId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ignoredKey(projectId)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeIgnored(projectId: string, ids: Set<string>) {
  try {
    localStorage.setItem(ignoredKey(projectId), JSON.stringify([...ids]))
  } catch {
    // The suggestion simply comes back next time.
  }
}

function readFilter(projectId: string): RelationFilter {
  try {
    const saved = JSON.parse(localStorage.getItem(filterKey(projectId)) ?? 'null') as Partial<RelationFilter> | null
    return saved ? { ...allRelations, ...saved } : allRelations
  } catch {
    return allRelations
  }
}

function writeFilter(projectId: string, filter: RelationFilter) {
  try {
    localStorage.setItem(filterKey(projectId), JSON.stringify(filter))
  } catch {
    // The filter resets next time.
  }
}

const typeOrder = ['CHARACTER', 'LOCATION', 'FACTION', 'ITEM', 'EVENT', 'WORLD_RULE']

interface DialogState {
  sourceId: string | null
  targetId: string | null
}

export function RelationsView({
  projectId,
  archive,
  slots,
  groups,
  onOpenEntity,
  onOpenScene,
  onRefresh,
  onError,
}: RelationsViewProps) {
  const scenes = useMemo(() => orderScenes(slots).filter((slot) => !slot.isUnanchored), [slots])
  const lastScene = Math.max(0, scenes.length - 1)
  const [filter, setFilterState] = useState<RelationFilter>(() => readFilter(projectId))
  const [showIsolated, setShowIsolated] = useState(false)
  const [ignored, setIgnored] = useState(() => readIgnored(projectId))
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)
  const [busyFactId, setBusyFactId] = useState<string | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null)
  const [connectFromId, setConnectFromId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)

  function setFilter(patch: Partial<RelationFilter>) {
    const next = { ...filter, ...patch }
    setFilterState(next)
    writeFilter(projectId, next)
  }

  // Scenes can be removed or reordered while this view is open.
  const time =
    filter.time.kind === 'UNTIL'
      ? { kind: 'UNTIL' as const, scene: Math.min(filter.time.scene, lastScene) }
      : filter.time.kind === 'RANGE'
        ? { kind: 'RANGE' as const, from: Math.min(filter.time.from, lastScene), to: Math.min(filter.time.to, lastScene) }
        : filter.time
  const byId = useMemo(() => new Map(archive.map((entity) => [entity.id, entity])), [archive])
  // The time filter as a stable key, so a new object with the same values doesn't recompute.
  const timeKey = JSON.stringify(time)
  const inTime = useMemo(() => relationsInTime(archive, JSON.parse(timeKey)), [archive, timeKey])
  const focusId = filter.focusId && byId.has(filter.focusId) ? filter.focusId : null
  const { entityTypes, attributes } = filter
  const relations = useMemo(
    () => filterRelations(archive, inTime, { time: { kind: 'ALL' }, entityTypes, attributes, focusId }),
    [archive, inTime, entityTypes, attributes, focusId],
  )
  const pairs = useMemo(() => pairRelations(relations), [relations])

  // What the chips offer: what exists in this stretch of time.
  const typesPresent = typeOrder.filter((type) =>
    inTime.some((relation) => byId.get(relation.sourceId)?.type === type || byId.get(relation.targetId)?.type === type),
  )
  const attributesPresent = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>()
    for (const relation of inTime) {
      const entry = counts.get(relation.fact.attributeKey) ?? { label: relation.label, count: 0 }
      entry.count += 1
      counts.set(relation.fact.attributeKey, entry)
    }
    return [...counts].sort((a, b) => b[1].count - a[1].count)
  }, [inTime])

  const involved = useMemo(() => {
    const ids = new Set(relations.flatMap((relation) => [relation.sourceId, relation.targetId]))
    const types = filter.entityTypes ? new Set(filter.entityTypes) : null
    return archive.filter(
      (entity) =>
        ids.has(entity.id) ||
        entity.id === selectedEntityId ||
        entity.id === connectFromId ||
        entity.id === focusId ||
        (showIsolated && !focusId && (!types || types.has(entity.type))),
    )
  }, [archive, relations, showIsolated, selectedEntityId, connectFromId, focusId, filter.entityTypes])
  const suggestions = useMemo(
    () => suggestTargets(archive).filter((suggestion) => !ignored.has(suggestion.fact.id)),
    [archive, ignored],
  )
  const selectedEntity = selectedEntityId ? byId.get(selectedEntityId) : undefined
  const selectedPair = pairs.find((pair) => pair.key === selectedPairKey)
  const isFiltered =
    filter.time.kind !== 'ALL' || filter.entityTypes !== null || filter.attributes !== null || focusId !== null

  useEffect(() => {
    if (!connectFromId) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConnectFromId(null)
    }
    document.addEventListener('keydown', cancel)
    return () => document.removeEventListener('keydown', cancel)
  }, [connectFromId])

  function selectEntity(entityId: string | null) {
    setSelectedEntityId(entityId)
    setSelectedPairKey(null)
  }

  function selectPair(key: string | null) {
    setSelectedPairKey(key)
    setSelectedEntityId(null)
  }

  function toggle(list: string[] | null, value: string, all: string[]): string[] | null {
    const current = new Set(list ?? all)
    if (current.has(value)) current.delete(value)
    else current.add(value)
    // Everything selected is the same as no filter.
    return current.size === all.length ? null : [...current]
  }

  // A new relation starts at the scene being viewed, or the source's last scene.
  function defaultSlotId(sourceId: string | null): string | null {
    if (time.kind === 'UNTIL') return scenes[time.scene]?.id ?? null
    if (time.kind === 'RANGE') return scenes[Math.max(time.from, time.to)]?.id ?? null
    const source = sourceId ? byId.get(sourceId) : undefined
    const lastFact = source?.facts.filter((fact) => fact.position !== null).at(-1)
    return lastFact?.slot.id ?? scenes.at(-1)?.id ?? null
  }

  async function link(suggestion: TargetSuggestion, target: ArchiveEntity) {
    setBusyFactId(suggestion.fact.id)
    try {
      await api.setFactTarget(suggestion.fact.id, target.id)
      await onRefresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível ligar o fato.')
    } finally {
      setBusyFactId(null)
    }
  }

  function ignore(suggestion: TargetSuggestion) {
    const next = new Set(ignored).add(suggestion.fact.id)
    setIgnored(next)
    writeIgnored(projectId, next)
  }

  async function createRelation(relation: CreateRelation) {
    await api.createRelation(projectId, relation)
    setDialog(null)
    await onRefresh()
    selectPair(pairKey(relation.sourceEntityId, relation.targetEntityId))
  }

  async function removeRelation(relation: Relation) {
    const source = byId.get(relation.sourceId)?.name
    const target = byId.get(relation.targetId)?.name
    const confirmed = relation.fact.isManual
      ? window.confirm(`Excluir a relação “${source} → ${target}”?`)
      : window.confirm(
          `“${source} → ${target}” veio da análise da cena. Remover só a ligação? O fato (“${relation.fact.value}”) continua no cânone; uma nova análise da cena pode propor a ligação de novo.`,
        )
    if (!confirmed) return
    setBusyFactId(relation.fact.id)
    try {
      if (relation.fact.isManual) {
        await api.deleteFact(relation.fact.id)
      } else {
        await api.setFactTarget(relation.fact.id, null)
      }
      await onRefresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível remover a relação.')
    } finally {
      setBusyFactId(null)
    }
  }

  function sceneLink(relation: Relation) {
    return (
      <button className="inline-link entity-scene-link" type="button" onClick={() => onOpenScene(relation.fact.slot.id)}>
        {relation.fact.position === null ? 'Cena avulsa' : `Cena ${relation.fact.position + 1}`}
      </button>
    )
  }

  function removeButton(relation: Relation) {
    return (
      <button
        aria-label={`Remover relação ${byId.get(relation.sourceId)?.name} → ${byId.get(relation.targetId)?.name}`}
        className="relation-remove"
        disabled={busyFactId !== null}
        title={relation.fact.isManual ? 'Excluir relação' : 'Remover ligação'}
        type="button"
        onClick={() => void removeRelation(relation)}
      >
        <CloseIcon />
      </button>
    )
  }

  const pairPanel = selectedPair ? (
    <aside className="relation-selection" aria-label="Relações entre duas entidades">
      <header>
        <p className="eyebrow">
          {selectedPair.relations.length === 1 ? '1 relação' : `${selectedPair.relations.length} relações`}
        </p>
        <h3>
          <button className="inline-link" type="button" onClick={() => selectEntity(selectedPair.aId)}>
            {byId.get(selectedPair.aId)?.name}
          </button>{' '}
          <span aria-hidden="true">{selectedPair.forward && selectedPair.backward ? '↔' : selectedPair.forward ? '→' : '←'}</span>{' '}
          <button className="inline-link" type="button" onClick={() => selectEntity(selectedPair.bId)}>
            {byId.get(selectedPair.bId)?.name}
          </button>
        </h3>
        <button aria-label="Fechar seleção" className="relation-remove" type="button" onClick={() => selectPair(null)}>
          <CloseIcon />
        </button>
      </header>
      <ul className="relation-pair-list">
        {selectedPair.relations
          .slice()
          .sort((a, b) => (a.fact.position ?? Infinity) - (b.fact.position ?? Infinity))
          .map((relation) => (
            <li key={relation.id}>
              <div className="relation-pair-main">
                <span className="relation-pair-direction">
                  {byId.get(relation.sourceId)?.name} <span aria-hidden="true">→</span> {byId.get(relation.targetId)?.name}
                </span>
                <strong>{relation.label}</strong>
                <span className="relation-pair-value">“{relation.fact.value}”</span>
                <span className="relation-pair-meta">
                  {sceneLink(relation)}
                  {relation.fact.isManual ? ' · criada por você' : ''}
                  {relation.fact.isSubjective && ` · segundo ${relation.fact.sourceClaim ?? 'alguém'}`}
                </span>
              </div>
              {removeButton(relation)}
            </li>
          ))}
      </ul>
      <div className="relation-selection-actions">
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => setDialog({ sourceId: selectedPair.aId, targetId: selectedPair.bId })}
        >
          + Relação entre os dois
        </button>
      </div>
    </aside>
  ) : null

  const entityPanel = selectedEntity ? (
    <aside className="relation-selection" aria-label={`Selecionado: ${selectedEntity.name}`}>
      <header>
        <p className="eyebrow">
          <span className={`entity-type-dot type-${selectedEntity.type.toLowerCase()}`} aria-hidden="true" />
          {entityTypeLabel(selectedEntity.type)}
        </p>
        <h3>{selectedEntity.name}</h3>
        <button aria-label="Fechar seleção" className="relation-remove" type="button" onClick={() => selectEntity(null)}>
          <CloseIcon />
        </button>
      </header>
      <div className="relation-selection-actions">
        <button className="button button-primary button-small" type="button" onClick={() => setConnectFromId(selectedEntity.id)}>
          + Relação a partir daqui
        </button>
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => setFilter({ focusId: focusId === selectedEntity.id ? null : selectedEntity.id })}
        >
          {focusId === selectedEntity.id ? 'Mostrar todas' : 'Só as ligações dela'}
        </button>
        <button className="button button-secondary button-small" type="button" onClick={() => onOpenEntity(selectedEntity.id)}>
          Abrir ficha
        </button>
      </div>
      {(() => {
        const own = pairs.filter((pair) => pair.aId === selectedEntity.id || pair.bId === selectedEntity.id)
        return own.length === 0 ? (
          <p className="archive-empty">Sem relações com estes filtros.</p>
        ) : (
          <ul className="relation-selection-list">
            {own.map((pair) => {
              const other = byId.get(pair.aId === selectedEntity.id ? pair.bId : pair.aId)
              return (
                <li key={pair.key}>
                  <button className="relation-row-main" type="button" onClick={() => selectPair(pair.key)}>
                    <span className={`entity-type-dot type-${other?.type.toLowerCase()}`} aria-hidden="true" />
                    <span className="relation-row-name">{other?.name}</span>
                    <span className="relation-direction">{pairLabel(pair)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      })()}
    </aside>
  ) : null
  const selectionPanel = pairPanel ?? entityPanel

  const groupStretches = groupRuns(scenes)
    .map((run) => ({ run, group: groups.find((group) => group.id === run.groupId) }))
    .filter((item) => item.group)

  return (
    <div className="archive-relations">
      {suggestions.length > 0 && (
        <section className="link-suggestions" aria-labelledby="link-suggestions-title">
          <div className="link-suggestions-heading">
            <p id="link-suggestions-title">
              <strong>
                {suggestions.length === 1
                  ? '1 fato parece citar outra entidade.'
                  : `${suggestions.length} fatos parecem citar outra entidade.`}
              </strong>{' '}
              Confirme para que entrem no mapa.
            </p>
            <button
              aria-expanded={isSuggestionsOpen}
              className="button button-secondary button-small"
              type="button"
              onClick={() => setIsSuggestionsOpen((open) => !open)}
            >
              {isSuggestionsOpen ? 'Fechar' : 'Revisar sugestões'}
            </button>
          </div>
          {isSuggestionsOpen && (
            <ul className="link-suggestion-list">
              {suggestions.map((suggestion) => (
                <li key={suggestion.fact.id}>
                  <div className="link-suggestion-fact">
                    <button className="facts-entity" type="button" onClick={() => onOpenEntity(suggestion.owner.id)}>
                      <span className={`entity-type-dot type-${suggestion.owner.type.toLowerCase()}`} aria-hidden="true" />
                      {suggestion.owner.name}
                    </button>
                    <span className="facts-attribute">{attributeLabel(suggestion.fact.attribute)}</span>
                    <span className="facts-value">{suggestion.fact.value}</span>
                  </div>
                  <div className="link-suggestion-actions">
                    {suggestion.candidates.map((candidate) => (
                      <button
                        className="button button-secondary button-small"
                        disabled={busyFactId !== null}
                        key={candidate.id}
                        type="button"
                        onClick={() => void link(suggestion, candidate)}
                      >
                        Ligar a {candidate.name}
                        {suggestion.candidates.length > 1 && ` (${entityTypeLabel(candidate.type).toLocaleLowerCase('pt-BR')})`}
                      </button>
                    ))}
                    <button className="text-button" type="button" onClick={() => ignore(suggestion)}>
                      Ignorar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="relation-filters" aria-label="Filtros do mapa">
        <div className="relation-filter-row">
          <span className="relation-filter-label">Tempo</span>
          <div className="relation-segments" role="radiogroup" aria-label="Período">
            {(
              [
                ['ALL', 'Toda a obra'],
                ['UNTIL', 'Até a cena…'],
                ['RANGE', 'Só um trecho…'],
              ] as const
            ).map(([kind, label]) => (
              <button
                aria-checked={filter.time.kind === kind}
                disabled={kind !== 'ALL' && scenes.length === 0}
                key={kind}
                role="radio"
                type="button"
                onClick={() =>
                  setFilter({
                    time:
                      kind === 'ALL'
                        ? { kind }
                        : kind === 'UNTIL'
                          ? { kind, scene: lastScene }
                          : { kind, from: 0, to: Math.min(lastScene, 9) },
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          {time.kind === 'RANGE' && (
            <div className="relation-range">
              <label>
                <span>da cena</span>
                <input
                  max={scenes.length}
                  min={1}
                  type="number"
                  value={time.from + 1}
                  onChange={(event) =>
                    setFilter({ time: { ...time, from: Math.max(0, Math.min(lastScene, Number(event.target.value) - 1)) } })
                  }
                />
              </label>
              <label>
                <span>à</span>
                <input
                  max={scenes.length}
                  min={1}
                  type="number"
                  value={time.to + 1}
                  onChange={(event) =>
                    setFilter({ time: { ...time, to: Math.max(0, Math.min(lastScene, Number(event.target.value) - 1)) } })
                  }
                />
              </label>
              {groupStretches.length > 0 && (
                <select
                  aria-label="Usar um grupo de cenas"
                  value=""
                  onChange={(event) => {
                    const item = groupStretches[Number(event.target.value)]
                    if (item) setFilter({ time: { kind: 'RANGE', from: item.run.start, to: item.run.start + item.run.length - 1 } })
                  }}
                >
                  <option value="">ou um grupo…</option>
                  {groupStretches.map((item, index) => (
                    <option key={`${item.run.groupId}-${item.run.start}`} value={index}>
                      {item.group!.name} (cenas {item.run.start + 1}–{item.run.start + item.run.length})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {time.kind === 'UNTIL' && scenes.length > 0 && (
          <div className="relations-timeline">
            <SceneStrip
              describe={() => 'Ver as relações até esta cena'}
              label="Escolha a cena para ver as relações até ela"
              scenes={scenes}
              selectedId={scenes[time.scene]?.id ?? null}
              stateOf={(slot) => (scenes.indexOf(slot) <= time.scene ? 'clean' : 'unanalyzed')}
              onSelect={(slot) => setFilter({ time: { kind: 'UNTIL', scene: scenes.indexOf(slot) } })}
            />
            <p className="relations-cursor">
              Relações em vigor na <strong>cena {time.scene + 1}</strong>
              {scenes[time.scene] && <span> · {sceneTitle(scenes[time.scene])}</span>}
            </p>
          </div>
        )}

        {typesPresent.length > 1 && (
          <div className="relation-filter-row">
            <span className="relation-filter-label">Entidades</span>
            <div className="relation-chips">
              {typesPresent.map((type) => {
                const isOn = !filter.entityTypes || filter.entityTypes.includes(type)
                return (
                  <button
                    aria-pressed={isOn}
                    className="relation-chip"
                    key={type}
                    type="button"
                    onClick={() => setFilter({ entityTypes: toggle(filter.entityTypes, type, typesPresent) })}
                  >
                    <span className={`entity-type-dot type-${type.toLowerCase()}`} aria-hidden="true" />
                    {entityTypeLabel(type)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {attributesPresent.length > 1 && (
          <div className="relation-filter-row">
            <span className="relation-filter-label">Relações</span>
            <div className="relation-chips">
              {attributesPresent.map(([key, { label, count }]) => {
                const isOn = !filter.attributes || filter.attributes.includes(key)
                return (
                  <button
                    aria-pressed={isOn}
                    className="relation-chip"
                    key={key}
                    type="button"
                    onClick={() =>
                      setFilter({ attributes: toggle(filter.attributes, key, attributesPresent.map(([item]) => item)) })
                    }
                  >
                    {label} <span>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="relation-filter-row">
          <span className="relation-filter-label">Foco</span>
          <select
            aria-label="Mostrar só as ligações de uma entidade"
            value={focusId ?? ''}
            onChange={(event) => setFilter({ focusId: event.target.value || null })}
          >
            <option value="">Todas as entidades</option>
            {archive
              .filter((entity) => inTime.some((relation) => relation.sourceId === entity.id || relation.targetId === entity.id))
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
          </select>
          <label className="checkbox-label">
            <input checked={showIsolated} type="checkbox" onChange={(event) => setShowIsolated(event.target.checked)} />
            <span>Entidades sem relações</span>
          </label>
          {isFiltered && (
            <button
              className="text-button"
              type="button"
              onClick={() => setFilter({ ...allRelations })}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      <div className="relations-controls">
        <button
          className="button button-primary button-small"
          type="button"
          onClick={() => setDialog({ sourceId: selectedEntityId, targetId: null })}
        >
          + Nova relação
        </button>
        <p className="relations-count">
          {pairs.length === 1 ? '1 ligação' : `${pairs.length} ligações`} ·{' '}
          {relations.length === 1 ? '1 relação' : `${relations.length} relações`}
          {isFiltered && inTime.length !== relations.length && <span> (de {inTime.length})</span>}
        </p>
      </div>

      {connectFromId && (
        <p className="connect-banner" role="status">
          Clique na entidade de destino para ligar a partir de <strong>{byId.get(connectFromId)?.name}</strong>.
          <button className="text-button" type="button" onClick={() => setConnectFromId(null)}>
            Cancelar (Esc)
          </button>
        </p>
      )}

      <div className={`relation-workspace${selectionPanel ? ' has-selection' : ''}`}>
        <section className="relation-map-panel" aria-label="Mapa de relações">
          {involved.length === 0 ? (
            <div className="relation-map-empty">
              <strong>{isFiltered ? 'Nenhuma relação com estes filtros.' : 'Nenhuma relação registrada ainda.'}</strong>
              <p>
                {isFiltered
                  ? 'Mude o período, os tipos ou o foco, ou limpe os filtros.'
                  : 'Crie uma relação, confirme as sugestões acima ou aprove novas análises — relações surgem de fatos que apontam para outra entidade.'}
              </p>
            </div>
          ) : (
            <RelationMap
              connectFromId={connectFromId}
              entities={involved}
              pairs={pairs}
              selectedEntityId={selectedEntityId}
              selectedPairKey={selectedPairKey}
              onConnect={(targetId) => {
                setDialog({ sourceId: connectFromId, targetId })
                setConnectFromId(null)
              }}
              onOpenEntity={onOpenEntity}
              onSelectEntity={selectEntity}
              onSelectPair={selectPair}
            />
          )}
        </section>
        {selectionPanel}
      </div>

      {pairs.length > 0 && (
        <section aria-labelledby="relation-list-title">
          <h3 className="entity-section-title" id="relation-list-title">
            {pairs.length === 1 ? '1 ligação' : `${pairs.length} ligações`}
          </h3>
          <ul className="relation-list">
            {pairs
              .slice()
              .sort((a, b) => b.relations.length - a.relations.length || (byId.get(a.aId)?.name ?? '').localeCompare(byId.get(b.aId)?.name ?? '', 'pt-BR'))
              .map((pair) => (
                <li className={pair.key === selectedPairKey ? 'is-selected' : ''} key={pair.key}>
                  <button className="facts-entity" type="button" onClick={() => selectEntity(pair.aId)}>
                    {byId.get(pair.aId)?.name}
                  </button>
                  <span className="relation-arrow" aria-hidden="true">
                    {pair.forward && pair.backward ? '↔' : pair.forward ? '→' : '←'}
                  </span>
                  <button className="facts-entity" type="button" onClick={() => selectEntity(pair.bId)}>
                    {byId.get(pair.bId)?.name}
                  </button>
                  <span className="relation-detail">{pairLabel(pair)}</span>
                  <button className="inline-link" type="button" onClick={() => selectPair(pair.key)}>
                    {pair.relations.length === 1 ? 'Ver relação' : `Ver ${pair.relations.length} relações`}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {dialog && (
        <RelationDialog
          archive={archive}
          initialSlotId={defaultSlotId(dialog.sourceId)}
          initialSourceId={dialog.sourceId}
          initialTargetId={dialog.targetId}
          slots={slots}
          onClose={() => setDialog(null)}
          onCreate={createRelation}
        />
      )}
    </div>
  )
}
