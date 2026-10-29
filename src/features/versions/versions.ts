import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import { api } from '../../api/client'
import type { Slot, VersionKind, VersionSummary } from '../../api/contracts'
import { decryptScene, encryptScene } from '../../crypto/projectEncryption'
import { loadSceneTexts } from '../manuscript/loadSceneTexts'
import { orderScenes } from '../scenes/sceneStatus'

/**
 * Versions: frozen copies of the whole manuscript, to compare an author's
 * revision against what was reviewed. Scenes are kept by slot id, so a scene
 * renamed or moved is still the same scene.
 */

export interface VersionScene {
  slotId: string
  title: string
  content: string
}

export interface VersionBody {
  version: 1
  scenes: VersionScene[]
}

export interface OpenedVersionSummary extends Omit<VersionSummary, 'labelCiphertext' | 'labelIv'> {
  label: string
}

export const versionKindLabels: Record<VersionKind, string> = {
  MANUAL: 'Salva à mão',
  STAGE: 'Mudança de etapa',
  SYNC: 'Antes do Google Docs',
  IMPORT: 'Antes de importar',
  COPYEDIT: 'Antes de corrigir',
}

export const countWords = (text: string) => text.match(/\S+/g)?.length ?? 0

// The body can be a whole book: gzip first (text shrinks a lot), then seal
// the bytes. Sealed bytes travel as base64.
function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(text: string) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function sealBody(projectKey: CryptoKey, body: VersionBody) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const packed = new Uint8Array(gzipSync(strToU8(JSON.stringify(body))))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, projectKey, packed)
  return { ciphertext: toBase64(new Uint8Array(sealed)), iv: toBase64(iv) }
}

async function openBody(projectKey: CryptoKey, ciphertext: string, iv: string): Promise<VersionBody> {
  const packed = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    projectKey,
    fromBase64(ciphertext),
  )
  const body = JSON.parse(strFromU8(gunzipSync(new Uint8Array(packed)))) as Partial<VersionBody>
  return { version: 1, scenes: Array.isArray(body.scenes) ? body.scenes : [] }
}

/** The project's scenes as they are now, in timeline order. */
export async function currentScenes(
  projectId: string,
  projectKey: CryptoKey,
  slots?: Slot[],
  onProgress?: (done: number, total: number) => void,
): Promise<VersionScene[]> {
  const ordered = orderScenes(slots ?? (await api.listProjectSlots(projectId)))
  const texts = await loadSceneTexts(projectKey, ordered, onProgress)
  return ordered.map((slot, index) => ({ slotId: slot.id, title: slot.title ?? '', content: texts[index] }))
}

/** Saves the scenes given (or the project as it is now) as a version. */
export async function saveVersion(
  projectId: string,
  projectKey: CryptoKey,
  kind: VersionKind,
  label: string,
  scenes?: VersionScene[],
) {
  const body: VersionBody = { version: 1, scenes: scenes ?? (await currentScenes(projectId, projectKey)) }
  const sealedLabel = await encryptScene(projectKey, label)
  return api.createVersion(projectId, {
    kind,
    labelCiphertext: sealedLabel.ciphertext,
    labelIv: sealedLabel.iv,
    ...(await sealBody(projectKey, body)),
    sceneCount: body.scenes.length,
    wordCount: body.scenes.reduce((total, scene) => total + countWords(scene.content), 0),
  })
}

export async function listVersions(projectId: string, projectKey: CryptoKey): Promise<OpenedVersionSummary[]> {
  const versions = await api.listVersions(projectId)
  return Promise.all(
    versions.map(async ({ labelCiphertext, labelIv, ...version }) => ({
      ...version,
      label: await decryptScene(projectKey, labelCiphertext, labelIv).catch(() => 'Versão sem nome'),
    })),
  )
}

export async function openVersion(projectId: string, projectKey: CryptoKey, versionId: string) {
  const version = await api.getVersion(projectId, versionId)
  return openBody(projectKey, version.ciphertext, version.iv)
}

// Automatic versions (Google Docs syncs) at most this often.
const SYNC_VERSION_EVERY_MS = 12 * 60 * 60 * 1000

/** Whether an automatic version of this kind was saved recently. */
export async function hasRecentVersion(projectId: string, kind: VersionKind, withinMs = SYNC_VERSION_EVERY_MS) {
  const versions = await api.listVersions(projectId)
  const since = Date.now() - withinMs
  return versions.some((version) => version.kind === kind && new Date(version.createdAt).getTime() > since)
}
