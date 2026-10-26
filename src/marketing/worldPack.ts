import { z } from 'zod'
import type { SceneGroup, Slot } from '../api/contracts'
import { attributeLabel } from '../features/archive/attributes'
import type { ArchiveEntity } from '../features/archive/entityModel'
import { templateForPage, type WikiPage, type WikiTemplateLibrary } from '../features/wiki/wikiModel'
import { bookStatuses, isWebUrl, linkKindLabels, linkKinds, type BookImage, type BookInfo } from './bookModel'
import type { BookMetadata } from './bookMetadata'
import { fichaSections, shownValue } from './ficha'
import {
  artifactKinds,
  colorRoles,
  imageUses,
  quoteUses,
  scales,
  temperatures,
  tempos,
  type MoodImage,
} from './identityModel'
import {
  aliasLevel,
  cutPosition,
  entityLevel,
  factLevel,
  isIncluded,
  spoilerLevels,
  stricter,
  summaryLevel,
  wikiFieldLevel,
  type MarketingKit,
  type SpoilerLevel,
} from './marketingKit'

/**
 * The World Pack: the book's information for whoever builds its site, already
 * cut to an audience. A contract with those readers — bump formatVersion on
 * any change a reader of version 1 couldn't handle.
 */
const Level = z.enum(spoilerLevels)

