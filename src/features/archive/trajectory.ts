import { normalizeForSearch } from '../scenes/sceneStatus'
import { attributeLabel } from './attributes'
import { bondKind, type BondKind } from './bonds'
import type { ArchiveEntity, ArchiveFact } from './entityModel'

/**
 * A character's story as the text records it, scene by scene: where they
 * are, what happens to them, what they gain, learn and want, and who they
 * are bound to. Built from the canon only; nothing is generated.
 */

export type StepKind = 'place' | 'health' | 'status' | 'gain' | 'knowledge' | 'goal' | 'role' | 'appearance' | 'origin' | 'bond' | 'other'

export const stepLabels: Record<StepKind, string> = {
  place: 'Onde está',
  health: 'Saúde',
  status: 'Situação',
  gain: 'Posses',
  knowledge: 'Descobre',
  goal: 'Quer',
  role: 'Função',
  appearance: 'Aparência',
  origin: 'Origem',
  bond: 'Vínculo',
  other: 'Outro',
}

const kindByAttribute: Record<string, StepKind> = {
  local_atual: 'place',
  saude: 'health',
  situacao: 'status',
  posse: 'gain',
  conhecimento: 'knowledge',
  objetivo: 'goal',
  cargo: 'role',
  profissao: 'role',
  aparencia: 'appearance',
  origem: 'origin',
}

export interface StepItem {
  kind: StepKind
  fact: ArchiveFact
  // Another entity's fact about this one ("Olivia: apaixonada por Julien").
  fromId: string | null
  bond: BondKind | null
  // Same attribute and value as the last time it was recorded.
  isRepeat: boolean
}

export interface TrajectoryStep {
  position: number | null
  slotId: string
  slotTitle: string | null
  items: StepItem[]
}

export interface Trajectory {
  steps: TrajectoryStep[]
  // Timeline stretches (0-based, inclusive) with no facts between two steps.
  gaps: Array<{ from: number; to: number }>
  first: number | null
  last: number | null
  summary: {
    place: ArchiveFact | null
    health: ArchiveFact | null
    status: ArchiveFact | null
    roles: ArchiveFact[]
    origins: ArchiveFact[]
    appearance: ArchiveFact[]
    goals: ArchiveFact[]
    knowledge: number
  }
}

const order = (position: number | null) => position ?? Number.MAX_SAFE_INTEGER

/** Facts with the same normalized value said once, keeping the first time. */
function distinct(facts: ArchiveFact[]): ArchiveFact[] {
  const seen = new Set<string>()
  return facts.filter((fact) => {
    const key = normalizeForSearch(fact.value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function characterTrajectory(archive: ArchiveEntity[], entityId: string): Trajectory {
  const byId = new Map(archive.map((entity) => [entity.id, entity]))
  const self = byId.get(entityId)
  const items: Array<StepItem & { slotKey: string }> = []

  for (const fact of self?.facts ?? []) {
    if (!fact.isActive) continue
    const target = fact.targetId ? byId.get(fact.targetId) : undefined
    const bond = target && target.id !== entityId ? bondKind(fact, target.type) : null
    items.push({
      kind: bond ? 'bond' : (kindByAttribute[fact.attributeKey] ?? 'other'),
      fact,
      fromId: null,
      bond,
      isRepeat: false,
      slotKey: fact.slot.id,
    })
  }
  for (const other of archive) {
    if (other.id === entityId) continue
    for (const fact of other.facts) {
      if (!fact.isActive || fact.targetId !== entityId) continue
      const bond = bondKind(fact, self?.type)
      if (!bond) continue
      items.push({ kind: 'bond', fact, fromId: other.id, bond, isRepeat: false, slotKey: fact.slot.id })
    }
  }

  items.sort((a, b) => order(a.fact.position) - order(b.fact.position))
  // A state recorded again with the same value is a repeat, not news.
  const lastValue = new Map<string, string>()
  for (const item of items) {
    const key = `${item.fromId ?? ''}|${item.fact.attributeKey}|${item.fact.targetId ?? ''}`
    const value = normalizeForSearch(item.fact.value)
    item.isRepeat = lastValue.get(key) === value
    lastValue.set(key, value)
  }

  const steps: TrajectoryStep[] = []
  for (const item of items) {
    let step = steps.find((candidate) => candidate.slotId === item.slotKey)
    if (!step) {
      step = { position: item.fact.position, slotId: item.slotKey, slotTitle: item.fact.slot.title, items: [] }
      steps.push(step)
    }
    const { slotKey: _slot, ...rest } = item
    step.items.push(rest)
  }
  steps.sort((a, b) => order(a.position) - order(b.position))

  const anchored = steps.filter((step) => step.position !== null).map((step) => step.position!)
  const gaps: Trajectory['gaps'] = []
  for (let index = 1; index < anchored.length; index += 1) {
    if (anchored[index] - anchored[index - 1] > 1) gaps.push({ from: anchored[index - 1] + 1, to: anchored[index] - 1 })
  }

  const own = (self?.facts ?? []).filter((fact) => fact.isActive).sort((a, b) => order(a.position) - order(b.position))
  const ofKind = (kind: StepKind) => own.filter((fact) => kindByAttribute[fact.attributeKey] === kind)
  const latest = (kind: StepKind) => ofKind(kind).at(-1) ?? null

  return {
    steps,
    gaps,
    first: anchored[0] ?? null,
    last: anchored.at(-1) ?? null,
    summary: {
      place: latest('place'),
      health: latest('health'),
      status: latest('status'),
      roles: distinct(ofKind('role')),
      origins: distinct(ofKind('origin')),
      appearance: distinct(ofKind('appearance')),
      goals: distinct(ofKind('goal')),
      knowledge: ofKind('knowledge').length,
    },
  }
}

/** Label for an item's attribute when it isn't one of the named kinds. */
export function itemLabel(item: StepItem): string {
  return item.kind === 'other' ? attributeLabel(item.fact.attribute) : stepLabels[item.kind]
}
