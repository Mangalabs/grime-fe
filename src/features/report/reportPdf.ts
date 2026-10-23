import { jsPDF } from 'jspdf'
import type { ReportItem, ReportModel, SceneSection, Tone } from './reportModel'

/** Draws a report model as an A4 PDF. Returns the document and its page count. */

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 20
const CONTENT_W = PAGE_W - MARGIN * 2
const BOTTOM = PAGE_H - 22

type RGB = [number, number, number]
const ink: RGB = [33, 37, 30]
const muted: RGB = [104, 112, 98]
const faint: RGB = [150, 156, 145]
const accent: RGB = [61, 89, 50]
const rule: RGB = [214, 219, 207]
const tones: Record<Tone, { text: RGB; soft: RGB }> = {
  critical: { text: [158, 50, 41], soft: [251, 229, 225] },
  warning: { text: [125, 84, 20], soft: [252, 240, 213] },
  note: { text: [70, 100, 125], soft: [229, 240, 247] },
  info: { text: [90, 98, 88], soft: [236, 238, 232] },
}

// Standard PDF fonts only cover Windows-1252: other characters are replaced.
const cp1252Extras = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const replacements: Record<string, string> = { '→': '->', '←': '<-', '⇣': '', '✂': '', '✓': 'v', '✕': 'x', '―': '—', '‐': '-', ' ': ' ' }
export function pdfText(text: string): string {
  let result = ''
  for (const character of text.normalize('NFC')) {
    if (character in replacements) result += replacements[character]
    else if (character === '\n' || character === '\t') result += character
    else if ((character.charCodeAt(0) >= 32 && character.charCodeAt(0) <= 255 && character.length === 1) || cp1252Extras.has(character)) result += character
    else if (/\p{L}/u.test(character)) result += character.normalize('NFD').replace(/\p{Diacritic}/gu, '').slice(0, 1) || '?'
  }
  return result
}

const presetTitles = {
  AUTHOR: 'Relatório de revisão',
  CHECKLIST: 'Checklist de revisão',
  MANUSCRIPT: 'Manuscrito anotado',
}

interface PendingLink {
  page: number
  x: number
  y: number
  w: number
  h: number
  target: string
}

class Writer {
  readonly doc = new jsPDF({ format: 'a4', unit: 'mm' })
  y = MARGIN
  private readonly destinations = new Map<string, number>()
  private readonly links: PendingLink[] = []
  readonly toc: Array<{ label: string; target: string; level: number }> = []

  private readonly footer: string

  constructor(footer: string) {
    this.footer = footer
  }

  get page() {
    return this.doc.getNumberOfPages()
  }

  font(style: 'normal' | 'bold' | 'italic' | 'bolditalic', size: number, color: RGB = ink) {
    this.doc.setFont('helvetica', style)
    this.doc.setFontSize(size)
    this.doc.setTextColor(...color)
  }

  newPage() {
    this.doc.addPage()
    this.y = MARGIN
  }

  ensure(height: number) {
    if (this.y + height > BOTTOM) this.newPage()
  }

  mark(target: string) {
    this.destinations.set(target, this.page)
  }

  link(x: number, y: number, w: number, h: number, target: string) {
    this.links.push({ page: this.page, x, y, w, h, target })
  }

  lines(text: string, width: number) {
    return this.doc.splitTextToSize(pdfText(text), width) as string[]
  }

  /** Wrapped text that may continue onto the next page. */
  paragraph(text: string, options: { size?: number; style?: 'normal' | 'bold' | 'italic'; color?: RGB; indent?: number; gap?: number } = {}) {
    const size = options.size ?? 10
    const indent = options.indent ?? 0
    const lineHeight = size * 0.45
    this.font(options.style ?? 'normal', size, options.color ?? ink)
    for (const line of this.lines(text, CONTENT_W - indent)) {
      this.ensure(lineHeight)
      this.doc.text(line, MARGIN + indent, this.y + lineHeight * 0.75)
      this.y += lineHeight
    }
    this.y += options.gap ?? 2
  }

