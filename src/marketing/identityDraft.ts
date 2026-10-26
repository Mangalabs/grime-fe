import type { MarketingDraft } from '../api/contracts'
import { entityTypeLabel } from '../features/archive/entityModel'
import { newId, type IdentityKit } from './identityModel'
import { cutPosition, type MarketingKit } from './marketingKit'
import { slotPositions, timeline, type StoryData, type WorldPack } from './worldPack'

/** The scenes on each side of the public cut. */
export function draftScenes(story: StoryData, kit: MarketingKit) {
  const cut = cutPosition(kit, slotPositions(story.slots))
  const ordered = timeline(story.slots)
  return {
    publicSlots: cut === null ? [] : ordered.filter((slot) => slot.timelinePosition! <= cut),
    laterSlots: cut === null ? ordered : ordered.filter((slot) => slot.timelinePosition! > cut),
  }
}

/**
 * The Arquivo as the model may read it: the same cut as a pack with teasers,
 * written as text. Teasers are marked so the model only hints at them.
 */
export function storyBibleText(pack: WorldPack): string {
  const tag = (level: string) => (level === 'TEASER' ? ' [TEASER]' : '')
  return pack.entities
    .map((entity) => {
      const lines = [`## ${entity.name} (${entityTypeLabel(entity.type)})${tag(entity.level)}`]
      if (entity.aliases.length) lines.push(`Também chamado: ${entity.aliases.map((alias) => `${alias.name}${tag(alias.level)}`).join(', ')}`)
      if (entity.page?.summary) lines.push(`Resumo${tag(entity.page.summary.level)}: ${entity.page.summary.text}`)
      entity.page?.sections.forEach((section) =>
        section.fields.forEach((field) => {
          const value = Array.isArray(field.value) ? field.value.join(', ') : field.value
          lines.push(`${field.label}${tag(field.level)}: ${value}`)
        }),
      )
      entity.facts.forEach((fact) => lines.push(`- ${fact.attributeLabel}: ${fact.value}${tag(fact.level)}`))
      return lines.join('\n')
    })
    .join('\n\n')
}

// --- Applying a draft, one part at a time -----------------------------------

export const draftParts = ['essence', 'mood', 'palette', 'typography', 'matter', 'motifs', 'artifacts', 'quotes', 'direction'] as const
export type DraftPart = (typeof draftParts)[number]
export const draftPartLabels: Record<DraftPart, string> = {
  essence: 'Essência',
  mood: 'Atmosfera',
  palette: 'Paleta',
  typography: 'Tipografia',
  matter: 'Matéria, luz e som',
  motifs: 'Motivos',
  artifacts: 'Objetos diegéticos',
  quotes: 'Citações',
  direction: 'Direção (evitar, prompt, frase de amostra)',
}

const merged = (own: string[], extra: string[]) => [...own, ...extra.filter((item) => item.trim() && !own.includes(item))]
const filled = (own: string, proposed: string) => proposed.trim() || own

/** Entity names the model wrote, back to ids (canonical names and aliases). */
function entityIdFor(story: StoryData, name: string): string | null {
  const needle = name.trim().toLocaleLowerCase('pt-BR')
  if (!needle) return null
  const match = story.entities.find((entity) =>
    [entity.name, ...entity.aliases.map((alias) => alias.name)].some((item) => item.toLocaleLowerCase('pt-BR') === needle),
  )
  return match?.id ?? null
}

/**
 * The identity with one part of the draft applied. Single values are
 * replaced (an empty proposal keeps what is there); lists gain the new items;
 * the palette is replaced whole, as a palette only works as a set.
 */
export function applyDraftPart(identity: IdentityKit, draft: MarketingDraft, part: DraftPart, story: StoryData): IdentityKit {
  switch (part) {
    case 'essence': {
      const own = identity.essence
      const proposed = draft.essence
      return {
        ...identity,
        essence: {
          setting: filled(own.setting, proposed.setting),
          era: filled(own.era, proposed.era),
          place: filled(own.place, proposed.place),
          culture: filled(own.culture, proposed.culture),
          scale: proposed.scale ?? own.scale,
          pointOfView: filled(own.pointOfView, proposed.pointOfView),
          // The promise is the author's own words; the model never writes it.
          promise: own.promise,
        },
      }
    }
    case 'mood':
      return {
        ...identity,
        mood: {
          words: merged(identity.mood.words, draft.mood.words),
          temperature: draft.mood.temperature ?? identity.mood.temperature,
          tempo: draft.mood.tempo ?? identity.mood.tempo,
          notes: filled(identity.mood.notes, draft.mood.notes),
        },
      }
    case 'palette':
      return draft.palette.length
        ? { ...identity, palette: draft.palette.map(({ name, hex, role, reason }) => ({ id: newId(), name, hex, role, note: reason })) }
        : identity
    case 'typography':
      return {
        ...identity,
        typography: {
          display: filled(identity.typography.display, draft.typography.display),
          body: filled(identity.typography.body, draft.typography.body),
          accent: filled(identity.typography.accent, draft.typography.accent),
          notes: filled(identity.typography.notes, draft.typography.reason),
        },
      }
    case 'matter':
      return {
        ...identity,
        materials: merged(identity.materials, draft.materials),
        light: filled(identity.light, draft.light),
        sound: filled(identity.sound, draft.sound),
        composition: filled(identity.composition, draft.composition),
      }
    case 'motifs':
      return {
        ...identity,
        motifs: [
          ...identity.motifs,
          ...draft.motifs
            .filter((motif) => motif.name.trim())
            .map((motif) => ({ id: newId(), name: motif.name, meaning: motif.meaning, entityId: entityIdFor(story, motif.entityName) })),
        ],
      }
    case 'artifacts': {
      return {
        ...identity,
        artifacts: [
          ...identity.artifacts,
          ...draft.artifacts
            .filter((artifact) => artifact.title.trim())
            .map((artifact) => ({
                id: newId(),
                kind: artifact.kind,
                title: artifact.title,
                entityId: entityIdFor(story, artifact.entityName),
                description: artifact.description,
                // What it reveals, and its content, the author writes.
                reveals: '',
                // A draft can't know what's a surprise: the author opens it.
                level: 'TEASER' as const,
                entries: [],
              })),
        ],
      }
    }
    case 'quotes': {
      const slotByOrder = new Map(timeline(story.slots).map((slot, index) => [index + 1, slot.id]))
      const known = new Set(identity.quotes.map((quote) => quote.text))
      return {
        ...identity,
        quotes: [
          ...identity.quotes,
          ...draft.quotes
            .filter((quote) => !known.has(quote.text))
            .map((quote) => ({ id: newId(), text: quote.text, slotId: slotByOrder.get(quote.scene) ?? null, use: quote.use, note: quote.note })),
        ],
      }
    }
    case 'direction':
      return {
        ...identity,
        avoid: merged(identity.avoid, draft.avoid),
        stylePrompt: filled(identity.stylePrompt, draft.stylePrompt),
        sampleLine: filled(identity.sampleLine, draft.sampleLine),
      }
  }
}
