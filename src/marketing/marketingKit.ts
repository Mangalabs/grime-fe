import type { ArchiveEntity, ArchiveFact } from '../features/archive/entityModel'
import { emptyBook, normalizeBook, type BookInfo } from './bookModel'
import { emptyIdentity, normalizeIdentity, type IdentityKit } from './identityModel'

/**
 * What the public may know. PUBLIC goes on the site as is; TEASER may be
 * hinted at (the site can show it redacted or locked); SPOILER never leaves
 * Petricor.
 */
export const spoilerLevels = ['PUBLIC', 'TEASER', 'SPOILER'] as const
export type SpoilerLevel = (typeof spoilerLevels)[number]

export const spoilerLevelLabels: Record<SpoilerLevel, string> = {
  PUBLIC: 'Público',
  TEASER: 'Teaser',
  SPOILER: 'Spoiler',
}

export const spoilerLevelDescriptions: Record<SpoilerLevel, string> = {
  PUBLIC: 'Pode aparecer no site como está.',
  TEASER: 'Pode ser insinuado: o site mostra como pista, censurado ou trancado.',
  SPOILER: 'Nunca sai do Petricor.',
}

// The page summary is levelled like a field, under this id.
export const summaryFieldId = 'summary'

/**
 * The project's marketing kit. Only the author's choices are stored; anything
 * without one follows the default (see the resolve functions), so the kit
 * stays right as the manuscript changes.
 */
export interface MarketingKit {
  version: 1
  // The last scene the public knows (e.g. the end of the sample chapters).
  // Facts up to it default to PUBLIC; null means nothing is public yet.
  publicThroughSlotId: string | null
  entities: Record<string, SpoilerLevel>
  aliases: Record<string, SpoilerLevel>
  facts: Record<string, SpoilerLevel>
  // Ficha fields: entityId → fieldId (or summaryFieldId) → level.
  wiki: Record<string, Record<string, SpoilerLevel>>
  // How the book looks and feels (see identityModel.ts).
  identity: IdentityKit
  // What the landing page sells (see bookModel.ts).
  book: BookInfo
}

export const emptyKit = (): MarketingKit => ({
  version: 1,
  publicThroughSlotId: null,
  entities: {},
  aliases: {},
  facts: {},
  wiki: {},
  identity: emptyIdentity(),
  book: emptyBook(),
})

const isLevel = (value: unknown): value is SpoilerLevel => spoilerLevels.includes(value as SpoilerLevel)

function levelsOnly(value: unknown): Record<string, SpoilerLevel> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).filter(([, level]) => isLevel(level))) as Record<string, SpoilerLevel>
}

export function normalizeKit(value: Partial<MarketingKit> | null | undefined): MarketingKit {
  const wiki: MarketingKit['wiki'] = {}
  Object.entries(value?.wiki ?? {}).forEach(([entityId, sections]) => {
    wiki[entityId] = levelsOnly(sections)
  })
  return {
    version: 1,
    publicThroughSlotId: typeof value?.publicThroughSlotId === 'string' ? value.publicThroughSlotId : null,
    entities: levelsOnly(value?.entities),
    aliases: levelsOnly(value?.aliases),
    facts: levelsOnly(value?.facts),
    wiki,
    identity: normalizeIdentity(value?.identity),
    book: normalizeBook(value?.book),
  }
}

// --- Levels: the author's choice, else the default --------------------------

export interface Resolved {
  level: SpoilerLevel
  // The author chose it; otherwise it follows `fallback`.
  isChosen: boolean
  fallback: SpoilerLevel
}

const resolve = (chosen: SpoilerLevel | undefined, fallback: SpoilerLevel): Resolved => ({
  level: chosen ?? fallback,
  isChosen: chosen !== undefined,
  fallback,
})

/** Timeline position of the cut, or null while nothing is public. */
export function cutPosition(kit: MarketingKit, positions: Map<string, number | null>): number | null {
  return kit.publicThroughSlotId ? (positions.get(kit.publicThroughSlotId) ?? null) : null
}

