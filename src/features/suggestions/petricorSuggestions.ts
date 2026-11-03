import { api } from '../../api/client'
import type { StoredSuggestion, SuggestionStatus } from '../../api/contracts'
import { decryptScene, decryptSceneDraft, encryptScene, encryptSceneDraft } from '../../crypto/projectEncryption'
import { applyEdits, type TextEdit } from './edits'

// Suggestions of projects without a linked Google Doc. Each one is sealed
// with the project key, with a little of the text around it, so it can be
// found again after the scene was edited or a new version was imported.

// Characters of context kept on each side of the passage.
const CONTEXT = 40
// A few characters on each side are enough to recognise the place.
const EDGE = 15

export interface SuggestionBody extends TextEdit {
  author: string
  before: string
  after: string
}

export interface PetricorSuggestion extends SuggestionBody {
  id: string
  slotId: string
  status: SuggestionStatus
  createdAt: string
}

export function describeEdit(text: string, edit: TextEdit, author: string): SuggestionBody {
  return {
    ...edit,
    author,
    before: text.slice(Math.max(0, edit.start - CONTEXT), edit.start),
    after: text.slice(edit.end, edit.end + CONTEXT),
  }
}

async function seal(projectKey: CryptoKey, body: SuggestionBody) {
  return encryptScene(projectKey, JSON.stringify(body))
}

async function open(projectKey: CryptoKey, stored: StoredSuggestion): Promise<PetricorSuggestion> {
  const body = JSON.parse(await decryptScene(projectKey, stored.ciphertext, stored.iv)) as SuggestionBody
  return { ...body, id: stored.id, slotId: stored.slotId, status: stored.status, createdAt: stored.createdAt }
}

export async function listSuggestions(projectId: string, projectKey: CryptoKey) {
  return Promise.all((await api.listSuggestions(projectId)).map((stored) => open(projectKey, stored)))
}

export async function createSuggestions(
  projectId: string,
  projectKey: CryptoKey,
  slotId: string,
  text: string,
  edits: TextEdit[],
  author: string,
) {
  const items = await Promise.all(
    edits.map(async (edit) => ({ slotId, ...(await seal(projectKey, describeEdit(text, edit, author))) })),
  )
  return api.createSuggestions(projectId, items)
}

/**
 * Where the suggestion's passage is in the scene's text now: at its place if
 * the text there is unchanged, or wherever the passage with its context is
 * (the nearest one to where it was). Null when it can't be found for sure.
 */
export function locate(text: string, suggestion: SuggestionBody): { start: number; end: number } | null {
  const { start, end, removed, before, after } = suggestion
  // Both sides: an insertion's passage is empty, so only its context tells
  // whether the place still reads as it did.
  if (
    text.slice(start, end) === removed &&
    text.slice(Math.max(0, start - before.length), start) === before &&
    text.slice(end, end + after.length) === after
  ) {
    return { start, end }
  }
  // The whole context first; then less of it, since a nearby change (another
  // suggestion accepted, a word fixed) shouldn't lose a passage still there.
  for (const length of [CONTEXT, EDGE]) {
    const lead = before.slice(-length)
    const needle = lead + removed + after.slice(0, length)
    if (needle.trim().length < 8) continue
    const found: number[] = []
    for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) {
      found.push(index + lead.length)
    }
    if (found.length === 0) continue
    const nearest = found.reduce((best, index) => (Math.abs(index - start) < Math.abs(best - start) ? index : best))
    return { start: nearest, end: nearest + removed.length }
  }
  return null
}

/** Whether the scene's text now reads as the suggestion proposed there. */
export function looksApplied(text: string, suggestion: SuggestionBody): boolean {
  const lead = suggestion.before.slice(-EDGE)
  const tail = suggestion.after.slice(0, EDGE)
  if (text.includes(lead + suggestion.inserted + tail)) return true
  // One side is enough when the other was rewritten too; a removal has no
  // text of its own, so it needs both.
  if (suggestion.inserted.trim().length < 3) return false
  return text.includes(lead + suggestion.inserted) || text.includes(suggestion.inserted + tail)
}

/**
 * What became of an open suggestion in a new version of the scene: still
 * open (found again, perhaps moved), accepted (the text reads as proposed),
 * changed (its surroundings are there, rewritten some other way) or gone.
 */
