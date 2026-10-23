import type {
  ArchitectReview,
  DiagnosticSeverity,
  DiagnosticType,
  LinterDiagnostic,
  NoteKind,
  Override,
  RegressionAlert,
  SceneGroup,
  SceneMetric,
  Slot,
} from '../../api/contracts'
import { diagnosticTypes as macroTypes, findSceneReferences, sceneResolver, severityLabels as macroSeverity } from '../architect/architect'
import { resolveAnchor, type Note } from '../notes/notes'
import { sceneTitle } from '../scenes/sceneStatus'
import { checkScene, type StyleSheet } from '../style/styleSheet'

/**
 * What goes into the review PDF, decided before anything is drawn: only what
 * asks for action, ranked, for the chosen reader. Pure, so it can be previewed.
 */

export type ReportPreset = 'AUTHOR' | 'CHECKLIST' | 'MANUSCRIPT'

export type ReportScope =
  | { kind: 'ALL' }
  | { kind: 'GROUP'; groupId: string }
  | { kind: 'RANGE'; from: number; to: number }

export interface ReportOptions {
  preset: ReportPreset
  scope: ReportScope
  // Diagnostics below this severity are left out.
  minSeverity: DiagnosticSeverity
  includeArchitect: boolean
  notes: 'OPEN' | 'ALL' | 'NONE'
  includeAlerts: boolean
  includeStyle: boolean
  includeRhythm: boolean
  // List intentional exceptions (with their justification) instead of hiding them.
  includeExceptions: boolean
  reviewer: string
  letter: string
}

export const presetDefaults: Record<ReportPreset, Partial<ReportOptions>> = {
  AUTHOR: { minSeverity: 'WARNING', includeArchitect: true, notes: 'OPEN', includeAlerts: true, includeStyle: true, includeRhythm: true, includeExceptions: false },
  CHECKLIST: { minSeverity: 'WARNING', includeArchitect: false, notes: 'OPEN', includeAlerts: true, includeStyle: true, includeRhythm: false, includeExceptions: false },
  MANUSCRIPT: { minSeverity: 'NOTE', includeArchitect: false, notes: 'OPEN', includeAlerts: false, includeStyle: false, includeRhythm: false, includeExceptions: false },
}

/** Everything gathered from the project, decrypted, in timeline order. */
export interface SceneData {
  slot: Slot
  // Position on the timeline (1-based); null for scenes outside it.
  number: number | null
  text: string | null
  diagnostics: LinterDiagnostic[]
  overrides: Override[]
  alerts: RegressionAlert[]
}

export interface ReportData {
  projectTitle: string
  scenes: SceneData[]
  notes: Note[]
  groups: SceneGroup[]
  architect: ArchitectReview | null
  // The latest report with a tension curve (may be older than `architect`).
  tension: ArchitectReview | null
  styleSheet: StyleSheet | null
  names: string[]
}

// --- Labels ----------------------------------------------------------------

export const diagnosticTypeLabels: Record<DiagnosticType, string> = {
  CONTINUITY_BREAK: 'Quebra de continuidade',
  SHOW_TELL_IMBALANCE: 'Mostrar x contar',
  PSYCHIC_DISTANCE_FILTER: 'Distância psíquica',
  WEAK_CAUSALITY: 'Causalidade fraca',
  FORCED_EXPOSITION: 'Exposição forçada',
  PROSE_MECHANICS: 'Mecânica de prosa',
  WHITE_ROOM_SYNDROME: 'Síndrome do quarto branco',
  OVERWRITING_CRUTCHES: 'Muletas e excesso de escrita',
  DIALOGUE_HOMOGENIZATION: 'Vozes homogêneas no diálogo',
}

export const severityNames: Record<DiagnosticSeverity, string> = {
  CRITICAL: 'Crítico',
  WARNING: 'Atenção',
  NOTE: 'Observação',
}

export const noteKindNames: Record<NoteKind, string> = {
  FIX: 'Corrigir',
  QUESTION: 'Pergunta',
  NOTE: 'Nota',
  IDEA: 'Ideia',
}

const severityRank: Record<DiagnosticSeverity, number> = { CRITICAL: 3, WARNING: 2, NOTE: 1 }

export type Tone = 'critical' | 'warning' | 'note' | 'info'

// --- Model -----------------------------------------------------------------

