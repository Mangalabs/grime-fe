import { useEffect, useState } from 'react'
import { factEntityTypes, type FactEntityType } from '../../api/contracts'
import { entityTypeLabel } from '../../features/archive/entityModel'
import { starterTemplates } from '../../features/wiki/starterTemplates'
import {
  canonViewLabels,
  fieldKindLabels,
  newField,
  newId,
  newSection,
  restoreStarters,
  type WikiCanonView,
  type WikiField,
  type WikiFieldKind,
  type WikiSection,
  type WikiTemplate,
  type WikiTemplateLibrary,
} from '../../features/wiki/wikiModel'
import { ArrowDownIcon, ArrowUpIcon } from '../icons'
import './Wiki.css'

interface WikiTemplatesViewProps {
  library: WikiTemplateLibrary
  selectedId: string | null
  onSelect: (templateId: string) => void
  onSave: (library: WikiTemplateLibrary) => Promise<void>
  onDirtyChange: (isDirty: boolean) => void
}

function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** The project's templates: sections, fields and the guidance shown on each page. */
export function WikiTemplatesView({ library, selectedId, onSelect, onSave, onDirtyChange }: WikiTemplatesViewProps) {
  const [draft, setDraft] = useState<WikiTemplateLibrary | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newType, setNewType] = useState<FactEntityType | null>(null)

  const isDirty = draft !== null
  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const current = draft ?? library
  const selected = current.templates.find((template) => template.id === selectedId) ?? current.templates[0] ?? null
  const missingStarters = starterTemplates().filter((starter) => !current.templates.some((template) => template.id === starter.id))

  function change(update: (library: WikiTemplateLibrary) => WikiTemplateLibrary) {
    setDraft((value) => update(value ?? structuredClone(library)))
  }

  function changeTemplate(update: (template: WikiTemplate) => WikiTemplate) {
    if (!selected) return
    change((value) => ({
      ...value,
      templates: value.templates.map((template) => (template.id === selected.id ? update(template) : template)),
    }))
  }

  function changeSection(sectionId: string, update: (section: WikiSection) => WikiSection) {
    changeTemplate((template) => ({
      ...template,
      sections: template.sections.map((section) => (section.id === sectionId ? update(section) : section)),
    }))
  }

  function addTemplate(type: FactEntityType, from: WikiTemplate | null) {
    const template: WikiTemplate = from
      ? { ...structuredClone(from), id: newId(), name: `${from.name} (cópia)` }
      : { id: newId(), name: `Nova ficha de ${entityTypeLabel(type).toLocaleLowerCase('pt-BR')}`, description: '', entityType: type, sections: [newSection('Geral')] }
    change((value) => ({
      ...value,
      templates: [...value.templates, template],
      defaults: { ...value.defaults, [type]: value.defaults[type] ?? template.id },
    }))
    onSelect(template.id)
    setNewType(null)
  }

  function deleteTemplate(template: WikiTemplate) {
    if (
      !window.confirm(
        `Excluir o modelo “${template.name}”? As fichas que o usam passam para o modelo padrão do tipo; o que já foi escrito é mantido.`,
      )
    ) {
      return
    }
    change((value) => {
      const templates = value.templates.filter((item) => item.id !== template.id)
      const defaults = { ...value.defaults }
      if (defaults[template.entityType] === template.id) {
        const next = templates.find((item) => item.entityType === template.entityType)
        if (next) defaults[template.entityType] = next.id
        else delete defaults[template.entityType]
      }
      return { ...value, templates, defaults }
    })
  }

  async function save() {
    if (!draft) return
    setIsSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setDraft(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar os modelos.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="wiki-templates">
      <aside className="entity-index wiki-template-index" aria-label="Modelos de ficha">
        {factEntityTypes.map((type) => {
          const ofType = current.templates.filter((template) => template.entityType === type)
          return (
            <section key={type}>
              <h3 className="entity-section-title">{entityTypeLabel(type)}</h3>
              <ul className="entity-list">
                {ofType.map((template) => (
                  <li key={template.id}>
                    <button
                      aria-current={template.id === selected?.id ? 'true' : undefined}
                      className={`entity-list-item${template.id === selected?.id ? ' is-selected' : ''}`}
                      type="button"
                      onClick={() => onSelect(template.id)}
                    >
                      <span className={`entity-type-dot type-${type.toLowerCase()}`} aria-hidden="true" />
                      <span className="entity-list-name">{template.name}</span>
                      {current.defaults[type] === template.id && <span className="entity-list-flag">padrão</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {ofType.length === 0 && <p className="archive-empty">Nenhum modelo.</p>}
            </section>
          )
        })}
        {newType === null ? (
          <button className="button button-secondary button-small" type="button" onClick={() => setNewType(selected?.entityType ?? 'CHARACTER')}>
            + Novo modelo
          </button>
        ) : (
          <div className="wiki-new-template">
            <label>
              <span>Tipo</span>
              <select value={newType} onChange={(event) => setNewType(event.target.value as FactEntityType)}>
                {factEntityTypes.map((type) => (
                  <option key={type} value={type}>
                    {entityTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-primary button-small" type="button" onClick={() => addTemplate(newType, null)}>
              Criar em branco
            </button>
            <button className="text-button" type="button" onClick={() => setNewType(null)}>
              Cancelar
            </button>
          </div>
        )}
        {missingStarters.length > 0 && (
          <button className="text-button" type="button" onClick={() => change(restoreStarters)}>
            Restaurar modelos iniciais ({missingStarters.length})
          </button>
        )}
      </aside>

      <div className="entity-detail">
        {isDirty && (
          <div className="wiki-save-bar" role="status">
            <span>Alterações nos modelos ainda não salvas.</span>
            <button className="text-button" disabled={isSaving} type="button" onClick={() => window.confirm('Descartar as alterações nos modelos?') && setDraft(null)}>
              Descartar
            </button>
            <button className="button button-primary button-small" disabled={isSaving} type="button" onClick={() => void save()}>
              {isSaving ? 'Salvando…' : 'Salvar modelos'}
            </button>
          </div>
        )}
        {error && <p className="form-message">{error}</p>}

        {!selected ? (
          <section className="panel canon-empty">
            <strong>Nenhum modelo.</strong>
            <p>Crie um modelo ou restaure os modelos iniciais.</p>
          </section>
        ) : (
          <article className="entity-sheet wiki-template-editor" aria-label={`Modelo ${selected.name}`}>
            <header className="wiki-template-header">
              <p className="eyebrow">
                <span className={`entity-type-dot type-${selected.entityType.toLowerCase()}`} aria-hidden="true" />
                Modelo de {entityTypeLabel(selected.entityType).toLocaleLowerCase('pt-BR')}
              </p>
              <label>
                <span>Nome</span>
                <input value={selected.name} onChange={(event) => changeTemplate((template) => ({ ...template, name: event.target.value }))} />
              </label>
              <label>
                <span>Descrição</span>
                <input
                  value={selected.description}
                  onChange={(event) => changeTemplate((template) => ({ ...template, description: event.target.value }))}
                />
              </label>
              <div className="wiki-template-actions">
                <label className="wiki-checkbox">
                  <input
                    checked={current.defaults[selected.entityType] === selected.id}
                    disabled={current.defaults[selected.entityType] === selected.id}
                    type="checkbox"
                    onChange={() => change((value) => ({ ...value, defaults: { ...value.defaults, [selected.entityType]: selected.id } }))}
                  />
                  Padrão para novas fichas de {entityTypeLabel(selected.entityType).toLocaleLowerCase('pt-BR')}
                </label>
                <button className="text-button" type="button" onClick={() => addTemplate(selected.entityType, selected)}>
                  Duplicar
                </button>
                <button className="text-button destructive" type="button" onClick={() => deleteTemplate(selected)}>
                  Excluir modelo
                </button>
              </div>
            </header>

            {selected.sections.map((section, index) => (
              <SectionEditor
                choiceFields={selected.sections.flatMap((item) => item.fields).filter((field) => field.kind === 'choice')}
                isFirst={index === 0}
                isLast={index === selected.sections.length - 1}
                key={section.id}
                section={section}
                onChange={(update) => changeSection(section.id, update)}
                onMove={(delta) => changeTemplate((template) => ({ ...template, sections: move(template.sections, index, delta) }))}
                onRemove={() => {
                  if (!window.confirm(`Remover a seção “${section.title}” do modelo? O que já foi escrito nas fichas é mantido como “fora do modelo”.`)) return
                  changeTemplate((template) => ({ ...template, sections: template.sections.filter((item) => item.id !== section.id) }))
                }}
              />
            ))}
            <button
              className="button button-secondary button-small wiki-add-section"
              type="button"
              onClick={() => changeTemplate((template) => ({ ...template, sections: [...template.sections, newSection('Nova seção')] }))}
            >
              + Seção
            </button>
          </article>
        )}
      </div>
    </div>
  )
}

function SectionEditor({
  section,
  choiceFields,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  section: WikiSection
  choiceFields: WikiField[]
  isFirst: boolean
  isLast: boolean
  onChange: (update: (section: WikiSection) => WikiSection) => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const [openFieldId, setOpenFieldId] = useState<string | null>(null)

  function changeField(fieldId: string, update: (field: WikiField) => WikiField) {
    onChange((value) => ({ ...value, fields: value.fields.map((field) => (field.id === fieldId ? update(field) : field)) }))
  }

  return (
    <fieldset className="wiki-section-editor">
      <legend className="sr-only">{section.title || 'Seção sem título'}</legend>
      <div className="wiki-section-heading">
        <input
          aria-label="Título da seção"
          className="wiki-section-title-input"
          placeholder="Título da seção"
          value={section.title}
          onChange={(event) => onChange((value) => ({ ...value, title: event.target.value }))}
        />
        <div className="wiki-order-buttons">
          <button aria-label="Mover seção para cima" className="wiki-icon-button" disabled={isFirst} type="button" onClick={() => onMove(-1)}>
            <ArrowUpIcon />
          </button>
          <button aria-label="Mover seção para baixo" className="wiki-icon-button" disabled={isLast} type="button" onClick={() => onMove(1)}>
            <ArrowDownIcon />
          </button>
          <button className="text-button destructive" type="button" onClick={onRemove}>
            Remover
          </button>
        </div>
      </div>
      <label>
        <span>Orientação da seção</span>
        <textarea rows={2} value={section.guidance} onChange={(event) => onChange((value) => ({ ...value, guidance: event.target.value }))} />
      </label>
      <label>
        <span>Conteúdo do Arquivo</span>
        <select
          value={section.canon ?? ''}
          onChange={(event) => onChange((value) => ({ ...value, canon: (event.target.value || null) as WikiCanonView | null }))}
        >
          <option value="">Nenhum: só os campos abaixo</option>
          {(Object.keys(canonViewLabels) as WikiCanonView[]).map((view) => (
            <option key={view} value={view}>
              {canonViewLabels[view]}
            </option>
          ))}
        </select>
      </label>

      <ul className="wiki-template-fields">
        {section.fields.map((field, index) => (
          <li key={field.id}>
            <div className="wiki-template-field-row">
              <button
                aria-expanded={openFieldId === field.id}
                className="wiki-template-field-toggle"
                type="button"
                onClick={() => setOpenFieldId(openFieldId === field.id ? null : field.id)}
              >
                <strong>{field.label || 'Campo sem nome'}</strong>
                <span>{fieldKindLabels[field.kind]}</span>
              </button>
              <div className="wiki-order-buttons">
                <button
                  aria-label="Mover campo para cima"
                  className="wiki-icon-button"
                  disabled={index === 0}
                  type="button"
                  onClick={() => onChange((value) => ({ ...value, fields: move(value.fields, index, -1) }))}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  aria-label="Mover campo para baixo"
                  className="wiki-icon-button"
                  disabled={index === section.fields.length - 1}
                  type="button"
                  onClick={() => onChange((value) => ({ ...value, fields: move(value.fields, index, 1) }))}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  className="text-button destructive"
                  type="button"
                  onClick={() => onChange((value) => ({ ...value, fields: value.fields.filter((item) => item.id !== field.id) }))}
                >
                  Remover
                </button>
              </div>
            </div>
            {openFieldId === field.id && (
              <FieldEditor
                choiceFields={choiceFields.filter((item) => item.id !== field.id)}
                field={field}
                onChange={(update) => changeField(field.id, update)}
              />
            )}
          </li>
        ))}
      </ul>
      <button
        className="text-button wiki-add"
        type="button"
        onClick={() => {
          const field = newField('longtext', 'Novo campo')
          onChange((value) => ({ ...value, fields: [...value.fields, field] }))
          setOpenFieldId(field.id)
        }}
      >
        + Campo
      </button>
    </fieldset>
  )
}

function FieldEditor({
  field,
  choiceFields,
  onChange,
}: {
  field: WikiField
  choiceFields: WikiField[]
  onChange: (update: (field: WikiField) => WikiField) => void
}) {
  const dependsOn = choiceFields.find((item) => item.id === field.guidanceBy?.fieldId) ?? null

  return (
    <div className="wiki-field-settings">
      <div className="wiki-field-settings-row">
        <label>
          <span>Nome do campo</span>
          <input value={field.label} onChange={(event) => onChange((value) => ({ ...value, label: event.target.value }))} />
        </label>
        <label>
          <span>Tipo</span>
          <select value={field.kind} onChange={(event) => onChange((value) => ({ ...value, kind: event.target.value as WikiFieldKind }))}>
            {(Object.keys(fieldKindLabels) as WikiFieldKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {fieldKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span>Orientação</span>
        <textarea rows={2} value={field.guidance} onChange={(event) => onChange((value) => ({ ...value, guidance: event.target.value }))} />
      </label>

      {field.kind === 'choice' && (
        <div className="wiki-options">
          <span className="wiki-settings-label">Opções</span>
          {field.options.map((option) => (
            <div className="wiki-option-row" key={option.id}>
              <input
                aria-label="Nome da opção"
                placeholder="Opção"
                value={option.label}
                onChange={(event) =>
                  onChange((value) => ({
                    ...value,
                    options: value.options.map((item) => (item.id === option.id ? { ...item, label: event.target.value } : item)),
                  }))
                }
              />
              <input
                aria-label="Orientação da opção"
                placeholder="Orientação quando escolhida (opcional)"
                value={option.guidance}
                onChange={(event) =>
                  onChange((value) => ({
                    ...value,
                    options: value.options.map((item) => (item.id === option.id ? { ...item, guidance: event.target.value } : item)),
                  }))
                }
              />
              <button
                aria-label={`Remover a opção ${option.label}`}
                className="text-button"
                type="button"
                onClick={() => onChange((value) => ({ ...value, options: value.options.filter((item) => item.id !== option.id) }))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="text-button wiki-add"
            type="button"
            onClick={() => onChange((value) => ({ ...value, options: [...value.options, { id: newId(), label: '', guidance: '' }] }))}
          >
            + Opção
          </button>
        </div>
      )}

      {field.kind === 'entities' && (
        <div className="wiki-options">
          <span className="wiki-settings-label">Tipos que podem ser vinculados (nenhum marcado: qualquer um)</span>
          <div className="wiki-type-checks">
            {factEntityTypes.map((type) => (
              <label className="wiki-checkbox" key={type}>
                <input
                  checked={field.entityTypes.includes(type)}
                  type="checkbox"
                  onChange={(event) =>
                    onChange((value) => ({
                      ...value,
                      entityTypes: event.target.checked ? [...value.entityTypes, type] : value.entityTypes.filter((item) => item !== type),
                    }))
                  }
                />
                {entityTypeLabel(type)}
              </label>
            ))}
          </div>
          <label className="wiki-checkbox">
            <input checked={field.multiple} type="checkbox" onChange={(event) => onChange((value) => ({ ...value, multiple: event.target.checked }))} />
            Permitir várias
          </label>
        </div>
      )}

      {choiceFields.length > 0 && (
        <div className="wiki-options">
          <label>
            <span>Orientação extra conforme a resposta de</span>
            <select
              value={dependsOn?.id ?? ''}
              onChange={(event) =>
                onChange((value) => ({
                  ...value,
                  guidanceBy: event.target.value ? { fieldId: event.target.value, byOption: value.guidanceBy?.byOption ?? {} } : null,
                }))
              }
            >
              <option value="">Nenhum campo</option>
              {choiceFields.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {dependsOn?.options.map((option) => (
            <label key={option.id}>
              <span>Quando “{option.label}”</span>
              <input
                value={field.guidanceBy?.byOption[option.id] ?? ''}
                onChange={(event) =>
                  onChange((value) => ({
                    ...value,
                    guidanceBy: value.guidanceBy && {
                      ...value.guidanceBy,
                      byOption: { ...value.guidanceBy.byOption, [option.id]: event.target.value },
                    },
                  }))
                }
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
