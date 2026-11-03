import type {
  CreateProjectSlot,
  GroupColor,
  ReorderTimelineResult,
  SceneGroup,
  SealedText,
  Slot,
  TimelineMove,
} from '../contracts'
import { request, jsonBody } from '../http'

export const timelineApi = {
  listProjectSlots: (projectId: string) =>
    request<Slot[]>(`/api/v1/projects/${projectId}/slots`),

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
}
