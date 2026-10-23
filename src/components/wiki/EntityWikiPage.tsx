import { useCallback, useEffect, useMemo, useState } from 'react'
import { entityStateAt, scenePositions, type ArchiveEntity } from '../../features/archive/entityModel'
import { relationsAt } from '../../features/archive/relations'
import { PageConflictError, type LoadedPage, type Wiki } from '../../features/wiki/useWiki'
import {
  combinePages,
  emptyPage,
  fieldGuidance,
  fieldKindLabels,
  isEmptyValue,
  newField,
  newSection,
  orphanEntries,
  pageForSave,
  resolveSections,
  templateForPage,
  templatesFor,
  type WikiCanonView,
  type WikiFieldKind,
  type WikiPage,
  type WikiValue,
} from '../../features/wiki/wikiModel'
import { WikiFieldEditor, WikiFieldValue } from './WikiField'
import './Wiki.css'

interface EntityWikiPageProps {
  entity: ArchiveEntity
  archive: ArchiveEntity[]
  wiki: Wiki
  startEditing?: boolean
  onSelectEntity: (entityId: string) => void
  onOpenScene: (slotId: string) => void
  onEditTemplate: (templateId: string) => void
  onDirtyChange: (isDirty: boolean) => void
}

const otherFieldsTitle = 'Outros campos'

