import type { StoredSceneCard } from '../features/sceneMap/sceneMap'
import type {
  ArchitectAnalysis,
  ArchitectReview,
  AdminInvite,
  AdminLlmModels,
  AdminOverview,
  AdminUser,
  AdminWaitlistEntry,
  AuthSession,
  AuthUser,
  GoogleCommentItem,
  GoogleCommentSummary,
  GoogleDocLink,
  GoogleDocSectionLink,
  GoogleDocSync,
  GoogleHeadingLevel,
  GoogleStatus,
  LlmTask,
  MarketingDraft,
  MarketingDraftRequest,
  FactApprovalResult,
  CreateProjectSlot,
  CreateRelation,
  GroupColor,
  SceneGroup,
  SealedText,
  StoredStyleSheet,
  CanonSettings,
  StoredEncryptedDocument,
  EntityPageSummary,
  FactEntityType,
  NoteKind,
  NoteStatus,
  StoredNote,
  EncryptedScene,
  LinterReport,
  ManuscriptImport,
  ManuscriptImportDetail,
  Override,
  PendingFact,
  Project,
  ProjectEncryption,
  ProjectEntity,
  ProjectFact,
  RegressionAlert,
  ReorderTimelineResult,
  SceneSubmission,
  Slot,
  SlotReview,
  SplitEntityResult,
  DeletedEntity,
  EntityChange,
  TimelineMove,
  UsageSummary,
} from './contracts'
import { notifyUsageChanged } from '../features/usage/usageEvents'
import {
  apiBaseUrl,
  clearSession,
  expireSession,
  getAccessToken,
  refreshSession,
  startSession,
} from '../auth/session'

export class ApiError extends Error {
  public readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function authorizationHeader(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Runs `send`; when the access token has expired, renews it once and retries.
// If the session can't be renewed the app goes back to the login page.
async function withSession<R extends { status: number }>(send: () => Promise<R>): Promise<R> {
  const response = await send()
  if (response.status !== 401) {
    return response
  }
  if (!(await refreshSession())) {
    expireSession()
    return response
  }
  const retried = await send()
  if (retried.status === 401) {
    expireSession()
  }
  return retried
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await withSession(() =>
    fetch(`${apiBaseUrl}${path}`, {
      ...options,
      signal,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...authorizationHeader(),
        ...options.headers,
      },
    }),
  )

  return readResponse<T>(response)
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'Não foi possível concluir a solicitação.'
    throw new ApiError(message, response.status)
  }

  return body as T
}

function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body) }
}

// Auth calls carry the refresh cookie and never trigger a token refresh.
async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return readResponse<T>(response)
}

export const auth = {
  register: async (details: { name: string; email: string; password: string; inviteCode?: string }) => {
    const session = await authRequest<AuthSession>('register', details)
    startSession(session)
    return session.user
  },

  login: async (credentials: { email: string; password: string }) => {
    const session = await authRequest<AuthSession>('login', credentials)
    startSession(session)
    return session.user
  },

  logout: async () => {
    try {
      await authRequest<void>('logout')
    } finally {
      clearSession()
    }
  },
}

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

