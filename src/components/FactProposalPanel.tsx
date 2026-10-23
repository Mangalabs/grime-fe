import {
  factEntityTypes,
  type FactApprovalResult,
  type FactEntityType,
  type FactStatus,
  type PendingFact,
  type ProjectFact,
  type Slot,
} from '../api/contracts'
import './FactProposalPanel.css'
import { FactEditDialog } from './FactEditDialog'
import { useState } from 'react'

interface FactProposalPanelProps {
  facts: PendingFact[]
  factStatus: FactStatus
  isDeciding: boolean
  slotId: string
  canonFacts: ProjectFact[]
  slots: Slot[]
  approval: FactApprovalResult | null
  onChange: (index: number, patch: Partial<PendingFact>) => void
  onRemove: (index: number) => void
  onApprove: () => void
  onReject: () => void
  onUpdateApprovedFact: (index: number, fact: PendingFact) => Promise<void>
  onSelectSlot: (slot: Slot) => void
}

const entityLabels: Record<FactEntityType, string> = {
  CHARACTER: 'Personagem',
  LOCATION: 'Local',
  ITEM: 'Item',
  FACTION: 'Facção',
  WORLD_RULE: 'Regra do mundo',
  EVENT: 'Evento',
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR')
}

// An active canon fact from another scene that gives the same entity
// attribute a different value.
function findCanonConflict(
  fact: PendingFact,
  canonFacts: ProjectFact[],
  slotId: string,
): ProjectFact | undefined {
  return canonFacts.find(
    (canonFact) =>
      canonFact.isActive &&
      canonFact.slot.id !== slotId &&
      [canonFact.entity.name, canonFact.entity.canonical?.name].some(
        (name) => normalize(name) === normalize(fact.entityName),
      ) &&
      normalize(canonFact.attribute) === normalize(fact.attribute) &&
      normalize(canonFact.value) !== normalize(fact.value),
  )
}

function slotLabel(slot: Pick<Slot, 'title' | 'timelinePosition' | 'isUnanchored'>): string {
  const title = slot.title ?? 'Cena sem título'
  return slot.isUnanchored || slot.timelinePosition === null
    ? `Cena avulsa · ${title}`
    : `Cena ${slot.timelinePosition + 1} · ${title}`
}

