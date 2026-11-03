import { notifyUsageChanged } from '../../features/usage/usageEvents'
import type {
  EncryptedScene,
  FactApprovalResult,
  LinterReport,
  Override,
  PendingFact,
  RegressionAlert,
  SceneSubmission,
  SlotReview,
} from '../contracts'
import { request, jsonBody } from '../http'

export const scenesApi = {
  // Spends words of the monthly allowance, or is refused for lack of them.
  submitScene: (submission: SceneSubmission, signal?: AbortSignal) =>
    request<LinterReport>(
      '/api/v1/scenes/submit',
      { method: 'POST', ...jsonBody(submission) },
      signal,
    ).finally(notifyUsageChanged),

  saveSceneContent: (slotId: string, content: Omit<EncryptedScene, 'version'>) =>
    request<EncryptedScene>(`/api/v1/slots/${slotId}/content`, {
      method: 'PUT',
      ...jsonBody(content),
    }),

  getSlotReview: (slotId: string) =>
    request<SlotReview>(`/api/v1/slots/${slotId}/review`),

  approveFacts: (slotId: string, facts: PendingFact[]) =>
    request<FactApprovalResult>(`/api/v1/scenes/${slotId}/facts/approve`, {
      method: 'POST',
      ...jsonBody({ facts }),
    }),

  rejectFacts: (slotId: string) =>
    request<{ slotId: string; status: 'REJECTED' }>(
      `/api/v1/scenes/${slotId}/facts/reject`,
      { method: 'POST' },
    ),

  listOverrides: (slotId: string) =>
    request<Override[]>(`/api/v1/slots/${slotId}/overrides`),

  saveOverride: (slotId: string, diagnosticSignatureHash: string, justification: string) =>
    request<Override>(`/api/v1/slots/${slotId}/overrides`, {
      method: 'POST',
      ...jsonBody({ diagnosticSignatureHash, justification }),
    }),

  // Undoes an intentional exception: the diagnostic counts again.
  removeOverride: (slotId: string, diagnosticSignatureHash: string) =>
    request<void>(`/api/v1/slots/${slotId}/overrides/${diagnosticSignatureHash}`, {
      method: 'DELETE',
    }),

  // Deletes a diagnostic; the same finding stays hidden in later analyses.
  dismissDiagnostic: (slotId: string, signatureHash: string) =>
    request<void>(`/api/v1/slots/${slotId}/diagnostics/${signatureHash}`, {
      method: 'DELETE',
    }),

  listRegressionAlerts: (slotId: string) =>
    request<RegressionAlert[]>(`/api/v1/slots/${slotId}/regression-alerts`),

  acknowledgeAlert: (slotId: string, alertId: string) =>
    request<RegressionAlert>(
      `/api/v1/slots/${slotId}/regression-alerts/${alertId}/acknowledge`,
      { method: 'POST' },
    ),
}
