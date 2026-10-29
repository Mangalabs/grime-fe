import { normalizeForSearch } from '../scenes/sceneStatus'
import { attributeLabel } from './attributes'
import type { ArchiveEntity, ArchiveFact } from './entityModel'

/**
 * What kind of bond a relation fact describes, for reading the archive as a
 * person would: "romance com Olivia", not "relacao → Olivia". New facts carry
 * the kind the Arquivista gave; older ones are read from their wording.
 */
export type BondKind = 'FAMILY' | 'ROMANCE' | 'FRIENDSHIP' | 'RIVALRY' | 'ALLIANCE' | 'HIERARCHY' | 'DEBT' | 'KNOWLEDGE' | 'OTHER'

export const bondKinds: BondKind[] = ['FAMILY', 'ROMANCE', 'FRIENDSHIP', 'RIVALRY', 'ALLIANCE', 'HIERARCHY', 'DEBT', 'KNOWLEDGE', 'OTHER']

export const bondLabels: Record<BondKind, string> = {
  FAMILY: 'família',
  ROMANCE: 'romance',
  FRIENDSHIP: 'amizade',
  RIVALRY: 'rivalidade',
  ALLIANCE: 'aliança',
  HIERARCHY: 'hierarquia',
  DEBT: 'dívida',
  KNOWLEDGE: 'sabe sobre',
  OTHER: 'relação',
}

// Kinds that only make sense between people or groups.
const bondTargets = new Set(['CHARACTER', 'FACTION'])

const byAttribute: Record<string, BondKind> = {
  familia: 'FAMILY',
  lealdade: 'ALLIANCE',
  cargo: 'HIERARCHY',
  conhecimento: 'KNOWLEDGE',
}

// Checked in order: the first that matches the wording wins.
const byWording: Array<[BondKind, RegExp]> = [
  ['ROMANCE', /\b(namor|apaixon|amor|ama\b|amad|beij|romant|noiv|paquer|flert|interesse amoroso|caso com|corteja)/],
  ['FAMILY', /\b(pai|mae|filh|irma|tio|tia|prim|avo|neto|neta|sobrinh|espos|marido|parente|entead|padrast|madrast|sogr|cunhad|familia)/],
  ['RIVALRY', /\b(rival|inimig|odei|odio|detest|desafet|adversari|vingan|ameac|hostil|despreza|humilh|derrot|combate contra)/],
  ['DEBT', /\b(dev[ea] (um |uma )?favor|devia (um |uma )?favor|divida|prometeu|promessa|deve a\b|deve ao\b)/],
  ['HIERARCHY', /\b(mestre|aprendiz|professor|alun|servo|serva|criad|chefe|subordin|empregad|patra|tutor|mentor|comandante|soldado|superior|discipul|protegid|apadrinhad|trabalh\w* para|a servico)/],
  ['FRIENDSHIP', /\b(amig|companheir|confidente|parceir)/],
  ['ALLIANCE', /\b(alia|leal|membro|pertence|juramento|unidade)/],
  ['KNOWLEDGE', /\b(sabe|descobr|segredo|conhece|revelou|contou)/],
]

/** The kind of a relation fact, or null when it isn't a bond between people or groups. */
export function bondKind(fact: ArchiveFact, targetType: string | undefined): BondKind | null {
  if (!targetType || !bondTargets.has(targetType)) return null
  if (fact.relationKind && (bondKinds as string[]).includes(fact.relationKind)) return fact.relationKind as BondKind
  const fromAttribute = byAttribute[fact.attributeKey]
  if (fromAttribute) return fromAttribute
  const wording = normalizeForSearch(fact.value)
  return byWording.find(([, pattern]) => pattern.test(wording))?.[0] ?? 'OTHER'
}

/** One fact of a bond, from either side. */
export interface BondEntry {
  fact: ArchiveFact
  kind: BondKind | null
  // True when this entity's own fact points at the other; false when the other's fact points here.
  outgoing: boolean
}

/** Everything between this entity and one other, in timeline order. */
export interface Bond {
  otherId: string
  otherType: string
  kinds: BondKind[]
  entries: BondEntry[]
  latest: BondEntry
}

export interface EntityBonds {
  people: Bond[]
  groups: Bond[]
  // Places, belongings, events…: by attribute label.
  others: Array<{ label: string; items: Array<{ otherId: string; facts: ArchiveFact[] }> }>
}

const inTime = (fact: ArchiveFact, upTo: number | null) =>
  fact.isActive && (upTo === null || (fact.position !== null && fact.position <= upTo))

function chronological(a: BondEntry, b: BondEntry): number {
  const pa = a.fact.position ?? Number.MAX_SAFE_INTEGER
  const pb = b.fact.position ?? Number.MAX_SAFE_INTEGER
  return pa - pb
}

/**
 * The entity's bonds as of a timeline position (or the whole book): people
 * and groups with their kinds and history, other links grouped by attribute.
 */
export function entityBonds(archive: ArchiveEntity[], entityId: string, upTo: number | null): EntityBonds {
  const byId = new Map(archive.map((entity) => [entity.id, entity]))
  const self = byId.get(entityId)
  const bonds = new Map<string, BondEntry[]>()
  const others = new Map<string, Map<string, ArchiveFact[]>>()

  const add = (otherId: string, entry: BondEntry) => bonds.set(otherId, [...(bonds.get(otherId) ?? []), entry])

  for (const fact of self?.facts ?? []) {
    if (!fact.targetId || fact.targetId === entityId || !inTime(fact, upTo)) continue
    const target = byId.get(fact.targetId)
    if (!target) continue
    const kind = bondKind(fact, target.type)
    if (kind) {
      add(target.id, { fact, kind, outgoing: true })
    } else {
      // Over the whole book, the current place reads as a list of places visited.
      const label = fact.attributeKey === 'local_atual' ? 'Esteve em' : attributeLabel(fact.attribute)
      const group = others.get(label) ?? new Map<string, ArchiveFact[]>()
      group.set(target.id, [...(group.get(target.id) ?? []), fact])
      others.set(label, group)
    }
  }
  for (const other of archive) {
    if (other.id === entityId || !bondTargets.has(other.type)) continue
    for (const fact of other.facts) {
      if (fact.targetId !== entityId || !inTime(fact, upTo)) continue
      add(other.id, { fact, kind: bondKind(fact, self?.type), outgoing: false })
    }
  }

  const all = [...bonds.entries()].map(([otherId, entries]): Bond => {
    const sorted = [...entries].sort(chronological)
    const kinds = bondKinds.filter((kind) => sorted.some((entry) => entry.kind === kind))
    return {
      otherId,
      otherType: byId.get(otherId)?.type ?? '',
      // "relação" only when nothing more specific was found.
      kinds: kinds.length > 1 ? kinds.filter((kind) => kind !== 'OTHER') : kinds,
      entries: sorted,
      latest: sorted.at(-1)!,
    }
  })
  const byWeight = (a: Bond, b: Bond) =>
    b.entries.length - a.entries.length || (byId.get(a.otherId)?.name ?? '').localeCompare(byId.get(b.otherId)?.name ?? '')

  return {
    people: all.filter((bond) => bond.otherType === 'CHARACTER').sort(byWeight),
    groups: all.filter((bond) => bond.otherType === 'FACTION').sort(byWeight),
    others: [...others.entries()]
      .map(([label, items]) => ({ label, items: [...items.entries()].map(([otherId, facts]) => ({ otherId, facts })) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  }
}