const PackImage = z
  .object({
    // Path of the image inside the pack's .zip.
    file: z.string(),
    mimeType: z.string(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  })
  .strict()

// The book in figures. Only what's safe for any audience: counts, length,
// prose and the detected structure; the tension curve (it shows where the
// climax falls) stays out, and only entities already in the pack are named.
const MetadataSchema = z
  .object({
    words: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
    readingMinutes: z.number().int().nonnegative(),
    scenes: z.number().int().nonnegative(),
    wordsPerScene: z.number().int().nonnegative(),
    dialogueShare: z.number().min(0).max(1),
    wordsPerSentence: z.number().nonnegative(),
    acts: z.number().int().nonnegative(),
    genre: z.string().nullable(),
    structure: z.string().nullable(),
    entitiesByType: z.record(z.string(), z.number().int().nonnegative()),
    mostPresent: z.array(
      z.object({ entityId: z.string(), name: z.string(), type: z.string(), scenes: z.number().int().positive(), level: Level }).strict(),
    ),
  })
  .strict()

const BookSchema = z
  .object({
    title: z.string(),
    subtitle: z.string(),
    series: z.string(),
    seriesNumber: z.string(),
    author: z.object({ name: z.string(), bio: z.string(), photo: PackImage.nullable() }).strict(),
    cover: PackImage.extend({ alt: z.string() }).strict().nullable(),
    tagline: z.string(),
    shortBlurb: z.string(),
    blurb: z.string(),
    genre: z.string(),
    audience: z.string(),
    language: z.string(),
    releaseDate: z.string().nullable(),
    status: z.enum(bookStatuses).nullable(),
    // Only http(s) addresses; the rest are left out.
    links: z.array(z.object({ id: z.string(), kind: z.enum(linkKinds), label: z.string(), url: z.string().url() }).strict()),
    // The link the page's main button leads to.
    primaryLinkId: z.string().nullable(),
  })
  .strict()

const IdentitySchema = z
  .object({
    essence: z
      .object({
        setting: z.string(),
        era: z.string(),
        place: z.string(),
        culture: z.string(),
        scale: z.enum(scales).nullable(),
        pointOfView: z.string(),
        promise: z.string(),
      })
      .strict(),
    mood: z
      .object({
        words: z.array(z.string()),
        temperature: z.enum(temperatures).nullable(),
        tempo: z.enum(tempos).nullable(),
        notes: z.string(),
      })
      .strict(),
    // Colours with roles (background, ink, accent…); the names guide illustrators.
    palette: z.array(
      z
        .object({ name: z.string(), hex: z.string().regex(/^#[0-9a-f]{6}$/), role: z.enum(colorRoles), note: z.string() })
        .strict(),
    ),
    // Google Fonts family names.
    typography: z.object({ display: z.string(), body: z.string(), accent: z.string(), notes: z.string() }).strict(),
    materials: z.array(z.string()),
    light: z.string(),
    sound: z.string(),
    composition: z.string(),
    motifs: z.array(
      z.object({ name: z.string(), meaning: z.string(), entityId: z.string().nullable() }).strict(),
    ),
    // Documents and objects of the story's world, with what can be read in them.
    artifacts: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(artifactKinds),
          title: z.string(),
          entityId: z.string().nullable(),
          description: z.string(),
          reveals: z.string(),
          level: Level,
          // What the visitor reads inside the object, in order.
          entries: z.array(
            z
              .object({
                id: z.string(),
                title: z.string(),
                body: z.string(),
                speakerId: z.string().nullable(),
                when: z.string(),
                entityIds: z.array(z.string()),
                level: Level,
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    moodboard: z.array(
      z
        .object({
          id: z.string(),
          // Path of the image inside the pack's .zip.
          file: z.string(),
          mimeType: z.string(),
          width: z.number().int().nonnegative(),
          height: z.number().int().nonnegative(),
          caption: z.string(),
          uses: z.array(z.enum(imageUses)),
          // False: a reference for the art direction, never shown on the site.
          publishable: z.boolean(),
        })
        .strict(),
    ),
    // Lines of the book itself, all from scenes the public knows.
    quotes: z.array(
      z.object({ id: z.string(), text: z.string(), scene: z.number().int().positive(), use: z.enum(quoteUses), note: z.string() }).strict(),
    ),
    avoid: z.array(z.string()),
    stylePrompt: z.string(),
    sampleLine: z.string(),
  })
  .strict()

export const WorldPackSchema = z
  .object({
    format: z.literal('petricor.world-pack'),
    formatVersion: z.literal(1),
    exportedAt: z.string().datetime(),
    project: z.object({ title: z.string() }).strict(),
    // What the landing page sells.
    book: BookSchema,
    // The book in figures; null when it wasn't computed for this export.
    metadata: MetadataSchema.nullable(),
    // How the book looks and feels: the brief for its site, art and marketing.
    identity: IdentitySchema,
    audience: z
      .object({
        // Which levels are in the pack; SPOILER never is.
        levels: z.array(Level.exclude(['SPOILER'])).min(1),
        // The last scene the public knows (1-based timeline order); null: none.
        publicThroughScene: z.number().int().positive().nullable(),
      })
      .strict(),
    groups: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() }).strict()),
    // Only the scenes up to the cut, without their text.
    scenes: z.array(
      z
        .object({
          id: z.string(),
          order: z.number().int().positive(),
          title: z.string().nullable(),
          groupId: z.string().nullable(),
        })
        .strict(),
    ),
    entities: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          level: Level,
          aliases: z.array(z.object({ name: z.string(), level: Level }).strict()),
          facts: z.array(
            z
              .object({
                id: z.string(),
                attribute: z.string(),
                attributeLabel: z.string(),
                value: z.string(),
                level: Level,
                // Who claims it, when it is a character's word and not the narrator's.
                isSubjective: z.boolean(),
                sourceClaim: z.string().nullable(),
                // Another entity of the pack the value refers to (a relation).
                relatedEntityId: z.string().nullable(),
                // Scene order where it appears, when that scene is in the pack.
                scene: z.number().int().positive().nullable(),
              })
              .strict(),
          ),
          page: z
            .object({
              template: z.string().nullable(),
              summary: z.object({ text: z.string(), level: Level }).strict().nullable(),
              // Only sections with at least one field in the pack.
              sections: z.array(
                z
                  .object({
                    id: z.string(),
                    title: z.string(),
                    fields: z.array(
                      z
                        .object({
                          // Stable ids from the starter templates (e.g. "appearance", "voice").
                          id: z.string(),
                          label: z.string(),
                          kind: z.enum(['text', 'longtext', 'choice', 'entities', 'list']),
                          level: Level,
                          value: z.union([z.string(), z.array(z.string())]),
                          // Entity fields: ids of the named entities, all in the pack,
                          // so the site can link one ficha to another.
                          entityIds: z.array(z.string()).optional(),
                        })
                        .strict(),
                    ),
                  })
                  .strict(),
              ),
            })
            .strict()
            .nullable(),
        })
        .strict(),
    ),
  })
  .strict()

export type WorldPack = z.infer<typeof WorldPackSchema>

const knownExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav' }
const extensionOf = (mimeType: string) => knownExtensions[mimeType] ?? (mimeType.split('/')[1]?.split(';')[0] || 'bin')

/** Where the book's own images go inside the pack's .zip. */
export function bookFile(name: 'cover' | 'author', image: BookImage): string {
  return `book/${name}.${extensionOf(image.mimeType)}`
}

function exportBook(book: BookInfo, projectTitle: string): WorldPack['book'] {
  const packImage = (name: 'cover' | 'author', image: BookImage | null) =>
    image ? { file: bookFile(name, image), mimeType: image.mimeType, width: image.width, height: image.height } : null
  const links = book.links
    .filter((link) => isWebUrl(link.url))
    .map((link) => ({ id: link.id, kind: link.kind, label: link.label.trim() || linkKindLabels[link.kind], url: link.url.trim() }))
  const cover = packImage('cover', book.cover)
  return {
    title: book.title.trim() || projectTitle,
    subtitle: book.subtitle,
    series: book.series,
    seriesNumber: book.seriesNumber,
    author: { name: book.authorName, bio: book.authorBio, photo: packImage('author', book.authorPhoto) },
    cover: cover && { ...cover, alt: book.coverAlt.trim() || `Capa de ${book.title.trim() || projectTitle}` },
    tagline: book.tagline,
    shortBlurb: book.shortBlurb,
    blurb: book.blurb,
    genre: book.genre,
    audience: book.audience,
    language: book.language,
    releaseDate: book.releaseDate || null,
    status: book.status,
    links,
    primaryLinkId: links.some((link) => link.id === book.primaryLinkId) ? book.primaryLinkId : null,
  }
}

function exportMetadata(
  metadata: BookMetadata,
  levelOf: Map<string, SpoilerLevel>,
  included: Map<string, string>,
  includeTeasers: boolean,
): WorldPack['metadata'] {
  const { prose, structure, world } = metadata
  const present = [
    ...world.characters.map((entity) => ({ ...entity, type: 'CHARACTER' })),
    ...world.places.map((entity) => ({ ...entity, type: 'LOCATION' })),
  ].filter((entity) => included.has(entity.id) && isIncluded(levelOf.get(entity.id)!, includeTeasers))
  return {
    words: prose.words,
    pages: prose.pages,
    readingMinutes: prose.readingMinutes,
    scenes: structure.scenes,
    wordsPerScene: prose.wordsPerScene,
    dialogueShare: Math.round(prose.dialogueShare * 1000) / 1000,
    wordsPerSentence: prose.wordsPerSentence,
    acts: structure.groups.filter((group) => group.scenes > 0).length,
    genre: structure.review?.genre || null,
    structure: structure.review?.detected || null,
    entitiesByType: world.byType,
    mostPresent: present.map((entity) => ({
      entityId: entity.id,
      name: entity.name,
      type: entity.type,
      scenes: entity.scenes,
      level: levelOf.get(entity.id)!,
    })),
  }
}

/** Where a moodboard image goes inside the pack's .zip. */
export function moodboardFile(image: Pick<MoodImage, 'id' | 'mimeType'>): string {
  return `moodboard/${image.id}.${extensionOf(image.mimeType)}`
}

export function worldPackJsonSchema() {
  return z.toJSONSchema(WorldPackSchema)
}

export interface StoryData {
  title: string
  slots: Slot[]
  groups: SceneGroup[]
  entities: ArchiveEntity[]
  library: WikiTemplateLibrary
  pages: Map<string, WikiPage>
}

/** Scenes on the timeline, in order (the inbox has no place in the story yet). */
export function timeline(slots: Slot[]): Slot[] {
  return slots
    .filter((slot) => !slot.isUnanchored && slot.timelinePosition !== null)
    .sort((a, b) => a.timelinePosition! - b.timelinePosition!)
}

export function slotPositions(slots: Slot[]): Map<string, number | null> {
  return new Map(slots.map((slot) => [slot.id, slot.isUnanchored ? null : slot.timelinePosition]))
}

/**
 * Builds the pack for an audience. Something is in it only if its own level,
 * its entity's and, for a relation, the other entity's are all in the
 * audience: a public fact can't leak a secret character's name.
 */
export function buildWorldPack(
  story: StoryData,
  kit: MarketingKit,
  options: { includeTeasers: boolean; now?: Date; metadata?: BookMetadata | null },
): WorldPack {
  const { includeTeasers } = options
  const positions = slotPositions(story.slots)
  const cut = cutPosition(kit, positions)
  const ordered = timeline(story.slots)
  const orderOf = new Map(ordered.map((slot, index) => [slot.id, index + 1]))
  const publicScenes = cut === null ? [] : ordered.filter((slot) => slot.timelinePosition! <= cut)

  const levelOf = new Map(story.entities.map((entity) => [entity.id, entityLevel(kit, entity, cut).level]))
  const included = story.entities.filter((entity) => isIncluded(levelOf.get(entity.id)!, includeTeasers))
  const includedNames = new Map(included.map((entity) => [entity.id, entity.name]))

  const entities = included.map((entity) => {
    const own = levelOf.get(entity.id)!

    const aliases = entity.aliases
      .map((alias) => ({ name: alias.name, level: stricter(aliasLevel(kit, alias.id).level, own) }))
      .filter((alias) => isIncluded(alias.level, includeTeasers))

    const facts = entity.facts
      // Replaced facts are history, not the canon a reader meets.
      .filter((fact) => fact.isActive)
      .flatMap((fact) => {
        let level = stricter(factLevel(kit, fact, cut).level, own)
        if (fact.targetId) {
          const target = levelOf.get(fact.targetId)
          if (!target || !includedNames.has(fact.targetId)) return []
          level = stricter(level, target)
        }
        if (!isIncluded(level, includeTeasers)) return []
        const sceneOrder = orderOf.get(fact.slot.id)
        return [
          {
            id: fact.id,
            attribute: fact.attribute,
            attributeLabel: attributeLabel(fact.attributeKey),
            value: fact.value,
            level,
            isSubjective: fact.isSubjective,
            sourceClaim: fact.sourceClaim,
            relatedEntityId: fact.targetId,
            scene: sceneOrder !== undefined && cut !== null && fact.position! <= cut ? sceneOrder : null,
          },
        ]
      })

    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      level: own,
      aliases,
      facts,
      page: exportPage(story, kit, entity, own, includeTeasers, includedNames),
    }
  })

  const sceneGroups = new Set(publicScenes.map((slot) => slot.groupId).filter(Boolean))
  const { identity } = kit
  // Links only to entities in the pack; an object of a secret entity is as
  // secret as the entity (and so left out).
  const linked = (entityId: string | null) => (entityId && includedNames.has(entityId) ? entityId : null)

  const identityOut = {
      essence: identity.essence,
      mood: identity.mood,
      palette: identity.palette.map(({ name, hex, role, note }) => ({ name, hex, role, note })),
      typography: identity.typography,
      materials: identity.materials,
      light: identity.light,
      sound: identity.sound,
      composition: identity.composition,
      motifs: identity.motifs
        .filter((motif) => motif.name.trim())
        .map((motif) => ({ name: motif.name, meaning: motif.meaning, entityId: linked(motif.entityId) })),
      artifacts: identity.artifacts.flatMap((artifact) => {
        const level = artifact.entityId
          ? stricter(artifact.level, levelOf.get(artifact.entityId) ?? 'SPOILER')
          : artifact.level
        if (!isIncluded(level, includeTeasers) || !artifact.title.trim()) return []
        const entries = artifact.entries.flatMap((entry) => {
          // Speaker and every entity named must be in the pack: an entry
          // naming a secret character is as secret as that character.
          const people = [entry.speakerId, ...entry.entityIds].filter((id): id is string => !!id)
          if (people.some((id) => !includedNames.has(id))) return []
          // Tied to a moment past the public cut: it would tell the future.
          if (entry.slotId) {
            const position = positions.get(entry.slotId)
            if (position === null || position === undefined || cut === null || position > cut) return []
          }
          const entryLevel = people.reduce<SpoilerLevel>((current, id) => stricter(current, levelOf.get(id)!), stricter(entry.level, level))
          if (!isIncluded(entryLevel, includeTeasers) || !entry.body.trim()) return []
          return [
            {
              id: entry.id,
              title: entry.title,
              body: entry.body,
              speakerId: entry.speakerId,
              when: entry.when,
              entityIds: entry.entityIds,
              level: entryLevel,
            },
          ]
        })
        return [{ ...artifact, entityId: linked(artifact.entityId), level, entries }]
      }),
      moodboard: identity.moodboard.map((image) => ({
        id: image.id,
        file: moodboardFile(image),
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        caption: image.caption,
        uses: image.uses,
        publishable: image.publishable,
      })),
      quotes: identity.quotes.flatMap((quote) => {
        const order = quote.slotId ? orderOf.get(quote.slotId) : undefined
        const position = quote.slotId ? positions.get(quote.slotId) : null
        if (order === undefined || position === null || position === undefined || cut === null || position > cut) return []
        return [{ id: quote.id, text: quote.text, scene: order, use: quote.use, note: quote.note }]
      }),
      avoid: identity.avoid,
      stylePrompt: identity.stylePrompt,
      sampleLine: identity.sampleLine,
  }

  return WorldPackSchema.parse({
    format: 'petricor.world-pack',
    formatVersion: 1,
    exportedAt: (options.now ?? new Date()).toISOString(),
    project: { title: story.title },
    book: exportBook(kit.book, story.title),
    metadata: options.metadata ? exportMetadata(options.metadata, levelOf, includedNames, includeTeasers) : null,
    identity: identityOut,
    audience: {
      levels: includeTeasers ? ['PUBLIC', 'TEASER'] : ['PUBLIC'],
      publicThroughScene: kit.publicThroughSlotId ? (orderOf.get(kit.publicThroughSlotId) ?? null) : null,
    },
    groups: story.groups
      .filter((group) => sceneGroups.has(group.id))
      .sort((a, b) => a.position - b.position)
      .map((group) => ({ id: group.id, name: group.name, color: group.color })),
    scenes: publicScenes.map((slot) => ({
      id: slot.id,
      order: orderOf.get(slot.id)!,
      title: slot.title,
      groupId: slot.groupId ?? null,
    })),
    entities,
  })
}

