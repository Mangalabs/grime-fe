/**
 * Wiki pages for the Arquivo's entities. A template (per entity type) lays
 * out sections and fields, each with guidance for the author; a page fills
 * it in and may add, hide or drop sections and fields of its own. Both are
 * encrypted in the browser like the scenes.
 */
import { factEntityTypes, type FactEntityType } from '../../api/contracts'
import { starterTemplates } from './starterTemplates'

// text, longtext: free text. choice: one option id. entities: Arquivo entity
// ids. list: one item per line.
export type WikiFieldKind = 'text' | 'longtext' | 'choice' | 'entities' | 'list'

export interface WikiChoiceOption {
  id: string
  label: string
  // Shown when the option is picked, e.g. what a negative arc implies.
  guidance: string
}

export interface WikiField {
  id: string
  label: string
  kind: WikiFieldKind
  guidance: string
  options: WikiChoiceOption[]
  // entities: the types that may be linked (empty: any type).
  entityTypes: FactEntityType[]
  multiple: boolean
  // Extra guidance that depends on the answer to a choice field of the same
  // template, e.g. what the Lie means in each kind of arc.
  guidanceBy: { fieldId: string; byOption: Record<string, string> } | null
}

// Live blocks filled from the Arquivo (scenes' facts), not by the author.
export type WikiCanonView = 'relations' | 'state'

export interface WikiSection {
  id: string
  title: string
  guidance: string
  canon: WikiCanonView | null
  fields: WikiField[]
}

export interface WikiTemplate {
  id: string
  name: string
  description: string
  entityType: FactEntityType
  sections: WikiSection[]
}

export interface WikiTemplateLibrary {
  version: 1
  templates: WikiTemplate[]
  // The template new pages of each type start from.
  defaults: Partial<Record<FactEntityType, string>>
}

// string for text, longtext and choice; string[] for entities and list.
export type WikiValue = string | string[]

export interface WikiPageEntry {
  // The field's label when it was saved, so the value stays readable if the
  // field leaves the template.
  label: string
  value: WikiValue
}

export interface WikiPage {
  version: 1
  templateId: string | null
  // One or two sentences about the entity: for synopses and promotion.
  summary: string
  values: Record<string, WikiPageEntry>
  // Sections only this page has.
  extraSections: WikiSection[]
  // Fields only this page has, by the template section they were added to.
  extraFields: Record<string, WikiField[]>
  hiddenSectionIds: string[]
  hiddenFieldIds: string[]
}

export const fieldKindLabels: Record<WikiFieldKind, string> = {
  text: 'Texto curto',
  longtext: 'Texto longo',
  choice: 'Escolha',
  entities: 'Entidades do Arquivo',
  list: 'Lista',
}

export const canonViewLabels: Record<WikiCanonView, string> = {
  relations: 'Relações do Arquivo',
  state: 'Estado no manuscrito',
}

export const newId = () => crypto.randomUUID()

export function newField(kind: WikiFieldKind = 'longtext', label = ''): WikiField {
  return {
    id: newId(),
    label,
    kind,
    guidance: '',
    options: [],
    entityTypes: [],
    multiple: true,
    guidanceBy: null,
  }
}

export function newSection(title = ''): WikiSection {
  return { id: newId(), title, guidance: '', canon: null, fields: [] }
}

export function emptyPage(templateId: string | null): WikiPage {
  return {
    version: 1,
    templateId,
    summary: '',
    values: {},
    extraSections: [],
    extraFields: {},
    hiddenSectionIds: [],
    hiddenFieldIds: [],
  }
}

// --- Normalising stored documents ---------------------------------------

const isEntityType = (value: unknown): value is FactEntityType =>
  factEntityTypes.includes(value as FactEntityType)

function normalizeField(value: Partial<WikiField>): WikiField {
  const base = newField(value.kind ?? 'longtext')
  return {
    ...base,
    ...value,
    id: value.id || base.id,
    options: (value.options ?? []).map((option) => ({ id: option.id || newId(), label: option.label ?? '', guidance: option.guidance ?? '' })),
    entityTypes: (value.entityTypes ?? []).filter(isEntityType),
    guidanceBy: value.guidanceBy?.fieldId ? { fieldId: value.guidanceBy.fieldId, byOption: value.guidanceBy.byOption ?? {} } : null,
  }
}

