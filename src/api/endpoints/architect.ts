import { notifyUsageChanged } from '../../features/usage/usageEvents'
import type {
  ArchitectAnalysis,
  ArchitectReview,
} from '../contracts'
import { request, jsonBody } from '../http'

export const architectApi = {
  // Spends words of the monthly allowance, or is refused for lack of them.
  createArchitecturalReview: (analysis: ArchitectAnalysis) =>
    request<ArchitectReview>('/api/v1/architectural-reviews', {
      method: 'POST',
      ...jsonBody(analysis),
    }).finally(notifyUsageChanged),

  listArchitecturalReviews: (projectId: string) =>
    request<ArchitectReview[]>(`/api/v1/projects/${projectId}/architectural-reviews`),

  getLatestArchitecturalReview: (projectId: string) =>
    request<ArchitectReview>(
      `/api/v1/projects/${projectId}/architectural-reviews/latest`,
    ),
}
