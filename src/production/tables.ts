// ─────────────────────────────────────────────────────────────────────────────
//  Reference tables for turning a project into a printed book. Plain data:
//  change a value here and every estimate follows. Rows marked `sugestao`
//  were added to fill gaps in the house's own tables and should be confirmed.
// ─────────────────────────────────────────────────────────────────────────────

export type FormatId = 'bolso-11' | 'bolso-12' | 'novela' | 'padrao' | 'epica'

export interface BookFormat {
  id: FormatId
  name: string
  widthMm: number
  heightMm: number
  // The page range where the format works well.
  minPages: number
  maxPages: number
  use: string
  ergonomics: string
  // Genres (lowercase fragments) the format suits; used to rank recommendations.
  genres: string[]
}

export const formats: BookFormat[] = [
  {
    id: 'bolso-11',
    name: 'Edição de bolso',
    widthMm: 110,
    heightMm: 180,
    minPages: 80,
    maxPages: 300,
    use: 'Reimpressões, consumo rápido.',
    ergonomics: 'Difícil manter aberto na mesa. Até 300 páginas.',
    genres: [],
  },
  {
    id: 'bolso-12',
    name: 'Edição de bolso (12 cm)',
    widthMm: 120,
    heightMm: 180,
    minPages: 80,
    maxPages: 300,
    use: 'Reimpressões, consumo rápido.',
    ergonomics: 'Difícil manter aberto na mesa. Até 300 páginas.',
    genres: [],
  },
  {
    id: 'novela',
    name: 'Novela elegante',
    widthMm: 135,
    heightMm: 210,
    minPages: 60,
    maxPages: 250,
    use: 'Ficção de cura, poesia, diários de campo.',
    ergonomics: 'Altamente portátil e intimista. Até 250 páginas.',
    genres: ['poesia', 'diário', 'cura', 'novela', 'conto', 'crônica'],
  },
  {
    id: 'padrao',
    name: 'Literatura padrão',
    widthMm: 140,
    heightMm: 210,
    minPages: 150,
    maxPages: 400,
    use: 'Romances gerais, slice-of-life.',
    ergonomics: 'Formato universal. Ideal para 150 a 400 páginas.',
    genres: ['romance', 'slice', 'drama', 'contemporâneo', 'suspense', 'mistério', 'jovem adulto'],
  },
  {
    id: 'epica',
    name: 'Literatura épica',
    widthMm: 160,
    heightMm: 230,
    minPages: 350,
    maxPages: 900,
    use: 'Fantasia estruturada, não-ficção, ficção científica.',
    ergonomics: 'Exige leitura apoiada ou com as duas mãos. Suporta de 350 a 800+ páginas.',
    genres: ['fantasia', 'ficção científica', 'não-ficção', 'épic', 'space opera'],
  },
]

// ── Margins (mm), by format and page count ──────────────────────────────────
// The inner margin grows with the page count: a thicker book curves more at
// the spine and swallows more of the page.
export interface MarginRow {
  formats: FormatId[]
  upToPages: number
  inner: number
  outer: number
  top: number
  bottom: number
  sugestao?: boolean
}

export const margins: MarginRow[] = [
  { formats: ['bolso-11', 'bolso-12'], upToPages: 200, inner: 15, outer: 12, top: 12, bottom: 16, sugestao: true },
  { formats: ['bolso-11', 'bolso-12'], upToPages: Infinity, inner: 18, outer: 12, top: 12, bottom: 16, sugestao: true },
  { formats: ['novela'], upToPages: 150, inner: 17, outer: 14, top: 14, bottom: 19, sugestao: true },
  { formats: ['novela'], upToPages: Infinity, inner: 20, outer: 14, top: 14, bottom: 19, sugestao: true },
  { formats: ['padrao'], upToPages: 200, inner: 18, outer: 15, top: 15, bottom: 20 },
  { formats: ['padrao'], upToPages: 400, inner: 22, outer: 15, top: 15, bottom: 20 },
  { formats: ['padrao'], upToPages: Infinity, inner: 24, outer: 15, top: 15, bottom: 20, sugestao: true },
  { formats: ['epica'], upToPages: 300, inner: 20, outer: 18, top: 18, bottom: 23 },
  { formats: ['epica'], upToPages: 600, inner: 25, outer: 18, top: 18, bottom: 23 },
  { formats: ['epica'], upToPages: Infinity, inner: 28, outer: 18, top: 18, bottom: 23, sugestao: true },
]

