import type {
  AdminInvite,
  AdminLlmModels,
  AdminOverview,
  AdminUser,
  AdminWaitlistEntry,
  LlmTask,
} from '../contracts'
import { request, jsonBody } from '../http'

// The customer management side; the server checks the admin role on each call.
export const admin = {
  overview: () => request<AdminOverview>('/api/v1/admin/overview'),

  waitlist: () => request<AdminWaitlistEntry[]>('/api/v1/admin/waitlist'),

  inviteFromWaitlist: (entryId: string) =>
    request<AdminInvite>(`/api/v1/admin/waitlist/${entryId}/invite`, { method: 'POST' }),

  removeWaitlistEntry: (entryId: string) =>
    request<void>(`/api/v1/admin/waitlist/${entryId}`, { method: 'DELETE' }),

  invites: () => request<AdminInvite[]>('/api/v1/admin/invites'),

  createInvite: (invite: { email?: string; note?: string }) =>
    request<AdminInvite>('/api/v1/admin/invites', { method: 'POST', ...jsonBody(invite) }),

  revokeInvite: (inviteId: string) =>
    request<AdminInvite>(`/api/v1/admin/invites/${inviteId}/revoke`, { method: 'POST' }),

  users: () => request<AdminUser[]>('/api/v1/admin/users'),

  setWordLimit: (userId: string, monthlyWordLimit: number | null) =>
    request<AdminUser>(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      ...jsonBody({ monthlyWordLimit }),
    }),

  setMarketing: (userId: string, marketingEnabled: boolean) =>
    request<AdminUser>(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      ...jsonBody({ marketingEnabled }),
    }),

  models: () => request<AdminLlmModels>('/api/v1/admin/models'),

  // Null goes back to the server default.
  setModel: (task: LlmTask, model: string | null) =>
    request<AdminLlmModels>(`/api/v1/admin/models/${task}`, {
      method: 'PUT',
      ...jsonBody({ model }),
    }),
}