/** The entity's wiki page: read like a wiki, edited against its template. */
export function EntityWikiPage({
  entity,
  archive,
  wiki,
  startEditing = false,
  onSelectEntity,
  onOpenScene,
  onEditTemplate,
  onDirtyChange,
}: EntityWikiPageProps) {
  const { library, loadPage, savePage, deletePage, pageIds } = wiki
  const [loaded, setLoaded] = useState<LoadedPage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<WikiPage | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Set when someone else saved while this draft was open.
  const [conflict, setConflict] = useState<LoadedPage | null>(null)
  const [showGuidance, setShowGuidance] = useState(true)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldKind, setNewFieldKind] = useState<WikiFieldKind>('longtext')
  const [newSectionTitle, setNewSectionTitle] = useState<string | null>(null)
  // The template a new page starts from; null: the type's default.
  const [startTemplateId, setStartTemplateId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await loadPage(entity.id)
      setLoaded(result)
      setLoadError(null)
      // A page with no template yet uses the type's default one.
      if (startEditing && !result.page) setDraft((current) => current ?? emptyPage(null))
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Não foi possível abrir a ficha.')
    }
  }, [entity.id, loadPage, startEditing])

  useEffect(() => {
    void Promise.resolve().then(reload)
  }, [reload])

  const ofType = library ? templatesFor(library, entity.type) : []
  const defaultTemplateId = library ? templateForPage(library, entity.type, null)?.id ?? null : null

  const isDirty = draft !== null
  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const page = draft ?? loaded?.page ?? null
  const template = library && page ? templateForPage(library, entity.type, page.templateId) : null
  const sections = useMemo(() => (page ? resolveSections(template, page) : []), [template, page])
  const orphans = page ? orphanEntries(sections, page) : []
  const aliasPages = entity.aliases.filter((alias) => pageIds.has(alias.id))

  if (!library) return wiki.error ? <p className="form-message">{wiki.error}</p> : <p className="empty-state">Carregando a ficha…</p>
  if (loadError) return <p className="form-message">{loadError}</p>
  if (!loaded) return <p className="empty-state">Carregando a ficha…</p>

  function update(change: (page: WikiPage) => WikiPage) {
    setDraft((current) => (current ? change(current) : current))
  }

  function setValue(fieldId: string, label: string, value: WikiValue) {
    update((current) => ({ ...current, values: { ...current.values, [fieldId]: { label, value } } }))
  }

  function dropValues(current: WikiPage, fieldIds: string[]): WikiPage['values'] {
    const values = { ...current.values }
    fieldIds.forEach((id) => delete values[id])
    return values
  }

  async function save(baseVersion = loaded?.version ?? null) {
    if (!draft) return
    setIsSaving(true)
    setSaveError(null)
    // The template is pinned, so a later change of the default doesn't move the page.
    const next = pageForSave({ ...draft, templateId: template?.id ?? null }, sections)
    try {
      const version = await savePage(entity.id, next, baseVersion)
      setLoaded({ page: next, version })
      setDraft(null)
      setConflict(null)
    } catch (reason) {
      if (reason instanceof PageConflictError) {
        setConflict(await loadPage(entity.id).catch(() => null))
      }
      setSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar a ficha.')
    } finally {
      setIsSaving(false)
    }
  }

  function discard() {
    if (draft && !window.confirm('Descartar as alterações desta ficha?')) return
    setDraft(null)
    setSaveError(null)
    setConflict(null)
  }

  async function combineWith(alias: { id: string; name: string }) {
    if (draft) return
    if (!window.confirm(`Trazer o conteúdo da ficha de “${alias.name}” para esta? Campos vazios recebem o valor dela; textos diferentes ficam um depois do outro.`)) {
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      const source = await loadPage(alias.id)
      if (source.page) {
        const base = loaded?.page ?? { ...emptyPage(source.page.templateId) }
        const combined = combinePages(base, source.page, alias.name)
        const version = await savePage(entity.id, combined, loaded?.version ?? null)
        setLoaded({ page: combined, version })
      }
      await deletePage(alias.id)
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Não foi possível combinar as fichas.')
    } finally {
      setIsSaving(false)
    }
  }

  function addField(sectionId: string, isExtraSection: boolean) {
    const label = newFieldLabel.trim()
    if (!label) return
    const field = newField(newFieldKind, label)
    update((current) =>
      isExtraSection
        ? {
            ...current,
            extraSections: current.extraSections.map((section) =>
              section.id === sectionId ? { ...section, fields: [...section.fields, field] } : section,
            ),
          }
        : {
            ...current,
            extraFields: { ...current.extraFields, [sectionId]: [...(current.extraFields[sectionId] ?? []), field] },
          },
    )
    setAddingTo(null)
    setNewFieldLabel('')
    setNewFieldKind('longtext')
  }

  function removeExtraField(sectionId: string, fieldId: string, isExtraSection: boolean) {
    if (!isEmptyValue(draft?.values[fieldId]?.value) && !window.confirm('Remover o campo e o que foi escrito nele?')) return
    update((current) => ({
      ...current,
      values: dropValues(current, [fieldId]),
      extraSections: isExtraSection
        ? current.extraSections.map((section) =>
            section.id === sectionId ? { ...section, fields: section.fields.filter((field) => field.id !== fieldId) } : section,
          )
        : current.extraSections,
      extraFields: isExtraSection
        ? current.extraFields
        : { ...current.extraFields, [sectionId]: (current.extraFields[sectionId] ?? []).filter((field) => field.id !== fieldId) },
    }))
  }

  function removeExtraSection(sectionId: string) {
    const section = draft?.extraSections.find((item) => item.id === sectionId)
    if (!section) return
    const fieldIds = section.fields.map((field) => field.id)
    if (fieldIds.some((id) => !isEmptyValue(draft?.values[id]?.value)) && !window.confirm(`Remover a seção “${section.title}” e o que foi escrito nela?`)) {
      return
    }
    update((current) => ({
      ...current,
      values: dropValues(current, fieldIds),
      extraSections: current.extraSections.filter((item) => item.id !== sectionId),
    }))
  }

  function keepOrphan(fieldId: string, label: string, value: WikiValue) {
    const field = { ...newField(Array.isArray(value) ? 'list' : 'longtext', label), id: fieldId }
    update((current) => {
      const existing = current.extraSections.find((section) => section.title === otherFieldsTitle)
      return {
        ...current,
        extraSections: existing
          ? current.extraSections.map((section) =>
              section.id === existing.id ? { ...section, fields: [...section.fields, field] } : section,
            )
          : [...current.extraSections, { ...newSection(otherFieldsTitle), fields: [field] }],
      }
    })
  }

  // --- No page yet --------------------------------------------------------

  if (!page) {
    return (
      <section className="wiki-empty">
        <strong>{entity.name} ainda não tem ficha.</strong>
        <p>
          A ficha reúne o que você planeja para {entity.name}, com orientações para cada campo. O que as cenas
          estabelecem continua na aba Cânone.
        </p>
        {ofType.length === 0 ? (
          <p className="panel-description">Não há modelo para este tipo. Crie um na aba Modelos.</p>
        ) : (
          <div className="wiki-empty-actions">
            {ofType.length > 1 && (
              <label>
                <span>Modelo</span>
                <select
                  value={startTemplateId ?? defaultTemplateId ?? ''}
                  onChange={(event) => setStartTemplateId(event.target.value)}
                >
                  {ofType.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="button button-primary"
              type="button"
              onClick={() => setDraft(emptyPage(startTemplateId ?? defaultTemplateId))}
            >
              Criar ficha
            </button>
          </div>
        )}
        {aliasPages.map((alias) => (
          <p className="wiki-notice" key={alias.id}>
            “{alias.name}” tem uma ficha.{' '}
            <button className="text-button" disabled={isSaving} type="button" onClick={() => void combineWith(alias)}>
              Usar como ficha de {entity.name}
            </button>
          </p>
        ))}
        {saveError && <p className="form-message">{saveError}</p>}
      </section>
    )
  }

  // --- Reading ------------------------------------------------------------

  if (!draft) {
    const visible = sections.filter((section) => !section.isHidden)
    const filled = (section: (typeof sections)[number]) =>
      section.fields.filter(({ field, isHidden }) => !isHidden && !isEmptyValue(page.values[field.id]?.value))
    const shown = visible.filter((section) => section.section.canon || filled(section).length > 0)
    const empty = visible.filter((section) => !section.section.canon && filled(section).length === 0)

    return (
      <div className="wiki-page">
        <div className="wiki-toolbar">
          <p className="wiki-template-name">
            Modelo: <strong>{template?.name ?? 'nenhum'}</strong>
            {template && (
              <button className="text-button" type="button" onClick={() => onEditTemplate(template.id)}>
                Editar modelo
              </button>
            )}
          </p>
          <button className="button button-secondary button-small" type="button" onClick={() => setDraft(structuredClone(page))}>
            Editar ficha
          </button>
        </div>
        {aliasPages.map((alias) => (
          <p className="wiki-notice" key={alias.id}>
            “{alias.name}”, unido a {entity.name}, tem uma ficha própria.{' '}
            <button className="text-button" disabled={isSaving} type="button" onClick={() => void combineWith(alias)}>
              Combinar com esta
            </button>
          </p>
        ))}
        {saveError && <p className="form-message">{saveError}</p>}
        {page.summary && <p className="wiki-summary">{page.summary}</p>}

        {shown.map((section) => (
          <section className="wiki-section" key={section.section.id} aria-labelledby={`wiki-${section.section.id}`}>
            <h3 className="entity-section-title" id={`wiki-${section.section.id}`}>
              {section.section.title || 'Seção sem título'}
            </h3>
            {section.section.canon && (
              <CanonBlock archive={archive} entity={entity} view={section.section.canon} onOpenScene={onOpenScene} onSelectEntity={onSelectEntity} />
            )}
            {filled(section).length > 0 && (
              <dl className="entity-state">
                {filled(section).map(({ field }) => (
                  <div className="entity-attribute" key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>
                      <WikiFieldValue archive={archive} field={field} value={page.values[field.id].value} onSelectEntity={onSelectEntity} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}

        {orphans.length > 0 && (
          <section className="wiki-section" aria-labelledby="wiki-orphans">
            <h3 className="entity-section-title" id="wiki-orphans">
              Fora do modelo
            </h3>
            <dl className="entity-state">
              {orphans.map(([id, entry]) => (
                <div className="entity-attribute" key={id}>
                  <dt>{entry.label}</dt>
                  <dd>
                    <WikiFieldValue archive={archive} field={null} value={entry.value} onSelectEntity={onSelectEntity} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {empty.length > 0 && (
          <p className="wiki-empty-sections">
            Ainda sem conteúdo: {empty.map((section) => section.section.title || 'Seção sem título').join(', ')}.{' '}
            <button className="text-button" type="button" onClick={() => setDraft(structuredClone(page))}>
              Preencher
            </button>
          </p>
        )}
      </div>
    )
  }

  // --- Editing ------------------------------------------------------------

  const hiddenSections = sections.filter((section) => section.isHidden)

  return (
    <form
      className="wiki-page is-editing"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="wiki-toolbar">
        <label className="wiki-template-picker">
          <span>Modelo</span>
          <select value={template?.id ?? ''} onChange={(event) => update((current) => ({ ...current, templateId: event.target.value || null }))}>
            {ofType.length === 0 && <option value="">Nenhum</option>}
            {ofType.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="switch">
          <input checked={showGuidance} role="switch" type="checkbox" onChange={(event) => setShowGuidance(event.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          Orientações
        </label>
        <div className="wiki-toolbar-actions">
          <button className="text-button" disabled={isSaving} type="button" onClick={discard}>
            Descartar
          </button>
          <button className="button button-primary button-small" disabled={isSaving} type="submit">
            {isSaving ? 'Salvando…' : 'Salvar ficha'}
          </button>
        </div>
      </div>
      {saveError && (
        <div className="form-message" role="alert">
          <p>{saveError}</p>
          {conflict && (
            <p className="wiki-conflict-actions">
              <button className="text-button" type="button" onClick={() => void save(conflict.version)}>
                Salvar a minha versão por cima
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setLoaded(conflict)
                  setDraft(null)
                  setConflict(null)
                  setSaveError(null)
                }}
              >
                Descartar a minha e ver a atual
              </button>
            </p>
          )}
        </div>
      )}

      <label className="wiki-summary-editor">
        <span>Resumo</span>
        {showGuidance && (
          <small className="wiki-guidance">Uma ou duas frases sobre {entity.name}. Servem para sinopses e material de divulgação.</small>
        )}
        <textarea rows={2} value={draft.summary} onChange={(event) => update((current) => ({ ...current, summary: event.target.value }))} />
      </label>

      {sections
        .filter((section) => !section.isHidden)
        .map(({ section, isExtra, fields }) => (
          <fieldset className="wiki-section-editor" key={section.id}>
            <legend className="sr-only">{section.title || 'Seção sem título'}</legend>
            <div className="wiki-section-heading">
              {isExtra ? (
                <input
                  aria-label="Título da seção"
                  className="wiki-section-title-input"
                  placeholder="Título da seção"
                  value={section.title}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      extraSections: current.extraSections.map((item) => (item.id === section.id ? { ...item, title: event.target.value } : item)),
                    }))
                  }
                />
              ) : (
                <h3 className="entity-section-title">{section.title || 'Seção sem título'}</h3>
              )}
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  isExtra
                    ? removeExtraSection(section.id)
                    : update((current) => ({ ...current, hiddenSectionIds: [...current.hiddenSectionIds, section.id] }))
                }
              >
                {isExtra ? 'Remover seção' : 'Ocultar nesta ficha'}
              </button>
            </div>
            {showGuidance && section.guidance && <p className="wiki-guidance">{section.guidance}</p>}
            {section.canon && <p className="wiki-canon-note">Preenchida pelo Arquivo a partir das cenas analisadas.</p>}

            {fields
              .filter(({ isHidden }) => !isHidden)
              .map(({ field, isExtra: isExtraField }) => (
                <WikiFieldEditor
                  archive={archive}
                  field={field}
                  guidance={fieldGuidance(field, draft)}
                  key={field.id}
                  removeLabel={isExtraField ? 'Remover' : 'Ocultar'}
                  selfId={entity.id}
                  showGuidance={showGuidance}
                  value={draft.values[field.id]?.value}
                  onChange={(value) => setValue(field.id, field.label, value)}
                  onRemove={() =>
                    isExtraField
                      ? removeExtraField(section.id, field.id, isExtra)
                      : update((current) => ({ ...current, hiddenFieldIds: [...current.hiddenFieldIds, field.id] }))
                  }
                />
              ))}

            {fields.some(({ isHidden }) => isHidden) && (
              <p className="wiki-hidden-list">
                Ocultos nesta ficha:{' '}
                {fields
                  .filter(({ isHidden }) => isHidden)
                  .map(({ field }) => (
                    <button
                      className="archive-chip"
                      key={field.id}
                      title="Mostrar de novo"
                      type="button"
                      onClick={() => update((current) => ({ ...current, hiddenFieldIds: current.hiddenFieldIds.filter((id) => id !== field.id) }))}
                    >
                      {field.label} +
                    </button>
                  ))}
              </p>
            )}

            {addingTo === section.id ? (
              <div className="wiki-add-field">
                <input
                  autoFocus
                  aria-label="Nome do campo"
                  placeholder="Nome do campo"
                  value={newFieldLabel}
                  onChange={(event) => setNewFieldLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addField(section.id, isExtra)
                    }
                    if (event.key === 'Escape') setAddingTo(null)
                  }}
                />
                <select aria-label="Tipo do campo" value={newFieldKind} onChange={(event) => setNewFieldKind(event.target.value as WikiFieldKind)}>
                  {(['text', 'longtext', 'list', 'entities'] as const).map((kind) => (
                    <option key={kind} value={kind}>
                      {fieldKindLabels[kind]}
                    </option>
                  ))}
                </select>
                <button className="button button-secondary button-small" disabled={!newFieldLabel.trim()} type="button" onClick={() => addField(section.id, isExtra)}>
                  Adicionar
                </button>
                <button className="text-button" type="button" onClick={() => setAddingTo(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button className="text-button wiki-add" type="button" onClick={() => setAddingTo(section.id)}>
                + Campo nesta ficha
              </button>
            )}
          </fieldset>
        ))}

      {orphans.length > 0 && (
        <fieldset className="wiki-section-editor">
          <legend className="sr-only">Fora do modelo</legend>
          <h3 className="entity-section-title">Fora do modelo</h3>
          <p className="wiki-guidance">
            Valores de campos que não estão no modelo atual (por troca de modelo ou campo removido dele).
          </p>
          <ul className="wiki-orphans">
            {orphans.map(([id, entry]) => (
              <li key={id}>
                <div>
                  <strong>{entry.label}</strong>
                  <WikiFieldValue archive={archive} field={null} value={entry.value} onSelectEntity={onSelectEntity} />
                </div>
                <div className="wiki-orphan-actions">
                  <button className="text-button" type="button" onClick={() => keepOrphan(id, entry.label, entry.value)}>
                    Manter nesta ficha
                  </button>
                  <button
                    className="text-button destructive"
                    type="button"
                    onClick={() => update((current) => ({ ...current, values: dropValues(current, [id]) }))}
                  >
                    Apagar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div className="wiki-edit-footer">
        {newSectionTitle === null ? (
          <button className="button button-secondary button-small" type="button" onClick={() => setNewSectionTitle('')}>
            + Seção nesta ficha
          </button>
        ) : (
          <div className="wiki-add-field">
            <input
              autoFocus
              aria-label="Título da nova seção"
              placeholder="Título da seção"
              value={newSectionTitle}
              onChange={(event) => setNewSectionTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setNewSectionTitle(null)
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (!newSectionTitle.trim()) return
                  const section = newSection(newSectionTitle.trim())
                  update((current) => ({ ...current, extraSections: [...current.extraSections, section] }))
                  setNewSectionTitle(null)
                  setAddingTo(section.id)
                }
              }}
            />
            <button
              className="button button-secondary button-small"
              disabled={!newSectionTitle.trim()}
              type="button"
              onClick={() => {
                const section = newSection(newSectionTitle.trim())
                update((current) => ({ ...current, extraSections: [...current.extraSections, section] }))
                setNewSectionTitle(null)
                setAddingTo(section.id)
              }}
            >
              Adicionar
            </button>
            <button className="text-button" type="button" onClick={() => setNewSectionTitle(null)}>
              Cancelar
            </button>
          </div>
        )}
        {hiddenSections.length > 0 && (
          <p className="wiki-hidden-list">
            Seções ocultas nesta ficha:{' '}
            {hiddenSections.map(({ section }) => (
              <button
                className="archive-chip"
                key={section.id}
                title="Mostrar de novo"
                type="button"
                onClick={() => update((current) => ({ ...current, hiddenSectionIds: current.hiddenSectionIds.filter((id) => id !== section.id) }))}
              >
                {section.title} +
              </button>
            ))}
          </p>
        )}
      </div>
    </form>
  )
}

/** What the analysed scenes say about the entity, read-only. */
function CanonBlock({
  archive,
  entity,
  view,
  onOpenScene,
  onSelectEntity,
}: {
  archive: ArchiveEntity[]
  entity: ArchiveEntity
  view: WikiCanonView
  onOpenScene: (slotId: string) => void
  onSelectEntity: (entityId: string) => void
}) {
  const relations = useMemo(() => (view === 'relations' ? relationsAt(archive, null) : []), [archive, view])
  const states = useMemo(() => (view === 'state' ? entityStateAt(entity, null) : []), [entity, view])
  const byId = useMemo(() => new Map(archive.map((item) => [item.id, item])), [archive])

  if (view === 'relations') {
    const own = relations.filter((relation) => relation.sourceId === entity.id || relation.targetId === entity.id)
    if (own.length === 0) return <p className="wiki-canon-empty">Nenhuma relação nas cenas ainda.</p>
    return (
      <ul className="entity-relations">
        {own.map((relation) => {
          const isOutgoing = relation.sourceId === entity.id
          const other = byId.get(isOutgoing ? relation.targetId : relation.sourceId)
          return (
            <li key={relation.id}>
              <span className="relation-direction">{isOutgoing ? `${relation.label} →` : `← ${relation.label} de`}</span>
              {other && (
                <button className="facts-entity" type="button" onClick={() => onSelectEntity(other.id)}>
                  <span className={`entity-type-dot type-${other.type.toLowerCase()}`} aria-hidden="true" />
                  {other.name}
                </button>
              )}
              <span className="relation-detail">“{relation.fact.value}”</span>
            </li>
          )
        })}
      </ul>
    )
  }

  const positions = scenePositions(entity)
  const first = entity.facts.find((fact) => fact.position === positions[0])
  const last = entity.facts.findLast((fact) => fact.position === positions.at(-1))
  if (states.length === 0) return <p className="wiki-canon-empty">Nenhum fato de {entity.name} nas cenas da timeline ainda.</p>
  return (
    <>
      <p className="wiki-canon-summary">
        Aparece em {positions.length} {positions.length === 1 ? 'cena' : 'cenas'} da timeline
        {first && (
          <>
            {' · primeira: '}
            <button className="inline-link" type="button" onClick={() => onOpenScene(first.slot.id)}>
              Cena {positions[0] + 1}
            </button>
          </>
        )}
        {last && positions.length > 1 && (
          <>
            {' · última: '}
            <button className="inline-link" type="button" onClick={() => onOpenScene(last.slot.id)}>
              Cena {(positions.at(-1) ?? 0) + 1}
            </button>
          </>
        )}
      </p>
      <dl className="entity-state wiki-canon-state">
        {states.map((state) => (
          <div className="entity-attribute" key={state.key}>
            <dt>{state.label}</dt>
            <dd>
              {state.current.length === 0 ? (
                <p className="entity-value is-empty">Sem valor ativo</p>
              ) : (
                state.current.map((fact) => (
                  <p className="entity-value" key={fact.id}>
                    {fact.value}
                    {fact.isSubjective && <span className="entity-tag">segundo {fact.sourceClaim ?? 'alguém'}</span>}
                  </p>
                ))
              )}
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
}
