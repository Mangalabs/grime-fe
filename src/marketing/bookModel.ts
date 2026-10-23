/**
 * What the landing page sells: the book itself, its author and where to get
 * it. Written by the author for the public, so it has no spoiler levels —
 * the blurb is the one place where the author decides what to tell.
 */

export const linkKinds = ['BUY', 'PREORDER', 'SAMPLE', 'NEWSLETTER', 'SOCIAL', 'OTHER'] as const
export type LinkKind = (typeof linkKinds)[number]
export const linkKindLabels: Record<LinkKind, string> = {
  BUY: 'Comprar',
  PREORDER: 'Pré-venda',
  SAMPLE: 'Ler amostra',
  NEWSLETTER: 'Newsletter',
  SOCIAL: 'Rede social',
  OTHER: 'Outro',
}

export const bookStatuses = ['UPCOMING', 'PREORDER', 'AVAILABLE'] as const
export type BookStatus = (typeof bookStatuses)[number]
export const bookStatusLabels: Record<BookStatus, string> = {
  UPCOMING: 'Em breve',
  PREORDER: 'Em pré-venda',
  AVAILABLE: 'À venda',
}

export interface BookLink {
  id: string
  kind: LinkKind
  label: string
  url: string
}

export interface BookImage {
  assetId: string
  mimeType: string
  width: number
  height: number
}

export interface BookInfo {
  // Empty: the project's title.
  title: string
  subtitle: string
  series: string
  seriesNumber: string
  authorName: string
  authorBio: string
  authorPhoto: BookImage | null
  cover: BookImage | null
  // Read aloud by screen readers and shown when the cover can't load.
  coverAlt: string
  tagline: string
  // A sentence or two for cards and previews.
  shortBlurb: string
  // The back cover.
  blurb: string
  genre: string
  // Who the book is for: adult, young adult, an age range…
  audience: string
  language: string
  // YYYY-MM-DD, or empty while there's no date.
  releaseDate: string
  status: BookStatus | null
  links: BookLink[]
  // The one call to action the page leads to.
  primaryLinkId: string | null
}

export const emptyBook = (): BookInfo => ({
  title: '',
  subtitle: '',
  series: '',
  seriesNumber: '',
  authorName: '',
  authorBio: '',
  authorPhoto: null,
  cover: null,
  coverAlt: '',
  tagline: '',
  shortBlurb: '',
  blurb: '',
  genre: '',
  audience: '',
  language: 'pt-BR',
  releaseDate: '',
  status: null,
  links: [],
  primaryLinkId: null,
})

/** Only web addresses: a link on a public site is never javascript: or data:. */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

function image(value: unknown): BookImage | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.assetId !== 'string') return null
  return {
    assetId: raw.assetId,
    mimeType: text(raw.mimeType) || 'image/webp',
    width: Number(raw.width) || 0,
    height: Number(raw.height) || 0,
  }
}

export function normalizeBook(value: unknown): BookInfo {
  const base = emptyBook()
  if (!value || typeof value !== 'object') return base
  const raw = value as Record<string, unknown>
  const links = (Array.isArray(raw.links) ? raw.links : [])
    .filter((link): link is Record<string, unknown> => !!link && typeof link === 'object')
    .map((link) => ({
      id: text(link.id) || crypto.randomUUID(),
      kind: linkKinds.includes(link.kind as LinkKind) ? (link.kind as LinkKind) : 'OTHER',
      label: text(link.label),
      url: text(link.url),
    }))
  const primaryLinkId = typeof raw.primaryLinkId === 'string' && links.some((link) => link.id === raw.primaryLinkId) ? raw.primaryLinkId : null
  return {
    title: text(raw.title),
    subtitle: text(raw.subtitle),
    series: text(raw.series),
    seriesNumber: text(raw.seriesNumber),
    authorName: text(raw.authorName),
    authorBio: text(raw.authorBio),
    authorPhoto: image(raw.authorPhoto),
    cover: image(raw.cover),
    coverAlt: text(raw.coverAlt),
    tagline: text(raw.tagline),
    shortBlurb: text(raw.shortBlurb),
    blurb: text(raw.blurb),
    genre: text(raw.genre),
    audience: text(raw.audience),
    language: text(raw.language) || base.language,
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(text(raw.releaseDate)) ? text(raw.releaseDate) : '',
    status: bookStatuses.includes(raw.status as BookStatus) ? (raw.status as BookStatus) : null,
    links,
    primaryLinkId,
  }
}
