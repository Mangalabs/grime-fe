import type {
  ArchitectReview,
  MacroDiagnostic,
  MacroDiagnosticSeverity,
  MacroDiagnosticType,
  Slot,
} from '../../api/contracts'
import { orderScenes } from '../scenes/sceneStatus'

export const diagnosticTypes: Record<MacroDiagnosticType, { label: string; description: string }> = {
  PACING_DRAG: { label: 'Ritmo arrastado', description: 'Trechos longos em que o conflito não avança.' },
  ABANDONED_PLOT_THREAD: { label: 'Trama abandonada', description: 'Elementos apresentados e depois esquecidos.' },
  CHARACTER_ARC_FLATLINE: { label: 'Arco estagnado', description: 'Personagens que terminam como começaram.' },
  STRUCTURAL_REPETITION: { label: 'Repetição estrutural', description: 'Padrões de cena que se repetem.' },
  THEMATIC_DISCONNECT: { label: 'Desconexão temática', description: 'O final responde a outra pergunta que a premissa.' },
  CLIMAX_ANTI_RESONANCE: {
    label: 'Clímax sem ressonância',
    description: 'Resolução que não decorre das escolhas dos personagens.',
  },
}

export const severities: MacroDiagnosticSeverity[] = ['CRITICAL', 'WARNING', 'ANOMALY']

export const severityLabels: Record<MacroDiagnosticSeverity, string> = {
  CRITICAL: 'Crítico',
  WARNING: 'Alerta',
  ANOMALY: 'Anomalia',
}

// Suggestions for the "structure" field; any text is accepted.
export const frameworkSuggestions = [
  'Desconhecida',
  'Três atos',
  'Jornada do herói',
  'Save the Cat',
  'Kishōtenketsu',
  'Episódica',
  'Slice-of-life',
]

/**
 * Scene numbers cited in a text: "Cena 16", "Cenas 15–17", "cenas 4, 9 e 12",
 * "Cenas 15 a 17". Each match keeps its position, so the text can be linked.
 */
export interface SceneReference {
  start: number
  end: number
  numbers: number[]
}

const referencePattern =
  /\bcenas?\s+(\d+(?:\s*(?:[–—-]|a|até)\s*\d+)?(?:\s*(?:,|e)\s*\d+(?:\s*(?:[–—-]|a|até)\s*\d+)?)*)/gi

export function findSceneReferences(text: string): SceneReference[] {
  const references: SceneReference[] = []
  for (const match of text.matchAll(referencePattern)) {
    const numbers = new Set<number>()
    for (const part of match[1].split(/\s*(?:,|\be\b)\s*/)) {
      const [from, to] = part.split(/\s*(?:[–—-]|\ba\b|até)\s*/).map(Number)
      if (!Number.isFinite(from)) continue
      const last = Number.isFinite(to) && to >= from ? Math.min(to, from + 500) : from
      for (let n = from; n <= last; n += 1) numbers.add(n)
    }
    if (numbers.size > 0) {
      references.push({ start: match.index, end: match.index + match[0].length, numbers: [...numbers] })
    }
  }
  return references
}

/** Every scene number a finding cites, in its scope, symptoms and examples. */
export function citedNumbers(diagnostic: MacroDiagnostic): number[] {
  const texts = [diagnostic.affectedScope, ...diagnostic.clinicalSymptoms, ...diagnostic.examples]
  const numbers = new Set(texts.flatMap((text) => findSceneReferences(text).flatMap((ref) => ref.numbers)))
  return [...numbers].sort((a, b) => a - b)
}

/**
 * Maps "Cena N" of a report to today's scene. Reports keep the scene order
 * they were generated from, so moved, split or merged scenes still resolve;
 * older reports fall back to the current timeline order.
 */
export function sceneResolver(report: ArchitectReview, slots: Slot[]) {
  const anchored = orderScenes(slots).filter((slot) => !slot.isUnanchored)
  const byId = new Map(slots.map((slot) => [slot.id, slot]))
  return (number: number): Slot | null => {
    if (report.sceneIds) {
      const id = report.sceneIds[number - 1]
      return id ? byId.get(id) ?? null : null
    }
    return anchored[number - 1] ?? null
  }
}

/** How the timeline changed since a report: scenes added or gone. */
export function timelineDrift(report: ArchitectReview, slots: Slot[]) {
  if (!report.sceneIds) return null
  const reported = new Set(report.sceneIds)
  const current = slots.filter((slot) => !slot.isUnanchored)
  const added = current.filter((slot) => !reported.has(slot.id)).length
  const removed = report.sceneIds.filter((id) => !current.some((slot) => slot.id === id)).length
  const currentOrder = orderScenes(current).map((slot) => slot.id).filter((id) => reported.has(id))
  const keptOrder = report.sceneIds.filter((id) => currentOrder.includes(id))
  const reordered = currentOrder.some((id, index) => keptOrder[index] !== id)
  return added || removed || reordered ? { added, removed, reordered } : null
}

export function bySeverity(left: MacroDiagnostic, right: MacroDiagnostic) {
  return severities.indexOf(left.severity) - severities.indexOf(right.severity)
}
