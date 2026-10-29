import { normalizeForSearch } from '../scenes/sceneStatus'
import type { WikiPage } from '../wiki/wikiModel'
import { entityBonds, type BondKind } from './bonds'
import type { ArchiveEntity, ArchiveFact } from './entityModel'

/**
 * The author's page for a character next to what the text records. Only
 * fields with a counterpart in the canon are compared; the comparison shows
 * both sides and flags what the text never records, it doesn't judge.
 */

// Page field → canon attributes that speak to it.
const counterparts: Record<string, string[]> = {
  goal: ['objetivo'],
  appearance: ['aparencia'],
  distinguishing_marks: ['aparencia'],
  clothing: ['aparencia'],
  occupation: ['profissao', 'cargo'],
  origin: ['origem'],
}

export interface PlannedRow {
  fieldId: string
  label: string
  planned: string
  written: ArchiveFact[]
}

export interface PlannedRelation {
  entity: ArchiveEntity
  kinds: BondKind[]
  scenes: number
}

export interface PlannedVsWritten {
  rows: PlannedRow[]
  relations: { planned: string; mentioned: PlannedRelation[] } | null
}

const asText = (value: string | string[] | undefined) => (Array.isArray(value) ? value.join('\n') : (value ?? '')).trim()

function mentions(text: string, name: string): boolean {
  const needle = normalizeForSearch(name)
  if (needle.length < 3) return false
  return new RegExp(`(^|[^\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(text)
}

export function plannedVsWritten(page: WikiPage, archive: ArchiveEntity[], entity: ArchiveEntity): PlannedVsWritten {
  const active = entity.facts.filter((fact) => fact.isActive)
  const rows: PlannedRow[] = []
  for (const [fieldId, attributes] of Object.entries(counterparts)) {
    const entry = page.values[fieldId]
    const planned = asText(entry?.value)
    if (!planned) continue
    rows.push({
      fieldId,
      label: entry.label,
      planned,
      written: active
        .filter((fact) => attributes.includes(fact.attributeKey))
        .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)),
    })
  }

  const relationsText = asText(page.values.planned_relations?.value)
  let relations: PlannedVsWritten['relations'] = null
  if (relationsText) {
    const folded = normalizeForSearch(relationsText)
    const bonds = entityBonds(archive, entity.id, null)
    const bondOf = new Map([...bonds.people, ...bonds.groups].map((bond) => [bond.otherId, bond]))
    const mentioned = archive
      .filter((other) => other.id !== entity.id && (other.type === 'CHARACTER' || other.type === 'FACTION'))
      .filter((other) => [other.name, ...other.aliases.map((alias) => alias.name)].some((name) => mentions(folded, name)))
      .map((other) => {
        const bond = bondOf.get(other.id)
        return {
          entity: other,
          kinds: bond?.kinds ?? [],
          scenes: bond ? new Set(bond.entries.map((entry) => entry.fact.slot.id)).size : 0,
        }
      })
    relations = { planned: relationsText, mentioned }
  }

  return { rows, relations }
}
