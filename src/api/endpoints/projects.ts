import type {
  Project,
  ProjectEncryption,
} from '../contracts'
import { request, jsonBody } from '../http'

export const projectsApi = {
  listProjects: () => request<Project[]>('/api/v1/projects'),

  createProject: (title: string, encryption: {
    passwordSalt: string; passwordWrappedKey: string; passwordWrapIv: string
    recoverySalt: string; recoveryWrappedKey: string; recoveryWrapIv: string
  }) =>
    request<Project>('/api/v1/projects', {
      method: 'POST',
      ...jsonBody({ title, encryption }),
    }),

  deleteProject: (projectId: string, password: string) =>
    request<Project>(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
      ...jsonBody({ password }),
    }),

  // The recovery key proves the author may replace a forgotten project password.
  resetProjectPassword: (
    projectId: string,
    payload: {
      recoveryKey: string
      passwordSalt: string
      passwordWrappedKey: string
      passwordWrapIv: string
    },
  ) =>
    request<void>(`/api/v1/projects/${projectId}/encryption/reset-password`, {
      method: 'POST',
      ...jsonBody(payload),
    }),

    // After the project key opened here: keeps track of projects in use.

  recordProjectAccess: (projectId: string) =>
    request<void>(`/api/v1/projects/${projectId}/access`, { method: 'POST' }),

  getProjectEncryption: (projectId: string) =>
    request<ProjectEncryption>(`/api/v1/projects/${projectId}/encryption`),
}
