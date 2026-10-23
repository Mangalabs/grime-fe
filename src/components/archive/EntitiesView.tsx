import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { DeletedEntity, FactEntityType, ProjectEntity, Slot, SplitEntityResult } from '../../api/contracts'
import {
  entityTypeLabel,
  findDuplicateHints,
  type ArchiveEntity,
} from '../../features/archive/entityModel'
import { attributeLabel } from '../../features/archive/attributes'
import { normalizeForSearch } from '../../features/scenes/sceneStatus'
import type { Wiki } from '../../features/wiki/useWiki'
import { EntityReconciliationDialog } from '../EntityReconciliationDialog'
import { PlusIcon, SearchIcon } from '../icons'
import { EntitySheet, type SheetTab } from './EntitySheet'

interface EntitiesViewProps {
  projectId: string
  archive: ArchiveEntity[]
  entities: ProjectEntity[]
  selectedId: string
  slots: Slot[]
  // Null when the wiki can't be used (locked project or older backend).
  wiki: Wiki | null
  // An entity just created by hand: its page opens for editing.
  startEditingId: string | null
  // False when the author keeps unsaved changes.
  confirmLeave: () => boolean
  onSelect: (entityId: string) => void
  onOpenScene: (slotId: string) => void
  onRefresh: () => Promise<void>
  onError: (message: string) => void
  onCreateEntity: (type?: FactEntityType) => void
  onEditTemplate: (templateId: string) => void
  onDirtyChange: (isDirty: boolean) => void
}

// The server's refusals, in the reviewer's language.
function entityErrorMessage(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message : ''
  if (/alias of the entity/i.test(message)) return 'Esse nome já é um apelido desta entidade: use “Tornar nome principal”.'
  if (/merge the two/i.test(message)) return 'Outra entidade já tem esse nome: use “Unir ou separar…” para juntá-las.'
  return message || fallback
}

