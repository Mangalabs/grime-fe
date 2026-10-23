import type { Slot } from '../../api/contracts'

// The single most urgent state of a scene, used for one-colour displays.
export type SceneState =
  | 'critical'
  | 'alert'
  | 'facts'
  | 'clean'
  | 'unanalyzed'
  | 'unknown'

export const sceneStateLabels: Record<SceneState, string> = {
  critical: 'Diagnóstico crítico',
  alert: 'Precisa revalidar',
  facts: 'Fatos aguardando decisão',
  clean: 'Analisada',
  unanalyzed: 'Não analisada',
  unknown: 'Sem informação de análise',
}

export function sceneState(slot: Slot): SceneState {
  const status = slot.status
  if (!status) return 'unknown'
  if (status.criticalDiagnostics > 0) return 'critical'
  if (status.pendingAlerts > 0) return 'alert'
  if (status.hasPendingFacts) return 'facts'
  if (status.lastAnalyzedAt === undefined) {
    // Older backends can't tell "analyzed, nothing found" from "never analyzed".
    return status.openDiagnostics > 0 ? 'clean' : 'unknown'
  }
  return status.lastAnalyzedAt ? 'clean' : 'unanalyzed'
}

export function supportsAnalysisTracking(slots: Slot[]): boolean {
  return slots.some((slot) => slot.status?.lastAnalyzedAt !== undefined)
}

// Reading order: the timeline first, then unanchored scenes.
export function orderScenes(slots: Slot[]): Slot[] {
  const anchored = slots
    .filter((slot) => !slot.isUnanchored)
    .sort((a, b) => (a.timelinePosition ?? 0) - (b.timelinePosition ?? 0))
  return [...anchored, ...slots.filter((slot) => slot.isUnanchored)]
}

/**
 * The slots as they will be after a reorder, so the next move is computed
 * from fresh positions before the server answers.
 */
export function applyReorder(
  slots: Slot[],
  slotId: string,
  targetPosition: number,
  isUnanchored: boolean,
): Slot[] {
  const moved = slots.find((slot) => slot.id === slotId)
  if (!moved) return slots

  const anchored = orderScenes(slots).filter(
    (slot) => !slot.isUnanchored && slot.id !== slotId,
  )
  if (!isUnanchored) {
    anchored.splice(Math.min(targetPosition, anchored.length), 0, moved)
  }
  const positions = new Map(anchored.map((slot, index) => [slot.id, index]))

  return slots.map((slot) =>
    positions.has(slot.id)
      ? { ...slot, isUnanchored: false, timelinePosition: positions.get(slot.id)! }
      : slot.id === slotId
        ? { ...slot, isUnanchored: true, timelinePosition: null }
        : slot,
  )
}

export function sceneNumberLabel(slot: Slot): string {
  return slot.isUnanchored || slot.timelinePosition === null
    ? 'Avulsa'
    : String(slot.timelinePosition + 1)
}

export function sceneTitle(slot: Slot): string {
  return slot.title?.trim() || 'Cena sem título'
}

// Case- and accent-insensitive form used for matching.
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

/**
 * Scenes matching a query by number ("42") or by title words in any order
 * ("juliana carro"). Exact number matches come first.
 */
export function searchScenes(
  slots: Slot[],
  query: string,
  // Extra searchable text per scene, e.g. its group name.
  extraText?: (slot: Slot) => string,
): Slot[] {
  const normalized = normalizeForSearch(query)
  if (!normalized) return slots

  const words = normalized.split(/\s+/)
  const isNumber = /^\d+$/.test(normalized)
  const matches = slots.filter((slot) => {
    const title = normalizeForSearch(`${sceneTitle(slot)} ${extraText?.(slot) ?? ''}`)
    if (isNumber && sceneNumberLabel(slot).startsWith(normalized)) return true
    return words.every((word) => title.includes(word))
  })

  if (!isNumber) return matches
  return [
    ...matches.filter((slot) => sceneNumberLabel(slot) === normalized),
    ...matches.filter((slot) => sceneNumberLabel(slot) !== normalized),
  ]
}
