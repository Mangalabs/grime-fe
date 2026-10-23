import { groupColors, type GroupColor, type SceneGroup, type Slot } from '../../api/contracts'

export const groupColorLabels: Record<GroupColor, string> = {
  sage: 'Verde',
  sky: 'Azul',
  amber: 'Âmbar',
  plum: 'Ameixa',
  teal: 'Turquesa',
  brick: 'Tijolo',
  slate: 'Ardósia',
  rose: 'Rosa',
}

export interface StructureTemplate {
  id: string
  name: string
  description: string
  groups: string[]
  // Approximate share of the book each group usually takes (sums to 1).
  shares: number[]
}

export const structureTemplates: StructureTemplate[] = [
  {
    id: 'hero',
    name: 'Jornada do herói',
    description: '12 etapas, segundo Vogler',
    groups: [
      'Mundo comum',
      'Chamado à aventura',
      'Recusa do chamado',
      'Encontro com o mentor',
      'Travessia do primeiro limiar',
      'Testes, aliados e inimigos',
      'Aproximação da caverna oculta',
      'Provação',
      'Recompensa',
      'Caminho de volta',
      'Ressurreição',
      'Retorno com o elixir',
    ],
    // Vogler: Act I ≈ 25%, Act II ≈ 50%, Act III ≈ 25%.
    shares: [0.07, 0.04, 0.04, 0.04, 0.06, 0.17, 0.1, 0.13, 0.1, 0.08, 0.1, 0.07],
  },
  {
    id: 'three-acts',
    name: 'Três atos',
    description: 'Apresentação, confronto e resolução',
    groups: ['Ato I — Apresentação', 'Ato II — Confronto', 'Ato III — Resolução'],
    shares: [0.25, 0.5, 0.25],
  },
  {
    id: 'save-the-cat',
    name: 'Save the Cat',
    description: '15 batidas, segundo Snyder',
    groups: [
      'Imagem de abertura',
      'Tema declarado',
      'Preparação',
      'Catalisador',
      'Debate',
      'Virada para o Ato 2',
      'História B',
      'Diversão e jogos',
      'Ponto médio',
      'Os vilões se aproximam',
      'Tudo está perdido',
      'Noite escura da alma',
      'Virada para o Ato 3',
      'Final',
      'Imagem final',
    ],
    // Snyder's beat sheet percentages, as spans.
    shares: [0.01, 0.02, 0.07, 0.02, 0.08, 0.02, 0.02, 0.26, 0.02, 0.23, 0.02, 0.03, 0.02, 0.17, 0.01],
  },
]

/** Colours cycle through the palette, continuing after existing groups. */
export function templateGroups(template: StructureTemplate, existingCount: number) {
  return template.groups.map((name, index) => ({
    name,
    color: groupColors[(existingCount + index) % groupColors.length],
  }))
}

export interface GroupRun {
  groupId: string
  start: number
  length: number
}

/** Consecutive scenes of the same group, as bands over the scene bar. */
export function groupRuns(scenes: Slot[]): GroupRun[] {
  const runs: GroupRun[] = []
  scenes.forEach((slot, index) => {
    const groupId = slot.groupId
    if (!groupId) return
    const last = runs.at(-1)
    if (last && last.groupId === groupId && last.start + last.length === index) {
      last.length++
    } else {
      runs.push({ groupId, start: index, length: 1 })
    }
  })
  return runs
}

/** "cenas 1–4, 7" for the scenes of a group, in timeline order. */
export function describeGroupScenes(scenes: Slot[], group: SceneGroup): string {
  const runs = groupRuns(scenes).filter((run) => run.groupId === group.id)
  if (runs.length === 0) return 'nenhuma cena'
  const parts = runs.map((run) =>
    run.length === 1 ? String(run.start + 1) : `${run.start + 1}–${run.start + run.length}`,
  )
  const total = runs.reduce((sum, run) => sum + run.length, 0)
  return `${total === 1 ? 'cena' : 'cenas'} ${parts.join(', ')}`
}