export function EntitiesView({
  projectId,
  archive,
  entities,
  selectedId,
  slots,
  wiki,
  startEditingId,
  confirmLeave,
  onSelect: selectEntity,
  onOpenScene,
  onRefresh,
  onError,
  onCreateEntity,
  onEditTemplate,
  onDirtyChange,
}: EntitiesViewProps) {
  const [sheetTab, setSheetTab] = useState<SheetTab>(wiki ? 'page' : 'canon')
  // A newly created entity opens on its page.
  const [seenStartId, setSeenStartId] = useState(startEditingId)
  if (startEditingId !== seenStartId) {
    setSeenStartId(startEditingId)
    if (startEditingId) setSheetTab('page')
  }
  const onSelect = (entityId: string) => {
    if (entityId !== selectedId && confirmLeave()) selectEntity(entityId)
  }
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [reconciling, setReconciling] = useState<ProjectEntity | null>(null)
  const [pendingSplit, setPendingSplit] = useState<SplitEntityResult | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  // Deleted entities (null on backends without soft delete).
  const [deleted, setDeleted] = useState<DeletedEntity[] | null>(null)
  const [deletedVersion, setDeletedVersion] = useState(0)
  const [showDeleted, setShowDeleted] = useState(false)
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    let isCurrent = true
    api
      .listDeletedEntities(projectId)
      .then((items) => {
        if (isCurrent) setDeleted(items)
      })
      .catch(() => {
        if (isCurrent) setDeleted(null)
      })
    return () => {
      isCurrent = false
    }
  }, [projectId, deletedVersion])

  async function mutate<T>(action: () => Promise<T>, fallback: string): Promise<T | null> {
    setIsMutating(true)
    try {
      const result = await action()
      await onRefresh()
      // A success clears an earlier refusal still on screen.
      onError('')
      return result
    } catch (reason) {
      onError(entityErrorMessage(reason, fallback))
      return null
    } finally {
      setIsMutating(false)
    }
  }

  async function renameSelected(name: string) {
    const result = await mutate(() => api.renameEntity(selected.id, name), 'Não foi possível renomear a entidade.')
    return result !== null
  }

  async function makePreferred(alias: { id: string; name: string }) {
    const result = await mutate(() => api.setPreferredName(alias.id), 'Não foi possível trocar o nome principal.')
    if (result) onSelect(result.canonicalId)
  }

  async function detachAlias(alias: { id: string; name: string }) {
    if (
      !window.confirm(
        `Desvincular “${alias.name}” de “${selected.name}”? Ele vira uma entidade separada, sem fatos: os fatos continuam em “${selected.name}”.`,
      )
    ) {
      return
    }
    await mutate(() => api.detachAlias(alias.id), 'Não foi possível desvincular o nome.')
  }

  async function deleteSelected() {
    const names = selected.aliases.length ? ` e os nomes ${selected.aliases.map((alias) => `“${alias.name}”`).join(', ')}` : ''
    const facts = selected.facts.length
    if (
      !window.confirm(
        `Excluir “${selected.name}”${names}? ${facts === 1 ? 'O fato sai' : `Os ${facts} fatos saem`} do Arquivo e do contexto do Revisor. Dá para restaurar depois em “Excluídas”.`,
      )
    ) {
      return
    }
    const target = { id: selected.id, name: selected.name }
    const result = await mutate(() => api.deleteEntity(target.id), 'Não foi possível excluir a entidade.')
    if (result) {
      setUndo(target)
      setDeletedVersion((version) => version + 1)
    }
  }

  async function restore(entityId: string) {
    const result = await mutate(() => api.restoreEntity(entityId), 'Não foi possível restaurar a entidade.')
    if (result) {
      setUndo(null)
      setDeletedVersion((version) => version + 1)
      onSelect(result.canonicalId)
    }
  }

  const hints = useMemo(() => findDuplicateHints(archive), [archive])
  const types = useMemo(
    () => [...new Set(archive.map((entity) => entity.type))],
    [archive],
  )
  const visible = useMemo(() => {
    const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
    return archive.filter((entity) => {
      if (typeFilter !== 'ALL' && entity.type !== typeFilter) return false
      const haystack = normalizeForSearch(
        [entity.name, ...entity.aliases.map((alias) => alias.name)].join(' '),
      )
      return words.every((word) => haystack.includes(word))
    })
  }, [archive, query, typeFilter])

  const selected = archive.find((entity) => entity.id === selectedId) ?? archive[0]
  // Names shared by entities of different types get their type shown in the list.
  const sharedNames = useMemo(() => {
    const counts = new Map<string, number>()
    archive.forEach((entity) => {
      const key = normalizeForSearch(entity.name)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name))
  }, [archive])

  async function mergeInto(target: ArchiveEntity, source: ArchiveEntity) {
    if (
      !window.confirm(
        `Unir “${source.name}” em “${target.name}”? Os fatos de ${source.name} passam a valer para ${target.name}, e “${source.name}” vira um apelido.`,
      )
    ) {
      return
    }
    setIsMutating(true)
    try {
      await api.mergeEntities(target.id, source.id)
      await onRefresh()
      onSelect(target.id)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível unir as entidades.')
    } finally {
      setIsMutating(false)
    }
  }

  async function reassignFact(factId: string, targetEntityId: string) {
    setIsMutating(true)
    try {
      await api.reassignFact(factId, targetEntityId)
      setPendingSplit((current) =>
        current
          ? { ...current, facts: current.facts.filter((fact) => fact.id !== factId) }
          : null,
      )
      await onRefresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível reatribuir o fato.')
    } finally {
      setIsMutating(false)
    }
  }

  const rawSelected = entities.find((entity) => entity.id === selected.id)

  return (
    <div className="archive-entities">
      <aside className="entity-index" aria-label="Lista de entidades">
        <button
          className="button button-secondary button-small entity-new"
          type="button"
          onClick={() => onCreateEntity(typeFilter === 'ALL' ? undefined : (typeFilter as FactEntityType))}
        >
          <PlusIcon /> Nova entidade
        </button>
        <label className="archive-search">
          <SearchIcon />
          <span className="sr-only">Buscar entidade</span>
          <input
            placeholder="Buscar entidade…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="archive-chips" role="radiogroup" aria-label="Filtrar por tipo">
          {['ALL', ...types].map((type) => (
            <button
              aria-checked={typeFilter === type}
              className={`archive-chip${typeFilter === type ? ' is-active' : ''}`}
              key={type}
              role="radio"
              type="button"
              onClick={() => setTypeFilter(type)}
            >
              {type === 'ALL' ? 'Todas' : entityTypeLabel(type)}
              <span>
                {type === 'ALL'
                  ? archive.length
                  : archive.filter((entity) => entity.type === type).length}
              </span>
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="archive-empty">Nenhuma entidade encontrada.</p>
        ) : (
          <ul className="entity-list">
            {visible.map((entity) => {
              const likely = hints.get(entity.id)?.some((hint) => hint.kind === 'likely')
              return (
                <li key={entity.id}>
                  <button
                    aria-current={entity.id === selected.id ? 'true' : undefined}
                    className={`entity-list-item${entity.id === selected.id ? ' is-selected' : ''}`}
                    type="button"
                    onClick={() => onSelect(entity.id)}
                  >
                    <span className={`entity-type-dot type-${entity.type.toLowerCase()}`} aria-hidden="true" />
                    <span className="entity-list-name">
                      {entity.name}
                      {sharedNames.has(normalizeForSearch(entity.name)) && (
                        <small> · {entityTypeLabel(entity.type)}</small>
                      )}
                    </span>
                    {wiki?.pageIds.has(entity.id) && (
                      <span className="entity-list-page" title="Tem ficha">
                        ficha
                      </span>
                    )}
                    {likely && (
                      <span className="entity-list-flag" title="Possível duplicata">
                        duplicata?
                      </span>
                    )}
                    <span className="entity-list-count">{entity.facts.length}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {deleted && deleted.length > 0 && (
          <button
            aria-expanded={showDeleted}
            className="text-button entity-trash-toggle"
            type="button"
            onClick={() => setShowDeleted(!showDeleted)}
          >
            {showDeleted ? 'Ocultar excluídas' : `Excluídas (${deleted.length})`}
          </button>
        )}
      </aside>

      <div className="entity-detail">
        {undo && (
          <div className="entity-undo" role="status">
            <span>
              “{undo.name}” foi excluída.
            </span>
            <button className="text-button" disabled={isMutating} type="button" onClick={() => void restore(undo.id)}>
              Desfazer
            </button>
            <button aria-label="Fechar aviso" className="text-button" type="button" onClick={() => setUndo(null)}>
              ×
            </button>
          </div>
        )}
        {showDeleted && deleted && deleted.length > 0 && (
          <section className="panel entity-trash" aria-labelledby="entity-trash-title">
            <h2 id="entity-trash-title">Excluídas</h2>
            <p className="panel-description">
              Fora do Arquivo e do contexto do Revisor. Restaurar traz de volta a entidade, os apelidos e os fatos.
            </p>
            <ul>
              {deleted.map((entity) => (
                <li key={entity.id}>
                  <span className={`entity-type-dot type-${entity.type.toLowerCase()}`} aria-hidden="true" />
                  <span className="entity-trash-name">
                    <strong>{entity.name}</strong>
                    <small>
                      {entityTypeLabel(entity.type)} · {entity.facts} {entity.facts === 1 ? 'fato' : 'fatos'}
                      {entity.aliases.length > 0 && ` · também: ${entity.aliases.join(', ')}`}
                    </small>
                  </span>
                  <button
                    className="button button-secondary button-small"
                    disabled={isMutating}
                    type="button"
                    onClick={() => void restore(entity.id)}
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {pendingSplit && (
          <section className="panel reassignment-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Separação em andamento</p>
                <h2>Distribua os fatos</h2>
              </div>
              <button className="button button-secondary" type="button" onClick={() => setPendingSplit(null)}>
                Fechar
              </button>
            </div>
            {pendingSplit.facts.length === 0 ? (
              <p className="panel-description">Todos os fatos desta separação já foram reatribuídos.</p>
            ) : (
              <div className="reassignment-list">
                {pendingSplit.facts.map((fact) => (
                  <label className="reassignment-row" key={fact.id}>
                    <span>
                      <b>{attributeLabel(fact.attribute)}</b> · {fact.value}
                    </span>
                    <select
                      defaultValue=""
                      disabled={isMutating}
                      onChange={(event) => {
                        if (event.target.value) void reassignFact(fact.id, event.target.value)
                      }}
                    >
                      <option value="" disabled>
                        Escolha a entidade
                      </option>
                      {archive.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.name} · {entityTypeLabel(entity.type)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </section>
        )}
        <EntitySheet
          archive={archive}
          entity={selected}
          hints={hints.get(selected.id) ?? []}
          isMutating={isMutating}
          key={selected.id}
          slots={slots}
          startEditing={startEditingId === selected.id}
          tab={wiki ? sheetTab : 'canon'}
          wiki={wiki}
          onDirtyChange={onDirtyChange}
          onEditTemplate={onEditTemplate}
          onTabChange={setSheetTab}
          onMerge={mergeInto}
          onOpenScene={onOpenScene}
          onDelete={() => void deleteSelected()}
          onDetachAlias={(alias) => void detachAlias(alias)}
          onMakePreferred={(alias) => void makePreferred(alias)}
          onReconcile={() => setReconciling(rawSelected ?? null)}
          onRename={renameSelected}
          onSelectEntity={onSelect}
        />
      </div>

      {reconciling && (
        <EntityReconciliationDialog
          entity={reconciling}
          mergeCandidates={entities.filter(
            (candidate) =>
              candidate.id !== reconciling.id &&
              candidate.canonicalId !== reconciling.id &&
              candidate.type === reconciling.type,
          )}
          onClose={() => setReconciling(null)}
          onMerge={async (sourceAliasId) => {
            await api.mergeEntities(reconciling.id, sourceAliasId)
            setReconciling(null)
            await onRefresh()
          }}
          onSplit={async (names) => {
            setPendingSplit(await api.splitEntity(reconciling.id, names))
            setReconciling(null)
            await onRefresh()
          }}
        />
      )}
    </div>
  )
}