// Google Docs sync: the account connection, and the doc linked to a project.
export const google = {
  status: () => request<GoogleStatus>('/api/v1/integrations/google'),

  // 'comment' asks Google for the extra permission to write comments.
  connect: (permission: 'read' | 'comment' = 'read') =>
    request<{ authUrl: string }>('/api/v1/integrations/google/connect', {
      method: 'POST',
      ...jsonBody({ permission }),
    }),

  publishComments: (projectId: string, items: GoogleCommentItem[]) =>
    request<GoogleCommentSummary>(`/api/v1/projects/${projectId}/google-doc/comments`, {
      method: 'POST',
      ...jsonBody({ items }),
    }),

  disconnect: () => request<void>('/api/v1/integrations/google', { method: 'DELETE' }),

  getLink: (projectId: string) =>
    request<{ link: GoogleDocLink | null }>(`/api/v1/projects/${projectId}/google-doc`),

  link: (projectId: string, document: string, headingLevel: GoogleHeadingLevel) =>
    request<GoogleDocLink>(`/api/v1/projects/${projectId}/google-doc`, {
      method: 'PUT',
      ...jsonBody({ document, headingLevel }),
    }),

  unlink: (projectId: string) =>
    request<void>(`/api/v1/projects/${projectId}/google-doc`, { method: 'DELETE' }),

  fetchForSync: (projectId: string) =>
    request<GoogleDocSync>(`/api/v1/projects/${projectId}/google-doc/fetch`, { method: 'POST' }),

  recordSync: (
    projectId: string,
    sync: { revisionId: string; sections: GoogleDocSectionLink[]; changedSlotIds: string[] },
  ) =>
    request<GoogleDocLink>(`/api/v1/projects/${projectId}/google-doc/synced`, {
      method: 'POST',
      ...jsonBody(sync),
    }),
}

