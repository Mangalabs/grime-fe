import type {
  GoogleCommentItem,
  GoogleCommentSummary,
  GoogleDocLink,
  GoogleDocSectionLink,
  GoogleDocSuggestionSection,
  GoogleDocSync,
  GoogleHeadingLevel,
  GoogleStatus,
  SuggestionDecision,
} from '../contracts'
import { request, jsonBody } from '../http'

// Google Docs sync: the account connection, and the doc linked to a project.
export const google = {
  status: () => request<GoogleStatus>('/api/v1/integrations/google'),

  // 'comment' asks Google for the extra permission to write comments.
  connect: (permission: 'read' | 'comment' = 'read') =>
    request<{ authUrl: string }>('/api/v1/integrations/google/connect', {
      method: 'POST',
      ...jsonBody({ permission }),
    }),

  publishComments: (projectId: string, items: GoogleCommentItem[]) =>
    request<GoogleCommentSummary>(`/api/v1/projects/${projectId}/google-doc/comments`, {
      method: 'POST',
      ...jsonBody({ items }),
    }),

  disconnect: () => request<void>('/api/v1/integrations/google', { method: 'DELETE' }),

  getLink: (projectId: string) =>
    request<{ link: GoogleDocLink | null }>(`/api/v1/projects/${projectId}/google-doc`),

  link: (projectId: string, document: string, headingLevel: GoogleHeadingLevel) =>
    request<GoogleDocLink>(`/api/v1/projects/${projectId}/google-doc`, {
      method: 'PUT',
      ...jsonBody({ document, headingLevel }),
    }),

  unlink: (projectId: string) =>
    request<void>(`/api/v1/projects/${projectId}/google-doc`, { method: 'DELETE' }),

  fetchForSync: (projectId: string) =>
    request<GoogleDocSync>(`/api/v1/projects/${projectId}/google-doc/fetch`, { method: 'POST' }),

  // Suggested edits open in the doc, by scene.
  listSuggestions: (projectId: string) =>
    request<{ sections: GoogleDocSuggestionSection[] }>(`/api/v1/projects/${projectId}/google-doc/suggestions`),

  // The reviewer's edits of one scene, made native suggested edits in the doc.
  createSuggestions: (
    projectId: string,
    suggestion: {
      slotId: string
      edits: Array<{ start: number; end: number; removed: string; inserted: string }>
      author: { ciphertext: string; iv: string } | null
    },
  ) =>
    request<{ created: number }>(`/api/v1/projects/${projectId}/google-doc/suggestions`, {
      method: 'POST',
      ...jsonBody(suggestion),
    }),

  // Accepts or rejects them in the doc itself; the next sync brings the text.
  decideSuggestions: (projectId: string, decisions: SuggestionDecision[]) =>
    request<{ accepted: number; rejected: number }>(`/api/v1/projects/${projectId}/google-doc/suggestions/decide`, {
      method: 'POST',
      ...jsonBody({ decisions }),
    }),

  recordSync: (
    projectId: string,
    sync: { revisionId: string; sections: GoogleDocSectionLink[]; changedSlotIds: string[] },
  ) =>
    request<GoogleDocLink>(`/api/v1/projects/${projectId}/google-doc/synced`, {
      method: 'POST',
      ...jsonBody(sync),
    }),
}
