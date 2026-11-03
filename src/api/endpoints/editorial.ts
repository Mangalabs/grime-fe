import type {
  BoardProject,
  CreateVersion,
  SealedText,
  StoredEncryptedDocument,
  TimeEntry,
  VersionDetail,
  VersionSummary,
} from '../contracts'
import { request, jsonBody } from '../http'

export const editorialApi = {
  // The editorial pipeline; 404 until the project has one.
  getPipeline: (projectId: string) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/pipeline`),

  savePipeline: (projectId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/pipeline`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

  // Frozen copies of the manuscript; the list carries labels, not text.
  listVersions: (projectId: string) =>
    request<VersionSummary[]>(`/api/v1/projects/${projectId}/versions`),

  getVersion: (projectId: string, versionId: string) =>
    request<VersionDetail>(`/api/v1/projects/${projectId}/versions/${versionId}`),

  createVersion: (projectId: string, version: CreateVersion) =>
    request<VersionSummary>(`/api/v1/projects/${projectId}/versions`, {
      method: 'POST',
      ...jsonBody(version),
    }),

  deleteVersion: (projectId: string, versionId: string) =>
    request<void>(`/api/v1/projects/${projectId}/versions/${versionId}`, { method: 'DELETE' }),

  // Active review time, per day and stage.
  listTime: (projectId: string) => request<TimeEntry[]>(`/api/v1/projects/${projectId}/time`),

  recordTime: (projectId: string, entry: TimeEntry) =>
    request<void>(`/api/v1/projects/${projectId}/time`, { method: 'POST', ...jsonBody(entry) }),

  deleteTime: (projectId: string, day: string, stageId: string) =>
    request<void>(
      `/api/v1/projects/${projectId}/time?${new URLSearchParams({ day, stageId })}`,
      { method: 'DELETE' },
    ),

  // Every project with its encrypted pipeline and open-note counts.
  listBoard: () => request<BoardProject[]>('/api/v1/board'),
}
