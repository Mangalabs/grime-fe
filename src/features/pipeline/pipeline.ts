/**
 * The editorial pipeline of a project: which stages it goes through, where it
 * is now and how it got there. Stored as one encrypted document; the notes of
 * each stage live with the other review notes, tagged with the stage id.
 */

export type StageKind =
  | 'leitura'
  | 'estrutural'
  | 'carta'
  | 'aguardando'
  | 'desenvolvimento'
  | 'copidesque'
  | 'provas'
  | 'producao'
  | 'livre'

// Pages of the workspace a stage can point to, plus the /producao route.
export type StageTool = 'review' | 'archive' | 'style-sheet' | 'architectural-review' | 'rhythm' | 'export' | 'producao'

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface Stage {
  id: string
  kind: StageKind
  name: string
  checklist: ChecklistItem[]
  // The stage's working text: impressions, the letter draft, decisions.
  notebook: string
  // Scenes marked as done in this stage (read, edited, copyedited…).
  doneSlotIds: string[]
  // Dates as YYYY-MM-DD, for stages that wait on someone.
  sentOn: string | null
  dueOn: string | null
  skipped: boolean
}

export interface PipelineEvent {
  id: string
  // null: the project was marked as finished.
  stageId: string | null
  at: string
}

export interface Pipeline {
  version: 1
  stages: Stage[]
  currentStageId: string | null
  finishedAt: string | null
  history: PipelineEvent[]
}

export interface StageKindInfo {
  label: string
  description: string
  // Placeholder for the stage notebook: what usually goes in it.
  notebookHint: string
  checklist: string[]
  tools: StageTool[]
  // Label for the per-scene progress, when the stage goes scene by scene.
  scenesLabel?: string
  // Open notes from earlier stages matter here (the letter, the follow-up).
  carriesNotes?: boolean
  // Labels for the two dates, when the stage waits on someone.
  dates?: { sent: string; due: string }
}

export const stageKinds: Record<StageKind, StageKindInfo> = {
  leitura: {
    label: 'Primeira leitura',
    description: 'Ler o livro inteiro como leitor, registrando impressões sem corrigir nada ainda.',
    notebookHint: 'Impressões da leitura: o que prende, onde a leitura cansa, o que confunde, perguntas que surgiram…',
    checklist: [
      'Ler todas as cenas',
      'Registrar as impressões gerais no caderno',
      'Marcar com notas os trechos em que a leitura travou',
      'Cadastrar personagens e lugares principais no Arquivo',
      'Definir gênero e público do livro',
    ],
    tools: ['review', 'archive'],
    scenesLabel: 'Cenas lidas',
  },
  estrutural: {
    label: 'Mapeamento estrutural',
    description: 'Entender a arquitetura do livro: atos, arcos, ritmo e continuidade.',
    notebookHint: 'Mapa do livro: atos e viradas, arcos dos personagens, buracos de continuidade, cenas que sobram ou faltam…',
    checklist: [
      'Organizar as cenas em atos ou grupos',
      'Rodar a revisão arquitetural',
      'Conferir a curva de tensão e o ritmo',
      'Revisar fatos e continuidade no Arquivo',
      'Registrar cada problema estrutural como nota "Corrigir"',
    ],
    tools: ['architectural-review', 'rhythm', 'archive', 'review'],
  },
  carta: {
    label: 'Carta de avaliação',
    description: 'Reunir o que foi encontrado e escrever a carta para o autor.',
    notebookHint: 'Rascunho da carta: pontos fortes, problemas principais em ordem de prioridade, caminhos possíveis…',
    checklist: [
      'Revisar as notas abertas das etapas anteriores',
      'Escrever a carta no caderno',
      'Exportar o relatório para o autor',
      'Enviar a carta ao autor',
    ],
    tools: ['export', 'architectural-review'],
    carriesNotes: true,
  },
  aguardando: {
    label: 'Aguardando retorno do autor',
    description: 'A carta está com o autor. Acompanhe o prazo e registre o que ele perguntar.',
    notebookHint: 'Combinados com o autor, dúvidas que ele mandou, o que ele disse que vai mudar…',
    checklist: ['Combinar o prazo de retorno', 'Registrar as dúvidas do autor', 'Importar a nova versão do manuscrito'],
    tools: ['export'],
    carriesNotes: true,
    dates: { sent: 'Carta enviada em', due: 'Retorno previsto para' },
  },
  desenvolvimento: {
    label: 'Edição de desenvolvimento',
    description: 'Trabalhar a nova versão: conferir cada ponto da carta e revisar cena a cena.',
    notebookHint: 'O que mudou na nova versão, o que ainda falta, decisões tomadas com o autor…',
    checklist: [
      'Conferir se cada ponto da carta foi tratado',
      'Reanalisar as cenas alteradas',
      'Resolver ou reabrir as notas pendentes',
      'Validar a estrutura de novo',
    ],
    tools: ['review', 'architectural-review', 'rhythm'],
    scenesLabel: 'Cenas revisadas',
    carriesNotes: true,
  },
  copidesque: {
    label: 'Copidesque',
    description: 'Revisão de linha: padronização, gramática, pontuação e consistência de nomes.',
    notebookHint: 'Critérios adotados, dúvidas de grafia para o autor, padrões a levar para a folha de estilo…',
    checklist: [
      'Montar ou atualizar a folha de estilo',
      'Padronizar grafias, nomes e números',
      'Conferir diálogos e pontuação',
      'Exportar o manuscrito anotado (Word com comentários)',
    ],
    tools: ['style-sheet', 'review', 'export'],
    scenesLabel: 'Cenas copidescadas',
  },
  provas: {
    label: 'Revisão de provas',
    description: 'Conferir a prova diagramada antes da gráfica.',
    notebookHint: 'Correções da prova por página, pendências com quem diagrama…',
    checklist: [
      'Receber a prova diagramada em PDF',
      'Conferir quebras de linha, viúvas e órfãs',
      'Conferir sumário, fólios e cabeçalhos',
      'Aprovar a prova final',
    ],
    tools: ['producao', 'style-sheet'],
    scenesLabel: 'Cenas conferidas na prova',
  },
  producao: {
    label: 'Produção',
    description: 'Formato, registros, capa e arquivo final para a gráfica.',
    notebookHint: 'Orçamentos, contatos da gráfica, prazos, números de ISBN e ficha…',
    checklist: ['Escolher formato e papel', 'Pedir ISBN e ficha catalográfica', 'Aprovar a capa', 'Enviar o arquivo final à gráfica'],
    tools: ['producao'],
  },
  livre: {
    label: 'Etapa livre',
    description: 'Uma etapa própria deste projeto.',
    notebookHint: 'Anotações desta etapa…',
    checklist: [],
    tools: [],
  },
}

