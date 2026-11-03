import type {
  AuthUser,
  UsageSummary,
} from '../contracts'
import { request } from '../http'

export const accountApi = {
  getUsage: () => request<UsageSummary>('/api/v1/usage'),

  completeTour: (tourId: 'welcome' | 'project') =>
    request<AuthUser>(`/api/v1/auth/tours/${tourId}/complete`, { method: 'POST' }),
}
