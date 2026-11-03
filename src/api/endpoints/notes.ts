import type {
  NoteKind,
  NoteStatus,
  StoredNote,
} from '../contracts'
import { request, jsonBody } from '../http'

export const notesApi = {
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
}
