import { api, google } from '../../api/client'
import type { GoogleDocLink, GoogleDocSectionLink, Slot } from '../../api/contracts'
import { decryptSceneDraft, encryptSceneDraft } from '../../crypto/projectEncryption'

export type GoogleSyncResult = {
  upToDate: boolean
  created: number
  updated: number
  // Headings no longer in the doc; their scenes stay in the project.
  removed: number
  // Scenes whose text the doc replaced.
  changedSlotIds: string[]
  link: GoogleDocLink | null
}

// One sync per project at a time: the automatic one and a click can overlap.
const running = new Map<string, Promise<GoogleSyncResult>>()

export function syncGoogleDoc(projectId: string, projectKey: CryptoKey): Promise<GoogleSyncResult> {
  const current = running.get(projectId)
  if (current) return current
  const sync = runSync(projectId, projectKey).finally(() => running.delete(projectId))
  running.set(projectId, sync)
  return sync
}

// The doc is the source of truth: its text replaces the scene's, and the
// text is encrypted here before it is saved, like any scene.
async function runSync(projectId: string, projectKey: CryptoKey): Promise<GoogleSyncResult> {
  const remote = await google.fetchForSync(projectId)
  if (remote.upToDate) {
    return { upToDate: true, created: 0, updated: 0, removed: 0, changedSlotIds: [], link: null }
  }

  const slots = new Map((await api.listProjectSlots(projectId)).map((slot) => [slot.id, slot]))
  const previous = new Map(remote.sectionMap.map((entry) => [entry.headingKey, entry.slotId]))
  const sections: GoogleDocSectionLink[] = []
  const changedSlotIds: string[] = []
  let created = 0
  let updated = 0
  let previousSlot: Slot | undefined

  for (const section of remote.sections) {
    const known = slots.get(previous.get(section.key) ?? '')
    if (known) {
      const review = await api.getSlotReview(known.id)
      const draft = review.content
        ? await decryptSceneDraft(projectKey, review.content.ciphertext, review.content.iv)
        : { content: '', genre: '', focusMode: 'GENERAL' }
      if ((draft.content ?? '') !== section.text) {
        await api.saveSceneContent(
          known.id,
          await encryptSceneDraft(projectKey, {
            content: section.text,
            genre: draft.genre ?? '',
            focusMode: draft.focusMode ?? 'GENERAL',
          }),
        )
        changedSlotIds.push(known.id)
      }
      if ((known.title ?? '') !== section.title) {
        await api.renameProjectSlot(projectId, known.id, section.title)
      }
      if ((draft.content ?? '') !== section.text || (known.title ?? '') !== section.title) {
        updated += 1
      }
      sections.push({ headingKey: section.key, slotId: known.id })
      previousSlot = known
      continue
    }

    // A new heading: in doc order, after the scene of the heading before it.
    const slot = await api.createProjectSlot(projectId, {
      title: section.title,
      isUnanchored: false,
      afterSlotId: previousSlot && !previousSlot.isUnanchored ? previousSlot.id : undefined,
    })
    await api.saveSceneContent(
      slot.id,
      await encryptSceneDraft(projectKey, { content: section.text, genre: '', focusMode: 'GENERAL' }),
    )
    created += 1
    sections.push({ headingKey: section.key, slotId: slot.id })
    previousSlot = slot
  }

  const stillThere = new Set(remote.sections.map((section) => section.key))
  const removed = remote.sectionMap.filter((entry) => !stillThere.has(entry.headingKey)).length
  const link = await google.recordSync(projectId, { revisionId: remote.revisionId, sections, changedSlotIds })
  return { upToDate: false, created, updated, removed, changedSlotIds, link }
}
