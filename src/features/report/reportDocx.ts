import type { Paragraph as DocxParagraph, ParagraphChild } from 'docx'
import { checkScene, type StyleSheet } from '../style/styleSheet'
import type { ReportItem, ReportModel, SceneSection } from './reportModel'

/**
 * The annotated manuscript as a Word document: the scene text, one Heading 1
 * per scene, and every observation as a Word comment on its passage. Headings
 * keep the scene titles, so the file can be imported back split by Título 1.
 */

type Comment = {
  // Character range in the scene text; null for a comment on the heading.
  range: { start: number; end: number } | null
  title: string
  lines: string[]
}

export async function renderReportDocx(
  model: ReportModel,
  extras: { styleSheet: StyleSheet | null; names: string[] },
): Promise<{ blob: Blob; comments: number }> {
  // Loaded on demand: the library is only needed when someone exports to Word.
  const docx = await import('docx')
  const { CommentRangeEnd, CommentRangeStart, CommentReference, Document, HeadingLevel, Packer, Paragraph, Tab, TextRun } =
    docx

  const author = model.options.reviewer.trim() || 'Petricor'
  const initials =
    author
      .split(/\s+/)
      .map((word) => word[0])
      .join('')
      .slice(0, 3)
      .toUpperCase() || 'P'
  const date = new Date()
  const comments: Array<{ id: number; author: string; initials: string; date: Date; children: DocxParagraph[] }> = []

  const addComment = (comment: Comment) => {
    const id = comments.length
    comments.push({
      id,
      author,
      initials,
      date,
      children: [
        new Paragraph({ children: [new TextRun({ text: comment.title, bold: true })] }),
        ...comment.lines.filter(Boolean).map((line) => new Paragraph({ children: textRuns(line) })),
      ],
    })
    return id
  }

  // Word shows a tab only as its own element, not inside the text.
  function textRuns(text: string, options: { italics?: boolean } = {}): ParagraphChild[] {
    return [
      new TextRun({
        ...options,
        children: text.split('\t').flatMap((part, index) => (index === 0 ? [part] : [new Tab(), part])),
      }),
    ]
  }

  const reference = (id: number): ParagraphChild[] => [
    new CommentRangeEnd(id),
    new TextRun({ children: [new CommentReference(id)] }),
  ]

  const body: DocxParagraph[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(model.projectTitle)] })]

  for (const section of model.sections) {
    const text = section.scene.text ?? ''
    const sceneComments = commentsOf(section, text, model.options.includeStyle ? extras : null)

    const lines = paragraphsOf(text)
    const placements = sceneComments.map((comment) => ({
      comment,
      at: comment.range ? place(lines, comment.range) : null,
    }))
    // Comments with nowhere to point at sit on the scene's heading.
    const onHeading = placements.filter((placement) => !placement.at).map((placement) => addComment(placement.comment))
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          ...onHeading.map((id) => new CommentRangeStart(id)),
          new TextRun(section.title),
          ...onHeading.flatMap(reference),
        ],
      }),
    )

    if (!text.trim()) {
      body.push(new Paragraph({ children: textRuns('Texto indisponível.', { italics: true }) }))
      continue
    }

    const markers = lines.map(() => [] as Array<{ at: number; kind: 'start' | 'end'; id: number }>)
    for (const { comment, at } of placements) {
      if (!at) continue
      const id = addComment(comment)
      markers[at.from.line].push({ at: at.from.at, kind: 'start', id })
      markers[at.to.line].push({ at: at.to.at, kind: 'end', id })
    }

    lines.forEach((line, index) => {
      // At the same spot, earlier comments close before later ones open.
      const sorted = markers[index].sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'end' ? -1 : 1))
      const children: ParagraphChild[] = []
      let cursor = 0
      for (const marker of sorted) {
        if (marker.at > cursor) children.push(...textRuns(line.text.slice(cursor, marker.at)))
        cursor = Math.max(cursor, marker.at)
        children.push(...(marker.kind === 'start' ? [new CommentRangeStart(marker.id)] : reference(marker.id)))
      }
      if (cursor < line.text.length) children.push(...textRuns(line.text.slice(cursor)))
      body.push(new Paragraph({ children }))
    })
  }

  const document = new Document({
    creator: author,
    title: model.projectTitle,
    description: `Manuscrito comentado · ${model.scopeLabel}`,
    comments: { children: comments },
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: { font: 'Georgia', size: 24 },
          paragraph: { spacing: { after: 160, line: 360 } },
        },
      ],
    },
    sections: [{ children: body }],
  })
  return { blob: await Packer.toBlob(document), comments: comments.length }
}

export function reportDocxFileName(model: ReportModel) {
  const base = `${model.projectTitle} - Manuscrito comentado`
    .replace(/[<>:"/\\|?*]/g, '')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return `${base || 'Petricor'}.docx`
}

function commentsOf(
  section: SceneSection,
  text: string,
  style: { styleSheet: StyleSheet | null; names: string[] } | null,
): Comment[] {
  const comments: Comment[] = section.items.map((item) => itemComment(item))
  for (const exception of section.exceptions) {
    comments.push({ range: null, title: 'Exceção intencional', lines: [exception] })
  }
  if (style?.styleSheet && text) {
    // Every occurrence on its own word: in Word that is where it gets fixed.
    for (const finding of checkScene(text, style.styleSheet, { slotId: section.scene.slot.id, names: style.names })) {
      if (finding.isException) continue
      comments.push({
        range: { start: finding.start, end: finding.end },
        title: `Folha de estilo · ${finding.label}`,
        lines: [finding.message, finding.note],
      })
    }
  }
  return comments
}

function itemComment(item: ReportItem): Comment {
  return {
    range: item.anchor,
    title: `${item.tag} · ${item.title}`,
    lines: [
      item.body,
      item.hint ? `Orientação: ${item.hint}` : '',
      // Without a passage to sit on, the quote says what it is about.
      !item.anchor && item.quote ? `Trecho: “${item.quote}”` : '',
    ],
  }
}

type Line = { text: string; start: number }

// One Word paragraph per line of the scene; blank lines only separate them.
function paragraphsOf(text: string): Line[] {
  const lines: Line[] = []
  let start = 0
  for (const line of text.split('\n')) {
    if (line.trim()) lines.push({ text: line, start })
    start += line.length + 1
  }
  return lines
}

// Where a character range starts and ends among the paragraphs. A range that
// falls entirely between two paragraphs has no text to sit on.
function place(lines: Line[], range: { start: number; end: number }) {
  const fromLine = lines.findIndex((line) => line.start + line.text.length > range.start)
  let toLine = -1
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].start < range.end) {
      toLine = index
      break
    }
  }
  if (fromLine < 0 || toLine < 0 || toLine < fromLine) return null
  const from = { line: fromLine, at: Math.max(0, range.start - lines[fromLine].start) }
  const to = { line: toLine, at: Math.min(lines[toLine].text.length, range.end - lines[toLine].start) }
  if (fromLine === toLine && to.at <= from.at) return null
  return { from, to }
}
