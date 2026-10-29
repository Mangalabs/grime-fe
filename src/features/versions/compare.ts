import type { Note } from '../notes/notes'
import { locateQuote } from '../scenes/quotes'
import { diffSequences, diffStats, diffText, setSimilarity, shingleSet, type ParagraphDiff } from './diff'
import type { VersionScene } from './versions'

/** One scene of a comparison between two versions of the manuscript. */
export interface SceneChange {
  slotId: string
  title: string
  status: 'same' | 'changed' | 'added' | 'removed'
  before: string
  after: string
  added: number
  removed: number
  // Share of the scene's words touched, 0–1, for the change bar.
  share: number
}

const words = (text: string) => text.match(/\S+/g)?.length ?? 0
// Line endings and trailing spaces aren't a change anyone made.
const settled = (text: string) => text.replace(/\r\n?/g, '\n').replace(/[^\S\n]+$/gm, '').trim()

/**
 * Scenes of `after` in its order, with the scenes only in `before` placed
 * where they used to be. Word counts come from the paragraph diff.
 */
export function compareScenes(before: VersionScene[], after: VersionScene[]): SceneChange[] {
  const old = new Map(before.map((scene) => [scene.slotId, scene]))
  const kept = new Set(after.map((scene) => scene.slotId))
  const changes: SceneChange[] = []
  const removedBefore = (slotId: string | null) => {
    // Removed scenes go before the first scene that followed them.
    for (const scene of before) {
      if (kept.has(scene.slotId)) {
        if (scene.slotId === slotId) return
        continue
      }
      if (changes.some((change) => change.slotId === scene.slotId)) continue
      const total = words(scene.content)
      changes.push({ ...scene, status: 'removed', before: scene.content, after: '', added: 0, removed: total, share: 1 })
    }
  }

  for (const scene of after) {
    removedBefore(scene.slotId)
    const previous = old.get(scene.slotId)
    if (!previous) {
      const total = words(scene.content)
      changes.push({ ...scene, status: 'added', before: '', after: scene.content, added: total, removed: 0, share: 1 })
      continue
    }
    if (settled(previous.content) === settled(scene.content)) {
      changes.push({ ...scene, status: 'same', before: previous.content, after: scene.content, added: 0, removed: 0, share: 0 })
      continue
    }
    const { added, removed } = diffStats(diffText(previous.content, scene.content))
    const share = Math.min(1, (added + removed) / Math.max(words(previous.content) + words(scene.content), 1))
    changes.push({ ...scene, status: 'changed', before: previous.content, after: scene.content, added, removed, share })
  }
  removedBefore(null)
  return changes
}

export function sceneDiff(change: SceneChange): ParagraphDiff[] {
  return diffText(change.before, change.after)
}

export type NoteFate =
  // The scene didn't change at all.
  | 'untouched'
  // The scene changed, but the quoted passage is still there as it was.
  | 'kept'
  // The quoted passage was rewritten or cut.
  | 'changed'
  // The scene is gone.
  | 'removed'
  // Not in either version (written after, or about the whole scene).
  | 'unknown'

export interface NoteFollowUp {
  note: Note
  fate: NoteFate
}

export const noteFateLabels: Record<NoteFate, string> = {
  untouched: 'Cena sem mudanças',
  kept: 'Trecho mantido',
  changed: 'Trecho alterado',
  removed: 'Cena removida',
  unknown: 'Sem trecho para conferir',
}

/** What the revision did to the passage each note is about. */
export function followNotes(notes: Note[], changes: SceneChange[]): NoteFollowUp[] {
  const bySlot = new Map(changes.map((change) => [change.slotId, change]))
  return notes
    .filter((note) => note.slotId && !note.isUnreadable)
    .map((note) => {
      const change = bySlot.get(note.slotId!)
      if (!change) return { note, fate: 'unknown' as const }
      if (change.status === 'removed') return { note, fate: 'removed' as const }
      if (change.status === 'same') return { note, fate: 'untouched' as const }
      const quote = note.excerpt?.quote
      if (!quote) return { note, fate: 'unknown' as const }
      if (locateQuote(change.after, quote)) return { note, fate: 'kept' as const }
      return { note, fate: locateQuote(change.before, quote) ? ('changed' as const) : ('unknown' as const) }
    })
}

/** An imported scene and the project scene it revises (null: a new scene). */
export interface RevisionMatch {
  sequence: number
  title: string
  content: string
  slotId: string | null
  // How it was matched, for the preview.
  reason: 'title' | 'order' | 'none'
}

const folded = (title: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

// Chapter numbers shift when a chapter is added or cut ("Capítulo 4 — A
// ponte" was "Capítulo 3 — A ponte"), so titles are compared without them.
const numbering =
  /^(?:(?:capitulo|cap|chapter|parte|part|cena|scene|livro|book)\s+)?(?:\d+|[ivxlcdm]+|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\b\s*/

export function titleKey(title: string) {
  const plain = folded(title)
  const bare = plain.replace(numbering, '').trim()
  return bare || plain
}

// Below this share of three-word runs, a scene in the same place is a
// different scene.
const SAME_SCENE_SIMILARITY = 0.2

/**
 * Pairs the scenes of an imported revision with the project's: titles that
 * line up in order first, then scenes in the gaps that still read alike.
 */
export function matchRevision(
  imported: Array<{ sequence: number; title: string; content: string }>,
  current: VersionScene[],
): RevisionMatch[] {
  const ops =
    diffSequences(
      imported.map((scene) => titleKey(scene.title)),
      current.map((scene) => titleKey(scene.title)),
      (x, y) => x !== '' && x === y,
    ) ?? []
  const importedWords = imported.map((scene) => shingleSet(scene.content))
  const currentWords = current.map((scene) => shingleSet(scene.content))
  const matches: RevisionMatch[] = []
  let i = 0
  let c = 0
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    if (op.type === 'same') {
      for (let step = 0; step < op.items.length; step += 1) {
        matches.push({ ...imported[i], slotId: current[c].slotId, reason: 'title' })
        i += 1
        c += 1
      }
      continue
    }
    // A gap: imported scenes ('del') against project scenes ('add'), in
    // either order. Pair them by place when the text still reads alike.
    const next = ops[index + 1]
    const importedCount = op.type === 'del' ? op.items.length : next?.type === 'del' ? next.items.length : 0
    const currentCount = op.type === 'add' ? op.items.length : next?.type === 'add' ? next.items.length : 0
    if (next && next.type !== 'same' && next.type !== op.type) index += 1
    const gapImported = imported.slice(i, i + importedCount)
    const gapCurrent = current.slice(c, c + currentCount)
    const used = new Set<number>()
    for (const [offset, scene] of gapImported.entries()) {
      let best = -1
      let bestScore = SAME_SCENE_SIMILARITY
      gapCurrent.forEach((_candidate, position) => {
        if (used.has(position)) return
        const score = setSimilarity(importedWords[i + offset], currentWords[c + position])
        if (score >= bestScore) {
          best = position
          bestScore = score
        }
      })
      if (best >= 0) used.add(best)
      matches.push({ ...scene, slotId: best >= 0 ? gapCurrent[best].slotId : null, reason: best >= 0 ? 'order' : 'none' })
    }
    i += importedCount
    c += currentCount
  }
  return matches
}
