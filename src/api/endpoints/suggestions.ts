import type { StoredSuggestion, SuggestionStatus } from '../contracts'
import { jsonBody, request } from '../http'

// Suggested edits of projects without a linked Google Doc, encrypted here.
export const suggestionsApi = {
  listSuggestions: (projectId: string) => request<StoredSuggestion[]>(`/api/v1/projects/${projectId}/suggestions`),

  createSuggestions: (projectId: string, items: Array<{ slotId: string; ciphertext: string; iv: string }>) =>
    request<StoredSuggestion[]>(`/api/v1/projects/${projectId}/suggestions`, { method: 'POST', ...jsonBody({ items }) }),

  // Decisions, or what an import found; a passage that moved comes re-encrypted.
  updateSuggestions: (
    projectId: string,
    updates: Array<{ suggestionId: string; status: SuggestionStatus; ciphertext?: string; iv?: string }>,
  ) => request<StoredSuggestion[]>(`/api/v1/projects/${projectId}/suggestions`, { method: 'PATCH', ...jsonBody({ updates }) }),

  deleteSuggestion: (suggestionId: string) => request<void>(`/api/v1/suggestions/${suggestionId}`, { method: 'DELETE' }),
}
