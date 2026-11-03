import { fromBase64, toBase64 } from './base64'
const iterations = 600_000
const sceneDraftVersion = 1

export type ProjectKeyEnvelope = {
  passwordSalt: string
  passwordWrappedKey: string
  passwordWrapIv: string
  recoverySalt: string
  recoveryWrappedKey: string
  recoveryWrapIv: string
}

export async function createProjectEncryption(password: string, recoveryKey: string) {
  const projectKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const passwordSalt = crypto.getRandomValues(new Uint8Array(16))
  const recoverySalt = crypto.getRandomValues(new Uint8Array(16))
  const passwordWrapIv = crypto.getRandomValues(new Uint8Array(12))
  const recoveryWrapIv = crypto.getRandomValues(new Uint8Array(12))
  return {
    projectKey,
    envelope: {
      passwordSalt: toBase64(passwordSalt),
      passwordWrappedKey: toBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: passwordWrapIv }, await deriveKey(password, passwordSalt), await crypto.subtle.exportKey('raw', projectKey)))),
      passwordWrapIv: toBase64(passwordWrapIv),
      recoverySalt: toBase64(recoverySalt),
      recoveryWrappedKey: toBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: recoveryWrapIv }, await deriveKey(recoveryKey, recoverySalt), await crypto.subtle.exportKey('raw', projectKey)))),
      recoveryWrapIv: toBase64(recoveryWrapIv),
    },
  }
}

/** Seals bytes with the project key: AES-GCM with a fresh IV, both as base64. */
export async function sealBytes(projectKey: CryptoKey, bytes: Uint8Array<ArrayBuffer>) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, projectKey, bytes)
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) }
}

/** Opens what sealBytes sealed. */
export function openBytes(projectKey: CryptoKey, ciphertext: string, iv: string): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, projectKey, fromBase64(ciphertext))
}

export function encryptScene(projectKey: CryptoKey, plaintext: string) {
  return sealBytes(projectKey, new TextEncoder().encode(plaintext))
}

/** Binary content (an image): the 12-byte IV followed by the ciphertext. */
export async function encryptBytes(projectKey: CryptoKey, bytes: ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, projectKey, bytes))
  const sealed = new Uint8Array(iv.length + ciphertext.length)
  sealed.set(iv)
  sealed.set(ciphertext, iv.length)
  return sealed
}

export async function decryptBytes(projectKey: CryptoKey, sealed: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(sealed, 0, 12) },
    projectKey,
    new Uint8Array(sealed, 12),
  )
}

export async function unlockProjectKey(password: string, envelope: ProjectKeyEnvelope) {
  const rawProjectKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.passwordWrapIv) },
    await deriveKey(password, fromBase64(envelope.passwordSalt)),
    fromBase64(envelope.passwordWrappedKey),
  )
  return crypto.subtle.importKey('raw', rawProjectKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

// A forgotten password: the recovery key opens the project key, which is then
// wrapped again with the new password. Throws when the recovery key is wrong.
export async function resetProjectPassword(
  recoveryKey: string,
  newPassword: string,
  envelope: ProjectKeyEnvelope,
) {
  const rawProjectKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.recoveryWrapIv) },
    await deriveKey(recoveryKey, fromBase64(envelope.recoverySalt)),
    fromBase64(envelope.recoveryWrappedKey),
  )
  const passwordSalt = crypto.getRandomValues(new Uint8Array(16))
  const passwordWrapIv = crypto.getRandomValues(new Uint8Array(12))
  const passwordWrappedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: passwordWrapIv },
    await deriveKey(newPassword, passwordSalt),
    rawProjectKey,
  )
  return {
    projectKey: await crypto.subtle.importKey('raw', rawProjectKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
    passwordEncryption: {
      passwordSalt: toBase64(passwordSalt),
      passwordWrappedKey: toBase64(new Uint8Array(passwordWrappedKey)),
      passwordWrapIv: toBase64(passwordWrapIv),
    },
  }
}

export async function decryptScene(projectKey: CryptoKey, ciphertext: string, iv: string) {
  return new TextDecoder().decode(await openBytes(projectKey, ciphertext, iv))
}

export async function encryptSceneDraft(
  projectKey: CryptoKey,
  draft: { content: string; genre: string; focusMode: string },
) {
  return encryptScene(
    projectKey,
    JSON.stringify({ ...draft, version: sceneDraftVersion }),
  )
}

export async function decryptSceneDraft(projectKey: CryptoKey, ciphertext: string, iv: string) {
  const plaintext = await decryptScene(projectKey, ciphertext, iv)

  try {
    const draft = JSON.parse(plaintext) as Partial<{
      version: number
      content: string
      genre: string
      focusMode: string
    }>
    if (
      draft.version === sceneDraftVersion &&
      typeof draft.content === 'string' &&
      typeof draft.genre === 'string' &&
      typeof draft.focusMode === 'string'
    ) {
      return draft
    }
  } catch {
    // Scenes saved before encrypted metadata stored the raw fragment directly.
  }

  return { content: plaintext, genre: '', focusMode: 'GENERAL' }
}

// What a review note keeps private: its text, author and the excerpt it is about.
export interface NotePayload {
  body: string
  author: string
  excerpt: { quote: string; start: number; end: number } | null
}

const notePayloadVersion = 1

export async function encryptNote(projectKey: CryptoKey, payload: NotePayload) {
  return encryptScene(projectKey, JSON.stringify({ ...payload, version: notePayloadVersion }))
}

export async function decryptNote(
  projectKey: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<NotePayload> {
  const parsed = JSON.parse(await decryptScene(projectKey, ciphertext, iv)) as Partial<NotePayload> & {
    version?: number
  }
  return {
    body: typeof parsed.body === 'string' ? parsed.body : '',
    author: typeof parsed.author === 'string' ? parsed.author : '',
    excerpt:
      parsed.excerpt && typeof parsed.excerpt.quote === 'string'
        ? {
            quote: parsed.excerpt.quote,
            start: Number(parsed.excerpt.start) || 0,
            end: Number(parsed.excerpt.end) || 0,
          }
        : null,
  }
}

async function deriveKey(secret: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