export interface ReportItem {
  key: string
  tone: Tone
  tag: string
  title: string
  body: string
  quote: string | null
  hint: string | null
  // Where the item sits in the scene text, for the annotated manuscript.
  anchor: { start: number; end: number } | null
  priority: number
}

export interface SceneSection {
  scene: SceneData
  label: string
  title: string
  meta: string[]
  items: ReportItem[]
  exceptions: string[]
  styleSummary: Array<{ label: string; count: number }>
}

export interface Priority {
  tone: Tone
  title: string
  detail: string
  scenes: SceneData[]
}

export interface StructureFinding {
  tone: Tone
  tag: string
  title: string
  scope: string
  symptoms: string[]
  examples: string[]
  scenes: SceneData[]
}

export interface ReportModel {
  options: ReportOptions
  projectTitle: string
  scopeLabel: string
  scenes: SceneData[]
  sections: SceneSection[]
  generalNotes: ReportItem[]
  priorities: Priority[]
  structure: { framework: string; date: string; findings: StructureFinding[] } | null
  rhythm: { words: number[]; tension: Array<number | null>; labels: string[] } | null
  styleTotals: Array<{ label: string; count: number; scenes: number }>
  stats: {
    scenes: number
    words: number
    analysed: number | null
    withItems: number
    items: number
    critical: number
    openNotes: number
    exceptions: number
  }
  warnings: string[]
}

const toneOfSeverity = (severity: DiagnosticSeverity): Tone =>
  severity === 'CRITICAL' ? 'critical' : severity === 'WARNING' ? 'warning' : 'note'

const toneOfNote = (kind: NoteKind): Tone => (kind === 'FIX' ? 'warning' : kind === 'QUESTION' ? 'note' : 'info')

const notePriority: Record<NoteKind, number> = { FIX: 80, QUESTION: 65, NOTE: 25, IDEA: 15 }
const diagnosticPriority: Record<DiagnosticSeverity, number> = { CRITICAL: 90, WARNING: 60, NOTE: 30 }

export function sceneLabel(scene: SceneData) {
  return scene.number === null ? 'Cena avulsa' : `Cena ${scene.number}`
}

const wordCount = (text: string | null) => (text ? (text.match(/[\p{L}\p{N}]+/gu) ?? []).length : 0)

function listNumbers(scenes: SceneData[], max = 8) {
  const labels = scenes.map((scene) => (scene.number === null ? 'avulsa' : String(scene.number)))
  return labels.length > max ? `${labels.slice(0, max).join(', ')} e mais ${labels.length - max}` : labels.join(', ')
}

function inScope(scene: SceneData, scope: ReportScope) {
  if (scope.kind === 'ALL') return true
  if (scope.kind === 'GROUP') return scene.slot.groupId === scope.groupId
  return scene.number !== null && scene.number >= scope.from && scene.number <= scope.to
}

