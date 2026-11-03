import type {
  EntityPageSummary,
  SealedText,
  StoredEncryptedDocument,
  StoredStyleSheet,
} from '../contracts'
import { request, jsonBody } from '../http'

export const documentsApi = {
  // 404 until the project has a style sheet.
  getStyleSheet: (projectId: string) =>
    request<StoredStyleSheet>(`/api/v1/projects/${projectId}/style-sheet`),

  saveStyleSheet: (projectId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredStyleSheet>(`/api/v1/projects/${projectId}/style-sheet`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

  // 404 while the project uses the built-in templates.
  getWikiTemplates: (projectId: string) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/wiki-templates`),

  saveWikiTemplates: (projectId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/wiki-templates`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

  listEntityPages: (projectId: string) =>
    request<EntityPageSummary[]>(`/api/v1/projects/${projectId}/entity-pages`),

  // 404 until the entity has a page.
  getEntityPage: (entityId: string) =>
    request<StoredEncryptedDocument>(`/api/v1/entities/${entityId}/page`),

  saveEntityPage: (entityId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredEncryptedDocument>(`/api/v1/entities/${entityId}/page`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

  deleteEntityPage: (entityId: string) =>
    request<void>(`/api/v1/entities/${entityId}/page`, { method: 'DELETE' }),
}