export function marginsFor(format: FormatId, pages: number): MarginRow {
  return margins.find((row) => row.formats.includes(format) && pages <= row.upToPages) ?? margins[margins.length - 1]
}

// ── Fonts ──────────────────────────────────────────────────────────────────
// The average width of a character (letters and spaces of Portuguese prose)
// as a fraction of the font size. Approximate: calibrate with a real page
// ("caracteres por linha medidos") once the layout exists.
export interface BookFont {
  id: string
  name: string
  avgCharWidthEm: number
}

export const fonts: BookFont[] = [
  { id: 'eb-garamond', name: 'EB Garamond', avgCharWidthEm: 0.44 },
  { id: 'adobe-garamond', name: 'Adobe Garamond Pro', avgCharWidthEm: 0.43 },
  { id: 'minion', name: 'Minion Pro', avgCharWidthEm: 0.45 },
  { id: 'crimson', name: 'Crimson Pro', avgCharWidthEm: 0.44 },
  { id: 'caslon', name: 'Libre Caslon Text', avgCharWidthEm: 0.5 },
  { id: 'baskerville', name: 'Libre Baskerville', avgCharWidthEm: 0.52 },
  { id: 'palatino', name: 'Palatino Linotype', avgCharWidthEm: 0.48 },
  { id: 'literata', name: 'Literata', avgCharWidthEm: 0.48 },
  { id: 'times', name: 'Times New Roman', avgCharWidthEm: 0.45 },
  { id: 'georgia', name: 'Georgia', avgCharWidthEm: 0.5 },
  { id: 'merriweather', name: 'Merriweather', avgCharWidthEm: 0.53 },
]

// ── Paper, for the spine width ─────────────────────────────────────────────
// Thickness of one sheet (two pages), in mm.
export const papers = [
  { id: 'polen-soft-80', name: 'Pólen Soft 80 g', sheetMm: 0.104 },
  { id: 'polen-bold-90', name: 'Pólen Bold 90 g', sheetMm: 0.12 },
  { id: 'offset-75', name: 'Offset 75 g', sheetMm: 0.09 },
  { id: 'offset-90', name: 'Offset 90 g', sheetMm: 0.11 },
] as const
export type PaperId = (typeof papers)[number]['id']

// ── Book production costs (BRL) ─────────────────────────────────────────────
// A lauda is the industry's unit for text work: 2,100 characters with spaces.
export const CHARS_PER_LAUDA = 2100

export type CostUnit = 'fixo' | 'lauda' | 'pagina'

export interface CostItem {
  id: string
  name: string
  group: 'Taxas' | 'Produção editorial'
  unit: CostUnit
  min: number
  max: number
  // Off by default (optional services).
  optional?: boolean
  note?: string
  sugestao?: boolean
}

export const costItems: CostItem[] = [
  { id: 'isbn', name: 'ISBN', group: 'Taxas', unit: 'fixo', min: 25, max: 25, note: 'CBL' },
  { id: 'ficha', name: 'Ficha catalográfica', group: 'Taxas', unit: 'fixo', min: 60, max: 90 },
  { id: 'registro', name: 'Registro de direitos autorais (Biblioteca Nacional)', group: 'Taxas', unit: 'fixo', min: 80, max: 80, optional: true },
  { id: 'leitura-critica', name: 'Leitura crítica', group: 'Produção editorial', unit: 'lauda', min: 8, max: 20 },
  { id: 'copydesk', name: 'Copidesque', group: 'Produção editorial', unit: 'lauda', min: 8, max: 20 },
  { id: 'revisao', name: 'Revisão de provas', group: 'Produção editorial', unit: 'lauda', min: 4, max: 10, optional: true, sugestao: true },
  { id: 'capa', name: 'Projeto gráfico de capa', group: 'Produção editorial', unit: 'fixo', min: 800, max: 3500 },
  { id: 'diagramacao', name: 'Diagramação', group: 'Produção editorial', unit: 'pagina', min: 5, max: 12 },
]

export const unitLabels: Record<CostUnit, string> = { fixo: 'valor fixo', lauda: 'por lauda', pagina: 'por página' }
