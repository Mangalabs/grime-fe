import { useEffect, useMemo, useState } from 'react'
import { bondLabels } from '../../features/archive/bonds'
import type { ArchiveEntity, ArchiveFact } from '../../features/archive/entityModel'
import { plannedVsWritten, type PlannedVsWritten } from '../../features/archive/plannedVsWritten'
import { characterTrajectory, itemLabel, type StepItem } from '../../features/archive/trajectory'
import type { Wiki } from '../../features/wiki/useWiki'

interface TrajectoryViewProps {
  archive: ArchiveEntity[]
  entity: ArchiveEntity
  wiki: Wiki | null
  hasPage: boolean
  onOpenScene: (slotId: string) => void
  onSelectEntity: (entityId: string) => void
}

const sceneName = (position: number | null) => (position === null ? 'Cena avulsa' : `Cena ${position + 1}`)
const range = (from: number, to: number) => (from === to ? `na cena ${from + 1}` : `nas cenas ${from + 1}–${to + 1}`)

/**
 * A character read from the text: a short summary, the story scene by scene
 * (only what changed, unless asked), and the author's plan next to it.
 */
export function TrajectoryView({ archive, entity, wiki, hasPage, onOpenScene, onSelectEntity }: TrajectoryViewProps) {
  const trajectory = useMemo(() => characterTrajectory(archive, entity.id), [archive, entity.id])
  const [showRepeats, setShowRepeats] = useState(false)
  const [plan, setPlan] = useState<{ entityId: string; result: PlannedVsWritten | null } | null>(null)
  const byId = useMemo(() => new Map(archive.map((item) => [item.id, item])), [archive])
  const name = (id: string) => byId.get(id)?.name ?? 'Entidade removida'

  // The author's page, decrypted here, only when there is one.
  useEffect(() => {
    if (!wiki || !hasPage) return
    let isCurrent = true
    wiki
      .loadPage(entity.id)
      .then(({ page }) => {
        if (isCurrent) setPlan({ entityId: entity.id, result: page ? plannedVsWritten(page, archive, entity) : null })
      })
      .catch(() => {
        if (isCurrent) setPlan({ entityId: entity.id, result: null })
      })
    return () => {
      isCurrent = false
    }
  }, [wiki, hasPage, entity, archive])

  const planned = plan?.entityId === entity.id ? plan.result : null
  const { summary } = trajectory

  const sceneLink = (fact: ArchiveFact) => (
    <button className="inline-link" type="button" onClick={() => onOpenScene(fact.slot.id)}>
      {sceneName(fact.position)}
    </button>
  )

  function item(entry: StepItem) {
    const target = entry.fact.targetId && entry.fact.targetId !== entity.id ? entry.fact.targetId : null
    return (
      <li className={`trajectory-item kind-${entry.kind}${entry.isRepeat ? ' is-repeat' : ''}`} key={entry.fact.id}>
        <span className="trajectory-label">
          {entry.bond ? (
            <span className={`bond-kind bond-${entry.bond.toLowerCase()}`}>{bondLabels[entry.bond]}</span>
          ) : (
            itemLabel(entry)
          )}
        </span>
        <span className="trajectory-value">
          {entry.fromId && (
            <button className="inline-link" type="button" onClick={() => onSelectEntity(entry.fromId!)}>
              {name(entry.fromId)}
            </button>
          )}
          {entry.fromId && ': '}
          {entry.fact.value}
          {target && !entry.fromId && (
            <>
              {' '}
              <button className="bond-chip" type="button" onClick={() => onSelectEntity(target)}>
                {name(target)}
              </button>
            </>
          )}
          {entry.fact.isSubjective && <span className="entity-tag">segundo {entry.fact.sourceClaim ?? 'alguém'}</span>}
        </span>
      </li>
    )
  }

  const repeatCount = trajectory.steps.reduce((total, step) => total + step.items.filter((entry) => entry.isRepeat).length, 0)
  const gapAfter = new Map(trajectory.gaps.map((gap) => [gap.from - 1, gap]))

  if (!trajectory.steps.length) {
    return <p className="archive-empty">Nenhum fato de {entity.name} no cânone ainda. Analise as cenas em que aparece.</p>
  }

  return (
    <div className="trajectory">
      <section aria-labelledby="trajectory-summary-title" className="trajectory-summary">
        <h3 className="entity-section-title" id="trajectory-summary-title">
          Pelo texto
        </h3>
        <dl>
          <div>
            <dt>Aparece</dt>
            <dd>
              {trajectory.first === null
                ? 'só em cenas avulsas'
                : trajectory.first === trajectory.last
                  ? `na cena ${trajectory.first + 1}`
                  : `da cena ${trajectory.first + 1} à ${trajectory.last! + 1}, com fatos em ${trajectory.steps.length} cenas`}
              {trajectory.gaps.length > 0 && (
                <small>
                  {' '}
                  · {trajectory.gaps.length} {trajectory.gaps.length === 1 ? 'intervalo' : 'intervalos'} sem registro
                </small>
              )}
            </dd>
          </div>
          {summary.origins.length > 0 && (
            <div>
              <dt>Origem</dt>
              <dd>{summary.origins.map((fact) => fact.value).join(' · ')}</dd>
            </div>
          )}
          {summary.roles.length > 0 && (
            <div>
              <dt>Função</dt>
              <dd>{summary.roles.map((fact) => fact.value).join(' → ')}</dd>
            </div>
          )}
          {summary.appearance.length > 0 && (
            <div>
              <dt>Aparência</dt>
              <dd>{summary.appearance.map((fact) => fact.value).join(' · ')}</dd>
            </div>
          )}
          {summary.goals.length > 0 && (
            <div>
              <dt>Quer</dt>
              <dd>
                <ol className="trajectory-goals">
                  {summary.goals.map((fact) => (
                    <li key={fact.id}>
                      {fact.value} {sceneLink(fact)}
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
          )}
          {(summary.place || summary.health || summary.status) && (
            <div>
              <dt>Por último</dt>
              <dd>
                {[summary.place && `em ${summary.place.value}`, summary.health?.value, summary.status?.value].filter(Boolean).join(' · ')}
              </dd>
            </div>
          )}
          {summary.knowledge > 0 && (
            <div>
              <dt>Descobertas</dt>
              <dd>{summary.knowledge} registradas</dd>
            </div>
          )}
        </dl>
      </section>

      {planned && (planned.rows.length > 0 || planned.relations) && (
        <section aria-labelledby="trajectory-plan-title" className="trajectory-plan">
          <h3 className="entity-section-title" id="trajectory-plan-title">
            Planejado × escrito
          </h3>
          <p className="trajectory-note">
            O que a ficha planeja ao lado do que o texto registra. Sem registro no texto não é erro: pode ser algo que
            ainda não foi escrito, ou que o Arquivista não extraiu.
          </p>
          <ul className="plan-rows">
            {planned.rows.map((row) => (
              <li className={row.written.length ? undefined : 'is-missing'} key={row.fieldId}>
                <span className="plan-label">{row.label}</span>
                <span className="plan-planned">{row.planned}</span>
                <span className="plan-written">
                  {row.written.length === 0 ? (
                    <span className="plan-flag">sem registro no texto</span>
                  ) : (
                    row.written.map((fact) => (
                      <span key={fact.id}>
                        {fact.value} {sceneLink(fact)}
                      </span>
                    ))
                  )}
                </span>
              </li>
            ))}
            {planned.relations && (
              <li className="plan-relations">
                <span className="plan-label">Relações planejadas</span>
                <span className="plan-planned">{planned.relations.planned}</span>
                <span className="plan-written">
                  {planned.relations.mentioned.length === 0 ? (
                    <span className="plan-flag">nenhum nome do Arquivo citado na ficha</span>
                  ) : (
                    planned.relations.mentioned.map((relation) => (
                      <span key={relation.entity.id}>
                        <button className="inline-link" type="button" onClick={() => onSelectEntity(relation.entity.id)}>
                          {relation.entity.name}
                        </button>
                        {relation.kinds.length ? (
                          <>
                            {' '}
                            {relation.kinds.map((kind) => (
                              <span className={`bond-kind bond-${kind.toLowerCase()}`} key={kind}>
                                {bondLabels[kind]}
                              </span>
                            ))}{' '}
                            <small>
                              {relation.scenes} {relation.scenes === 1 ? 'cena' : 'cenas'}
                            </small>
                          </>
                        ) : (
                          <span className="plan-flag">sem vínculo no texto</span>
                        )}
                      </span>
                    ))
                  )}
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      <section aria-labelledby="trajectory-steps-title" className="trajectory-steps">
        <div className="trajectory-steps-head">
          <h3 className="entity-section-title" id="trajectory-steps-title">
            Cena a cena
          </h3>
          {repeatCount > 0 && (
            <label className="trajectory-repeats">
              <input checked={showRepeats} type="checkbox" onChange={(event) => setShowRepeats(event.target.checked)} />
              Mostrar estados repetidos ({repeatCount})
            </label>
          )}
        </div>
        <ol className="trajectory-list">
          {trajectory.steps.map((step) => {
            const shown = step.items.filter((entry) => showRepeats || !entry.isRepeat)
            const gap = step.position !== null ? gapAfter.get(step.position) : undefined
            return (
              <li key={step.slotId}>
                <div className={`trajectory-step${shown.length ? '' : ' is-quiet'}`}>
                  <button className="trajectory-scene" type="button" onClick={() => onOpenScene(step.slotId)}>
                    <strong>{sceneName(step.position)}</strong>
                    {step.slotTitle && <span>{step.slotTitle}</span>}
                  </button>
                  {shown.length ? (
                    <ul>{shown.map(item)}</ul>
                  ) : (
                    <p className="trajectory-quiet">Nada novo: os mesmos estados de antes.</p>
                  )}
                </div>
                {gap && <p className="trajectory-gap">Sem registro de {entity.name} {range(gap.from, gap.to)}</p>}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
