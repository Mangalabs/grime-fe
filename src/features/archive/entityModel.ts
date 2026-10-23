import type {
  FactEntityType,
  ProjectEntity,
  ProjectFact,
  Slot,
} from '../../api/contracts'
import { normalizeForSearch } from '../scenes/sceneStatus'
import { attributeLabel, canonicalAttribute, compareAttributes } from './attributes'

export const entityTypeLabels: Record<FactEntityType, string> = {
  CHARACTER: 'Personagem',
  LOCATION: 'Local',
  ITEM: 'Item',
  FACTION: 'Facção',
  WORLD_RULE: 'Regra do mundo',
  EVENT: 'Evento',
}

export function entityTypeLabel(type: string): string {
  return entityTypeLabels[type as FactEntityType] ?? type
}

export interface ArchiveFact extends ProjectFact {
  attributeKey: string
  // Timeline position of the fact's scene; null for unanchored scenes.
  position: number | null
  // Canonical id of the entity the value refers to, when the fact is a relation.
  targetId: string | null
}

/** A canonical entity together with its aliases and all their facts. */
export interface ArchiveEntity {
  id: string
  name: string
  type: string
  aliases: Array<{ id: string; name: string }>
  facts: ArchiveFact[]
}

function chronological(a: ArchiveFact, b: ArchiveFact): number {
  if (a.position === null || b.position === null) {
    return a.position === null ? (b.position === null ? 0 : 1) : -1
  }
  return a.position - b.position
}

/**
 * Groups facts under their canonical entities. Scene positions come from the
 * live `slots` list, so reordering scenes immediately changes what
 * "as of scene N" means — histories and relations follow the new order.
 */
export function buildArchive(
  entities: ProjectEntity[],
  facts: ProjectFact[],
  slots: Slot[],
): ArchiveEntity[] {
  const liveSlots = new Map(slots.map((slot) => [slot.id, slot]))
  const canonical = entities.filter((entity) => !entity.canonicalId)
  const canonicalIdOf = new Map<string, string>()
  entities.forEach((entity) =>
    canonicalIdOf.set(entity.id, entity.canonicalId ?? entity.id),
  )

  const factsByEntity = new Map<string, ArchiveFact[]>()
  facts.forEach((fact) => {
    const ownerId =
      fact.entity.canonical?.id ?? canonicalIdOf.get(fact.entity.id) ?? fact.entity.id
    const list = factsByEntity.get(ownerId) ?? []
    const slot = { ...fact.slot, ...liveSlots.get(fact.slot.id) }
    list.push({
      ...fact,
      slot,
      attributeKey: canonicalAttribute(fact.attribute),
      position:
        slot.isUnanchored || slot.timelinePosition === null
          ? null
          : slot.timelinePosition,
      targetId: fact.targetEntity
        ? fact.targetEntity.canonicalId ??
          canonicalIdOf.get(fact.targetEntity.id) ??
          fact.targetEntity.id
        : null,
    })
    factsByEntity.set(ownerId, list)
  })

  return canonical
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      aliases: entity.aliases,
      facts: (factsByEntity.get(entity.id) ?? []).sort(chronological),
    }))
    .sort(
      (a, b) =>
        b.facts.length - a.facts.length || a.name.localeCompare(b.name, 'pt-BR'),
    )
}

export interface AttributeState {
  key: string
  label: string
  // Facts from the latest scene (up to the cursor) that set this attribute.
  current: ArchiveFact[]
  // Every timeline fact for the attribute up to the cursor, oldest first.
  history: ArchiveFact[]
  changedAtCursor: boolean
}

/**
 * What an entity looks like as of a timeline position (inclusive), or as of
 * the end of the timeline when `upTo` is null. Replaced (inactive) facts stay
 * in the history but never count as the current value.
 */
export function entityStateAt(
  entity: ArchiveEntity,
  upTo: number | null,
): AttributeState[] {
  const byKey = new Map<string, ArchiveFact[]>()
  entity.facts
    .filter((fact) => fact.position !== null && (upTo === null || fact.position <= upTo))
    .forEach((fact) => {
      const list = byKey.get(fact.attributeKey) ?? []
      list.push(fact)
      byKey.set(fact.attributeKey, list)
    })

  return [...byKey.entries()]
    .map(([key, history]) => {
      const active = history.filter((fact) => fact.isActive)
      const latestPosition = active.at(-1)?.position ?? null
      const current = active.filter((fact) => fact.position === latestPosition)
      return {
        key,
        label: attributeLabel(key),
        current,
        history,
        changedAtCursor: upTo !== null && latestPosition === upTo,
      }
    })
    .filter((state) => state.current.length > 0 || state.history.length > 0)
    .sort((a, b) => compareAttributes(a.key, b.key))
}

export function looseFacts(entity: ArchiveEntity): ArchiveFact[] {
  return entity.facts.filter((fact) => fact.position === null)
}

export function scenePositions(entity: ArchiveEntity): number[] {
  return [
    ...new Set(
      entity.facts
        .map((fact) => fact.position)
        .filter((position): position is number => position !== null),
    ),
  ].sort((a, b) => a - b)
}

export interface DuplicateHint {
  other: ArchiveEntity
  // Same type and one name starts the other: probably the same entity.
  // Same name but another type: worth a look, but cannot be merged.
  kind: 'likely' | 'other-type'
}

function nameWords(name: string): string[] {
  return normalizeForSearch(name).split(/\s+/).filter(Boolean)
}

function startsWithWords(longer: string[], shorter: string[]): boolean {
  return shorter.length > 0 && shorter.every((word, index) => longer[index] === word)
}

export function findDuplicateHints(
  entities: ArchiveEntity[],
): Map<string, DuplicateHint[]> {
  const hints = new Map<string, DuplicateHint[]>()
  const add = (entity: ArchiveEntity, hint: DuplicateHint) => {
    hints.set(entity.id, [...(hints.get(entity.id) ?? []), hint])
  }

  entities.forEach((a, index) => {
    entities.slice(index + 1).forEach((b) => {
      const wordsA = nameWords(a.name)
      const wordsB = nameWords(b.name)
      const sameName = wordsA.join(' ') === wordsB.join(' ')
      const prefixMatch =
        startsWithWords(wordsA, wordsB) || startsWithWords(wordsB, wordsA)
      if (a.type === b.type && (sameName || prefixMatch)) {
        add(a, { other: b, kind: 'likely' })
        add(b, { other: a, kind: 'likely' })
      } else if (a.type !== b.type && sameName) {
        add(a, { other: b, kind: 'other-type' })
        add(b, { other: a, kind: 'other-type' })
      }
    })
  })
  return hints
}
