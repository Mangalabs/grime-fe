import type {
  DeletedEntity,
  EntityChange,
  FactEntityType,
  ProjectEntity,
  SplitEntityResult,
} from '../contracts'
import { request, jsonBody } from '../http'

export const entitiesApi = {
  listProjectEntities: (projectId: string) =>
    request<ProjectEntity[]>(`/api/v1/projects/${projectId}/entities`),

  mergeEntities: (targetCanonicalId: string, sourceAliasId: string) =>
    request<{ canonicalId: string; aliasId: string; transferredFacts: number }>(
      `/api/v1/entities/${targetCanonicalId}/merge`,
      { method: 'POST', ...jsonBody({ sourceAliasId }) },
    ),

  splitEntity: (sourceEntityId: string, newEntityNames: string[]) =>
    request<SplitEntityResult>(`/api/v1/entities/${sourceEntityId}/split`, {
      method: 'POST',
      ...jsonBody({ newEntityNames }),
    }),

  // An entity added by hand, before any scene mentions it.
  createEntity: (projectId: string, entity: { name: string; type: FactEntityType }) =>
    request<{ id: string }>(`/api/v1/projects/${projectId}/entities`, {
      method: 'POST',
      ...jsonBody(entity),
    }),

  listDeletedEntities: (projectId: string) =>
    request<DeletedEntity[]>(`/api/v1/projects/${projectId}/entities/deleted`),

  // An alias becomes the entity's main name.
  setPreferredName: (aliasId: string) =>
    request<EntityChange>(`/api/v1/entities/${aliasId}/preferred`, { method: 'POST' }),

  renameEntity: (entityId: string, name: string) =>
    request<EntityChange>(`/api/v1/entities/${entityId}`, { method: 'PATCH', ...jsonBody({ name }) }),

  detachAlias: (aliasId: string) =>
    request<EntityChange>(`/api/v1/entities/${aliasId}/detach`, { method: 'POST' }),

  // Soft delete, with all the entity's names.
  deleteEntity: (entityId: string) =>
    request<EntityChange>(`/api/v1/entities/${entityId}`, { method: 'DELETE' }),

  restoreEntity: (entityId: string) =>
    request<EntityChange>(`/api/v1/entities/${entityId}/restore`, { method: 'POST' }),

  reassignFact: (factId: string, targetEntityId: string) =>
    request<{ id: string; entityId: string }>(
      `/api/v1/facts/${factId}/reassign`,
      { method: 'POST', ...jsonBody({ targetEntityId }) },
    ),
}
