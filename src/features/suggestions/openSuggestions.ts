import { google } from '../../api/client'
import { decryptScene } from '../../crypto/projectEncryption'
import { mergeReplacements } from './hunks'
import { listSuggestions, locate } from './petricorSuggestions'

/** An open suggestion placed in its scene's text, for exports. */
export interface PlacedSuggestion {
  start: number
  end: number
  inserted: string
  // Null when unknown: typed in Google Docs.
  author: string | null
}

/**
 * The open suggestions of these scenes, placed in the text given for each:
 * from the linked Google Doc (only where the scene's text is the doc's, so
 * the places hold), or from Petricor without a doc.
 */
export async function openSuggestionsBySlot(
  projectId: string,
  projectKey: CryptoKey,
  texts: Map<string, string>,
): Promise<Map<string, PlacedSuggestion[]>> {
  const bySlot = new Map<string, PlacedSuggestion[]>()
  const link = await google
    .getLink(projectId)
    .then((response) => response.link)
    .catch(() => null)

  if (link) {
    const { sections } = await google.listSuggestions(projectId)
    for (const section of sections) {
      if (!section.slotId || texts.get(section.slotId) !== section.text) continue
      const named = await Promise.all(
        section.suggestions.map(async ({ author, ...suggestion }) => ({
          ...suggestion,
          author: author ? await decryptScene(projectKey, author.ciphertext, author.iv).catch(() => null) : null,
        })),
      )
      bySlot.set(
        section.slotId,
        mergeReplacements(named).map(({ start, end, inserted, author }) => ({ start, end, inserted, author: author ?? null })),
      )
    }
    return bySlot
  }

  for (const suggestion of await listSuggestions(projectId, projectKey)) {
    const text = texts.get(suggestion.slotId)
    if (suggestion.status !== 'OPEN' || text === undefined) continue
    const place = locate(text, suggestion)
    if (!place) continue
    bySlot.set(suggestion.slotId, [...(bySlot.get(suggestion.slotId) ?? []), { ...place, inserted: suggestion.inserted, author: suggestion.author }])
  }
  return bySlot
}