  heading(text: string, target?: string, level = 1) {
    this.ensure(level === 1 ? 20 : 14)
    if (target) {
      this.mark(target)
      this.toc.push({ label: text, target, level })
    }
    if (level === 1) {
      this.font('bold', 16, accent)
      this.doc.text(pdfText(text), MARGIN, this.y + 6)
      this.y += 9
      this.doc.setDrawColor(...rule)
      this.doc.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y)
      this.y += 6
    } else {
      this.font('bold', 12, ink)
      this.doc.text(pdfText(text), MARGIN, this.y + 5)
      this.y += 8
    }
  }

  label(text: string, color: RGB = muted) {
    this.ensure(7)
    this.font('bold', 7.5, color)
    this.doc.text(pdfText(text.toUpperCase()), MARGIN, this.y + 3)
    this.y += 5
  }

  /** A small rounded tag; returns its width. */
  tag(text: string, tone: Tone, x: number, y: number) {
    this.font('bold', 7.5, tones[tone].text)
    const label = pdfText(text.toUpperCase())
    const width = this.doc.getTextWidth(label) + 4
    this.doc.setFillColor(...tones[tone].soft)
    this.doc.roundedRect(x, y - 3.4, width, 4.6, 1.2, 1.2, 'F')
    this.doc.text(label, x + 2, y)
    return width
  }

  quote(text: string, indent = 0) {
    const lines = this.lines(`“${text.trim()}”`, CONTENT_W - indent - 5)
    this.font('italic', 9.5, muted)
    for (const line of lines) {
      this.ensure(4.4)
      this.doc.setDrawColor(...rule)
      this.doc.setLineWidth(0.6)
      this.doc.line(MARGIN + indent + 1, this.y, MARGIN + indent + 1, this.y + 4.4)
      this.doc.setLineWidth(0.2)
      this.doc.text(line, MARGIN + indent + 5, this.y + 3.3)
      this.y += 4.4
    }
    this.y += 1.5
  }

  /** "Ver: Cena 3 · Cena 12" with each scene linking to its section. */
  sceneLinks(prefix: string, scenes: Array<{ label: string; target: string }>, indent = 0) {
    if (scenes.length === 0) return
    this.ensure(5)
    this.font('normal', 8.5, muted)
    let x = MARGIN + indent
    this.doc.text(pdfText(prefix), x, this.y + 3.2)
    x += this.doc.getTextWidth(pdfText(prefix)) + 1.5
    for (const [index, scene] of scenes.slice(0, 14).entries()) {
      const label = pdfText(scene.label) + (index < Math.min(scenes.length, 14) - 1 ? ',' : '')
      const width = this.doc.getTextWidth(label)
      if (x + width > MARGIN + CONTENT_W) {
        this.y += 4.2
        this.ensure(5)
        x = MARGIN + indent
      }
      this.font('normal', 8.5, accent)
      this.doc.text(label, x, this.y + 3.2)
      this.link(x, this.y, width, 4, scene.target)
      x += width + 1.5
    }
    if (scenes.length > 14) {
      this.font('normal', 8.5, muted)
      this.doc.text(`e mais ${scenes.length - 14}`, x, this.y + 3.2)
    }
    this.y += 5.5
  }

  /** Fills the reserved contents page and resolves links; adds footers. */
  finish(tocPage: number | null, coverPages: number) {
    if (tocPage !== null) {
      this.doc.setPage(tocPage)
      let y = MARGIN
      this.font('bold', 16, accent)
      this.doc.text('Sumário', MARGIN, y + 6)
      y += 15
      const entries = this.toc.length > 46 ? this.toc.filter((entry) => entry.level === 1) : this.toc
      for (const entry of entries) {
        const page = this.destinations.get(entry.target)
        if (!page || y > BOTTOM) continue
        const indent = entry.level === 1 ? 0 : 6
        this.font(entry.level === 1 ? 'bold' : 'normal', entry.level === 1 ? 10.5 : 9.5, entry.level === 1 ? ink : muted)
        const label = this.doc.splitTextToSize(pdfText(entry.label), CONTENT_W - indent - 16)[0] as string
        this.doc.text(label, MARGIN + indent, y + 4)
        this.doc.text(String(page), MARGIN + CONTENT_W, y + 4, { align: 'right' })
        this.doc.setDrawColor(...rule)
        this.doc.setLineDashPattern([0.4, 1], 0)
        this.doc.line(MARGIN + indent + this.doc.getTextWidth(label) + 2, y + 4, MARGIN + CONTENT_W - 8, y + 4)
        this.doc.setLineDashPattern([], 0)
        this.doc.link(MARGIN, y, CONTENT_W, 5.5, { pageNumber: page })
        y += entry.level === 1 ? 7 : 5.8
      }
    }
    for (const link of this.links) {
      const page = this.destinations.get(link.target)
      if (!page) continue
      this.doc.setPage(link.page)
      this.doc.link(link.x, link.y, link.w, link.h, { pageNumber: page })
    }
    const count = this.page
    for (let page = coverPages + 1; page <= count; page += 1) {
      this.doc.setPage(page)
      this.doc.setDrawColor(...rule)
      this.doc.line(MARGIN, PAGE_H - 15, MARGIN + CONTENT_W, PAGE_H - 15)
      this.font('normal', 7.5, faint)
      this.doc.text(pdfText(this.footer), MARGIN, PAGE_H - 10)
      this.doc.text(`${page} / ${count}`, MARGIN + CONTENT_W, PAGE_H - 10, { align: 'right' })
    }
  }
}