function normalizeSection(value: Partial<WikiSection>): WikiSection {
  return {
    ...newSection(),
    ...value,
    id: value.id || newId(),
    canon: value.canon === 'relations' || value.canon === 'state' ? value.canon : null,
    fields: (value.fields ?? []).map(normalizeField),
  }
}

function normalizeTemplate(value: Partial<WikiTemplate>): WikiTemplate | null {
  if (!value.id || !isEntityType(value.entityType)) return null
  return {
    id: value.id,
    name: value.name ?? 'Modelo sem nome',
    description: value.description ?? '',
    entityType: value.entityType,
    sections: (value.sections ?? []).map(normalizeSection),
  }
}

/** The built-in templates, used until the project saves its own. */
export function starterLibrary(): WikiTemplateLibrary {
  const templates = starterTemplates()
  const defaults: WikiTemplateLibrary['defaults'] = {}
  templates.forEach((template) => {
    defaults[template.entityType] ??= template.id
  })
  return { version: 1, templates, defaults }
}

export function normalizeLibrary(value: Partial<WikiTemplateLibrary> | null | undefined): WikiTemplateLibrary {
  if (!value) return starterLibrary()
  const templates = (value.templates ?? [])
    .map(normalizeTemplate)
    .filter((template): template is WikiTemplate => template !== null)
  const defaults: WikiTemplateLibrary['defaults'] = {}
  Object.entries(value.defaults ?? {}).forEach(([type, id]) => {
    if (isEntityType(type) && templates.some((template) => template.id === id && template.entityType === type)) {
      defaults[type] = id
    }
  })
  return { version: 1, templates, defaults }
}

/** Adds back the built-in templates the project removed or never had. */
export function restoreStarters(library: WikiTemplateLibrary): WikiTemplateLibrary {
  const existing = new Set(library.templates.map((template) => template.id))
  const missing = starterTemplates().filter((template) => !existing.has(template.id))
  const defaults = { ...library.defaults }
  missing.forEach((template) => {
    defaults[template.entityType] ??= template.id
  })
  return { ...library, templates: [...library.templates, ...missing], defaults }
}

export function normalizePage(value: Partial<WikiPage> | null | undefined): WikiPage {
  const base = emptyPage(value?.templateId ?? null)
  const extraFields: WikiPage['extraFields'] = {}
  Object.entries(value?.extraFields ?? {}).forEach(([sectionId, fields]) => {
    extraFields[sectionId] = (fields ?? []).map(normalizeField)
  })
  return {
    ...base,
    summary: value?.summary ?? '',
    values: value?.values ?? {},
    extraSections: (value?.extraSections ?? []).map(normalizeSection),
    extraFields,
    hiddenSectionIds: value?.hiddenSectionIds ?? [],
    hiddenFieldIds: value?.hiddenFieldIds ?? [],
  }
}

// --- Templates for a type -----------------------------------------------

export function templatesFor(library: WikiTemplateLibrary, type: string): WikiTemplate[] {
  return library.templates.filter((template) => template.entityType === type)
}

/** The page's template, else the type's default, else the first of the type. */
export function templateForPage(
  library: WikiTemplateLibrary,
  type: string,
  templateId: string | null,
): WikiTemplate | null {
  const ofType = templatesFor(library, type)
  return (
    ofType.find((template) => template.id === templateId) ??
    ofType.find((template) => template.id === library.defaults[type as FactEntityType]) ??
    ofType[0] ??
    null
  )
}

// --- Resolving a page against its template ------------------------------

export interface ResolvedSection {
  section: WikiSection
  // Only on this page (removable), as opposed to coming from the template.
  isExtra: boolean
  isHidden: boolean
  fields: Array<{ field: WikiField; isExtra: boolean; isHidden: boolean }>
}

