import { normalizeForSearch } from '../scenes/sceneStatus'
import { attributeLabel } from './attributes'
import type { ArchiveEntity, ArchiveFact } from './entityModel'

/** A directed relation: `source` → `target`, described by one fact. */
export interface Relation {
  id: string
  sourceId: string
  targetId: string
  label: string
  fact: ArchiveFact
}

// Attributes with one value at a time: a newer fact replaces the older
// relation even when it points elsewhere (moving away, changing loyalty).
// Others (relacao, familia, posse…) hold several relations at once.
const singleValued = new Set([
  'local_atual',
  'lealdade',
  'cargo',
  'situacao',
  'saude',
  'profissao',
  'origem',
])

function latestAt(facts: ArchiveFact[]): ArchiveFact[] {
  const latest = facts.reduce<number | null>(
    (max, fact) => (fact.position !== null && (max === null || fact.position > max) ? fact.position : max),
    null,
  )
  return facts.filter((fact) => fact.position === latest)
}

/**
 * The relations in effect as of a timeline position (inclusive), or across
 * the whole book (including unanchored scenes) when `upTo` is null.
 */
export function relationsAt(
  archive: ArchiveEntity[],
  upTo: number | null,
): Relation[] {
  const known = new Set(archive.map((entity) => entity.id))
  const relations: Relation[] = []

  archive.forEach((entity) => {
    const facts = entity.facts.filter(
      (fact) =>
        fact.isActive &&
        (upTo === null || (fact.position !== null && fact.position <= upTo)),
    )
    const byAttribute = new Map<string, ArchiveFact[]>()
    facts.forEach((fact) => {
      byAttribute.set(fact.attributeKey, [...(byAttribute.get(fact.attributeKey) ?? []), fact])
    })

    byAttribute.forEach((attributeFacts, key) => {
      let effective: ArchiveFact[]
      if (singleValued.has(key)) {
        const anchored = attributeFacts.filter((fact) => fact.position !== null)
        effective = anchored.length > 0 ? latestAt(anchored) : attributeFacts
      } else {
        // One relation per target: the latest fact pointing to it.
        const byTarget = new Map<string, ArchiveFact>()
        attributeFacts.forEach((fact) => {
          if (fact.targetId) byTarget.set(fact.targetId, fact)
        })
        effective = [...byTarget.values()]
      }
      effective
        .filter((fact) => fact.targetId && fact.targetId !== entity.id && known.has(fact.targetId))
        .forEach((fact) =>
          relations.push({
            id: fact.id,
            sourceId: entity.id,
            targetId: fact.targetId!,
            label: attributeLabel(fact.attribute),
            fact,
          }),
        )
    })
  })
  return relations
}

export interface TargetSuggestion {
  fact: ArchiveFact
  owner: ArchiveEntity
  candidates: ArchiveEntity[]
  // The part of the value that names the candidate, for highlighting.
  mention: string
}

function wordsOf(value: string): string {
  return ` ${normalizeForSearch(value).replace(/[^a-z0-9]+/g, ' ').trim()} `
}

/**
 * Unlinked facts whose value names another entity (or one of its aliases)
 * as whole words. When both "Julien" and "Julien Vane" match, only the
 * longer name is suggested.
 */
export function suggestTargets(archive: ArchiveEntity[]): TargetSuggestion[] {
  const names = archive.flatMap((entity) =>
    [entity.name, ...entity.aliases.map((alias) => alias.name)]
      .filter((name) => normalizeForSearch(name).length >= 3)
      .map((name) => ({ entity, name, words: wordsOf(name).trim() })),
  )

  const suggestions: TargetSuggestion[] = []
  archive.forEach((owner) => {
    owner.facts
      .filter((fact) => fact.isActive && !fact.targetId)
      .forEach((fact) => {
        const value = wordsOf(fact.value)
        const hits = names.filter(
          (candidate) =>
            candidate.entity.id !== owner.id && value.includes(` ${candidate.words} `),
        )
        const longest = hits.filter(
          (hit) =>
            !hits.some(
              (other) =>
                other !== hit &&
                other.words.length > hit.words.length &&
                ` ${other.words} `.includes(` ${hit.words} `),
            ),
        )
        const candidates = [...new Map(longest.map((hit) => [hit.entity.id, hit.entity])).values()]
        if (candidates.length > 0) {
          suggestions.push({ fact, owner, candidates, mention: longest[0].name })
        }
      })
  })
  return suggestions
}