const sceneTarget = (section: SceneSection) => `scene:${section.scene.slot.id}`

function writeCover(w: Writer, model: ReportModel) {
  const { options } = model
  w.y = 70
  w.font('bold', 9, accent)
  w.doc.text(pdfText(presetTitles[options.preset].toUpperCase()), MARGIN, w.y)
  w.y += 12
  w.font('bold', 28, ink)
  for (const line of w.lines(model.projectTitle, CONTENT_W)) {
    w.doc.text(line, MARGIN, w.y)
    w.y += 11
  }
  w.y += 4
  w.font('normal', 11, muted)
  const details = [
    model.scopeLabel,
    `${model.stats.scenes} ${model.stats.scenes === 1 ? 'cena' : 'cenas'} · ${model.stats.words.toLocaleString('pt-BR')} palavras`,
    options.reviewer.trim() ? `Revisão: ${options.reviewer.trim()}` : null,
    new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }),
  ].filter((line): line is string => Boolean(line))
  for (const line of details) {
    w.doc.text(pdfText(line), MARGIN, w.y)
    w.y += 6
  }
  if (options.letter.trim()) {
    w.y += 14
    w.doc.setDrawColor(...rule)
    w.doc.line(MARGIN, w.y, MARGIN + 40, w.y)
    w.y += 8
    for (const paragraph of options.letter.trim().split(/\n\s*\n/)) {
      w.paragraph(paragraph.replace(/\n/g, ' '), { size: 10.5, gap: 3 })
    }
  }
}

function writeStats(w: Writer, model: ReportModel) {
  const boxes = [
    ['Cenas', String(model.stats.scenes), model.stats.analysed !== null ? `${model.stats.analysed} analisadas` : ''],
    ['Com pendências', String(model.stats.withItems), `${model.stats.items} itens`],
    ['Críticos', String(model.stats.critical), 'diagnósticos'],
    ['Notas abertas', String(model.stats.openNotes), model.stats.exceptions ? `${model.stats.exceptions} ${model.stats.exceptions === 1 ? 'exceção' : 'exceções'}` : ''],
  ]
  const width = (CONTENT_W - 9) / 4
  w.ensure(24)
  boxes.forEach(([label, value, detail], index) => {
    const x = MARGIN + index * (width + 3)
    w.doc.setDrawColor(...rule)
    w.doc.roundedRect(x, w.y, width, 21, 2, 2, 'S')
    w.font('bold', 7, muted)
    w.doc.text(pdfText(label.toUpperCase()), x + 3, w.y + 5)
    w.font('bold', 16, label === 'Críticos' && Number(value) > 0 ? tones.critical.text : ink)
    w.doc.text(value, x + 3, w.y + 13)
    w.font('normal', 7.5, faint)
    w.doc.text(pdfText(detail), x + 3, w.y + 18)
  })
  w.y += 27
}

