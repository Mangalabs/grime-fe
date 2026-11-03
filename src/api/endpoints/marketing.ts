import { notifyUsageChanged } from '../../features/usage/usageEvents'
import type {
  MarketingDraft,
  MarketingDraftRequest,
  SealedText,
  StoredEncryptedDocument,
} from '../contracts'
import { apiBaseUrl } from '../../auth/session'
import { authorizationHeader, withSession, request, readResponse, jsonBody } from '../http'

export const marketingApi = {
  // Only for accounts with marketing on; 404 until the project has a kit.
  getMarketingKit: (projectId: string) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/marketing-kit`),

  saveMarketingKit: (projectId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/marketing-kit`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

  // The model drafts the identity kit; the words it reads are charged.
  draftMarketingIdentity: async (projectId: string, body: MarketingDraftRequest) => {
    const draft = await request<MarketingDraft>(`/api/v1/projects/${projectId}/marketing/identity-draft`, {
      method: 'POST',
      ...jsonBody(body),
    })
    notifyUsageChanged()
    return draft
  },

  // Moodboard images, already encrypted: the server only stores the bytes.
  uploadMarketingAsset: async (projectId: string, sealed: Uint8Array<ArrayBuffer>) => {
    const response = await withSession(() => {
      const formData = new FormData()
      formData.append('file', new Blob([sealed], { type: 'application/octet-stream' }), 'asset')
      return fetch(`${apiBaseUrl}/api/v1/projects/${projectId}/marketing-assets`, {
        method: 'POST',
        headers: authorizationHeader(),
        body: formData,
      })
    })
    return readResponse<{ id: string; byteSize: number }>(response)
  },

  getMarketingAsset: async (projectId: string, assetId: string) => {
    const response = await withSession(() =>
      fetch(`${apiBaseUrl}/api/v1/projects/${projectId}/marketing-assets/${assetId}`, {
        headers: authorizationHeader(),
      }),
    )
    if (!response.ok) return readResponse<never>(response)
    return response.arrayBuffer()
  },

  deleteMarketingAsset: (projectId: string, assetId: string) =>
    request<void>(`/api/v1/projects/${projectId}/marketing-assets/${assetId}`, { method: 'DELETE' }),
}
