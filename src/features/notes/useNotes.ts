import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { NoteKind, NoteStatus, StoredNote } from '../../api/contracts'
import { decryptNote, encryptNote, type NotePayload } from '../../crypto/projectEncryption'
import type { Note } from './notes'

async function open(projectKey: CryptoKey, stored: StoredNote): Promise<Note> {
  const base = {
    id: stored.id,
    slotId: stored.slotId,
    kind: stored.kind,
    status: stored.status,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    resolvedAt: stored.resolvedAt,
  }
  try {
    return { ...base, ...(await decryptNote(projectKey, stored.ciphertext, stored.iv)), isUnreadable: false }
  } catch {
    return { ...base, body: '', author: '', excerpt: null, isUnreadable: true }
  }
}

export interface NewNote {
  slotId: string | null
  kind: NoteKind
  payload: NotePayload
}

/**
 * Review notes of the open project, decrypted in the browser. The server only
 * ever receives ciphertext for the text, author and excerpt.
 */
export function useNotes(projectId: string, projectKey: CryptoKey | null) {
  const [notes, setNotes] = useState<Note[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!projectId || !projectKey) return
    try {
      const stored = await api.listNotes(projectId)
      setNotes(await Promise.all(stored.map((note) => open(projectKey, note))))
      setError(null)
    } catch (reason) {
      // Older backends have no notes; the panel then explains it is unavailable.
      setNotes([])
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as notas.')
    }
  }, [projectId, projectKey])

  useEffect(() => {
    void Promise.resolve().then(reload)
  }, [reload])

  const replace = (note: Note) =>
    setNotes((current) =>
      current.some((item) => item.id === note.id)
        ? current.map((item) => (item.id === note.id ? note : item))
        : [...current, note],
    )

  async function create({ slotId, kind, payload }: NewNote): Promise<Note> {
    if (!projectKey) throw new Error('Desbloqueie o projeto para escrever notas.')
    const sealed = await encryptNote(projectKey, payload)
    const stored = await api.createNote(projectId, { slotId, kind, ...sealed })
    const note = await open(projectKey, stored)
    replace(note)
    return note
  }

  async function edit(note: Note, changes: { kind?: NoteKind; body?: string }) {
    if (!projectKey) throw new Error('Desbloqueie o projeto para editar notas.')
    const sealed =
      changes.body !== undefined
        ? await encryptNote(projectKey, { body: changes.body, author: note.author, excerpt: note.excerpt })
        : {}
    replace(await open(projectKey, await api.updateNote(note.id, { kind: changes.kind, ...sealed })))
  }

  async function setStatus(note: Note, status: NoteStatus) {
    if (!projectKey) return
    replace(await open(projectKey, await api.updateNote(note.id, { status })))
  }

  async function remove(note: Note) {
    await api.deleteNote(note.id)
    setNotes((current) => current.filter((item) => item.id !== note.id))
  }

  return { notes: projectId && projectKey ? notes : [], error, reload, create, edit, setStatus, remove }
}
