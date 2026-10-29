import { useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { ArchiveEntity } from '../../features/archive/entityModel'
import { duplicateCandidates, readDismissed, subjectiveClaims, writeDismissed } from '../../features/archive/toReview'

interface ToReviewViewProps {
  projectId: string
  archive: ArchiveEntity[]
  onOpenEntity: (entityId: string) => void
  onOpenScene: (slotId: string) => void
  onRefresh: () => Promise<void>
  onError: (message: string) => void
}

const typeLabels: Record<string, string> = {
  CHARACTER: 'Personagens',
  LOCATION: 'Locais',
  ITEM: 'Itens',
  FACTION: 'Facções',
  WORLD_RULE: 'Regras do mundo',
  EVENT: 'Eventos',
}

/**
 * What an automatically approved canon still asks of the author: possible
 * duplicate names, and claims made by characters. Dismissed items stay
 * hidden in this browser.
 */
export function ToReviewView({ projectId, archive, onOpenEntity, onOpenScene, onRefresh, onError }: ToReviewViewProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(projectId))
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)

  const duplicates = useMemo(() => duplicateCandidates(archive), [archive])
  const claims = useMemo(() => subjectiveClaims(archive), [archive])
  const visible = <T extends { key: string }>(items: T[]) => items.filter((item) => showDismissed || !dismissed.has(item.key))
  const shownDuplicates = visible(duplicates)
  const shownClaims = visible(claims)
  const hiddenCount = [...duplicates, ...claims].filter((item) => dismissed.has(item.key)).length

  function toggleDismissed(key: string) {
    const next = new Set(dismissed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setDismissed(next)
    writeDismissed(projectId, next)
  }

  async function merge(key: string, keepId: string, mergeId: string) {
    setBusyKey(key)
    try {
      await api.mergeEntities(keepId, mergeId)
      await onRefresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível unir as entidades.')
    } finally {
      setBusyKey(null)
    }
  }

  const sceneLabel = (position: number | null) => (position === null ? 'cena avulsa' : `cena ${position + 1}`)

  return (
    <div className="to-review">
      <p className="to-review-intro">
        Com a aprovação automática, os fatos entram no cânone sem passar por você. Aqui fica só o que pede um olhar:
        nomes que talvez sejam a mesma entidade e afirmações feitas por personagens, que a narração não confirma.
        Contradições com o cânone aparecem no Revisor de cada cena.
      </p>

      <section aria-labelledby="to-review-duplicates" className="panel to-review-section">
        <div className="panel-heading">
          <h2 id="to-review-duplicates">Nomes parecidos</h2>
          <span className="to-review-count">{shownDuplicates.length}</span>
        </div>
        {shownDuplicates.length === 0 ? (
          <p className="to-review-empty">Nenhum nome parecido entre entidades do mesmo tipo.</p>
        ) : (
          <ul className="to-review-list">
            {shownDuplicates.map(({ key, keep, merge: other }) => (
              <li className={dismissed.has(key) ? 'is-dismissed' : undefined} key={key}>
                <div className="to-review-main">
                  <span className="to-review-kind">{typeLabels[keep.type] ?? keep.type}</span>
                  <span>
                    <button className="inline-link" type="button" onClick={() => onOpenEntity(other.id)}>
                      {other.name}
                    </button>{' '}
                    e{' '}
                    <button className="inline-link" type="button" onClick={() => onOpenEntity(keep.id)}>
                      {keep.name}
                    </button>{' '}
                    são a mesma entidade?
                  </span>
                  <small>
                    {other.facts.length} e {keep.facts.length} fatos
                  </small>
                </div>
                <div className="to-review-actions">
                  <button
                    className="button button-secondary button-small"
                    disabled={busyKey !== null}
                    title={`"${other.name}" vira outro nome de "${keep.name}", e os fatos passam para ela.`}
                    type="button"
                    onClick={() => void merge(key, keep.id, other.id)}
                  >
                    {busyKey === key ? 'Unindo…' : `Unir em “${keep.name}”`}
                  </button>
                  <button className="text-button" type="button" onClick={() => toggleDismissed(key)}>
                    {dismissed.has(key) ? 'Mostrar de novo' : 'São diferentes'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="to-review-claims" className="panel to-review-section">
        <div className="panel-heading">
          <h2 id="to-review-claims">Afirmações de personagens</h2>
          <span className="to-review-count">{shownClaims.length}</span>
        </div>
        {shownClaims.length === 0 ? (
          <p className="to-review-empty">Nenhuma afirmação subjetiva no cânone.</p>
        ) : (
          <ul className="to-review-list">
            {shownClaims.map(({ key, entity, fact }) => (
              <li className={dismissed.has(key) ? 'is-dismissed' : undefined} key={key}>
                <div className="to-review-main">
                  <span className="to-review-kind">{fact.sourceClaim ? `segundo ${fact.sourceClaim}` : 'afirmação'}</span>
                  <span>
                    <button className="inline-link" type="button" onClick={() => onOpenEntity(entity.id)}>
                      {entity.name}
                    </button>
                    : {fact.value}
                  </span>
                  <small>{sceneLabel(fact.position)}</small>
                </div>
                <div className="to-review-actions">
                  <button className="text-button" type="button" onClick={() => onOpenScene(fact.slot.id)}>
                    Abrir cena
                  </button>
                  <button className="text-button" type="button" onClick={() => toggleDismissed(key)}>
                    {dismissed.has(key) ? 'Mostrar de novo' : 'Visto'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hiddenCount > 0 && (
        <button className="text-button" type="button" onClick={() => setShowDismissed((value) => !value)}>
          {showDismissed ? 'Esconder os já vistos' : `Mostrar ${hiddenCount} já ${hiddenCount === 1 ? 'visto' : 'vistos'}`}
        </button>
      )}
    </div>
  )
}