function exportPage(
  story: StoryData,
  kit: MarketingKit,
  entity: ArchiveEntity,
  own: SpoilerLevel,
  includeTeasers: boolean,
  includedNames: Map<string, string>,
): WorldPack['entities'][number]['page'] {
  const page = story.pages.get(entity.id)
  if (!page) return null
  const template = templateForPage(story.library, entity.type, page.templateId)

  const ownSummary = stricter(summaryLevel(kit, entity.id).level, own)
  const summary =
    page.summary.trim() && isIncluded(ownSummary, includeTeasers)
      ? { text: page.summary.trim(), level: ownSummary }
      : null

  const sections = fichaSections(story.library, entity, page).flatMap((section) => {
    const fields = section.fields.flatMap(({ field, value }) => {
      const level = stricter(wikiFieldLevel(kit, entity.id, field.id, own).level, own)
      if (!isIncluded(level, includeTeasers)) return []
      // Entity fields name only entities that are themselves in the pack.
      const shown = shownValue(field, value, includedNames)
      return shown ? [{ id: field.id, label: field.label, kind: field.kind, level, ...shown }] : []
    })
    return fields.length ? [{ id: section.id, title: section.title, fields }] : []
  })

  if (!summary && sections.length === 0) return null
  return { template: template?.name ?? null, summary, sections }
}
