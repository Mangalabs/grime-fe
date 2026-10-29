import { useMemo } from 'react'
import { bondLabels, entityBonds, type Bond, type BondEntry } from '../../features/archive/bonds'
import type { ArchiveEntity } from '../../features/archive/entityModel'

interface EntityBondsProps {
  archive: ArchiveEntity[]
  entity: ArchiveEntity
  // Timeline cursor when following the story; null for the whole book.
  upTo: number | null
  onSelectEntity: (entityId: string) => void
  onOpenScene: (slotId: string) => void
}

const sceneLabel = (entry: BondEntry) =>
  entry.fact.position === null ? 'avulsa' : `cena ${entry.fact.position + 1}`

/**
 * The entity's bonds as a reader would list them: each person or group once,
 * with the kinds of bond, the latest thing the text says and its history;
 * places, belongings and events as short lists.
 */
export function EntityBonds({ archive, entity, upTo, onSelectEntity, onOpenScene }: EntityBondsProps) {
  const byId = useMemo(() => new Map(archive.map((item) => [item.id, item])), [archive])
  const bonds = useMemo(() => entityBonds(archive, entity.id, upTo), [archive, entity.id, upTo])
  if (!bonds.people.length && !bonds.groups.length && !bonds.others.length) return null

  const name = (id: string) => byId.get(id)?.name ?? 'Entidade removida'

  function bondRow(bond: Bond) {
    const { latest } = bond
    // Whose words: "Olivia → Julien" reads the other's fact about this entity.
    const speaker = latest.outgoing ? entity.name : name(bond.otherId)
    return (
      <li className="bond" key={bond.otherId}>
        <div className="bond-head">
          <button className="facts-entity" type="button" onClick={() => onSelectEntity(bond.otherId)}>
            <span aria-hidden="true" className={`entity-type-dot type-${bond.otherType.toLowerCase()}`} />
            {name(bond.otherId)}
          </button>
          <span className="bond-kinds">
            {bond.kinds.map((kind) => (
              <span className={`bond-kind bond-${kind.toLowerCase()}`} key={kind}>
                {bondLabels[kind]}
              </span>
            ))}
          </span>
        </div>
        <p className="bond-latest">
          <span className="bond-speaker">{speaker}:</span> {latest.fact.value}{' '}
          <button className="inline-link" type="button" onClick={() => onOpenScene(latest.fact.slot.id)}>
            {sceneLabel(latest)}
          </button>
        </p>
        {bond.entries.length > 1 && (
          <details className="bond-history">
            <summary>
              Histórico · {bond.entries.length} {bond.entries.length === 1 ? 'registro' : 'registros'}
            </summary>
            <ol>
              {bond.entries.map((entry) => (
                <li key={entry.fact.id}>
                  <button className="inline-link" type="button" onClick={() => onOpenScene(entry.fact.slot.id)}>
                    {sceneLabel(entry)}
                  </button>
                  {entry.kind && <span className={`bond-kind bond-${entry.kind.toLowerCase()}`}>{bondLabels[entry.kind]}</span>}
                  <span>
                    {entry.outgoing ? '' : `${name(bond.otherId)}: `}
                    {entry.fact.value}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </li>
    )
  }

  return (
    <section aria-labelledby="entity-bonds-title" className="entity-bonds">
      <h3 className="entity-section-title" id="entity-bonds-title">
        Vínculos{upTo !== null ? ` até a cena ${upTo + 1}` : ''}
      </h3>
      {bonds.people.length > 0 && (
        <>
          <h4 className="bond-group-title">Pessoas</h4>
          <ul className="bond-list">{bonds.people.map(bondRow)}</ul>
        </>
      )}
      {bonds.groups.length > 0 && (
        <>
          <h4 className="bond-group-title">Grupos</h4>
          <ul className="bond-list">{bonds.groups.map(bondRow)}</ul>
        </>
      )}
      {bonds.others.length > 0 && (
        <dl className="bond-others">
          {bonds.others.map((group) => (
            <div key={group.label}>
              <dt>{group.label}</dt>
              <dd>
                {group.items.map((item) => (
                  <button
                    className="bond-chip"
                    key={item.otherId}
                    title={item.facts.map((fact) => fact.value).join(' · ')}
                    type="button"
                    onClick={() => onSelectEntity(item.otherId)}
                  >
                    {name(item.otherId)}
                    {item.facts.length > 1 && <span className="bond-count">{item.facts.length}×</span>}
                  </button>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
