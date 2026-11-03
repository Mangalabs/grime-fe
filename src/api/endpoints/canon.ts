import type { StoredSceneCard } from '../../features/sceneMap/sceneMap'
import type {
  CanonSettings,
  CreateRelation,
  ProjectFact,
} from '../contracts'
import { request, jsonBody } from '../http'

export const canonApi = {
  listProjectFacts: (projectId: string) =>
    request<ProjectFact[]>(`/api/v1/projects/${projectId}/facts`),

  // The Arquivista's reading of each analysed scene, for the scene map.
  listSceneCards: (projectId: string) =>
    request<StoredSceneCard[]>(`/api/v1/projects/${projectId}/scene-cards`),

  getCanonSettings: (projectId: string) =>
    request<CanonSettings>(`/api/v1/projects/${projectId}/canon-settings`),

  saveCanonSettings: (projectId: string, settings: CanonSettings) =>
    request<CanonSettings>(`/api/v1/projects/${projectId}/canon-settings`, {
      method: 'PUT',
      ...jsonBody(settings),
    }),

  // Scenes whose facts still wait for approval.
  getPendingFacts: (projectId: string) =>
    request<{ scenes: number; facts: number }>(`/api/v1/projects/${projectId}/facts/pending`),

  approvePendingFacts: (projectId: string) =>
    request<{ scenes: number; approvedFacts: number; regressionAlerts: number }>(
      `/api/v1/projects/${projectId}/facts/approve-pending`,
      { method: 'POST' },
    ),

  createRelation: (projectId: string, relation: CreateRelation) =>
    request<{ id: string }>(`/api/v1/projects/${projectId}/relations`, {
      method: 'POST',
      ...jsonBody(relation),
    }),

  // Manual facts only; extracted facts are unlinked with setFactTarget(null).
  deleteFact: (factId: string) =>
    request<void>(`/api/v1/facts/${factId}`, { method: 'DELETE' }),

  setFactTarget: (factId: string, targetEntityId: string | null) =>
    request<{ id: string; targetEntityId: string | null }>(
      `/api/v1/facts/${factId}/target`,
      { method: 'PATCH', ...jsonBody({ targetEntityId }) },
    ),
}
