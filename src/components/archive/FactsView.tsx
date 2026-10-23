import { useMemo, useState } from 'react'
import type { Slot } from '../../api/contracts'
import {
  entityTypeLabel,
  type ArchiveEntity,
  type ArchiveFact,
} from '../../features/archive/entityModel'
import { attributeLabel, compareAttributes } from '../../features/archive/attributes'
import { normalizeForSearch } from '../../features/scenes/sceneStatus'
import { SearchIcon } from '../icons'

interface FactsViewProps {
  archive: ArchiveEntity[]
  slots: Slot[]
  onOpenEntity: (entityId: string) => void
  onOpenScene: (slotId: string) => void
}

type GroupBy = 'scene' | 'entity'

interface Row {
  fact: ArchiveFact
  entity: ArchiveEntity
}

interface Group {
  id: string
  rows: Row[]
}

export function FactsView({ archive, slots, onOpenEntity, onOpenScene }: FactsViewProps) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [attributeFilter, setAttributeFilter] = useState('ALL')
  const [subjectiveOnly, setSubjectiveOnly] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('scene')

  const rows = useMemo<Row[]>(
    () => archive.flatMap((entity) => entity.facts.map((fact) => ({ fact, entity }))),
    [archive],
  )
  const types = useMemo(() => [...new Set(archive.map((entity) => entity.type))], [archive])
  const attributes = useMemo(
    () => [...new Set(rows.map((row) => row.fact.attributeKey))].sort(compareAttributes),
    [rows],
  )

  const visible = useMemo(() => {
    const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
    return rows.filter(({ fact, entity }) => {
      if (typeFilter !== 'ALL' && entity.type !== typeFilter) return false
      if (attributeFilter !== 'ALL' && fact.attributeKey !== attributeFilter) return false
      if (subjectiveOnly && !fact.isSubjective) return false
      const haystack = normalizeForSearch(
        [
          entity.name,
          ...entity.aliases.map((alias) => alias.name),
          attributeLabel(fact.attribute),
          fact.value,
          fact.sourceClaim ?? '',
        ].join(' '),
      )
      return words.every((word) => haystack.includes(word))
    })
  }, [rows, query, typeFilter, attributeFilter, subjectiveOnly])

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Row[]>()
    visible.forEach((row) => {
      const key = groupBy === 'scene' ? row.fact.slot.id : row.entity.id
      map.set(key, [...(map.get(key) ?? []), row])
    })
    const list = [...map.entries()].map(([id, groupRows]) => ({ id, rows: groupRows }))
    if (groupBy === 'scene') {
      const position = (group: Group) => group.rows[0].fact.position ?? Number.POSITIVE_INFINITY
      return list.sort((a, b) => position(a) - position(b))
    }
    return list.sort((a, b) => a.rows[0].entity.name.localeCompare(b.rows[0].entity.name, 'pt-BR'))
  }, [visible, groupBy])

  const anchoredCount = slots.filter((slot) => !slot.isUnanchored).length
  const byId = new Map(archive.map((entity) => [entity.id, entity]))

  return (
    <div className="archive-facts">
      <div className="facts-toolbar">
        <label className="archive-search">
          <SearchIcon />
          <span className="sr-only">Buscar nos fatos</span>
          <input
            placeholder="Buscar entidade, atributo ou valor…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Tipo de entidade</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="ALL">Todos os tipos</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {entityTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Atributo</span>
          <select value={attributeFilter} onChange={(event) => setAttributeFilter(event.target.value)}>
            <option value="ALL">Todos os atributos</option>
            {attributes.map((key) => (
              <option key={key} value={key}>
                {attributeLabel(key)}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            checked={subjectiveOnly}
            type="checkbox"
            onChange={(event) => setSubjectiveOnly(event.target.checked)}
          />
          <span>Só subjetivos</span>
        </label>
        <div className="segmented" role="radiogroup" aria-label="Agrupar por">
          {(['scene', 'entity'] as GroupBy[]).map((option) => (
            <button
              aria-checked={groupBy === option}
              className={groupBy === option ? 'is-active' : ''}
              key={option}
              role="radio"
              type="button"
              onClick={() => setGroupBy(option)}
            >
              {option === 'scene' ? 'Por cena' : 'Por entidade'}
            </button>
          ))}
        </div>
      </div>
      <p className="facts-count" aria-live="polite">
        {visible.length === rows.length
          ? `${rows.length} fatos`
          : `${visible.length} de ${rows.length} fatos`}
      </p>

      {groups.length === 0 ? (
        <p className="archive-empty">Nenhum fato corresponde aos filtros.</p>
      ) : (
        <div className="facts-groups">
          {groups.map((group) => {
            const first = group.rows[0]
            return (
              <section className="facts-group" key={group.id}>
                <header className="facts-group-header">
                  {groupBy === 'scene' ? (
                    <>
                      <span className="facts-group-index">
                        {first.fact.position === null ? 'A' : first.fact.position + 1}
                      </span>
                      <button
                        className="inline-link facts-group-title"
                        title="Abrir no editor"
                        type="button"
                        onClick={() => onOpenScene(first.fact.slot.id)}
                      >
                        {first.fact.slot.title ?? 'Cena sem título'}
                      </button>
                      <span className="facts-group-meta">
                        {first.fact.position === null
                          ? 'Cena avulsa'
                          : `Cena ${first.fact.position + 1} de ${anchoredCount}`}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={`entity-type-dot type-${first.entity.type.toLowerCase()}`} aria-hidden="true" />
                      <button
                        className="inline-link facts-group-title"
                        type="button"
                        onClick={() => onOpenEntity(first.entity.id)}
                      >
                        {first.entity.name}
                      </button>
                      <span className="facts-group-meta">{entityTypeLabel(first.entity.type)}</span>
                    </>
                  )}
                </header>
                <ul className="facts-rows">
                  {group.rows.map(({ fact, entity }) => (
                    <li className={`facts-row${fact.isActive ? '' : ' is-replaced'}`} key={fact.id}>
                      {groupBy === 'scene' ? (
                        <button className="facts-entity" type="button" onClick={() => onOpenEntity(entity.id)}>
                          <span className={`entity-type-dot type-${entity.type.toLowerCase()}`} aria-hidden="true" />
                          {entity.name}
                        </button>
                      ) : (
                        <button className="facts-entity" type="button" onClick={() => onOpenScene(fact.slot.id)}>
                          {fact.position === null ? 'Cena avulsa' : `Cena ${fact.position + 1}`}
                        </button>
                      )}
                      <span className="facts-attribute">{attributeLabel(fact.attribute)}</span>
                      <span className="facts-value">
                        {fact.value}
                        {fact.targetId && byId.has(fact.targetId) && (
                          <button
                            className="relation-chip"
                            type="button"
                            onClick={() => onOpenEntity(fact.targetId!)}
                          >
                            → {byId.get(fact.targetId)!.name}
                          </button>
                        )}
                        {fact.isSubjective && (
                          <span className="entity-tag">segundo {fact.sourceClaim ?? 'alguém'}</span>
                        )}
                        {!fact.isActive && <span className="entity-tag">substituído</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
