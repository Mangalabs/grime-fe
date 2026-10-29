import { normalizeForSearch } from '../scenes/sceneStatus'
import type { ArchiveEntity, ArchiveFact } from './entityModel'

/**
 * What in an auto-approved canon still deserves a look: names that may be
 * the same entity, and facts a character claims but the narration doesn't
 * confirm. Contradictions are the Revisor's job, scene by scene.
 */

// Particles that don't tell two names apart ("Julien de Vane" ~ "Julien Vane").
const particles = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'della', 'di', 'van', 'von', 'la', 'le', 'o', 'a'])

function nameTokens(name: string): string[] {
  return normalizeForSearch(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !particles.has(token))
}

export interface DuplicateCandidate {
  key: string
  // The fuller name, kept as the main one when merging.
  keep: ArchiveEntity
  merge: ArchiveEntity
}

/** Whether two words differ by at most one letter (typo), for words long enough to trust it. */
function isTypo(a: string, b: string): boolean {
  if (a === b || Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && a[i] === b[i]) i += 1
  // One substitution, insertion or deletion, or two neighbours swapped.
  return (
    a.slice(i + 1) === b.slice(i + 1) ||
    a.slice(i) === b.slice(i + 1) ||
    a.slice(i + 1) === b.slice(i) ||
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  )
}

function sameWords(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((token, index) => token === b[index] || isTypo(token, b[index]))
}

/**
 * Pairs of same-type entities that may be one: the same name up to accents,
 * case or a one-letter typo; and, for characters, a name inside the full
 * name ("Julien" and "Julien Vane"). Places inside places ("Castelo" and
 * "Biblioteca do castelo") are left alone.
 */
export function duplicateCandidates(archive: ArchiveEntity[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = []
  const tokens = new Map(archive.map((entity) => [entity.id, nameTokens(entity.name)]))
  const folded = new Map(archive.map((entity) => [entity.id, normalizeForSearch(entity.name).replace(/\s+/g, '')]))
  for (let i = 0; i < archive.length; i += 1) {
    for (let j = i + 1; j < archive.length; j += 1) {
      const a = archive[i]
      const b = archive[j]
      if (a.type !== b.type) continue
      const ta = tokens.get(a.id)!
      const tb = tokens.get(b.id)!
      if (!ta.length || !tb.length) continue
      const [short, long] = ta.length <= tb.length ? [a, b] : [b, a]
      const shortTokens = tokens.get(short.id)!
      const longTokens = tokens.get(long.id)!
      const isSame =
        folded.get(a.id) === folded.get(b.id) ||
        sameWords(ta, tb) ||
        (a.type === 'CHARACTER' && shortTokens.every((token) => longTokens.some((other) => other === token || isTypo(token, other))))
      if (!isSame) continue
      // With names of the same length, the one with more facts is kept.
      const [keep, merge] =
        shortTokens.length === longTokens.length && short.facts.length > long.facts.length ? [short, long] : [long, short]
      candidates.push({ key: `dup:${[a.id, b.id].sort().join('|')}`, keep, merge })
    }
  }
  return candidates
}

export interface ClaimItem {
  key: string
  entity: ArchiveEntity
  fact: ArchiveFact
}

/** Active facts a character claims rather than the narration shows, in timeline order. */
export function subjectiveClaims(archive: ArchiveEntity[]): ClaimItem[] {
  return archive
    .flatMap((entity) =>
      entity.facts.filter((fact) => fact.isActive && fact.isSubjective).map((fact) => ({ key: `claim:${fact.id}`, entity, fact })),
    )
    .sort((a, b) => (a.fact.position ?? Number.MAX_SAFE_INTEGER) - (b.fact.position ?? Number.MAX_SAFE_INTEGER))
}

/** How many items still need a look, for the tab badge. */
export function countToReview(projectId: string, archive: ArchiveEntity[]): number {
  const dismissed = readDismissed(projectId)
  return [...duplicateCandidates(archive), ...subjectiveClaims(archive)].filter((item) => !dismissed.has(item.key)).length
}

const storageKey = (projectId: string) => `petricor.aconferir.${projectId}`

// Dismissed items are a per-browser convenience; storage may be unavailable.
export function readDismissed(projectId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey(projectId)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function writeDismissed(projectId: string, keys: Set<string>) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify([...keys]))
  } catch {
    // Shown again next time.
  }
}
