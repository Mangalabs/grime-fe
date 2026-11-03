import type { TextEdit } from './edits'

// Suggesting mode, as in Google Docs: the reviewer types into the text, but
// nothing of the original is lost. What they add is kept apart; what they
// delete is only marked. The text on screen (the "visual" text) shows both:
// added text, then each original character, struck through when deleted.

export interface SuggestDraft {
  original: string
  // Per original character: marked for deletion.
  deleted: boolean[]
  // Per gap (before character i; the last one after the end): text added there.
  inserted: string[]
}

export type DraftPiece = { text: string; kind: 'same' | 'added' | 'removed' }

export function startDraft(original: string): SuggestDraft {
  return {
    original,
    deleted: new Array<boolean>(original.length).fill(false),
    inserted: new Array<string>(original.length + 1).fill(''),
  }
}

/** The visual text in runs, to draw: added, unchanged and struck text. */
export function draftPieces(draft: SuggestDraft): DraftPiece[] {
  const pieces: DraftPiece[] = []
  const push = (text: string, kind: DraftPiece['kind']) => {
    if (!text) return
    const last = pieces.at(-1)
    if (last?.kind === kind) last.text += text
    else pieces.push({ text, kind })
  }
  for (let index = 0; index <= draft.original.length; index += 1) {
    push(draft.inserted[index], 'added')
    if (index < draft.original.length) push(draft.original[index], draft.deleted[index] ? 'removed' : 'same')
  }
  return pieces
}

export const visualLength = (draft: SuggestDraft) => draft.original.length + draft.inserted.reduce((sum, text) => sum + text.length, 0)

// What sits at a visual position: inside added text (gap `index`, `offset`
// into it), or an original character. A position between two characters is
// always in a gap: the end of the gap before the next original character.
type Spot = { kind: 'gap'; index: number; offset: number }
function gapAt(draft: SuggestDraft, position: number): Spot {
  let start = 0
  for (let index = 0; index <= draft.original.length; index += 1) {
    const added = draft.inserted[index].length
    if (position <= start + added) return { kind: 'gap', index, offset: position - start }
    start += added + 1
  }
  return { kind: 'gap', index: draft.original.length, offset: draft.inserted[draft.original.length].length }
}

// The character just after a visual position: added (in which gap) or original.
function charAfter(draft: SuggestDraft, position: number): { kind: 'added'; index: number; offset: number } | { kind: 'original'; index: number } | null {
  const spot = gapAt(draft, position)
  if (spot.offset < draft.inserted[spot.index].length) return { kind: 'added', index: spot.index, offset: spot.offset }
  return spot.index < draft.original.length ? { kind: 'original', index: spot.index } : null
}

const copy = (draft: SuggestDraft): SuggestDraft => ({ ...draft, deleted: [...draft.deleted], inserted: [...draft.inserted] })

export type DraftChange = { draft: SuggestDraft; caret: number }

/** Adds text at a visual position; the caret ends after it. */
export function insertText(draft: SuggestDraft, position: number, text: string): DraftChange {
  if (!text) return { draft, caret: position }
  const next = copy(draft)
  const { index, offset } = gapAt(draft, position)
  next.inserted[index] = next.inserted[index].slice(0, offset) + text + next.inserted[index].slice(offset)
  return { draft: next, caret: position + text.length }
}

/**
 * Deletes a visual range: added text in it goes away, original text in it is
 * marked. The caret ends at the end of what remains of the range, so text
 * typed next reads after the struck passage ("~~rua escura~~viela").
 */
export function deleteRange(draft: SuggestDraft, from: number, to: number): DraftChange {
  if (to <= from) return { draft, caret: from }
  const next = copy(draft)
  let removedAdded = 0
  // Back to front, so earlier positions stay valid while removing.
  for (let position = to - 1; position >= from; position -= 1) {
    const char = charAfter(next, position)
    if (!char) continue
    if (char.kind === 'added') {
      next.inserted[char.index] = next.inserted[char.index].slice(0, char.offset) + next.inserted[char.index].slice(char.offset + 1)
      removedAdded += 1
    } else {
      next.deleted[char.index] = true
    }
  }
  return { draft: next, caret: to - removedAdded }
}

/** Backspace: removes the added character before the caret, or marks the original one (skipping text already struck). */
export function deleteBackward(draft: SuggestDraft, position: number): DraftChange {
  let at = position
  while (at > 0) {
    const char = charAfter(draft, at - 1)
    if (char?.kind === 'original' && draft.deleted[char.index]) {
      at -= 1
      continue
    }
    break
  }
  if (at === 0) return { draft, caret: position }
  const char = charAfter(draft, at - 1)!
  const next = copy(draft)
  if (char.kind === 'added') {
    next.inserted[char.index] = next.inserted[char.index].slice(0, char.offset) + next.inserted[char.index].slice(char.offset + 1)
  } else {
    next.deleted[char.index] = true
  }
  return { draft: next, caret: at - 1 }
}

/** Delete: removes the added character after the caret, or marks the original one and steps over it. */
export function deleteForward(draft: SuggestDraft, position: number): DraftChange {
  const end = visualLength(draft)
  let at = position
  while (at < end) {
    const char = charAfter(draft, at)
    if (char?.kind === 'original' && draft.deleted[char.index]) {
      at += 1
      continue
    }
    break
  }
  const char = at < end ? charAfter(draft, at) : null
  if (!char) return { draft, caret: position }
  const next = copy(draft)
  if (char.kind === 'added') {
    next.inserted[char.index] = next.inserted[char.index].slice(0, char.offset) + next.inserted[char.index].slice(char.offset + 1)
    return { draft: next, caret: at }
  }
  next.deleted[char.index] = true
  return { draft: next, caret: at + 1 }
}

/** The changes as edits of the original text: one per run of struck and added text. */
export function draftEdits(draft: SuggestDraft): TextEdit[] {
  const edits: TextEdit[] = []
  const { original, deleted, inserted } = draft
  let index = 0
  while (index <= original.length) {
    if (!inserted[index] && !(index < original.length && deleted[index])) {
      index += 1
      continue
    }
    const start = index
    let added = ''
    for (;;) {
      added += inserted[index]
      if (index < original.length && deleted[index]) {
        index += 1
        continue
      }
      break
    }
    edits.push({ start, end: index, removed: original.slice(start, index), inserted: added })
    index += 1
  }
  return edits
}