const knownByThen = (position: number | null, cut: number | null) =>
  position !== null && cut !== null && position <= cut

/** A fact is public by default when its scene comes before the cut. */
export function factLevel(kit: MarketingKit, fact: ArchiveFact, cut: number | null): Resolved {
  return resolve(kit.facts[fact.id], knownByThen(fact.position, cut) ? 'PUBLIC' : 'SPOILER')
}

/** An entity is public by default once the public has met it in a scene. */
export function entityLevel(kit: MarketingKit, entity: ArchiveEntity, cut: number | null): Resolved {
  const met = entity.facts.some((fact) => fact.isActive && knownByThen(fact.position, cut))
  return resolve(kit.entities[entity.id], met ? 'PUBLIC' : 'SPOILER')
}

// A second name is often the secret (a hidden identity): opt in, one by one.
export function aliasLevel(kit: MarketingKit, aliasId: string): Resolved {
  return resolve(kit.aliases[aliasId], 'SPOILER')
}

// Starter-template fields (stable ids, see starterTemplates.ts) that present
// an entity rather than plan the book: they open up with the entity itself.
const presentationFields = new Set([
  'full_name', 'age', 'gender', 'role', 'occupation', 'appearance', 'voice',
  'kind', 'era', 'located_in', 'sounds_smells', 'weather_light', 'inhabitants',
  'customs', 'mood', 'symbols', 'scope', 'when', 'where',
])

// What a back-cover blurb would hint at: at most a teaser by default.
const blurbFields = new Set(['goal', 'fear', 'values', 'statement'])

/**
 * A ficha field's level. The default reads the starter templates: presentation
 * fields follow the entity, blurb material is at most a teaser, and the rest
 * (the lie, the ghost, secrets, custom fields) is the author's planning, so
 * it stays a spoiler until opened.
 */
export function wikiFieldLevel(kit: MarketingKit, entityId: string, fieldId: string, entity: SpoilerLevel): Resolved {
  const fallback = presentationFields.has(fieldId)
    ? entity
    : blurbFields.has(fieldId)
      ? stricter(entity, 'TEASER')
      : 'SPOILER'
  return resolve(kit.wiki[entityId]?.[fieldId], fallback)
}

// A summary often says who someone really is: opt in.
export function summaryLevel(kit: MarketingKit, entityId: string): Resolved {
  return resolve(kit.wiki[entityId]?.[summaryFieldId], 'SPOILER')
}

/** Levels in the order they open up: PUBLIC is in every audience. */
export function isIncluded(level: SpoilerLevel, includeTeasers: boolean): boolean {
  return level === 'PUBLIC' || (includeTeasers && level === 'TEASER')
}

/** The more secret of two levels: a public fact of a teaser entity is a teaser. */
export function stricter(a: SpoilerLevel, b: SpoilerLevel): SpoilerLevel {
  return spoilerLevels.indexOf(a) >= spoilerLevels.indexOf(b) ? a : b
}

// --- Changes (null clears the choice: back to the default) ------------------

type Bucket = 'entities' | 'aliases' | 'facts'

export function withLevel(kit: MarketingKit, bucket: Bucket, id: string, level: SpoilerLevel | null): MarketingKit {
  const next = { ...kit[bucket] }
  if (level === null) delete next[id]
  else next[id] = level
  return { ...kit, [bucket]: next }
}

/** Sets (or, with null, clears) the level of one or more ficha fields at once. */
export function withWikiLevel(
  kit: MarketingKit,
  entityId: string,
  fieldIds: string[],
  level: SpoilerLevel | null,
): MarketingKit {
  const fields = { ...kit.wiki[entityId] }
  fieldIds.forEach((fieldId) => {
    if (level === null) delete fields[fieldId]
    else fields[fieldId] = level
  })
  return { ...kit, wiki: { ...kit.wiki, [entityId]: fields } }
}