function writeRhythm(w: Writer, rhythm: NonNullable<ReportModel['rhythm']>) {
  const n = rhythm.words.length
  const hasTension = rhythm.tension.some((value) => value !== null)
  w.ensure(hasTension ? 62 : 34)
  w.label('Extensão das cenas')
  const maxWords = Math.max(...rhythm.words, 1)
  const step = CONTENT_W / n
  const barH = 18
  w.doc.setFillColor(...accent)
  rhythm.words.forEach((value, index) => {
    const h = Math.max(value ? 0.6 : 0, (value / maxWords) * barH)
    w.doc.rect(MARGIN + index * step + step * 0.12, w.y + barH - h, Math.max(step * 0.76, 0.3), h, 'F')
  })
  w.y += barH + 2
  w.font('normal', 7, faint)
  w.doc.text(rhythm.labels[0] || '', MARGIN, w.y + 2.5)
  w.doc.text(rhythm.labels[n - 1] || '', MARGIN + CONTENT_W, w.y + 2.5, { align: 'right' })
  w.y += 6
  if (!hasTension) return
  w.label('Tensão (0–10, revisão arquitetural)')
  const chartH = 22
  w.doc.setDrawColor(...rule)
  w.doc.setLineDashPattern([0.6, 1.2], 0)
  for (const level of [3, 7]) {
    const y = w.y + chartH - (level / 10) * chartH
    w.doc.line(MARGIN, y, MARGIN + CONTENT_W, y)
  }
  w.doc.setLineDashPattern([], 0)
  w.doc.setDrawColor(...tones.critical.text)
  w.doc.setLineWidth(0.5)
  let previous: [number, number] | null = null
  rhythm.tension.forEach((value, index) => {
    if (value === null) {
      previous = null
      return
    }
    const point: [number, number] = [MARGIN + (index + 0.5) * step, w.y + chartH - (value / 10) * chartH]
    if (previous) w.doc.line(previous[0], previous[1], point[0], point[1])
    else w.doc.circle(point[0], point[1], 0.35, 'F')
    previous = point
  })
  w.doc.setLineWidth(0.2)
  w.y += chartH + 6
}

function writeItem(w: Writer, item: ReportItem, indent = 0) {
  w.ensure(14)
  const tagWidth = w.tag(item.tag, item.tone, MARGIN + indent, w.y + 3.6)
  w.font('bold', 10, ink)
  const title = w.lines(item.title, CONTENT_W - indent - tagWidth - 3)[0] ?? ''
  w.doc.text(title, MARGIN + indent + tagWidth + 2.5, w.y + 3.6)
  w.y += 6.5
  if (item.body.trim()) w.paragraph(item.body, { indent, size: 10, gap: 1.5 })
  if (item.quote) w.quote(item.quote, indent)
  if (item.hint) w.paragraph(`Orientação: ${item.hint}`, { indent, size: 9, color: muted, gap: 1.5 })
  w.y += 2.5
}

function writeSceneHeader(w: Writer, section: SceneSection, compact = false) {
  w.ensure(compact ? 16 : 24)
  w.mark(sceneTarget(section))
  w.toc.push({ label: `${section.label} · ${section.title}`, target: sceneTarget(section), level: 2 })
  w.doc.setDrawColor(...rule)
  w.doc.line(MARGIN, w.y, MARGIN + CONTENT_W, w.y)
  w.y += 4
  w.font('bold', 7.5, accent)
  w.doc.text(pdfText(section.label.toUpperCase()), MARGIN, w.y + 3)
  w.y += 4.5
  w.font('bold', compact ? 11 : 13, ink)
  for (const line of w.lines(section.title, CONTENT_W)) {
    w.doc.text(line, MARGIN, w.y + 4.5)
    w.y += compact ? 5 : 6
  }
  if (section.meta.length) {
    w.font('normal', 8.5, muted)
    w.doc.text(pdfText(section.meta.join(' · ')), MARGIN, w.y + 3.5)
    w.y += 5
  }
  w.y += 2.5
}

function writeStyleLine(w: Writer, section: SceneSection, indent = 0) {
  if (!section.styleSummary.length) return
  const parts = section.styleSummary.slice(0, 5).map((entry) => `${entry.label} (${entry.count})`)
  w.paragraph(`Folha de estilo: ${parts.join('; ')}${section.styleSummary.length > 5 ? '…' : ''}`, {
    size: 9,
    color: muted,
    indent,
    gap: 2,
  })
}

