// "Remember this project on this browser": after a successful unlock, the
// project key itself is kept for a while, so switching projects doesn't ask
// for the password every time.
//
// What is stored is never the password: it is the AES key, as a
// non-extractable CryptoKey in IndexedDB. The browser can use it to decrypt,
// but no script (not even ours) can read its bytes out, and it never leaves
// the device. Each entry belongs to the signed-in account and expires; logging
// out forgets every entry.

const DB_NAME = 'petricor-chaves'
const STORE = 'projetos'
export const REMEMBER_FOR_MS = 24 * 60 * 60 * 1000
const PREFERENCE_KEY = 'petricor.lembrar-projetos'

type Entry = { id: string; owner: string; projectId: string; key: CryptoKey; expiresAt: number }

let owner: string | null = null

/** The account whose keys can be read and written (null when signed out). */
export function setProjectKeyOwner(userId: string | null) {
  owner = userId
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

const entryId = (userId: string, projectId: string) => `${userId}:${projectId}`

export async function rememberProjectKey(projectId: string, key: CryptoKey, ttl = REMEMBER_FOR_MS) {
  // An extractable key could be read back out of storage: never keep one.
  if (!owner || key.extractable) return
  const entry: Entry = { id: entryId(owner, projectId), owner, projectId, key, expiresAt: Date.now() + ttl }
  try {
    await withStore('readwrite', (store) => store.put(entry))
  } catch {
    // Private windows may refuse IndexedDB: the project simply asks again.
  }
}

/** The remembered key, or null when there is none, it expired or it isn't this account's. */
export async function recallProjectKey(projectId: string): Promise<CryptoKey | null> {
  if (!owner) return null
  const id = entryId(owner, projectId)
  try {
    const entry = await withStore<Entry | undefined>('readonly', (store) => store.get(id))
    if (!entry) return null
    if (entry.owner !== owner || entry.expiresAt <= Date.now()) {
      await forgetProjectKey(projectId)
      return null
    }
    return entry.key
  } catch {
    return null
  }
}

export async function forgetProjectKey(projectId: string) {
  if (!owner) return
  const id = entryId(owner, projectId)
  try {
    await withStore('readwrite', (store) => store.delete(id))
  } catch {
    // Nothing to forget.
  }
}

/** Logging out (or a dead session) forgets every remembered project. */
export async function forgetAllProjectKeys() {
  try {
    await withStore('readwrite', (store) => store.clear())
  } catch {
    // Nothing to forget.
  }
}

// The checkbox remembers the person's last choice; it starts checked.
export function readRememberPreference(): boolean {
  try {
    return localStorage.getItem(PREFERENCE_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeRememberPreference(remember: boolean) {
  try {
    localStorage.setItem(PREFERENCE_KEY, remember ? '1' : '0')
  } catch {
    // Private window: the choice lasts as long as the page.
  }
}