export function buildReport(data: ReportData, options: ReportOptions): ReportModel {
  const scenes = data.scenes.filter((scene) => inScope(scene, options.scope))
  const sceneById = new Map(data.scenes.map((scene) => [scene.slot.id, scene]))
  const groupById = new Map(data.groups.map((group) => [group.id, group]))
  const warnings: string[] = []

  // Tension per scene, following the report's own scene numbering.
  const tensionBySlot = new Map<string, SceneMetric>()
  if (data.tension?.sceneMetrics) {
    for (const metric of data.tension.sceneMetrics) {
      const id = data.tension.sceneIds?.[metric.scene - 1]
      if (id) tensionBySlot.set(id, metric)
    }
  }

  const noteFilter = (note: Note) =>
    !note.isUnreadable && (options.notes === 'ALL' || (options.notes === 'OPEN' && note.status === 'OPEN'))

  const styleTotals = new Map<string, { label: string; count: number; scenes: number }>()
  let exceptionCount = 0

  const sections: SceneSection[] = scenes.map((scene) => {
    const items: ReportItem[] = []
    const overridden = new Set(scene.overrides.map((override) => override.diagnosticSignatureHash))
    exceptionCount += scene.overrides.length

    scene.diagnostics.forEach((diagnostic, index) => {
      if (diagnostic.signatureHash && overridden.has(diagnostic.signatureHash)) return
      if (severityRank[diagnostic.severity] < severityRank[options.minSeverity]) return
      const start = scene.text && diagnostic.sourceQuote ? scene.text.indexOf(diagnostic.sourceQuote) : -1
      items.push({
        key: `d${index}`,
        tone: toneOfSeverity(diagnostic.severity),
        tag: severityNames[diagnostic.severity],
        title: diagnosticTypeLabels[diagnostic.type] ?? diagnostic.type,
        body: diagnostic.message,
        quote: diagnostic.sourceQuote || null,
        hint: diagnostic.correctionHint,
        anchor: start >= 0 ? { start, end: start + diagnostic.sourceQuote.length } : null,
        priority: diagnosticPriority[diagnostic.severity],
      })
    })

    if (options.notes !== 'NONE') {
      data.notes
        .filter((note) => note.slotId === scene.slot.id && noteFilter(note))
        .forEach((note) => {
          const anchor = scene.text ? resolveAnchor(scene.text, note) : null
          items.push({
            key: `n${note.id}`,
            tone: note.status === 'RESOLVED' ? 'info' : toneOfNote(note.kind),
            tag: `${noteKindNames[note.kind]}${note.status === 'RESOLVED' ? ' · resolvida' : ''}`,
            title: note.author ? `Nota de ${note.author}` : 'Nota',
            body: note.body,
            quote: note.excerpt?.quote ?? null,
            hint: null,
            anchor: anchor ? { start: anchor.start, end: anchor.end } : null,
            priority: note.status === 'RESOLVED' ? 5 : notePriority[note.kind],
          })
        })
    }

    if (options.includeAlerts) {
      scene.alerts
        .filter((alert) => alert.status === 'PENDING')
        .forEach((alert) => {
          const source = sceneById.get(alert.sourceSlotId)
          items.push({
            key: `a${alert.id}`,
            tone: 'warning',
            tag: 'Continuidade',
            title: 'Releitura pendente',
            body: source
              ? `${sceneLabel(source)} (“${sceneTitle(source.slot)}”) mudou fatos dos quais esta cena depende. Releia para confirmar a continuidade.`
              : 'Uma cena da qual esta depende foi alterada. Releia para confirmar a continuidade.',
            quote: null,
            hint: null,
            anchor: null,
            priority: 75,
          })
        })
    }

    // Style sheet: a summary per scene, never one item per occurrence.
    const styleSummary: Array<{ label: string; count: number }> = []
    if (options.includeStyle && data.styleSheet && scene.text) {
      const counts = new Map<string, { label: string; count: number }>()
      for (const finding of checkScene(scene.text, data.styleSheet, { slotId: scene.slot.id, names: data.names })) {
        if (finding.isException) continue
        const entry = counts.get(finding.ruleId) ?? { label: finding.label, count: 0 }
        entry.count += 1
        counts.set(finding.ruleId, entry)
      }
      for (const [ruleId, entry] of counts) {
        styleSummary.push(entry)
        const total = styleTotals.get(ruleId) ?? { label: entry.label, count: 0, scenes: 0 }
        total.count += entry.count
        total.scenes += 1
        styleTotals.set(ruleId, total)
      }
      styleSummary.sort((a, b) => b.count - a.count)
    }

    const exceptions = options.includeExceptions
      ? scene.overrides.map((override) => {
          const diagnostic = scene.diagnostics.find((item) => item.signatureHash === override.diagnosticSignatureHash)
          return `${diagnostic ? diagnosticTypeLabels[diagnostic.type] ?? diagnostic.type : 'Diagnóstico'}: ${override.justification}`
        })
      : []

    items.sort((a, b) => b.priority - a.priority || (a.anchor?.start ?? Infinity) - (b.anchor?.start ?? Infinity))

    const group = scene.slot.groupId ? groupById.get(scene.slot.groupId) : undefined
    const tension = tensionBySlot.get(scene.slot.id)
    const analysedAt = scene.slot.status?.lastAnalyzedAt
    return {
      scene,
      label: sceneLabel(scene),
      title: sceneTitle(scene.slot),
      meta: [
        group?.name ?? null,
        `${wordCount(scene.text).toLocaleString('pt-BR')} palavras`,
        tension ? `tensão ${tension.tension}/10` : null,
        analysedAt === null ? 'ainda não analisada' : null,
      ].filter((part): part is string => Boolean(part)),
      items,
      exceptions,
      styleSummary,
    }
  })

  // The manuscript shows every scene in scope. The checklist lists scenes with
  // anything to do, style included; the author report only scenes with real
  // items, since style is summarised for the whole selection.
  const visibleSections =
    options.preset === 'MANUSCRIPT'
      ? sections
      : options.preset === 'CHECKLIST'
        ? sections.filter((section) => section.items.length || section.exceptions.length || section.styleSummary.length)
        : sections.filter((section) => section.items.length || section.exceptions.length)

  const generalNotes: ReportItem[] =
    options.notes === 'NONE' || options.preset === 'MANUSCRIPT'
      ? []
      : data.notes
          .filter((note) => note.slotId === null && noteFilter(note))
          .map((note) => ({
            key: `g${note.id}`,
            tone: note.status === 'RESOLVED' ? 'info' : toneOfNote(note.kind),
            tag: noteKindNames[note.kind],
            title: note.author ? `Nota de ${note.author}` : 'Nota',
            body: note.body,
            quote: null,
            hint: null,
            anchor: null,
            priority: notePriority[note.kind],
          }))
          .sort((a, b) => b.priority - a.priority)

  // Structural review: only in the author report, with scenes named.
  let structure: ReportModel['structure'] = null
  if (options.includeArchitect && options.preset === 'AUTHOR' && data.architect) {
    const resolve = sceneResolver(data.architect, data.scenes.map((scene) => scene.slot))
    const findings = [...data.architect.diagnostics]
      .sort((a, b) => ['CRITICAL', 'WARNING', 'ANOMALY'].indexOf(a.severity) - ['CRITICAL', 'WARNING', 'ANOMALY'].indexOf(b.severity))
      .map((diagnostic) => {
        const cited = new Set<string>()
        for (const text of [diagnostic.affectedScope, ...diagnostic.clinicalSymptoms, ...diagnostic.examples]) {
          for (const reference of findSceneReferences(text)) {
            for (const number of reference.numbers) {
              const slot = resolve(number)
              if (slot) cited.add(slot.id)
            }
          }
        }
        return {
          tone: (diagnostic.severity === 'CRITICAL' ? 'critical' : diagnostic.severity === 'WARNING' ? 'warning' : 'note') as Tone,
          tag: macroSeverity[diagnostic.severity],
          title: macroTypes[diagnostic.type].label,
          scope: diagnostic.affectedScope,
          symptoms: diagnostic.clinicalSymptoms,
          examples: diagnostic.examples,
          scenes: data.scenes.filter((scene) => cited.has(scene.slot.id)),
        }
      })
    structure = {
      framework: data.architect.detectedFramework,
      date: new Date(data.architect.createdAt).toLocaleDateString('pt-BR'),
      findings,
    }
  }

  // Priorities: grouped, so a problem in seven scenes reads as one line.
  const priorities: Priority[] = []
  if (structure) {
    for (const finding of structure.findings.filter((item) => item.tone === 'critical')) {
      priorities.push({ tone: 'critical', title: `${finding.title} (estrutura)`, detail: finding.scope, scenes: finding.scenes })
    }
  }
  const byType = new Map<string, { severity: DiagnosticSeverity; type: DiagnosticType; scenes: SceneData[] }>()
  for (const section of sections) {
    for (const diagnostic of section.scene.diagnostics) {
      if (diagnostic.signatureHash && section.scene.overrides.some((override) => override.diagnosticSignatureHash === diagnostic.signatureHash)) continue
      if (severityRank[diagnostic.severity] < Math.max(severityRank[options.minSeverity], 2)) continue
      const key = `${diagnostic.severity}:${diagnostic.type}`
      const entry = byType.get(key) ?? { severity: diagnostic.severity, type: diagnostic.type, scenes: [] }
      if (!entry.scenes.includes(section.scene)) entry.scenes.push(section.scene)
      byType.set(key, entry)
    }
  }
  ;[...byType.values()]
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.scenes.length - a.scenes.length)
    .forEach((entry) => {
      priorities.push({
        tone: toneOfSeverity(entry.severity),
        title: `${diagnosticTypeLabels[entry.type] ?? entry.type} · ${severityNames[entry.severity]}`,
        detail: `${entry.scenes.length === 1 ? 'Em 1 cena' : `Em ${entry.scenes.length} cenas`}: ${listNumbers(entry.scenes)}.`,
        scenes: entry.scenes,
      })
    })
  const scenesWith = (test: (item: ReportItem) => boolean) =>
    sections.filter((section) => section.items.some(test)).map((section) => section.scene)
  const fixScenes = scenesWith((item) => item.key.startsWith('n') && item.tag === 'Corrigir')
  if (fixScenes.length) {
    const count = sections.reduce((sum, section) => sum + section.items.filter((item) => item.key.startsWith('n') && item.tag === 'Corrigir').length, 0)
    priorities.push({ tone: 'warning', title: `${count} ${count === 1 ? 'correção pedida' : 'correções pedidas'} em notas`, detail: `Cenas ${listNumbers(fixScenes)}.`, scenes: fixScenes })
  }
  const alertScenes = scenesWith((item) => item.key.startsWith('a'))
  if (alertScenes.length) {
    priorities.push({ tone: 'warning', title: 'Continuidade a reler', detail: `Cenas que dependem de fatos alterados: ${listNumbers(alertScenes)}.`, scenes: alertScenes })
  }
  const questionScenes = scenesWith((item) => item.key.startsWith('n') && item.tag === 'Pergunta')
  if (questionScenes.length) {
    priorities.push({ tone: 'note', title: 'Perguntas em aberto', detail: `Cenas ${listNumbers(questionScenes)}.`, scenes: questionScenes })
  }
  if (structure) {
    for (const finding of structure.findings.filter((item) => item.tone === 'warning')) {
      priorities.push({ tone: 'warning', title: `${finding.title} (estrutura)`, detail: finding.scope, scenes: finding.scenes })
    }
  }

  // Rhythm: lengths and tension of the scenes in scope.
  let rhythm: ReportModel['rhythm'] = null
  if (options.includeRhythm && options.preset === 'AUTHOR' && scenes.length > 1) {
    rhythm = {
      words: scenes.map((scene) => wordCount(scene.text)),
      tension: scenes.map((scene) => tensionBySlot.get(scene.slot.id)?.tension ?? null),
      labels: scenes.map((scene) => (scene.number === null ? '' : String(scene.number))),
    }
  }

  const analysedKnown = scenes.some((scene) => scene.slot.status?.lastAnalyzedAt !== undefined)
  const analysed = analysedKnown ? scenes.filter((scene) => scene.slot.status?.lastAnalyzedAt).length : null
  if (analysed !== null && analysed < scenes.length) {
    warnings.push(
      `${scenes.length - analysed} de ${scenes.length} cenas ainda não foram analisadas: o relatório não traz diagnósticos delas.`,
    )
  }
  if (options.preset === 'MANUSCRIPT' && scenes.reduce((sum, scene) => sum + (scene.text?.length ?? 0), 0) > 400_000) {
    warnings.push('O manuscrito anotado desta seleção é longo; considere escolher um grupo ou um intervalo de cenas.')
  }
  if (options.includeArchitect && options.preset === 'AUTHOR' && !data.architect) {
    warnings.push('Não há revisão arquitetural: a seção estrutural ficará de fora.')
  }

  const group = options.scope.kind === 'GROUP' ? groupById.get(options.scope.groupId) : null
  const scopeLabel =
    options.scope.kind === 'ALL'
      ? 'Obra completa'
      : options.scope.kind === 'GROUP'
        ? `Grupo “${group?.name ?? '—'}”`
        : `Cenas ${options.scope.from} a ${options.scope.to}`

  const allItems = visibleSections.flatMap((section) => section.items)
  return {
    options,
    projectTitle: data.projectTitle,
    scopeLabel,
    scenes,
    sections: visibleSections,
    generalNotes,
    priorities: priorities.slice(0, 10),
    structure,
    rhythm,
    styleTotals: [...styleTotals.values()].sort((a, b) => b.count - a.count),
    stats: {
      scenes: scenes.length,
      words: scenes.reduce((sum, scene) => sum + wordCount(scene.text), 0),
      analysed,
      withItems: sections.filter((section) => section.items.length).length,
      items: allItems.length,
      critical: allItems.filter((item) => item.tone === 'critical').length,
      openNotes:
        options.notes === 'NONE'
          ? 0
          : data.notes.filter((note) => note.status === 'OPEN' && (note.slotId === null || scenes.some((scene) => scene.slot.id === note.slotId))).length,
      exceptions: exceptionCount,
    },
    warnings,
  }
}
