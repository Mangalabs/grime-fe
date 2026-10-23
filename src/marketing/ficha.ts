import type { ArchiveEntity } from '../features/archive/entityModel'
import {
  isEmptyValue,
  resolveSections,
  templateForPage,
  type WikiField,
  type WikiPage,
  type WikiTemplateLibrary,
  type WikiValue,
} from '../features/wiki/wikiModel'

export interface FichaSection {
  id: string
  title: string
  fields: Array<{ field: WikiField; value: WikiValue }>
}

/** The ficha's visible sections, with only their filled, visible fields. */
export function fichaSections(
  library: WikiTemplateLibrary,
  entity: ArchiveEntity,
  page: WikiPage,
): FichaSection[] {
  const template = templateForPage(library, entity.type, page.templateId)
  return resolveSections(template, page)
    .filter((resolved) => !resolved.isHidden)
    .map(({ section, fields }) => ({
      id: section.id,
      title: section.title,
      fields: fields.flatMap(({ field, isHidden }) => {
        const value = page.values[field.id]?.value
        return isHidden || isEmptyValue(value) ? [] : [{ field, value: value! }]
      }),
    }))
    .filter((section) => section.fields.length > 0)
}

export interface ShownValue {
  value: WikiValue
  // For entity fields: the entities the value names, in the same order.
  entityIds?: string[]
}

/**
 * A field's value as a reader sees it: choices become their labels, and entity
 * fields keep only the entities in `names` (the others are left out entirely).
 */
export function shownValue(field: WikiField, value: WikiValue, names: Map<string, string>): ShownValue | null {
  if (field.kind === 'choice') {
    const id = Array.isArray(value) ? value[0] : value
    return { value: field.options.find((option) => option.id === id)?.label ?? id }
  }
  if (field.kind === 'entities') {
    const entityIds = (Array.isArray(value) ? value : [value]).filter((id) => names.has(id))
    return entityIds.length ? { value: entityIds.map((id) => names.get(id)!), entityIds } : null
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => item.trim()).filter(Boolean)
    return items.length ? { value: items } : null
  }
  return value.trim() ? { value: value.trim() } : null
}
