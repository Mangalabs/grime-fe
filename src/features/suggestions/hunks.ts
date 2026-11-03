// A suggested edit shown like a pull-request review: the paragraph it touches,
// as it is and as it would be.

export interface Suggestion {
  id: string
  // Every id the decision applies to: a replacement made from Petricor in
  // Google Docs is a removal and an insertion, decided together.
  ids?: string[]
  // The passage it would remove, [start, end) in the scene text.
  start: number
  end: number
  // What it would add at `start`.
  inserted: string
  // Who suggested it; null when unknown (typed in Google Docs).
  author?: string | null
}

/**
 * Joins a removal and an insertion placed right after it, by the same person,
 * into one replacement: Google keeps them as two suggestions when Petricor
 * creates them, but they are one change.
 */
export function mergeReplacements(suggestions: Suggestion[]): Suggestion[] {
  const sorted = [...suggestions].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Suggestion[] = []
  for (const suggestion of sorted) {
    const last = merged.at(-1)
    const isRemoval = last && last.end > last.start && last.inserted === ''
    const isInsertion = suggestion.start === suggestion.end && suggestion.inserted !== ''
    // Only pairs Petricor made (they carry a name): two neighbouring Docs
    // suggestions may be from different people.
    const samePerson = last?.author != null && last.author === suggestion.author
    if (last && isRemoval && isInsertion && suggestion.start === last.end && samePerson) {
      merged[merged.length - 1] = {
        ...last,
        ids: [...(last.ids ?? [last.id]), ...(suggestion.ids ?? [suggestion.id])],
        inserted: suggestion.inserted,
      }
    } else {
      merged.push(suggestion)
    }
  }
  return merged
}

/** The ids a decision on this suggestion applies to. */
export const decisionIds = (suggestion: Suggestion) => suggestion.ids ?? [suggestion.id]

export type HunkPart = { text: string; change: 'same' | 'removed' | 'added' }

export interface Hunk {
  suggestion: Suggestion
  // The paragraph as it is, with the removed passage marked.
  before: HunkPart[]
  // The same paragraph with the suggestion applied, the added text marked.
  after: HunkPart[]
}

// Context: the whole paragraph, cut to this many characters on each side.
const CONTEXT = 160

function contextAround(text: string, start: number, end: number) {
  const paragraphStart = text.lastIndexOf('\n', start - 1) + 1
  const breakAfter = text.indexOf('\n', end)
  const paragraphEnd = breakAfter === -1 ? text.length : breakAfter
  const from = Math.max(paragraphStart, start - CONTEXT)
  const to = Math.min(paragraphEnd, end + CONTEXT)
  return {
    lead: `${from > paragraphStart ? '…' : ''}${text.slice(from, start)}`,
    tail: `${text.slice(end, to)}${to < paragraphEnd ? '…' : ''}`,
  }
}

const parts = (...items: HunkPart[]) => items.filter((part) => part.text !== '')

/** One hunk per suggestion, in the order of the text. */
export function buildHunks(text: string, suggestions: Suggestion[]): Hunk[] {
  return [...suggestions]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((suggestion) => {
      const start = Math.min(suggestion.start, text.length)
      const end = Math.min(Math.max(suggestion.end, start), text.length)
      const { lead, tail } = contextAround(text, start, end)
      return {
        suggestion,
        before: parts(
          { text: lead, change: 'same' },
          { text: text.slice(start, end), change: 'removed' },
          { text: tail, change: 'same' },
        ),
        after: parts(
          { text: lead, change: 'same' },
          { text: suggestion.inserted, change: 'added' },
          { text: tail, change: 'same' },
        ),
      }
    })
}

/** "Troca", "Inclui" or "Remove": what the suggestion does, in a word. */
export function suggestionKind(suggestion: Suggestion): 'replace' | 'insert' | 'delete' {
  if (suggestion.start === suggestion.end) return 'insert'
  return suggestion.inserted === '' ? 'delete' : 'replace'
}