export function FactProposalPanel({
  facts,
  factStatus,
  isDeciding,
  slotId,
  canonFacts,
  slots,
  approval,
  onChange,
  onRemove,
  onApprove,
  onReject,
  onUpdateApprovedFact,
  onSelectSlot,
}: FactProposalPanelProps) {
  const isReadOnly = factStatus === 'APPROVED'
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [dialogIndex, setDialogIndex] = useState<number | null>(null)
  const [isConfirmingReject, setIsConfirmingReject] = useState(false)

  const conflicts = facts.map((fact) =>
    isReadOnly ? undefined : findCanonConflict(fact, canonFacts, slotId),
  )
  const conflictCount = conflicts.filter(Boolean).length
  // Names offered when linking a fact to the entity its value refers to.
  const knownEntityNames = [
    ...new Set(
      canonFacts.flatMap((fact) => [
        fact.entity.canonical?.name ?? fact.entity.name,
        ...(fact.targetEntity ? [fact.targetEntity.name] : []),
      ]),
    ),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const missingClaimCount = facts.filter(
    (fact) => fact.isSubjective && !fact.sourceClaim?.trim(),
  ).length

  function slotLink(target: Pick<Slot, 'id' | 'title' | 'timelinePosition' | 'isUnanchored'>) {
    const slot = slots.find((item) => item.id === target.id)
    return slot ? (
      <button className="inline-link" type="button" onClick={() => onSelectSlot(slot)}>
        {slotLabel(slot)}
      </button>
    ) : (
      <span>{slotLabel(target)}</span>
    )
  }

  return (
    <section className="panel facts-panel" aria-labelledby="facts-heading" data-tour="archivist">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Arquivista</p>
          <h2 id="facts-heading">{isReadOnly ? 'Fatos aprovados' : 'Proposta de fatos'}</h2>
        </div>
        <span className="count-badge">{facts.length}</span>
      </div>

      {approval && (
        <div className="approval-summary" aria-live="polite">
          <strong>
            {approval.approvedFacts === 1
              ? '1 fato consolidado no cânone.'
              : `${approval.approvedFacts} fatos consolidados no cânone.`}
          </strong>
          {approval.regressionAlerts.length > 0 ? (
            <>
              <p>Estas cenas posteriores precisam ser revalidadas:</p>
              <ul>
                {approval.regressionAlerts.map((affectedSlotId) => {
                  const slot = slots.find((item) => item.id === affectedSlotId)
                  return (
                    <li key={affectedSlotId}>
                      {slot ? slotLink(slot) : 'Cena não encontrada na timeline'}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p>Nenhuma cena posterior foi invalidada.</p>
          )}
        </div>
      )}

      {facts.length === 0 ? (
        <div className="empty-state">
          <strong>Nenhum fato pendente</strong>
          <p>A proposta do Arquivista aparecerá após a análise.</p>
        </div>
      ) : (
        <>
          <p className="panel-description">
            {isReadOnly
              ? 'Fatos desta cena já consolidados no cânone.'
              : 'Revise cada fato antes de aprovar. Fatos removidos não entram no cânone.'}
          </p>
          <ul className="fact-proposal-list">
            {facts.map((fact, index) => {
              const conflict = conflicts[index]
              const isEditing = editingIndex === index
              const isMissingClaim = fact.isSubjective && !fact.sourceClaim?.trim()
              return (
                <li
                  className={`fact-proposal${conflict ? ' fact-proposal-conflict' : ''}`}
                  key={index}
                >
                  <div className="fact-line">
                    <span className="fact-type">{entityLabels[fact.entityType]}</span>
                    <p className="fact-statement">
                      <strong>{fact.entityName || 'Entidade sem nome'}</strong>
                      <span className="fact-attribute"> · {fact.attribute || 'atributo'}</span>
                      <span aria-hidden="true"> → </span>
                      <span className="sr-only">: </span>
                      <span className="fact-value">{fact.value || 'sem valor'}</span>
                      {fact.targetEntityName && (
                        <span className="relation-chip is-static">→ {fact.targetEntityName}</span>
                      )}
                    </p>
                    <div className="fact-actions">
                      {isReadOnly ? (
                        <button className="text-button" type="button" onClick={() => setDialogIndex(index)}>
                          Editar
                        </button>
                      ) : (
                        <>
                          <button
                            aria-expanded={isEditing}
                            className="text-button"
                            type="button"
                            onClick={() => setEditingIndex(isEditing ? null : index)}
                          >
                            {isEditing ? 'Concluir' : 'Editar'}
                          </button>
                          <button
                            className="text-button destructive"
                            type="button"
                            onClick={() => {
                              setEditingIndex(null)
                              onRemove(index)
                            }}
                          >
                            Remover
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {fact.isSubjective && (
                    <p className={`fact-note${isMissingClaim ? ' fact-note-error' : ''}`}>
                      {isMissingClaim
                        ? 'Fato subjetivo sem alegação de origem — informe quem afirma isso.'
                        : `Subjetivo · segundo ${fact.sourceClaim}`}
                    </p>
                  )}
                  {conflict && (
                    <p className="fact-note fact-note-conflict">
                      <span aria-hidden="true">▲ </span>
                      Diverge do cânone: “{conflict.value}”, registrado em {slotLink(conflict.slot)}
                    </p>
                  )}
                  {isEditing && (
                    <div className="fact-editor">
                      <div className="fact-grid">
                        <label>
                          <span>Entidade</span>
                          <input
                            value={fact.entityName}
                            onChange={(event) => onChange(index, { entityName: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>Tipo</span>
                          <select
                            value={fact.entityType}
                            onChange={(event) =>
                              onChange(index, { entityType: event.target.value as FactEntityType })
                            }
                          >
                            {factEntityTypes.map((type) => (
                              <option key={type} value={type}>
                                {entityLabels[type]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Atributo</span>
                          <input
                            value={fact.attribute}
                            onChange={(event) => onChange(index, { attribute: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>Valor</span>
                          <input
                            value={fact.value}
                            onChange={(event) => onChange(index, { value: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>Refere-se a (opcional)</span>
                          <input
                            list="known-entity-names"
                            placeholder="Outra entidade citada no valor"
                            value={fact.targetEntityName ?? ''}
                            onChange={(event) =>
                              onChange(index, { targetEntityName: event.target.value || null })
                            }
                          />
                        </label>
                        {fact.targetEntityName && (
                          <label>
                            <span>Tipo da entidade citada</span>
                            <select
                              value={fact.targetEntityType ?? ''}
                              onChange={(event) =>
                                onChange(index, {
                                  targetEntityType: (event.target.value || null) as FactEntityType | null,
                                })
                              }
                            >
                              <option value="">Usar a entidade existente</option>
                              {factEntityTypes.map((type) => (
                                <option key={type} value={type}>
                                  {entityLabels[type]}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                      <div className="fact-options">
                        <label className="checkbox-label">
                          <input
                            checked={fact.isSubjective}
                            type="checkbox"
                            onChange={(event) =>
                              onChange(index, {
                                isSubjective: event.target.checked,
                                sourceClaim: event.target.checked ? fact.sourceClaim ?? '' : null,
                              })
                            }
                          />
                          <span>Fato subjetivo</span>
                        </label>
                        {fact.isSubjective && (
                          <label className="fact-claim-field">
                            <span>Alegação de origem</span>
                            <input
                              value={fact.sourceClaim ?? ''}
                              onChange={(event) => onChange(index, { sourceClaim: event.target.value })}
                              placeholder="Quem fez a alegação?"
                              required
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {!isReadOnly && (
            <div className="decision-bar">
              <p>
                {facts.length === 1 ? '1 fato entrará' : `${facts.length} fatos entrarão`} no cânone
                {conflictCount > 0 && (
                  <span className="decision-warning">
                    {' · '}
                    {conflictCount === 1 ? '1 diverge' : `${conflictCount} divergem`} do cânone
                  </span>
                )}
                {missingClaimCount > 0 && (
                  <span className="decision-error">
                    {' · '}
                    {missingClaimCount === 1
                      ? '1 sem alegação de origem'
                      : `${missingClaimCount} sem alegação de origem`}
                  </span>
                )}
              </p>
              <div className="decision-actions">
                {isConfirmingReject ? (
                  <>
                    <span className="decision-confirm">Descartar toda a proposta?</span>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setIsConfirmingReject(false)}
                    >
                      Manter
                    </button>
                    <button
                      className="button button-danger"
                      disabled={isDeciding}
                      type="button"
                      onClick={() => {
                        setIsConfirmingReject(false)
                        onReject()
                      }}
                    >
                      Rejeitar proposta
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="button button-secondary"
                      disabled={isDeciding}
                      type="button"
                      onClick={() => setIsConfirmingReject(true)}
                    >
                      Rejeitar…
                    </button>
                    <button
                      className="button button-primary"
                      disabled={isDeciding || missingClaimCount > 0}
                      type="button"
                      onClick={onApprove}
                    >
                      {isDeciding ? 'Processando…' : 'Aprovar snapshot'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
      <datalist id="known-entity-names">
        {knownEntityNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {dialogIndex !== null && (
        <FactEditDialog
          fact={facts[dialogIndex]}
          isSaving={isDeciding}
          onClose={() => setDialogIndex(null)}
          onSave={async (fact) => {
            await onUpdateApprovedFact(dialogIndex, fact)
            setDialogIndex(null)
          }}
        />
      )}
    </section>
  )
}
