import type { ArchitectReview, SceneGroup } from '../api/contracts'
import type { ArchiveEntity } from '../features/archive/entityModel'
import { timeline, type StoryData } from './worldPack'

/**
 * Figures taken from the book itself — its text, its scenes and its Arquivo —
 * for marketing copy, catalogues and whoever builds the site ("92 mil
 * palavras, 31 personagens, 6 horas de leitura").
 */
export interface BookMetadata {
  prose: {
    words: number
    scenesWithText: number
    wordsPerScene: number
    // At 230 words a minute, a common pace for fiction.
    readingMinutes: number
    // At 250 words a page, a common estimate for a printed novel.
    pages: number
    // Share of the words inside dialogue paragraphs (dash or quote openings).
    dialogueShare: number
    wordsPerSentence: number
    longestScene: { order: number; title: string | null; words: number } | null
    shortestScene: { order: number; title: string | null; words: number } | null
  }
  structure: {
    scenes: number
    // Scenes still in the inbox, outside the timeline.
    unplaced: number
    groups: Array<{ id: string; name: string; color: string; scenes: number }>
    review: {
      genre: string
      declared: string
      detected: string
      date: string
      // One point per scene of the review, in its order.
      tension: Array<{ order: number; tension: number; beat: string }>
    } | null
  }
  world: {
    byType: Record<string, number>
    facts: number
    // Entities in the most scenes (scenes where the Arquivo noted a fact about them).
    characters: Array<{ id: string; name: string; scenes: number }>
    places: Array<{ id: string; name: string; scenes: number }>
  }
}

const WORDS_PER_MINUTE = 230
const WORDS_PER_PAGE = 250

const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0)

// A paragraph opening with a dash or a quotation mark is dialogue, the
// convention in Portuguese and English prose alike.
const isDialogue = (paragraph: string) => /^[\s]*[—–\-"“«]/.test(paragraph)

export function proseStats(scenes: Array<{ order: number; title: string | null; text: string }>): BookMetadata['prose'] {
  const counted = scenes.map((scene) => ({ ...scene, words: countWords(scene.text) })).filter((scene) => scene.words > 0)
  const words = counted.reduce((total, scene) => total + scene.words, 0)
  let dialogueWords = 0
  let sentences = 0
  for (const scene of counted) {
    for (const paragraph of scene.text.split(/\n+/)) {
      if (isDialogue(paragraph)) dialogueWords += countWords(paragraph)
    }
    sentences += scene.text.split(/[.!?…]+(?:["”»)]*)(?:\s|$)/).filter((sentence) => sentence.trim()).length
  }
  const byLength = [...counted].sort((a, b) => b.words - a.words)
  const pick = (scene: (typeof counted)[number] | undefined) => (scene ? { order: scene.order, title: scene.title, words: scene.words } : null)
  return {
    words,
    scenesWithText: counted.length,
    wordsPerScene: counted.length ? Math.round(words / counted.length) : 0,
    readingMinutes: Math.round(words / WORDS_PER_MINUTE),
    pages: Math.ceil(words / WORDS_PER_PAGE),
    dialogueShare: words ? dialogueWords / words : 0,
    wordsPerSentence: sentences ? Math.round((words / sentences) * 10) / 10 : 0,
    longestScene: pick(byLength[0]),
    shortestScene: pick(byLength.at(-1)),
  }
}

/** In how many scenes the Arquivo noted something about the entity. */
const presence = (entity: ArchiveEntity) => new Set(entity.facts.map((fact) => fact.slot.id)).size

export function bookMetadata(
  story: StoryData,
  texts: Array<{ order: number; title: string | null; text: string }>,
  review: ArchitectReview | null,
): BookMetadata {
  const ordered = timeline(story.slots)
  const groupScenes = (group: SceneGroup) => ordered.filter((slot) => slot.groupId === group.id).length
  const byType: Record<string, number> = {}
  story.entities.forEach((entity) => (byType[entity.type] = (byType[entity.type] ?? 0) + 1))
  const ranked = (type: string, count: number) =>
    story.entities
      .filter((entity) => entity.type === type)
      .map((entity) => ({ id: entity.id, name: entity.name, scenes: presence(entity) }))
      .filter((entity) => entity.scenes > 0)
      .sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, count)

  return {
    prose: proseStats(texts),
    structure: {
      scenes: ordered.length,
      unplaced: story.slots.filter((slot) => slot.isUnanchored || slot.timelinePosition === null).length,
      groups: [...story.groups]
        .sort((a, b) => a.position - b.position)
        .map((group) => ({ id: group.id, name: group.name, color: group.color, scenes: groupScenes(group) })),
      review: review
        ? {
            genre: review.genre,
            declared: review.narrativeFramework,
            detected: review.detectedFramework,
            date: review.createdAt,
            tension: (review.sceneMetrics ?? []).map((metric) => ({ order: metric.scene, tension: metric.tension, beat: metric.beat })),
          }
        : null,
    },
    world: {
      byType,
      facts: story.entities.reduce((total, entity) => total + entity.facts.filter((fact) => fact.isActive).length, 0),
      characters: ranked('CHARACTER', 10),
      places: ranked('LOCATION', 6),
    },
  }
}