// Public: asking for an invite from the registration page.
export async function joinWaitlist(details: { name: string; email: string; message?: string }) {
  const response = await fetch(`${apiBaseUrl}/api/v1/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
  return readResponse<void>(response)
}

export const api = {
  // Spends words of the monthly allowance, or is refused for lack of them.
  createArchitecturalReview: (analysis: ArchitectAnalysis) =>
    request<ArchitectReview>('/api/v1/architectural-reviews', {
      method: 'POST',
      ...jsonBody(analysis),
    }).finally(notifyUsageChanged),

  getUsage: () => request<UsageSummary>('/api/v1/usage'),

  completeTour: (tourId: 'welcome' | 'project') =>
    request<AuthUser>(`/api/v1/auth/tours/${tourId}/complete`, { method: 'POST' }),

  listArchitecturalReviews: (projectId: string) =>
    request<ArchitectReview[]>(`/api/v1/projects/${projectId}/architectural-reviews`),

  getLatestArchitecturalReview: (projectId: string) =>
    request<ArchitectReview>(
      `/api/v1/projects/${projectId}/architectural-reviews/latest`,
    ),

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

  listProjectSlots: (projectId: string) =>
    request<Slot[]>(`/api/v1/projects/${projectId}/slots`),

  listProjectFacts: (projectId: string) =>
    request<ProjectFact[]>(`/api/v1/projects/${projectId}/facts`),

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

  // 404 until the project has a style sheet.
  getStyleSheet: (projectId: string) =>
    request<StoredStyleSheet>(`/api/v1/projects/${projectId}/style-sheet`),

  saveStyleSheet: (projectId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredStyleSheet>(`/api/v1/projects/${projectId}/style-sheet`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

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

  // The editorial pipeline; 404 until the project has one.
  getPipeline: (projectId: string) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/pipeline`),

  savePipeline: (projectId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/pipeline`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

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

  // 404 while the project uses the built-in templates.
  getWikiTemplates: (projectId: string) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/wiki-templates`),

  saveWikiTemplates: (projectId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredEncryptedDocument>(`/api/v1/projects/${projectId}/wiki-templates`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

  listEntityPages: (projectId: string) =>
    request<EntityPageSummary[]>(`/api/v1/projects/${projectId}/entity-pages`),

  // 404 until the entity has a page.
  getEntityPage: (entityId: string) =>
    request<StoredEncryptedDocument>(`/api/v1/entities/${entityId}/page`),

  saveEntityPage: (entityId: string, sealed: SealedText, expectedVersion: number | null) =>
    request<StoredEncryptedDocument>(`/api/v1/entities/${entityId}/page`, {
      method: 'PUT',
      ...jsonBody({ ...sealed, expectedVersion }),
    }),

  deleteEntityPage: (entityId: string) =>
    request<void>(`/api/v1/entities/${entityId}/page`, { method: 'DELETE' }),

  listGroups: (projectId: string) =>
    request<SceneGroup[]>(`/api/v1/projects/${projectId}/groups`),

  createGroups: (projectId: string, groups: Array<{ name: string; color: GroupColor }>) =>
    request<SceneGroup[]>(`/api/v1/projects/${projectId}/groups`, {
      method: 'POST',
      ...jsonBody({ groups }),
    }),

  updateGroup: (groupId: string, patch: { name?: string; color?: GroupColor; position?: number }) =>
    request<SceneGroup>(`/api/v1/groups/${groupId}`, { method: 'PATCH', ...jsonBody(patch) }),

  deleteGroup: (groupId: string) =>
    request<void>(`/api/v1/groups/${groupId}`, { method: 'DELETE' }),

  assignGroup: (projectId: string, slotIds: string[], groupId: string | null) =>
    request<{ updated: number }>(`/api/v1/projects/${projectId}/groups/assign`, {
      method: 'POST',
      ...jsonBody({ slotIds, groupId }),
    }),

  splitSlot: (
    projectId: string,
    slotId: string,
    payload: {
      newTitle: string
      first: SealedText
      second: SealedText
      moveDiagnosticHashes: string[]
      movedNotes: Array<{ id: string } & SealedText>
    },
  ) =>
    request<Slot>(`/api/v1/projects/${projectId}/slots/${slotId}/split`, {
      method: 'POST',
      ...jsonBody(payload),
    }),

  mergeWithNext: (
    projectId: string,
    slotId: string,
    payload: {
      nextSlotId: string
      title: string
      content: SealedText
      movedNotes: Array<{ id: string } & SealedText>
    },
  ) =>
    request<{ slotId: string }>(`/api/v1/projects/${projectId}/slots/${slotId}/merge-next`, {
      method: 'POST',
      ...jsonBody(payload),
    }),

  listNotes: (projectId: string) =>
    request<StoredNote[]>(`/api/v1/projects/${projectId}/notes`),

  createNote: (
    projectId: string,
    note: { slotId: string | null; kind: NoteKind; stageId?: string | null; ciphertext: string; iv: string },
  ) =>
    request<StoredNote>(`/api/v1/projects/${projectId}/notes`, {
      method: 'POST',
      ...jsonBody(note),
    }),

  updateNote: (
    noteId: string,
    patch: { kind?: NoteKind; status?: NoteStatus; stageId?: string | null; ciphertext?: string; iv?: string },
  ) =>
    request<StoredNote>(`/api/v1/notes/${noteId}`, {
      method: 'PATCH',
      ...jsonBody(patch),
    }),

  deleteNote: (noteId: string) =>
    request<void>(`/api/v1/notes/${noteId}`, { method: 'DELETE' }),

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

  createProjectSlot: (projectId: string, slot: CreateProjectSlot) =>
    request<Slot>(`/api/v1/projects/${projectId}/slots`, {
      method: 'POST',
      ...jsonBody(slot),
    }),

  renameProjectSlot: (projectId: string, slotId: string, title: string) =>
    request<Slot>(`/api/v1/projects/${projectId}/slots/${slotId}`, {
      method: 'PATCH',
      ...jsonBody({ title }),
    }),

  deleteProjectSlot: (projectId: string, slotId: string) =>
    request<void>(`/api/v1/projects/${projectId}/slots/${slotId}`, {
      method: 'DELETE',
    }),

  reorderTimeline: (
    projectId: string,
    payload: { slotId: string; targetPosition?: number; isUnanchored: boolean },
  ) =>
    request<ReorderTimelineResult>(
      `/api/v1/projects/${projectId}/timeline/reorder`,
      { method: 'POST', ...jsonBody(payload) },
    ),

  listTimelineMoves: (projectId: string) =>
    request<TimelineMove[]>(`/api/v1/projects/${projectId}/timeline/moves`),

  undoTimelineMove: (projectId: string, moveId: string) =>
    request<{ moveId: string; slotId: string }>(
      `/api/v1/projects/${projectId}/timeline/moves/${moveId}/undo`,
      { method: 'POST' },
    ),

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
