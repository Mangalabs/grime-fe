import { useId } from 'react'
import { entityTypeLabel, type ArchiveEntity } from '../../features/archive/entityModel'
import type { WikiField, WikiValue } from '../../features/wiki/wikiModel'

interface EditorProps {
  field: WikiField
  value: WikiValue | undefined
  guidance: string[]
  showGuidance: boolean
  archive: ArchiveEntity[]
  selfId: string
  onChange: (value: WikiValue) => void
  // Template fields are hidden on this page; page fields are removed.
  onRemove: () => void
  removeLabel: string
}

// A value saved before the field changed kind still shows up.
const asText = (value: WikiValue | undefined) => (Array.isArray(value) ? value.join('\n') : (value ?? ''))
const asList = (value: WikiValue | undefined) => (Array.isArray(value) ? value : value ? [value] : [])

/** One field of a page being edited, with its guidance. */
export function WikiFieldEditor({
  field,
  value,
  guidance,
  showGuidance,
  archive,
  selfId,
  onChange,
  onRemove,
  removeLabel,
}: EditorProps) {
  const id = useId()
  const label = field.label || 'Campo sem nome'
  const option = field.kind === 'choice' ? field.options.find((item) => item.id === value) : undefined

  return (
    <div className="wiki-field-editor">
      <div className="wiki-field-label">
        <label htmlFor={id}>{label}</label>
        <button className="text-button" type="button" onClick={onRemove}>
          {removeLabel}
        </button>
      </div>
      {showGuidance && guidance.length > 0 && (
        <p className="wiki-guidance" id={`${id}-guidance`}>
          {guidance.join(' ')}
        </p>
      )}
      {field.kind === 'text' && (
        <input
          aria-describedby={showGuidance ? `${id}-guidance` : undefined}
          id={id}
          value={asText(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.kind === 'longtext' && (
        <textarea
          aria-describedby={showGuidance ? `${id}-guidance` : undefined}
          id={id}
          rows={3}
          value={asText(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.kind === 'list' && (
        <textarea
          aria-describedby={showGuidance ? `${id}-guidance` : undefined}
          id={id}
          placeholder="Um item por linha"
          rows={3}
          value={asList(value).join('\n')}
          onChange={(event) => onChange(event.target.value.split('\n'))}
        />
      )}
      {field.kind === 'choice' && (
        <>
          <select id={id} value={asText(value)} onChange={(event) => onChange(event.target.value)}>
            <option value="">—</option>
            {field.options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          {option?.guidance && <p className="wiki-guidance wiki-option-guidance">{option.guidance}</p>}
        </>
      )}
      {field.kind === 'entities' && (
        <EntityPicker
          archive={archive}
          field={field}
          id={id}
          selfId={selfId}
          value={asList(value)}
          onChange={onChange}
        />
      )}
    </div>
  )
}

function EntityPicker({
  archive,
  field,
  id,
  selfId,
  value,
  onChange,
}: {
  archive: ArchiveEntity[]
  field: WikiField
  id: string
  selfId: string
  value: string[]
  onChange: (value: string[]) => void
}) {
  const byId = new Map(archive.map((entity) => [entity.id, entity]))
  const candidates = archive
    .filter(
      (entity) =>
        entity.id !== selfId &&
        !value.includes(entity.id) &&
        (field.entityTypes.length === 0 || field.entityTypes.includes(entity.type as never)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const canAdd = field.multiple || value.length === 0

  return (
    <div className="wiki-entity-picker">
      {value.length > 0 && (
        <ul className="wiki-entity-chips">
          {value.map((entityId) => (
            <li key={entityId}>
              <span className={`entity-type-dot type-${byId.get(entityId)?.type.toLowerCase()}`} aria-hidden="true" />
              {byId.get(entityId)?.name ?? 'Entidade removida'}
              <button
                aria-label={`Remover ${byId.get(entityId)?.name ?? 'entidade'}`}
                className="text-button"
                type="button"
                onClick={() => onChange(value.filter((item) => item !== entityId))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <select
          id={id}
          value=""
          onChange={(event) => {
            if (event.target.value) onChange([...value, event.target.value])
          }}
        >
          <option value="">
            {candidates.length === 0
              ? field.entityTypes.length
                ? `Nenhum(a) ${field.entityTypes.map((type) => entityTypeLabel(type).toLocaleLowerCase('pt-BR')).join(' ou ')} disponível`
                : 'Nenhuma entidade disponível'
              : 'Vincular entidade…'}
          </option>
          {candidates.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
              {field.entityTypes.length !== 1 ? ` · ${entityTypeLabel(entity.type)}` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/** A filled value, read like a wiki. */
export function WikiFieldValue({
  field,
  value,
  archive,
  onSelectEntity,
}: {
  field: WikiField | null
  value: WikiValue
  archive: ArchiveEntity[]
  onSelectEntity: (entityId: string) => void
}) {
  if (field?.kind === 'choice' && typeof value === 'string') {
    return <p className="wiki-value">{field.options.find((option) => option.id === value)?.label ?? value}</p>
  }
  if (field?.kind === 'entities' && Array.isArray(value)) {
    const byId = new Map(archive.map((entity) => [entity.id, entity]))
    return (
      <ul className="wiki-entity-links">
        {value.map((entityId) => {
          const entity = byId.get(entityId)
          return (
            <li key={entityId}>
              {entity ? (
                <button className="facts-entity" type="button" onClick={() => onSelectEntity(entity.id)}>
                  <span className={`entity-type-dot type-${entity.type.toLowerCase()}`} aria-hidden="true" />
                  {entity.name}
                </button>
              ) : (
                <span className="wiki-value is-missing">Entidade removida</span>
              )}
            </li>
          )
        })}
      </ul>
    )
  }
  if (Array.isArray(value)) {
    return (
      <ul className="wiki-list">
        {value.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    )
  }
  return <p className="wiki-value">{value}</p>
}
