import type { ProjectEntity, SceneBeat, SceneGroup, Slot } from '../../api/contracts'
import { structureTemplates, type GroupRun } from '../scenes/groups'
import { normalizeForSearch } from '../scenes/sceneStatus'

export const beatLabels: Record<SceneBeat, string> = {
  SETUP: 'Preparação',
  RISING: 'Ascensão',
  PEAK: 'Pico',
  FALLING: 'Queda',
  RELEASE: 'Respiro',
}

/** Text measures of one scene, computed in the browser from its plain text. */
export interface SceneTextMetrics {
  words: number
  // Share of words spoken by characters (0–1).
  dialogueShare: number
  sentences: number
  avgSentenceWords: number
  // Standard deviation of sentence length, in words.
  sentenceSpread: number
  paragraphs: number
  avgParagraphWords: number
  questionsPer1k: number
  exclamationsPer1k: number
  opening: string
  openingKind: 'dialogue' | 'narration'
  ending: string
  endingKind: 'dialogue' | 'question' | 'narration'
}

const dialogueLine = /^\s*[—–―-]\s*\S/
const quoted = /“[^”]*”|«[^»]*»|"[^"\n]*"/g

// Imported scenes may start with the chapter heading of the source PDF.
const chapterHeading = /^\s*(?:cap[íi]tulo|chapter|parte)\s+(?:\d+|[ivxlcdm]+\b)[\s.:—–-]*/i