// The order a new project starts with; each project can change it.
export const defaultStageKinds: StageKind[] = [
  'leitura',
  'estrutural',
  'carta',
  'aguardando',
  'desenvolvimento',
  'copidesque',
  'provas',
  'producao',
]

const newId = () => crypto.randomUUID()

export function createStage(kind: StageKind, name?: string): Stage {
  const info = stageKinds[kind]
  return {
    id: newId(),
    kind,
    name: name?.trim() || info.label,
    checklist: info.checklist.map((label) => ({ id: newId(), label, done: false })),
    notebook: '',
    doneSlotIds: [],
    sentOn: null,
    dueOn: null,
    skipped: false,
  }
}

export function createPipeline(): Pipeline {
  return { version: 1, stages: defaultStageKinds.map((kind) => createStage(kind)), currentStageId: null, finishedAt: null, history: [] }
}

const isKind = (value: unknown): value is StageKind => typeof value === 'string' && value in stageKinds
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)
const dateOrNull = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null)

/** Reads a stored pipeline, filling in whatever an older version left out. */
export function normalizePipeline(raw: unknown): Pipeline {
  if (!raw || typeof raw !== 'object') return createPipeline()
  const source = raw as Partial<Record<keyof Pipeline, unknown>>
  const stages = (Array.isArray(source.stages) ? source.stages : [])
    .filter((stage): stage is Record<string, unknown> => !!stage && typeof stage === 'object' && typeof stage.id === 'string')
    .map(
      (stage): Stage => ({
        id: stage.id as string,
        kind: isKind(stage.kind) ? stage.kind : 'livre',
        name: text(stage.name, isKind(stage.kind) ? stageKinds[stage.kind].label : 'Etapa'),
        checklist: (Array.isArray(stage.checklist) ? stage.checklist : [])
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && typeof item.id === 'string')
          .map((item) => ({ id: item.id as string, label: text(item.label), done: item.done === true })),
        notebook: text(stage.notebook),
        doneSlotIds: Array.isArray(stage.doneSlotIds) ? stage.doneSlotIds.filter((id): id is string => typeof id === 'string') : [],
        sentOn: dateOrNull(stage.sentOn),
        dueOn: dateOrNull(stage.dueOn),
        skipped: stage.skipped === true,
      }),
    )
  if (stages.length === 0) return createPipeline()
  const ids = new Set(stages.map((stage) => stage.id))
  const current = typeof source.currentStageId === 'string' && ids.has(source.currentStageId) ? source.currentStageId : null
  const history = (Array.isArray(source.history) ? source.history : [])
    .filter((event): event is Record<string, unknown> => !!event && typeof event === 'object' && typeof event.at === 'string')
    .map((event) => ({
      id: text(event.id) || newId(),
      stageId: typeof event.stageId === 'string' ? event.stageId : null,
      at: event.at as string,
    }))
  return {
    version: 1,
    stages,
    currentStageId: current,
    finishedAt: current ? null : typeof source.finishedAt === 'string' ? source.finishedAt : null,
    history,
  }
}

