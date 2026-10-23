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
      passwordSalt: encode(passwordSalt),
      passwordWrappedKey: encode(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: passwordWrapIv }, await deriveKey(password, passwordSalt), await crypto.subtle.exportKey('raw', projectKey)))),
      passwordWrapIv: encode(passwordWrapIv),
      recoverySalt: encode(recoverySalt),
      recoveryWrappedKey: encode(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: recoveryWrapIv }, await deriveKey(recoveryKey, recoverySalt), await crypto.subtle.exportKey('raw', projectKey)))),
      recoveryWrapIv: encode(recoveryWrapIv),
    },
  }
}

export async function encryptScene(projectKey: CryptoKey, plaintext: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, projectKey, new TextEncoder().encode(plaintext))
  return { ciphertext: encode(new Uint8Array(ciphertext)), iv: encode(iv) }
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
    { name: 'AES-GCM', iv: decode(envelope.passwordWrapIv) },
    await deriveKey(password, decode(envelope.passwordSalt)),
    decode(envelope.passwordWrappedKey),
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
    { name: 'AES-GCM', iv: decode(envelope.recoveryWrapIv) },
    await deriveKey(recoveryKey, decode(envelope.recoverySalt)),
    decode(envelope.recoveryWrappedKey),
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
      passwordSalt: encode(passwordSalt),
      passwordWrappedKey: encode(new Uint8Array(passwordWrappedKey)),
      passwordWrapIv: encode(passwordWrapIv),
    },
  }
}

export async function decryptScene(projectKey: CryptoKey, ciphertext: string, iv: string) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(iv) },
    projectKey,
    decode(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
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

function encode(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
}

function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}