const wordCount = (text: string) => (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length

function splitSentences(text: string): string[] {
  return text
    .replace(/\s*\n+\s*/g, '\n')
    .split(/(?<=[.!?…])["”»)]*\s+|\n/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => wordCount(sentence) > 0)
}

export function measureScene(text: string): SceneTextMetrics {
  const words = wordCount(text)
  const paragraphs = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean)
  let dialogueWords = 0
  for (const paragraph of paragraphs) {
    if (dialogueLine.test(paragraph)) dialogueWords += wordCount(paragraph)
    else for (const match of paragraph.matchAll(quoted)) dialogueWords += wordCount(match[0])
  }
  const sentences = splitSentences(text)
  const body = splitSentences(text.replace(chapterHeading, ''))
  const lengths = sentences.map(wordCount)
  const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0
  const spread = lengths.length
    ? Math.sqrt(lengths.reduce((sum, length) => sum + (length - avg) ** 2, 0) / lengths.length)
    : 0
  const per1k = (count: number) => (words ? (count / words) * 1000 : 0)
  const first = text.replace(chapterHeading, '').trim().split('\n')[0] ?? ''
  const last = paragraphs[paragraphs.length - 1] ?? ''
  const opening = body[0] ?? ''
  const ending = sentences[sentences.length - 1] ?? ''

  return {
    words,
    dialogueShare: words ? Math.min(1, dialogueWords / words) : 0,
    sentences: sentences.length,
    avgSentenceWords: avg,
    sentenceSpread: spread,
    paragraphs: paragraphs.length,
    avgParagraphWords: paragraphs.length ? words / paragraphs.length : 0,
    questionsPer1k: per1k(sentences.filter((s) => /\?["”»)]*$/.test(s)).length),
    exclamationsPer1k: per1k(sentences.filter((s) => /!["”»)]*$/.test(s)).length),
    opening,
    openingKind: dialogueLine.test(first) || /^[“«"]/.test(first) ? 'dialogue' : 'narration',
    ending,
    endingKind: /\?["”»)]*$/.test(ending)
      ? 'question'
      : dialogueLine.test(last) || /[”»"]$/.test(last)
        ? 'dialogue'
        : 'narration',
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** The longest run of consecutive indexes where `test` holds. */
export function longestRun(count: number, test: (index: number) => boolean) {
  let best: { start: number; length: number } | null = null
  let start = -1
  for (let index = 0; index <= count; index += 1) {
    if (index < count && test(index)) {
      if (start < 0) start = index
    } else if (start >= 0) {
      const length = index - start
      if (!best || length > best.length) best = { start, length }
      start = -1
    }
  }
  return best
}

export const rangeLabel = (start: number, length: number) =>
  length === 1 ? `cena ${start + 1}` : `cenas ${start + 1}–${start + length}`

// --- Cast presence -------------------------------------------------------

export interface CastRow {
  entityId: string
  name: string
  type: string
  // Mentions per scene, in timeline order.
  mentions: number[]
  total: number
  scenes: number
}

const stripAccents = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * How often each entity is named in each scene, by its name and aliases.
 * Matching keeps capitalisation, so a character called "Rosa" isn't counted
 * every time a rose appears in lowercase.
 */
export function castPresence(entities: ProjectEntity[], texts: string[]): CastRow[] {
  const plain = texts.map(stripAccents)
  return entities
    .filter((entity) => !entity.canonicalId)
    .map((entity) => {
      const names = [entity.name, ...entity.aliases.map((alias) => alias.name)]
        .map((name) => stripAccents(name.trim()))
        .filter((name) => name.length >= 2)
      const pattern = names.length
        ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
        : null
      const mentions = plain.map((text) => (pattern ? (text.match(pattern) ?? []).length : 0))
      return {
        entityId: entity.id,
        name: entity.name,
        type: entity.type,
        mentions,
        total: mentions.reduce((a, b) => a + b, 0),
        scenes: mentions.filter(Boolean).length,
      }
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.scenes - a.scenes || b.total - a.total)
}

/** Approved facts recorded in each scene: the state changes the Arquivista kept. */
export function factsPerScene(entities: ProjectEntity[], scenes: Slot[]): number[] {
  const index = new Map(scenes.map((slot, position) => [slot.id, position]))
  const counts = new Array<number>(scenes.length).fill(0)
  for (const entity of entities) {
    for (const fact of entity.facts) {
      const position = index.get(fact.slot.id)
      if (position !== undefined) counts[position] += 1
    }
  }
  return counts
}

// --- Openings ------------------------------------------------------------

const stopwords = new Set(
  'aquele aquela aquilo quando depois antes sobre entre ainda porque enquanto tambem apenas mesmo outra outro todos todas nunca sempre estava estavam tinha tinham seria havia esta estas esse essa isso disse'.split(' '),
)

// Content words of a sentence, by stem, keeping one spelling to show.
function contentWords(sentence: string): Map<string, string> {
  const words = new Map<string, string>()
  for (const word of normalizeForSearch(sentence).split(/[^a-z0-9]+/)) {
    if (word.length >= 5 && !stopwords.has(word) && !words.has(word.slice(0, 6))) words.set(word.slice(0, 6), word)
  }
  return words
}

export interface OpeningCluster {
  seed: number
  scenes: number[]
  // Words most of these openings share.
  words: string[]
}

/**
 * Groups of three or more scenes whose first sentences share at least two
 * content words with the same first sentence, e.g. scenes that all open with
 * someone waking up. Each group grows from one opening, so loosely related
 * openings don't chain into one big group.
 */
export function similarOpenings(openings: string[]): OpeningCluster[] {
  const sets = openings.map(contentWords)
  const sharedWith = (a: number, b: number) => [...sets[a].keys()].filter((stem) => sets[b].has(stem))
  const neighbours = sets.map((_, a) => sets.map((__, b) => b).filter((b) => b !== a && sharedWith(a, b).length >= 2))
  const taken = new Set<number>()
  const clusters: OpeningCluster[] = []
  for (;;) {
    let seed = -1
    let size = 0
    neighbours.forEach((list, index) => {
      if (taken.has(index)) return
      const free = list.filter((other) => !taken.has(other)).length
      if (free > size) {
        seed = index
        size = free
      }
    })
    if (seed < 0 || size < 2) break
    const scenes = [seed, ...neighbours[seed].filter((other) => !taken.has(other))].sort((a, b) => a - b)
    scenes.forEach((index) => taken.add(index))
    const words = [...sets[seed].entries()]
      .filter(([stem]) => scenes.filter((index) => sets[index].has(stem)).length * 2 >= scenes.length)
      .map(([, word]) => word)
    clusters.push({ seed, scenes, words })
  }
  return clusters
}

// --- Structure proportions -----------------------------------------------

export interface GroupShare {
  group: SceneGroup
  scenes: number
  words: number
  share: number
  // Share the matched template usually gives this group, if any.
  expected: number | null
}

/**
 * How much of the book (in words) each group takes, in timeline order. When
 * the group names come from a structure template, its usual proportions are
 * given for comparison, rescaled to the template's groups that are present.
 */
export function groupShares(
  groups: SceneGroup[],
  runs: GroupRun[],
  words: number[],
): { rows: GroupShare[]; template: string | null } {
  const total = words.reduce((a, b) => a + b, 0) || 1
  const byGroup = new Map<string, { scenes: number; words: number }>()
  for (const run of runs) {
    const entry = byGroup.get(run.groupId) ?? { scenes: 0, words: 0 }
    entry.scenes += run.length
    entry.words += words.slice(run.start, run.start + run.length).reduce((a, b) => a + b, 0)
    byGroup.set(run.groupId, entry)
  }
  const present = groups
    .filter((group) => byGroup.has(group.id))
    .sort((a, b) => a.position - b.position)

  const normalize = (name: string) => normalizeForSearch(name).replace(/[^a-z0-9]+/g, ' ').trim()
  let template: (typeof structureTemplates)[number] | null = null
  let best = 0
  for (const candidate of structureTemplates) {
    const names = new Set(candidate.groups.map(normalize))
    const matched = present.filter((group) => names.has(normalize(group.name))).length
    if (matched >= 2 && matched > best) {
      best = matched
      template = candidate
    }
  }
  const expectedOf = (group: SceneGroup) => {
    if (!template) return null
    const index = template.groups.map(normalize).indexOf(normalize(group.name))
    return index >= 0 ? template.shares[index] : null
  }
  const expectedTotal = present.reduce((sum, group) => sum + (expectedOf(group) ?? 0), 0) || 1

  return {
    template: template?.name ?? null,
    rows: present.map((group) => {
      const entry = byGroup.get(group.id)!
      const expected = expectedOf(group)
      return {
        group,
        scenes: entry.scenes,
        words: entry.words,
        share: entry.words / total,
        expected: expected === null ? null : expected / expectedTotal,
      }
    }),
  }
}
