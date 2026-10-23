import type { GoogleCommentItem, GoogleDocLink, Slot } from '../../api/contracts'
import { citedNumbers, diagnosticTypes as macroTypes, sceneResolver, severityLabels as macroSeverity } from '../architect/architect'
import type { Note } from '../notes/notes'
import { collectReportData } from '../report/collectReport'
import { diagnosticTypeLabels, noteKindNames, severityNames } from '../report/reportModel'
import { checkScene, foldAccents, type StyleSheet } from '../style/styleSheet'

export type CommentSource = 'diagnostics' | 'style' | 'architect' | 'notes'

// Every comment starts with this, so they stand out among the author's own.
const marker = 'Petricor'

// The project's findings and notes as comments for the linked doc. Built here
// because notes and scene text only exist decrypted in this browser. Only
// scenes that came from the doc can be pointed at; the rest have no place in it.
export async function buildCommentItems({
  projectId,
  projectKey,
  slots,
  link,
  notes,
  styleSheet,
  sources,
  onProgress,
}: {
  projectId: string
  projectKey: CryptoKey
  slots: Slot[]
  link: GoogleDocLink
  notes: Note[]
  styleSheet: StyleSheet | null
  sources: Set<CommentSource>
  onProgress?: (done: number, total: number) => void
}): Promise<GoogleCommentItem[]> {
  const headingOf = new Map(link.sections.map((section) => [section.slotId, section.headingKey]))
  const linkedSlots = slots.filter((slot) => headingOf.has(slot.id))
  const data = await collectReportData(
    projectId,
    projectKey,
    linkedSlots,
    sources.has('style'),
    onProgress ?? (() => undefined),
  )
  const items: GoogleCommentItem[] = []

  for (const scene of data.scenes) {
    const headingKey = headingOf.get(scene.slot.id) ?? null

    if (sources.has('diagnostics')) {
      const exceptions = new Set(scene.overrides.map((override) => override.diagnosticSignatureHash))
      for (const diagnostic of scene.diagnostics) {
        if (!diagnostic.signatureHash || exceptions.has(diagnostic.signatureHash)) continue
        items.push({
          key: `diagnostic:${diagnostic.signatureHash}`,
          headingKey,
          quote: diagnostic.sourceQuote || null,
          content: [
            `${marker} · Revisor — ${severityNames[diagnostic.severity]} · ${diagnosticTypeLabels[diagnostic.type] ?? diagnostic.type}`,
            diagnostic.message,
            diagnostic.correctionHint ? `Orientação: ${diagnostic.correctionHint}` : null,
          ]
            .filter(Boolean)
            .join('\n\n'),
        })
      }
    }

    if (sources.has('style') && styleSheet && scene.text) {
      // Keyed by rule and word, not position: edits elsewhere don't churn them.
      const occurrences = new Map<string, number>()
      for (const finding of checkScene(scene.text, styleSheet, { slotId: scene.slot.id, names: data.names })) {
        if (finding.isException) continue
        const base = `style:${scene.slot.id}:${finding.ruleId}:${foldAccents(finding.match).toLowerCase()}`
        const count = (occurrences.get(base) ?? 0) + 1
        occurrences.set(base, count)
        items.push({
          key: `${base}:${count}`,
          headingKey,
          quote: finding.context || finding.match,
          content: [`${marker} · Folha de estilo — ${finding.label}`, finding.message, finding.note || null]
            .filter(Boolean)
            .join('\n\n'),
        })
      }
    }
  }

  if (sources.has('notes')) {
    for (const note of notes) {
      if (note.status !== 'OPEN' || note.isUnreadable || !note.body.trim()) continue
      // A scene note outside the doc has nowhere to go.
      if (note.slotId && !headingOf.has(note.slotId)) continue
      items.push({
        key: `note:${note.id}`,
        headingKey: note.slotId ? headingOf.get(note.slotId) ?? null : null,
        quote: note.excerpt?.quote ?? null,
        content: [`${marker} · ${noteKindNames[note.kind]}${note.author ? ` — ${note.author}` : ''}`, note.body].join('\n\n'),
      })
    }
  }

  if (sources.has('architect') && data.architect) {
    const report = data.architect
    const resolveScene = sceneResolver(report, slots)
    report.diagnostics.forEach((diagnostic, index) => {
      // On the first scene it cites; the whole doc when it cites none in it.
      const cited = citedNumbers(diagnostic)
        .map((number) => resolveScene(number))
        .find((slot) => slot && headingOf.has(slot.id))
      items.push({
        key: `architect:${report.id}:${index}`,
        headingKey: cited ? headingOf.get(cited.id) ?? null : null,
        quote: literalQuote(diagnostic.examples[0]),
        content: [
          `${marker} · Arquiteto — ${macroSeverity[diagnostic.severity]} · ${macroTypes[diagnostic.type]?.label ?? diagnostic.type}`,
          diagnostic.affectedScope ? `Afeta: ${diagnostic.affectedScope}` : null,
          diagnostic.clinicalSymptoms.map((symptom) => `• ${symptom}`).join('\n'),
        ]
          .filter(Boolean)
          .join('\n\n'),
      })
    })
  }

  return items
}

// Examples are often quotes ("“Ele saiu.”"); a reference like "Cena 4" is not.
function literalQuote(example: string | undefined): string | null {
  if (!example) return null
  const quoted = example.match(/[“"«](.+?)[”"»]/)
  return quoted ? quoted[1] : null
}