function writeAuthor(w: Writer, model: ReportModel) {
  writeCover(w, model)
  w.newPage() // contents, filled at the end
  const tocPage = w.page
  w.newPage()

  w.heading('Resumo', 'summary')
  writeStats(w, model)
  for (const warning of model.warnings) w.paragraph(`Atenção: ${warning}`, { size: 9, color: tones.warning.text })
  if (model.rhythm) writeRhythm(w, model.rhythm)
  if (model.styleTotals.length) {
    w.label('Folha de estilo na seleção')
    w.paragraph(
      model.styleTotals
        .slice(0, 6)
        .map((entry) => `${entry.label}: ${entry.count} em ${entry.scenes} ${entry.scenes === 1 ? 'cena' : 'cenas'}`)
        .join(' · '),
      { size: 9, color: muted, gap: 4 },
    )
  }

  if (model.priorities.length) {
    w.heading('Prioridades', 'priorities')
    model.priorities.forEach((priority, index) => {
      w.ensure(16)
      w.font('bold', 11, tones[priority.tone].text)
      w.doc.text(String(index + 1), MARGIN, w.y + 4)
      w.font('bold', 10.5, ink)
      const lines = w.lines(priority.title, CONTENT_W - 8)
      lines.forEach((line, lineIndex) => w.doc.text(line, MARGIN + 7, w.y + 4 + lineIndex * 4.8))
      w.y += 4.8 * lines.length + 1.5
      w.paragraph(priority.detail, { indent: 7, size: 9.5, color: muted, gap: 0.5 })
      const targets = priority.scenes
        .map((scene) => model.sections.find((section) => section.scene === scene))
        .filter((section): section is SceneSection => Boolean(section))
        .map((section) => ({ label: section.label.replace('Cena ', ''), target: sceneTarget(section) }))
      w.sceneLinks('Ir para a cena:', targets, 7)
      w.y += 2
    })
  }

  if (model.structure) {
    w.heading('Revisão estrutural', 'structure')
    w.paragraph(`Estrutura identificada: ${model.structure.framework} · relatório de ${model.structure.date}.`, {
      size: 9.5,
      color: muted,
      gap: 4,
    })
    for (const finding of model.structure.findings) {
      w.ensure(18)
      const tagWidth = w.tag(finding.tag, finding.tone, MARGIN, w.y + 3.6)
      w.font('bold', 10.5, ink)
      w.doc.text(pdfText(finding.title), MARGIN + tagWidth + 2.5, w.y + 3.6)
      w.y += 6.5
      w.paragraph(finding.scope, { size: 9, color: muted, gap: 1 })
      for (const symptom of finding.symptoms) w.paragraph(`• ${symptom}`, { size: 10, indent: 2, gap: 1 })
      for (const example of finding.examples) w.quote(example, 2)
      w.sceneLinks(
        'Cenas citadas:',
        finding.scenes
          .map((scene) => model.sections.find((section) => section.scene === scene))
          .filter((section): section is SceneSection => Boolean(section))
          .map((section) => ({ label: section.label.replace('Cena ', ''), target: sceneTarget(section) })),
      )
      w.y += 3
    }
  }

  if (model.generalNotes.length) {
    w.heading('Notas gerais', 'general-notes')
    for (const item of model.generalNotes) writeItem(w, item)
  }

  w.heading('Por cena', 'scenes')
  if (model.sections.length === 0) {
    w.paragraph('Nenhuma cena da seleção tem pendências com estes critérios.', { color: muted })
  }
  for (const section of model.sections) {
    writeSceneHeader(w, section)
    for (const item of section.items) writeItem(w, item)
    writeStyleLine(w, section)
    if (section.exceptions.length) {
      w.label('Exceções intencionais registradas')
      for (const exception of section.exceptions) w.paragraph(`• ${exception}`, { size: 9, color: muted, gap: 1 })
    }
    w.y += 3
  }
  return { tocPage, coverPages: 1 }
}

