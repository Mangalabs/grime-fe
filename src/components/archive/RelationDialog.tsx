import { useState, type FormEvent } from 'react'
import '../Modal.css'
import type { CreateRelation, Slot } from '../../api/contracts'
import { attributeLabel } from '../../features/archive/attributes'
import { entityTypeLabel, type ArchiveEntity } from '../../features/archive/entityModel'
import { orderScenes, sceneTitle } from '../../features/scenes/sceneStatus'

interface RelationDialogProps {
  archive: ArchiveEntity[]
  slots: Slot[]
  initialSourceId: string | null
  initialTargetId: string | null
  initialSlotId: string | null
  onClose: () => void
  onCreate: (relation: CreateRelation) => Promise<void>
}

// Attributes that describe a link to another entity, in the Arquivista's vocabulary.
const relationAttributes = ['relacao', 'familia', 'lealdade', 'local_atual', 'cargo', 'posse', 'conhecimento', 'objetivo']
const OTHER = '__other__'

export function RelationDialog({
  archive,
  slots,
  initialSourceId,
  initialTargetId,
  initialSlotId,
  onClose,
  onCreate,
}: RelationDialogProps) {
  const scenes = orderScenes(slots)
  const sortedEntities = [...archive].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const [sourceId, setSourceId] = useState(initialSourceId ?? '')
  const [targetId, setTargetId] = useState(initialTargetId ?? '')
  const [attribute, setAttribute] = useState('relacao')
  const [customAttribute, setCustomAttribute] = useState('')
  const [value, setValue] = useState('')
  const [slotId, setSlotId] = useState(initialSlotId ?? scenes.at(-1)?.id ?? '')
  const [isSubjective, setIsSubjective] = useState(false)
  const [sourceClaim, setSourceClaim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const resolvedAttribute = attribute === OTHER ? customAttribute.trim() : attribute
  const source = archive.find((entity) => entity.id === sourceId)
  const target = archive.find((entity) => entity.id === targetId)
  const canSave =
    !!sourceId &&
    !!targetId &&
    sourceId !== targetId &&
    !!resolvedAttribute &&
    !!value.trim() &&
    !!slotId &&
    (!isSubjective || !!sourceClaim.trim())

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    setIsSaving(true)
    setError(null)
    try {
      await onCreate({
        sourceEntityId: sourceId,
        targetEntityId: targetId,
        slotId,
        attribute: resolvedAttribute,
        value: value.trim(),
        isSubjective,
        sourceClaim: isSubjective ? sourceClaim.trim() : null,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a relação.')
      setIsSaving(false)
    }
  }

  const entityOptions = sortedEntities.map((entity) => (
    <option key={entity.id} value={entity.id}>
      {entity.name} · {entityTypeLabel(entity.type)}
    </option>
  ))

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="relation-dialog-title" aria-modal="true" className="modal relation-dialog" role="dialog">
        <p className="eyebrow">Arquivo</p>
        <h2 id="relation-dialog-title">Nova relação</h2>
        <p>
          A relação vale a partir da cena escolhida e acompanha a ordem da timeline. Relações
          criadas aqui não são alteradas quando a cena é analisada de novo.
        </p>
        <form className="relation-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>De</span>
            <select autoFocus={!initialSourceId} required value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="">Escolha a entidade</option>
              {entityOptions}
            </select>
          </label>
          <label>
            <span>Tipo de relação</span>
            <select value={attribute} onChange={(event) => setAttribute(event.target.value)}>
              {relationAttributes.map((key) => (
                <option key={key} value={key}>
                  {attributeLabel(key)}
                </option>
              ))}
              <option value={OTHER}>Outro…</option>
            </select>
          </label>
          {attribute === OTHER && (
            <label>
              <span>Nome do atributo</span>
              <input
                placeholder="Ex.: rivalidade"
                required
                value={customAttribute}
                onChange={(event) => setCustomAttribute(event.target.value)}
              />
            </label>
          )}
          <label>
            <span>Para</span>
            <select required value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Escolha a entidade</option>
              {entityOptions}
            </select>
          </label>
          <label className="relation-form-wide">
            <span>Descrição</span>
            <input
              autoFocus={!!initialSourceId && !!initialTargetId}
              maxLength={500}
              placeholder={
                source && target
                  ? `Ex.: ${source.name} deve um favor a ${target.name}`
                  : 'Como esta relação aparece na história'
              }
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <label className="relation-form-wide">
            <span>Vale a partir da cena</span>
            <select required value={slotId} onChange={(event) => setSlotId(event.target.value)}>
              {scenes.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.isUnanchored || slot.timelinePosition === null
                    ? 'Avulsa'
                    : `Cena ${slot.timelinePosition + 1}`}{' '}
                  · {sceneTitle(slot)}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label relation-form-wide">
            <input checked={isSubjective} type="checkbox" onChange={(event) => setIsSubjective(event.target.checked)} />
            <span>Relação subjetiva (afirmada por alguém, não confirmada)</span>
          </label>
          {isSubjective && (
            <label className="relation-form-wide">
              <span>Quem afirma</span>
              <input required value={sourceClaim} onChange={(event) => setSourceClaim(event.target.value)} />
            </label>
          )}
          {sourceId && sourceId === targetId && (
            <p className="form-message relation-form-wide">Escolha duas entidades diferentes.</p>
          )}
          {error && <p className="form-message relation-form-wide">{error}</p>}
          <div className="modal-actions relation-form-wide">
            <button className="button button-secondary" disabled={isSaving} type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="button button-primary" disabled={!canSave || isSaving} type="submit">
              {isSaving ? 'Criando…' : 'Criar relação'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
