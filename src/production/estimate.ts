import { joinSoftWraps } from '../features/scenes/softWraps'
import { fonts, formats, marginsFor, papers, type BookFormat, type FormatId, type MarginRow, type PaperId } from './tables'

/**
 * How many pages the book will have, typeset rather than guessed: each
 * paragraph is laid out in lines of the text block (format minus margins, in
 * the chosen font and size), chapters open on a new page with a sunk title,
 * and the front and back matter are added before rounding to whole
 * signatures. Dialogue-heavy books come out longer, as they do in print.
 */

const PT_TO_MM = 25.4 / 72
// A first-line indent of about one em is roughly two characters.
const INDENT_CHARS = 2
// A scene break inside a chapter ("* * *") takes a blank line before and after.
const SCENE_BREAK_LINES = 2

export interface TextStats {
  charsWithSpaces: number
  paragraphs: number
  dialogueShare: number
  scenes: Array<{ groupId: string | null; paragraphs: number[] }>
  groups: number
}

const isDialogue = (paragraph: string) => /^[\s]*[—–\-"“«]/.test(paragraph)

/** Character counts per paragraph, scene by scene (scenes in reading order). */
export function textStats(scenes: Array<{ text: string; groupId: string | null }>): TextStats {
  let chars = 0
  let dialogue = 0
  let paragraphs = 0
  const counted = scenes
    .map((scene) => ({
      groupId: scene.groupId,
      // Mid-sentence line breaks are not paragraphs in print.
      paragraphs: joinSoftWraps(scene.text)
        .split(/\n+/)
        .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((paragraph) => {
          chars += paragraph.length
          paragraphs += 1
          if (isDialogue(paragraph)) dialogue += paragraph.length
          return paragraph.length
        }),
    }))
    .filter((scene) => scene.paragraphs.length > 0)
  return {
    charsWithSpaces: chars,
    paragraphs,
    dialogueShare: chars ? dialogue / chars : 0,
    scenes: counted,
    groups: new Set(counted.map((scene) => scene.groupId).filter(Boolean)).size,
  }
}

export type ChapterMode = 'cena' | 'grupo' | 'continuo'
export type ChapterStart = 'nova-pagina' | 'impar'

export interface Typography {
  fontId: string
  sizePt: number
  leadingPt: number
  // Measured on a real page in the layout program; overrides the font estimate.
  measuredCharsPerLine: number | null
}

export interface LayoutOptions {
  typography: Typography
  chapterMode: ChapterMode
  chapterStart: ChapterStart
  frontPages: number
  backPages: number
  roundTo: number
  paperId: PaperId
}

export interface PageEstimate {
  format: BookFormat
  margins: MarginRow
  textBlock: { widthMm: number; heightMm: number }
  charsPerLine: number
  linesPerPage: number
  // A page filled edge to edge.
  fullPageChars: number
  // What a page of this book holds on average, paragraph ends and dialogue included.
  charsPerPage: number
  chapters: number
  bodyPages: number
  total: number
  // Pages left blank to start chapters on the right or to complete the last signature.
  blankPages: number
  spineMm: number
  fit: 'abaixo' | 'dentro' | 'acima'
}

function chaptersOf(stats: TextStats, mode: ChapterMode): number[][][] {
  // Each chapter is a list of scenes; each scene a list of paragraph lengths.
  if (mode === 'continuo') return stats.scenes.length ? [stats.scenes.map((scene) => scene.paragraphs)] : []
  if (mode === 'cena') return stats.scenes.map((scene) => [scene.paragraphs])
  const chapters: number[][][] = []
  let current: string | null | undefined
  for (const scene of stats.scenes) {
    if (!chapters.length || scene.groupId !== current) chapters.push([])
    chapters[chapters.length - 1].push(scene.paragraphs)
    current = scene.groupId
  }
  return chapters
}

function layout(stats: TextStats, format: BookFormat, margin: MarginRow, options: LayoutOptions) {
  const { typography } = options
  const font = fonts.find((item) => item.id === typography.fontId) ?? fonts[0]
  const widthMm = format.widthMm - margin.inner - margin.outer
  const heightMm = format.heightMm - margin.top - margin.bottom
  const charsPerLine = Math.max(
    10,
    typography.measuredCharsPerLine ?? Math.floor(widthMm / (font.avgCharWidthEm * typography.sizePt * PT_TO_MM)),
  )
  const linesPerPage = Math.max(5, Math.floor(heightMm / (typography.leadingPt * PT_TO_MM)))
  // A chapter opening leaves about a third of its first page for the title.
  const sink = Math.ceil(linesPerPage / 3)

  const chapters = chaptersOf(stats, options.chapterMode)
  let bodyPages = 0
  let rectoBlanks = 0
  for (const chapter of chapters) {
    // Body pages start on a right-hand page; an odd count so far means the
    // next page would be a left one.
    if (options.chapterStart === 'impar' && bodyPages % 2 === 1) {
      bodyPages += 1
      rectoBlanks += 1
    }
    let lines = sink + SCENE_BREAK_LINES * (chapter.length - 1)
    for (const scene of chapter) for (const length of scene) lines += Math.ceil((length + INDENT_CHARS) / charsPerLine)
    bodyPages += Math.ceil(lines / linesPerPage)
  }

  const raw = options.frontPages + bodyPages + options.backPages
  const total = Math.ceil(raw / options.roundTo) * options.roundTo
  const paper = papers.find((item) => item.id === options.paperId) ?? papers[0]
  return {
    format,
    margins: margin,
    textBlock: { widthMm, heightMm },
    charsPerLine,
    linesPerPage,
    fullPageChars: charsPerLine * linesPerPage,
    charsPerPage: bodyPages ? Math.round(stats.charsWithSpaces / bodyPages) : 0,
    chapters: chapters.length,
    bodyPages,
    total,
    blankPages: total - raw + rectoBlanks,
    // Half a millimetre more for the glue and the cover's fold.
    spineMm: Math.round(((total / 2) * paper.sheetMm + 0.5) * 2) / 2,
    fit: total < format.minPages ? 'abaixo' : total > format.maxPages ? 'acima' : 'dentro',
  } satisfies PageEstimate
}

/** The estimate for one format. Margins depend on the page count, so it settles in a few passes. */
export function estimate(stats: TextStats, formatId: FormatId, options: LayoutOptions): PageEstimate {
  const format = formats.find((item) => item.id === formatId) ?? formats[0]
  let guess = Math.round((format.minPages + Math.min(format.maxPages, 600)) / 2)
  let result = layout(stats, format, marginsFor(format.id, guess), options)
  for (let pass = 0; pass < 3; pass += 1) {
    if (marginsFor(format.id, result.total) === result.margins) break
    guess = result.total
    result = layout(stats, format, marginsFor(format.id, guess), options)
  }
  return result
}

/**
 * Every format, best first: those whose page range holds the book, then
 * those whose genres match, then the one where the book sits most
 * comfortably inside the range.
 */
export function rankFormats(stats: TextStats, options: LayoutOptions, genre: string) {
  const lower = genre.toLowerCase()
  return formats
    .map((format) => {
      const result = estimate(stats, format.id, options)
      const matchesGenre = format.genres.some((fragment) => lower.includes(fragment))
      const span = Math.max(1, format.maxPages - format.minPages)
      const center = (format.minPages + format.maxPages) / 2
      const outside = result.fit === 'dentro' ? 0 : result.fit === 'abaixo' ? format.minPages - result.total : result.total - format.maxPages
      const score = (outside > 0 ? 100 + outside / span : 0) + (matchesGenre ? 0 : 0.5) + Math.abs(result.total - center) / span / 4
      return { result, matchesGenre, score }
    })
    .sort((a, b) => a.score - b.score)
}

export const defaultTypography: Typography = { fontId: 'eb-garamond', sizePt: 11, leadingPt: 14.5, measuredCharsPerLine: null }

export const defaultLayout: LayoutOptions = {
  typography: defaultTypography,
  chapterMode: 'cena',
  chapterStart: 'nova-pagina',
  frontPages: 8,
  backPages: 4,
  roundTo: 16,
  paperId: 'polen-soft-80',
}
