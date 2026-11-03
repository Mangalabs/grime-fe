import { diffSequences } from '../versions/diff'

/** A change to a text: [start, end) of the original becomes `inserted`. */
export interface TextEdit {
  start: number
  end: number
  // The original text of [start, end), so the change can be checked later.
  removed: string
  inserted: string
}

// Words and the spaces between them as separate tokens, so a change of
// spacing is a change, and every token has an exact place in the text.
const tokenize = (text: string) => text.match(/\s+|[^\s]+/g) ?? []

/**
 * The reviewer's changes between the original and the edited text, word by
 * word. Two changes with only a space between them are one: "rua escura" →
 * "viela clara" is a single suggestion, not two.
 */
export function editsBetween(original: string, edited: string): TextEdit[] {
  if (original === edited) return []
  const before = tokenize(original)
  const after = tokenize(edited)
  const ops = diffSequences(before, after)
  if (!ops) return [{ start: 0, end: original.length, removed: original, inserted: edited }]

  const edits: TextEdit[] = []
  let offset = 0
  let current: TextEdit | null = null
  // A space kept between two changes, held until we know whether another follows.
  let pendingSpace = ''
  const close = () => {
    if (current) edits.push(current)
    current = null
    pendingSpace = ''
  }
  for (const op of ops) {
    const text = op.items.join('')
    if (op.type === 'same') {
      if (current && /^\s+$/.test(text) && !pendingSpace) {
        pendingSpace = text
      } else {
        close()
      }
      offset += text.length
      continue
    }
    if (!current) {
      current = { start: offset, end: offset, removed: '', inserted: '' }
    } else if (pendingSpace) {
      // Join across the space: it is removed and inserted again, unchanged.
      current.end += pendingSpace.length
      current.removed += pendingSpace
      current.inserted += pendingSpace
      pendingSpace = ''
    }
    if (op.type === 'del') {
      current.end += text.length
      current.removed += text
      offset += text.length
    } else {
      current.inserted += text
    }
  }
  close()
  return edits
}

/** The text with the edits applied (edits in the original's positions). */
export function applyEdits(text: string, edits: Array<Pick<TextEdit, 'start' | 'end' | 'inserted'>>): string {
  return [...edits]
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce((result, edit) => result.slice(0, edit.start) + edit.inserted + result.slice(edit.end), text)
}