// --- Pairs and filters -------------------------------------------------------

/**
 * All relations between two entities, drawn as one line. `aId` < `bId`;
 * `forward` means some relation goes a → b, `backward` b → a.
 */
export interface RelationPair {
  key: string
  aId: string
  bId: string
  relations: Relation[]
  forward: boolean
  backward: boolean
}

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`)

export function pairRelations(relations: Relation[]): RelationPair[] {
  const pairs = new Map<string, RelationPair>()
  for (const relation of relations) {
    const key = pairKey(relation.sourceId, relation.targetId)
    const [aId, bId] = relation.sourceId < relation.targetId
      ? [relation.sourceId, relation.targetId]
      : [relation.targetId, relation.sourceId]
    const pair = pairs.get(key) ?? { key, aId, bId, relations: [], forward: false, backward: false }
    pair.relations.push(relation)
    if (relation.sourceId === aId) pair.forward = true
    else pair.backward = true
    pairs.set(key, pair)
  }
  return [...pairs.values()]
}

/** "família" for one relation, "família · relação" for two kinds, "4 relações" beyond. */
export function pairLabel(pair: RelationPair): string {
  const labels = [...new Set(pair.relations.map((relation) => relation.label))]
  if (pair.relations.length === 1) return labels[0]
  if (labels.length <= 2) return labels.join(' · ')
  return `${pair.relations.length} relações`
}

export type RelationTimeFilter =
  | { kind: 'ALL' }
  // The relations in effect at a scene (0-based timeline index).
  | { kind: 'UNTIL'; scene: number }
  // Relations recorded within a stretch of scenes (0-based, inclusive).
  | { kind: 'RANGE'; from: number; to: number }

export interface RelationFilter {
  time: RelationTimeFilter
  // Entity types both ends must have; null for all.
  entityTypes: string[] | null
  // Attribute keys (família, relação, local…); null for all.
  attributes: string[] | null
  // Only relations touching this entity.
  focusId: string | null
}

export const allRelations: RelationFilter = { time: { kind: 'ALL' }, entityTypes: null, attributes: null, focusId: null }

/** Relations in time only: what the type, kind and focus filters choose from. */
export function relationsInTime(archive: ArchiveEntity[], time: RelationTimeFilter): Relation[] {
  if (time.kind === 'ALL') return relationsAt(archive, null)
  if (time.kind === 'UNTIL') return relationsAt(archive, time.scene)
  const from = Math.min(time.from, time.to)
  const to = Math.max(time.from, time.to)
  return relationsAt(archive, to).filter((relation) => relation.fact.position !== null && relation.fact.position >= from)
}

export function filterRelations(archive: ArchiveEntity[], relations: Relation[], filter: RelationFilter): Relation[] {
  const typeOf = new Map(archive.map((entity) => [entity.id, entity.type]))
  const types = filter.entityTypes ? new Set(filter.entityTypes) : null
  const attributes = filter.attributes ? new Set(filter.attributes) : null
  return relations.filter(
    (relation) =>
      (!types || (types.has(typeOf.get(relation.sourceId) ?? '') && types.has(typeOf.get(relation.targetId) ?? ''))) &&
      (!attributes || attributes.has(relation.fact.attributeKey)) &&
      (!filter.focusId || relation.sourceId === filter.focusId || relation.targetId === filter.focusId),
  )
}