/** Moves the project to a stage (or to finished, with null) and logs it. */
export function moveTo(pipeline: Pipeline, stageId: string | null, now = new Date()): Pipeline {
  if (stageId === pipeline.currentStageId && (stageId !== null || pipeline.finishedAt)) return pipeline
  const at = now.toISOString()
  return {
    ...pipeline,
    // Moving into a skipped stage means it is part of the flow after all.
    stages: pipeline.stages.map((stage) => (stage.id === stageId && stage.skipped ? { ...stage, skipped: false } : stage)),
    currentStageId: stageId,
    finishedAt: stageId === null ? at : null,
    history: [...pipeline.history, { id: newId(), stageId, at }],
  }
}

/** The stage after the current one, skipping the skipped ones. */
export function nextStage(pipeline: Pipeline): Stage | null {
  const index = pipeline.stages.findIndex((stage) => stage.id === pipeline.currentStageId)
  return pipeline.stages.slice(index + 1).find((stage) => !stage.skipped) ?? null
}

/** How many times the project has entered a stage: 2 means a second round. */
export function roundOf(pipeline: Pipeline, stageId: string): number {
  return pipeline.history.filter((event) => event.stageId === stageId).length
}

export type StageState = 'atual' | 'feita' | 'pendente' | 'pulada'

/**
 * Where a stage stands: the current one, done (entered before and left), or
 * still ahead. Going back makes later stages pending again until re-entered.
 */
export function stageState(pipeline: Pipeline, stage: Stage): StageState {
  if (stage.skipped) return 'pulada'
  if (pipeline.currentStageId === stage.id) return 'atual'
  if (pipeline.finishedAt) return roundOf(pipeline, stage.id) > 0 ? 'feita' : 'pendente'
  const order = pipeline.stages.map((item) => item.id)
  const current = order.indexOf(pipeline.currentStageId ?? '')
  return roundOf(pipeline, stage.id) > 0 && order.indexOf(stage.id) < current ? 'feita' : 'pendente'
}

/** When the project entered its current stage (or finished). */
export function enteredAt(pipeline: Pipeline): string | null {
  return pipeline.history.at(-1)?.at ?? null
}

/** Whole days between two dates, ignoring the time of day. */
export function daysBetween(from: string | Date, to: string | Date): number {
  const day = (value: string | Date) => {
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  }
  return Math.round((day(to) - day(from)) / 86_400_000)
}

export function updateStage(pipeline: Pipeline, stageId: string, change: (stage: Stage) => Stage): Pipeline {
  return { ...pipeline, stages: pipeline.stages.map((stage) => (stage.id === stageId ? change(stage) : stage)) }
}

/** Removes a stage; when it was the current one, the project has no stage until moved. */
export function removeStage(pipeline: Pipeline, stageId: string): Pipeline {
  return {
    ...pipeline,
    stages: pipeline.stages.filter((stage) => stage.id !== stageId),
    currentStageId: pipeline.currentStageId === stageId ? null : pipeline.currentStageId,
  }
}

export function moveStage(pipeline: Pipeline, stageId: string, offset: -1 | 1): Pipeline {
  const stages = [...pipeline.stages]
  const from = stages.findIndex((stage) => stage.id === stageId)
  const to = from + offset
  if (from < 0 || to < 0 || to >= stages.length) return pipeline
  ;[stages[from], stages[to]] = [stages[to], stages[from]]
  return { ...pipeline, stages }
}
