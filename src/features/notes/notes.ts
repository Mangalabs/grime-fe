import type { NoteKind, NoteStatus } from '../../api/contracts'

/** A review note with its private part decrypted. */
export interface Note {
  id: string
  slotId: string | null
  kind: NoteKind
  status: NoteStatus
  body: string
  author: string
  excerpt: { quote: string; start: number; end: number } | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  // The text couldn't be decrypted (another key, or corrupted data).
  isUnreadable: boolean
}

export const noteKindLabels: Record<NoteKind, string> = {
  NOTE: 'Nota',
  QUESTION: 'Pergunta',
  FIX: 'Corrigir',
  IDEA: 'Ideia',
}

/** Where an excerpt note sits in the current scene text, if it still does. */
export interface NoteAnchor {
  noteId: string
  start: number
  end: number
  kind: NoteKind
}

/**
 * Finds a note's excerpt in the scene text: at the saved offsets when the
 * text there is unchanged, otherwise the occurrence of the quote nearest to
 * where it used to be. Returns null when the excerpt no longer exists.
 */
export function resolveAnchor(content: string, note: Note): NoteAnchor | null {
  const excerpt = note.excerpt
  if (!excerpt || !excerpt.quote) return null
  const anchor = (start: number) => ({
    noteId: note.id,
    start,
    end: start + excerpt.quote.length,
    kind: note.kind,
  })
  if (content.slice(excerpt.start, excerpt.end) === excerpt.quote) return anchor(excerpt.start)

  let best: number | null = null
  let from = content.indexOf(excerpt.quote)
  while (from >= 0) {
    if (best === null || Math.abs(from - excerpt.start) < Math.abs(best - excerpt.start)) best = from
    from = content.indexOf(excerpt.quote, from + 1)
  }
  return best === null ? null : anchor(best)
}

const authorKey = 'petricor-note-author'

// The name a person signs notes with; kept per browser, never required.
export function readAuthorName(): string {
  try {
    return localStorage.getItem(authorKey) ?? ''
  } catch {
    return ''
  }
}

export function writeAuthorName(name: string) {
  try {
    localStorage.setItem(authorKey, name)
  } catch {
    // The name is simply asked for again next time.
  }
}
