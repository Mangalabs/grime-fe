import { google } from '../../api/client'
import { encryptScene } from '../../crypto/projectEncryption'
import type { TextEdit } from './edits'
import { createSuggestions } from './petricorSuggestions'

/**
 * Sends a reviewer's changes to a scene as suggestions: native suggested edits
 * in the linked Google Doc, or Petricor's own without one. The name is sealed
 * with the project key either way.
 */
export async function sendSuggestions(options: {
  projectId: string
  projectKey: CryptoKey
  slotId: string
  // The scene's text the edits were made on.
  text: string
  edits: TextEdit[]
  author: string
  isLinked: boolean
}) {
  const { projectId, projectKey, slotId, text, edits, author, isLinked } = options
  if (isLinked) {
    await google.createSuggestions(projectId, { slotId, edits, author: await encryptScene(projectKey, author) })
  } else {
    await createSuggestions(projectId, projectKey, slotId, text, edits, author)
  }
}

// The reviewer's name, remembered in this browser only.
const NAME_KEY = 'petricor:suggester-name'

export function rememberedSuggester(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberSuggester(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Only a convenience.
  }
}