function writeChecklist(w: Writer, model: ReportModel) {
  w.font('bold', 18, ink)
  w.doc.text(pdfText(model.projectTitle), MARGIN, w.y + 7)
  w.y += 11
  w.font('normal', 9.5, muted)
  w.doc.text(
    pdfText(
      [
        presetTitles.CHECKLIST,
        model.scopeLabel,
        `${model.stats.items} itens em ${model.sections.length} cenas`,
        model.options.reviewer.trim() || null,
        new Date().toLocaleDateString('pt-BR'),
      ]
        .filter(Boolean)
        .join(' · '),
    ),
    MARGIN,
    w.y + 3,
  )
  w.y += 9
  for (const warning of model.warnings) w.paragraph(`Atenção: ${warning}`, { size: 8.5, color: tones.warning.text })
  if (model.generalNotes.length) {
    w.label('Notas gerais')
    for (const item of model.generalNotes) writeCheckRow(w, item)
    w.y += 2
  }
  for (const section of model.sections) {
    writeSceneHeader(w, section, true)
    for (const item of section.items) writeCheckRow(w, item)
    writeStyleLine(w, section, 7)
  }
  if (model.sections.length === 0) w.paragraph('Nada pendente com estes critérios.', { color: muted })
  return { tocPage: null, coverPages: 0 }
}

function writeCheckRow(w: Writer, item: ReportItem) {
  const body = item.body.length > 220 ? `${item.body.slice(0, 217).trimEnd()}…` : item.body
  const quote = item.quote ? ` — “${item.quote.length > 90 ? `${item.quote.slice(0, 87).trimEnd()}…` : item.quote}”` : ''
  w.font('normal', 9.5, ink)
  const lines = w.lines(`${item.title}: ${body}${quote}`, CONTENT_W - 9 - 24)
  w.ensure(lines.length * 4.3 + 2)
  w.doc.setDrawColor(...muted)
  w.doc.rect(MARGIN, w.y + 0.6, 3.4, 3.4, 'S')
  w.tag(item.tag, item.tone, MARGIN + 6, w.y + 3.5)
  w.font('normal', 9.5, ink)
  lines.forEach((line, index) => w.doc.text(line, MARGIN + 6 + 25, w.y + 3.4 + index * 4.3))
  w.y += lines.length * 4.3 + 2
}

function writeManuscript(w: Writer, model: ReportModel) {
  writeCover(w, model)
  w.newPage()
  const tocPage = w.page
  for (const section of model.sections) {
    w.newPage()
    writeSceneHeader(w, section)
    const text = section.scene.text ?? ''
    if (!text) {
      w.paragraph('Texto indisponível.', { color: muted })
      continue
    }
    // Numbered markers after each anchored passage; unanchored items go last.
    const anchored = section.items
      .filter((item) => item.anchor)
      .sort((a, b) => a.anchor!.end - b.anchor!.end || a.anchor!.start - b.anchor!.start)
    const numbered = [...anchored, ...section.items.filter((item) => !item.anchor)]
    const numberOf = new Map(numbered.map((item, index) => [item.key, index + 1]))
    let annotated = ''
    let cursor = 0
    for (const item of anchored) {
      annotated += text.slice(cursor, item.anchor!.end) + ` [${numberOf.get(item.key)}]`
      cursor = item.anchor!.end
    }
    annotated += text.slice(cursor)
    for (const paragraph of annotated.split(/\n+/)) {
      if (paragraph.trim()) w.paragraph(paragraph.trim(), { size: 10.5, gap: 2.5 })
    }
    if (numbered.length) {
      w.y += 2
      w.label('Observações desta cena')
      numbered.forEach((item) => writeItem(w, { ...item, title: `[${numberOf.get(item.key)}] ${item.title}`, quote: item.anchor ? null : item.quote }))
    }
    writeStyleLine(w, section)
  }
  return { tocPage, coverPages: 1 }
}

export function renderReportPdf(model: ReportModel) {
  const w = new Writer(`${model.projectTitle} · ${presetTitles[model.options.preset]} · ${model.scopeLabel}`)
  w.doc.setProperties({
    title: `${model.projectTitle} — ${presetTitles[model.options.preset]}`,
    subject: model.scopeLabel,
    author: model.options.reviewer.trim() || 'Petricor',
    creator: 'Petricor',
  })
  const layout =
    model.options.preset === 'AUTHOR'
      ? writeAuthor(w, model)
      : model.options.preset === 'CHECKLIST'
        ? writeChecklist(w, model)
        : writeManuscript(w, model)
  w.finish(layout.tocPage, layout.coverPages)
  return { doc: w.doc, pages: w.page }
}

export function reportFileName(model: ReportModel) {
  const base = `${model.projectTitle} - ${presetTitles[model.options.preset]}`
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
  return `${base || 'Petricor'}.pdf`
}