export function followSuggestion(
  text: string,
  suggestion: SuggestionBody,
): { status: 'OPEN'; place: { start: number; end: number } } | { status: 'ACCEPTED' | 'CHANGED' | 'GONE' } {
  const place = locate(text, suggestion)
  if (place) return { status: 'OPEN', place }
  if (looksApplied(text, suggestion)) return { status: 'ACCEPTED' }
  const nearby = [suggestion.before.slice(-EDGE), suggestion.after.slice(0, EDGE)].filter((edge) => edge.trim().length >= 5)
  return nearby.some((edge) => text.includes(edge)) ? { status: 'CHANGED' } : { status: 'GONE' }
}

/**
 * Accepts and declines. Accepted suggestions are applied to their scenes'
 * text, all of a scene at once; one that can no longer be found stays open.
 * Returns the scenes whose text changed and the suggestions left open.
 */
export async function decideSuggestions(
  projectId: string,
  projectKey: CryptoKey,
  decisions: Array<{ suggestion: PetricorSuggestion; accept: boolean }>,
) {
  const accepted = new Map<string, PetricorSuggestion[]>()
  for (const { suggestion, accept } of decisions) {
    if (accept) accepted.set(suggestion.slotId, [...(accepted.get(suggestion.slotId) ?? []), suggestion])
  }
  const changedSlotIds: string[] = []
  const notFound = new Set<string>()
  for (const [slotId, suggestions] of accepted) {
    const review = await api.getSlotReview(slotId)
    const draft = review.content
      ? await decryptSceneDraft(projectKey, review.content.ciphertext, review.content.iv)
      : { content: '', genre: '', focusMode: 'GENERAL' }
    const text = draft.content ?? ''
    const placed = suggestions.flatMap((suggestion) => {
      const place = locate(text, suggestion)
      if (!place) notFound.add(suggestion.id)
      return place ? [{ ...place, inserted: suggestion.inserted }] : []
    })
    // Overlapping ones can't both apply: the first (in the text) wins.
    const applicable = placed
      .sort((a, b) => a.start - b.start)
      .filter((edit, index, all) => index === 0 || edit.start >= all[index - 1].end)
    if (applicable.length === 0) continue
    await api.saveSceneContent(
      slotId,
      await encryptSceneDraft(projectKey, {
        content: applyEdits(text, applicable),
        genre: draft.genre ?? '',
        focusMode: draft.focusMode ?? 'GENERAL',
      }),
    )
    changedSlotIds.push(slotId)
  }
  const updates = decisions
    .filter(({ suggestion }) => !notFound.has(suggestion.id))
    .map(({ suggestion, accept }) => ({ suggestionId: suggestion.id, status: (accept ? 'ACCEPTED' : 'DECLINED') as SuggestionStatus }))
  if (updates.length > 0) await api.updateSuggestions(projectId, updates)
  return { changedSlotIds, notFound: [...notFound] }
}

/**
 * After a new version of these scenes was imported: what became of each open
 * suggestion on them. Moved passages are sealed again with their new place.
 */
export async function followSuggestions(
  projectId: string,
  projectKey: CryptoKey,
  texts: Map<string, string>,
): Promise<Record<SuggestionStatus, number>> {
  const counts: Record<SuggestionStatus, number> = { OPEN: 0, ACCEPTED: 0, DECLINED: 0, CHANGED: 0, GONE: 0 }
  const open = (await listSuggestions(projectId, projectKey)).filter(
    (suggestion) => suggestion.status === 'OPEN' && texts.has(suggestion.slotId),
  )
  const updates = await Promise.all(
    open.map(async (suggestion) => {
      const text = texts.get(suggestion.slotId)!
      const fate = followSuggestion(text, suggestion)
      counts[fate.status] += 1
      if (fate.status !== 'OPEN') return { suggestionId: suggestion.id, status: fate.status }
      if (fate.place.start === suggestion.start) return null
      const moved = describeEdit(text, { ...suggestion, ...fate.place }, suggestion.author)
      return { suggestionId: suggestion.id, status: 'OPEN' as const, ...(await seal(projectKey, moved)) }
    }),
  )
  const changes = updates.filter((update) => update !== null)
  if (changes.length > 0) await api.updateSuggestions(projectId, changes)
  return counts
}
