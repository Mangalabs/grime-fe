import type {
  ManuscriptImport,
  ManuscriptImportDetail,
} from '../contracts'
import { apiBaseUrl } from '../../auth/session'
import { ApiError, authorizationHeader, withSession, request, jsonBody } from '../http'

export const manuscriptImportsApi = {
  // XMLHttpRequest rather than fetch: only it reports upload progress.
  createManuscriptImport: (
    projectId: string,
    file: File,
    onUploadProgress?: (loaded: number, total: number) => void,
    // For a .docx: split scenes at headings of this level instead of by the Importador.
    headingLevel?: 1 | 2 | 3 | null,
  ) =>
    withSession(
      () =>
        new Promise<XMLHttpRequest>((resolve, reject) => {
          const formData = new FormData()
          // Before the file: the server reads fields sent ahead of it.
          if (headingLevel) formData.append('headingLevel', String(headingLevel))
          formData.append('file', file)
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `${apiBaseUrl}/api/v1/projects/${projectId}/manuscript-imports`)
          for (const [name, value] of Object.entries(authorizationHeader())) {
            xhr.setRequestHeader(name, value)
          }
          xhr.responseType = 'json'
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onUploadProgress?.(event.loaded, event.total)
          }
          xhr.onload = () => resolve(xhr)
          xhr.onerror = () => reject(new ApiError('Não foi possível enviar o arquivo.', 0))
          xhr.send(formData)
        }),
    ).then((xhr) => {
      const body: unknown = xhr.response
      if (xhr.status >= 200 && xhr.status < 300) {
        return body as ManuscriptImport
      }
      const message =
        typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
          ? body.message
          : 'Não foi possível enviar o arquivo.'
      throw new ApiError(message, xhr.status)
    }),

  getManuscriptImport: (projectId: string, importId: string) =>
    request<ManuscriptImportDetail>(
      `/api/v1/projects/${projectId}/manuscript-imports/${importId}`,
    ),

  finalizeManuscriptImport: (
    projectId: string,
    importId: string,
    scenes: Array<{ sequence: number; title: string; ciphertext: string; iv: string }>,
  ) =>
    request<ManuscriptImport>(
      `/api/v1/projects/${projectId}/manuscript-imports/${importId}/finalize`,
      { method: 'POST', ...jsonBody({ scenes }) },
    ),

  // A revision applied scene by scene in the browser: closes the import
  // without replacing the timeline.
  closeManuscriptImport: (projectId: string, importId: string) =>
    request<ManuscriptImport>(`/api/v1/projects/${projectId}/manuscript-imports/${importId}/close`, {
      method: 'POST',
    }),
}