export function resolveSections(template: WikiTemplate | null, page: WikiPage): ResolvedSection[] {
  const hiddenSections = new Set(page.hiddenSectionIds)
  const hiddenFields = new Set(page.hiddenFieldIds)
  const fromTemplate = (template?.sections ?? []).map((section) => ({
    section,
    isExtra: false,
    isHidden: hiddenSections.has(section.id),
    fields: [
      ...section.fields.map((field) => ({ field, isExtra: false, isHidden: hiddenFields.has(field.id) })),
      ...(page.extraFields[section.id] ?? []).map((field) => ({ field, isExtra: true, isHidden: false })),
    ],
  }))
  const extras = page.extraSections.map((section) => ({
    section,
    isExtra: true,
    isHidden: false,
    fields: section.fields.map((field) => ({ field, isExtra: true, isHidden: false })),
  }))
  return [...fromTemplate, ...extras]
}

export function isEmptyValue(value: WikiValue | undefined): boolean {
  if (value === undefined) return true
  return Array.isArray(value) ? value.every((item) => !item.trim()) : !value.trim()
}

/**
 * Filled values whose field is in neither the template nor the page: what is
 * left after switching templates or removing a field from one. Kept, never
 * dropped silently.
 */
export function orphanEntries(sections: ResolvedSection[], page: WikiPage): Array<[string, WikiPageEntry]> {
  const known = new Set(sections.flatMap((section) => section.fields.map(({ field }) => field.id)))
  return Object.entries(page.values).filter(([id, entry]) => !known.has(id) && !isEmptyValue(entry.value))
}

/** The field's guidance, plus what applies to the answer it depends on. */
export function fieldGuidance(field: WikiField, page: WikiPage): string[] {
  const parts = field.guidance ? [field.guidance] : []
  if (field.guidanceBy) {
    const answer = page.values[field.guidanceBy.fieldId]?.value
    const extra = typeof answer === 'string' ? field.guidanceBy.byOption[answer] : undefined
    if (extra) parts.push(extra)
  }
  return parts
}

/** Drops blank list items and empty values, and records each field's label. */
export function pageForSave(page: WikiPage, sections: ResolvedSection[]): WikiPage {
  const labels = new Map(sections.flatMap((section) => section.fields.map(({ field }) => [field.id, field.label] as const)))
  const values: WikiPage['values'] = {}
  Object.entries(page.values).forEach(([id, entry]) => {
    const value = Array.isArray(entry.value)
      ? entry.value.map((item) => item.trim()).filter(Boolean)
      : entry.value.trim()
    if (isEmptyValue(value)) return
    values[id] = { label: labels.get(id) ?? entry.label, value }
  })
  return { ...page, summary: page.summary.trim(), values }
}

/**
 * Folds another page (e.g. of a name merged into this entity) into this one.
 * Empty fields take the other's value; when both have text, the other's is
 * appended under its name, so nothing is lost.
 */
export function combinePages(target: WikiPage, source: WikiPage, sourceName: string): WikiPage {
  const values = { ...target.values }
  Object.entries(source.values).forEach(([id, entry]) => {
    const current = values[id]
    if (!current || isEmptyValue(current.value)) {
      values[id] = entry
    } else if (Array.isArray(current.value) && Array.isArray(entry.value)) {
      values[id] = { ...current, value: [...new Set([...current.value, ...entry.value])] }
    } else if (!Array.isArray(current.value) && !Array.isArray(entry.value) && current.value !== entry.value) {
      values[id] = { ...current, value: `${current.value}\n\n(De “${sourceName}”) ${entry.value}` }
    }
  })
  const extraFields = { ...target.extraFields }
  Object.entries(source.extraFields).forEach(([sectionId, fields]) => {
    const known = new Set((extraFields[sectionId] ?? []).map((field) => field.id))
    extraFields[sectionId] = [...(extraFields[sectionId] ?? []), ...fields.filter((field) => !known.has(field.id))]
  })
  const knownSections = new Set(target.extraSections.map((section) => section.id))
  return {
    ...target,
    summary: target.summary || source.summary,
    values,
    extraFields,
    extraSections: [...target.extraSections, ...source.extraSections.filter((section) => !knownSections.has(section.id))],
  }
}
