import type { SpoilerLevel } from './marketingKit'

/**
 * The book's identity kit: how its world looks, sounds and feels, concrete
 * enough for a site builder and an image model to reproduce it. Two books can
 * share nothing here — a castle with dragons, a Toronto apartment — and both
 * are described with the same fields.
 */

export const scales = ['INTIMATE', 'PERSONAL', 'EPIC'] as const
export type Scale = (typeof scales)[number]
export const scaleLabels: Record<Scale, string> = {
  INTIMATE: 'Íntimo: um quarto, uma pessoa, um detalhe',
  PERSONAL: 'Pessoal: uma vida e as pessoas em volta',
  EPIC: 'Épico: reinos, multidões, paisagens',
}

export const temperatures = ['WARM', 'NEUTRAL', 'COLD'] as const
export type Temperature = (typeof temperatures)[number]
export const temperatureLabels: Record<Temperature, string> = { WARM: 'Quente', NEUTRAL: 'Neutra', COLD: 'Fria' }

export const tempos = ['STILL', 'FLOWING', 'URGENT'] as const
export type Tempo = (typeof tempos)[number]
export const tempoLabels: Record<Tempo, string> = { STILL: 'Contemplativo', FLOWING: 'Fluido', URGENT: 'Urgente' }

export const colorRoles = ['BACKGROUND', 'SURFACE', 'INK', 'ACCENT', 'HIGHLIGHT', 'SHADOW'] as const
export type ColorRole = (typeof colorRoles)[number]
export const colorRoleLabels: Record<ColorRole, string> = {
  BACKGROUND: 'Fundo',
  SURFACE: 'Superfície (papel, cartões)',
  INK: 'Tinta (texto)',
  ACCENT: 'Destaque',
  HIGHLIGHT: 'Brilho',
  SHADOW: 'Sombra',
}

export const artifactKinds = [
  'LETTER', 'DIARY', 'MAP', 'CHAT', 'PHOTO', 'FILE', 'BESTIARY', 'RECIPE', 'TICKET', 'NEWSPAPER', 'OBJECT', 'OTHER',
] as const
export type ArtifactKind = (typeof artifactKinds)[number]
export const artifactKindLabels: Record<ArtifactKind, string> = {
  LETTER: 'Carta ou bilhete',
  DIARY: 'Diário ou caderno',
  MAP: 'Mapa ou planta',
  CHAT: 'Conversa no celular',
  PHOTO: 'Fotografia ou polaroid',
  FILE: 'Dossiê ou arquivo',
  BESTIARY: 'Bestiário ou compêndio',
  RECIPE: 'Receita ou lista',
  TICKET: 'Ingresso, recibo ou passagem',
  NEWSPAPER: 'Jornal ou cartaz',
  OBJECT: 'Objeto para explorar',
  OTHER: 'Outro',
}

// What the object does in the site's navigation.
export const artifactRoles = ['HUB', 'INDEX', 'DETAIL', 'COLLECTIBLE'] as const
export type ArtifactRole = (typeof artifactRoles)[number]
export const artifactRoleLabels: Record<ArtifactRole, string> = {
  HUB: 'Ponto de partida (a "home")',
  INDEX: 'Índice (leva a outras partes)',
  DETAIL: 'Detalhe (uma página)',
  COLLECTIBLE: 'Achado (desbloqueável)',
}

export const imageUses = ['PALETTE', 'LIGHT', 'TEXTURE', 'PLACE', 'CHARACTER', 'OBJECT', 'TYPOGRAPHY', 'COMPOSITION'] as const
export type ImageUse = (typeof imageUses)[number]
export const imageUseLabels: Record<ImageUse, string> = {
  PALETTE: 'Cores',
  LIGHT: 'Luz',
  TEXTURE: 'Textura',
  PLACE: 'Lugar',
  CHARACTER: 'Personagem',
  OBJECT: 'Objeto',
  TYPOGRAPHY: 'Letras',
  COMPOSITION: 'Enquadramento',
}

export interface Swatch {
  id: string
  name: string
  hex: string
  role: ColorRole
  note: string
}

export interface Motif {
  id: string
  name: string
  meaning: string
  entityId: string | null
}

/**
 * One piece of an object's content: a diary page, a letter, a message, a
 * note on the map. What a visitor actually reads.
 */
export interface ArtifactEntry {
  id: string
  title: string
  body: string
  // Who writes or speaks it (an entity of the Arquivo).
  speakerId: string | null
  // When, in the story's own time: "terça, 3 de março", "o primeiro inverno".
  when: string
  // Entities it names: each must be in the pack for the entry to be.
  entityIds: string[]
  // The scene it belongs after, if any: past the public cut, it stays out.
  slotId: string | null
  level: SpoilerLevel
}

/** How an entry's fields read for each kind of object. */
export const entryLabels: Record<ArtifactKind, { title: string | null; body: string; speaker: string; when: string; noun: string }> = {
  LETTER: { title: 'Para quem ou assunto', body: 'Texto da carta', speaker: 'Quem escreve', when: 'Data', noun: 'carta' },
  DIARY: { title: 'Data ou título', body: 'Página', speaker: 'Dono do diário', when: 'Quando, na história', noun: 'página' },
  MAP: { title: 'Lugar', body: 'Anotação', speaker: 'Quem anotou', when: 'Quando', noun: 'ponto' },
  CHAT: { title: null, body: 'Mensagem', speaker: 'Quem manda', when: 'Hora', noun: 'mensagem' },
  PHOTO: { title: 'Legenda', body: 'O que a foto mostra', speaker: 'Quem fotografou', when: 'Quando', noun: 'foto' },
  FILE: { title: 'Título do documento', body: 'Conteúdo', speaker: 'Quem assina', when: 'Data', noun: 'documento' },
  BESTIARY: { title: 'Verbete', body: 'Texto', speaker: 'Quem escreveu', when: 'Quando', noun: 'verbete' },
  RECIPE: { title: 'Nome', body: 'Receita ou lista', speaker: 'Quem escreveu', when: 'Quando', noun: 'receita' },
  TICKET: { title: 'O que é', body: 'O que está impresso', speaker: 'De quem', when: 'Data', noun: 'item' },
  NEWSPAPER: { title: 'Manchete', body: 'Texto', speaker: 'Quem assina', when: 'Data', noun: 'notícia' },
  OBJECT: { title: 'Detalhe', body: 'O que se descobre', speaker: 'De quem', when: 'Quando', noun: 'detalhe' },
  OTHER: { title: 'Título', body: 'Texto', speaker: 'De quem', when: 'Quando', noun: 'entrada' },
}

export const newEntry = (level: SpoilerLevel = 'PUBLIC'): ArtifactEntry => ({
  id: newId(),
  title: '',
  body: '',
  speakerId: null,
  when: '',
  entityIds: [],
  slotId: null,
  level,
})

export interface Artifact {
  id: string
  kind: ArtifactKind
  title: string
  entityId: string | null
  // What it looks like: material, wear, handwriting, the phone's wallpaper.
  description: string
  // What opening it gives the reader.
  reveals: string
  role: ArtifactRole
  level: SpoilerLevel
  entries: ArtifactEntry[]
}

export const quoteUses = ['TAGLINE', 'ATMOSPHERE', 'VOICE', 'ARTIFACT'] as const
export type QuoteUse = (typeof quoteUses)[number]
export const quoteUseLabels: Record<QuoteUse, string> = {
  TAGLINE: 'Chamada',
  ATMOSPHERE: 'Atmosfera',
  VOICE: 'Voz',
  ARTIFACT: 'Para um objeto',
}

/** A line of the book itself, approved for the site. */
export interface Quote {
  id: string
  text: string
  // The scene it comes from. The pack drops it while that scene is past the
  // public cut, so moving the cut back can't leak it.
  slotId: string | null
  use: QuoteUse
  note: string
}

export interface MoodImage {
  id: string
  assetId: string
  mimeType: string
  width: number
  height: number
  caption: string
  uses: ImageUse[]
  // Most references aren't ours to publish: only own or licensed images may
  // appear on the site; the rest guide the art direction.
  publishable: boolean
}

export interface IdentityKit {
  presetId: string | null
  essence: {
    setting: string
    era: string
    place: string
    culture: string
    scale: Scale | null
    pointOfView: string
    // What the site promises the visitor, in one line.
    promise: string
  }
  mood: {
    words: string[]
    temperature: Temperature | null
    tempo: Tempo | null
    notes: string
  }
  palette: Swatch[]
  typography: { display: string; body: string; accent: string; notes: string }
  materials: string[]
  light: string
  sound: string
  // Framing: close on hands and objects, wide on landscapes…
  composition: string
  motifs: Motif[]
  artifacts: Artifact[]
  moodboard: MoodImage[]
  quotes: Quote[]
  avoid: string[]
  // The base an image generator starts from; descriptions are added to it.
  stylePrompt: string
  // A line shown in the style tile: the voice of the book.
  sampleLine: string
}

export const newId = () => crypto.randomUUID()

export const emptyIdentity = (): IdentityKit => ({
  presetId: null,
  essence: { setting: '', era: '', place: '', culture: '', scale: null, pointOfView: '', promise: '' },
  mood: { words: [], temperature: null, tempo: null, notes: '' },
  palette: [],
  typography: { display: '', body: '', accent: '', notes: '' },
  materials: [],
  light: '',
  sound: '',
  composition: '',
  motifs: [],
  artifacts: [],
  moodboard: [],
  quotes: [],
  avoid: [],
  stylePrompt: '',
  sampleLine: '',
})

export const newArtifact = (): Artifact => ({
  id: newId(),
  kind: 'LETTER',
  title: '',
  entityId: null,
  description: '',
  reveals: '',
  role: 'DETAIL',
  level: 'PUBLIC',
  entries: [],
})

export const newMotif = (): Motif => ({ id: newId(), name: '', meaning: '', entityId: null })

// --- Normalising the stored document ------------------------------------

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const texts = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return values.includes(value as T) ? (value as T) : null
}
const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
const objects = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : []

export function normalizeIdentity(value: unknown): IdentityKit {
  const base = emptyIdentity()
  if (!value || typeof value !== 'object') return base
  const raw = value as Record<string, unknown>
  const essence = (raw.essence ?? {}) as Record<string, unknown>
  const mood = (raw.mood ?? {}) as Record<string, unknown>
  const typography = (raw.typography ?? {}) as Record<string, unknown>
  return {
    presetId: typeof raw.presetId === 'string' ? raw.presetId : null,
    essence: {
      setting: text(essence.setting),
      era: text(essence.era),
      place: text(essence.place),
      culture: text(essence.culture),
      scale: oneOf(scales, essence.scale),
      pointOfView: text(essence.pointOfView),
      promise: text(essence.promise),
    },
    mood: {
      words: texts(mood.words),
      temperature: oneOf(temperatures, mood.temperature),
      tempo: oneOf(tempos, mood.tempo),
      notes: text(mood.notes),
    },
    palette: objects(raw.palette)
      .filter((swatch) => isHex(swatch.hex))
      .map((swatch) => ({
        id: text(swatch.id) || newId(),
        name: text(swatch.name),
        hex: (swatch.hex as string).toLowerCase(),
        role: oneOf(colorRoles, swatch.role) ?? 'ACCENT',
        note: text(swatch.note),
      })),
    typography: {
      display: text(typography.display),
      body: text(typography.body),
      accent: text(typography.accent),
      notes: text(typography.notes),
    },
    materials: texts(raw.materials),
    light: text(raw.light),
    sound: text(raw.sound),
    composition: text(raw.composition),
    motifs: objects(raw.motifs).map((motif) => ({
      id: text(motif.id) || newId(),
      name: text(motif.name),
      meaning: text(motif.meaning),
      entityId: typeof motif.entityId === 'string' ? motif.entityId : null,
    })),
    artifacts: objects(raw.artifacts).map((artifact) => ({
      ...newArtifact(),
      id: text(artifact.id) || newId(),
      kind: oneOf(artifactKinds, artifact.kind) ?? 'OTHER',
      title: text(artifact.title),
      entityId: typeof artifact.entityId === 'string' ? artifact.entityId : null,
      description: text(artifact.description),
      reveals: text(artifact.reveals),
      role: oneOf(artifactRoles, artifact.role) ?? 'DETAIL',
      level: oneOf(['PUBLIC', 'TEASER', 'SPOILER'] as const, artifact.level) ?? 'PUBLIC',
      entries: objects(artifact.entries)
        .filter((entry) => typeof entry.body === 'string')
        .map((entry) => ({
          id: text(entry.id) || newId(),
          title: text(entry.title),
          body: entry.body as string,
          speakerId: typeof entry.speakerId === 'string' ? entry.speakerId : null,
          when: text(entry.when),
          entityIds: texts(entry.entityIds),
          slotId: typeof entry.slotId === 'string' ? entry.slotId : null,
          level: oneOf(['PUBLIC', 'TEASER', 'SPOILER'] as const, entry.level) ?? 'PUBLIC',
        })),
    })),
    moodboard: objects(raw.moodboard)
      .filter((image) => typeof image.assetId === 'string')
      .map((image) => ({
        id: text(image.id) || newId(),
        assetId: image.assetId as string,
        mimeType: text(image.mimeType) || 'image/webp',
        width: Number(image.width) || 0,
        height: Number(image.height) || 0,
        caption: text(image.caption),
        uses: texts(image.uses).filter((use): use is ImageUse => imageUses.includes(use as ImageUse)),
        publishable: image.publishable === true,
      })),
    quotes: objects(raw.quotes)
      .filter((quote) => typeof quote.text === 'string' && quote.text.trim())
      .map((quote) => ({
        id: text(quote.id) || newId(),
        text: quote.text as string,
        slotId: typeof quote.slotId === 'string' ? quote.slotId : null,
        use: oneOf(quoteUses, quote.use) ?? 'ATMOSPHERE',
        note: text(quote.note),
      })),
    avoid: texts(raw.avoid),
    stylePrompt: text(raw.stylePrompt),
    sampleLine: text(raw.sampleLine),
  }
}

// --- Fonts ----------------------------------------------------------------

/** Google Fonts families, grouped by what they evoke; any other name works too. */
export const fontGroups: Array<{ label: string; fonts: string[] }> = [
  { label: 'Clássicas e medievais', fonts: ['Cinzel', 'Cormorant Garamond', 'EB Garamond', 'IM Fell English', 'Cormorant SC', 'MedievalSharp', 'UnifrakturMaguntia'] },
  { label: 'Editoriais e literárias', fonts: ['Fraunces', 'Playfair Display', 'Libre Baskerville', 'Lora', 'Crimson Pro', 'Spectral', 'Newsreader'] },
  { label: 'Japonesas e minimalistas', fonts: ['Shippori Mincho', 'Zen Kaku Gothic New', 'Zen Old Mincho', 'Noto Serif JP', 'M PLUS 1p', 'Klee One'] },
  { label: 'Contemporâneas', fonts: ['Inter', 'DM Sans', 'Manrope', 'Work Sans', 'Space Grotesk', 'IBM Plex Sans', 'IBM Plex Serif'] },
  { label: 'Manuscritas', fonts: ['Caveat', 'Homemade Apple', 'La Belle Aurore', 'Reenie Beanie', 'Kalam', 'Nanum Pen Script'] },
  { label: 'Noite, cinema e máquina', fonts: ['Bebas Neue', 'Oswald', 'Special Elite', 'Courier Prime', 'Major Mono Display', 'Syne'] },
]

export function googleFontsHref(families: string[]): string | null {
  const unique = [...new Set(families.map((family) => family.trim()).filter(Boolean))]
  if (!unique.length) return null
  const params = unique.map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}`).join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

// --- Colour -----------------------------------------------------------------

function luminance(hex: string): number {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** The first swatch with a role, for the style tile and the site's tokens. */
export function swatchFor(identity: IdentityKit, role: ColorRole): Swatch | undefined {
  return identity.palette.find((swatch) => swatch.role === role)
}

// --- Starting points ------------------------------------------------------

type Preset = { id: string; name: string; description: string; identity: Omit<IdentityKit, 'presetId' | 'moodboard' | 'motifs' | 'quotes' | 'essence'> & { essence: Partial<IdentityKit['essence']> } }

const swatch = (name: string, hex: string, role: ColorRole, note = ''): Swatch => ({ id: newId(), name, hex, role, note })
const artifact = (kind: ArtifactKind, title: string, role: ArtifactRole, description: string, reveals: string): Artifact => ({
  ...newArtifact(),
  kind,
  title,
  role,
  description,
  reveals,
})

/**
 * Starting points to edit, not themes to keep: each fills the kit with a
 * coherent palette, type pair, materials and in-world objects.
 */
export function presets(): Preset[] {
  return [
    {
      id: 'medieval-epic',
      name: 'Fantasia medieval',
      description: 'Castelos, dragões, pergaminho e brasa.',
      identity: {
        essence: { setting: 'Fantasia medieval', era: 'Idade média imaginária', scale: 'EPIC' },
        mood: { words: ['ancestral', 'perigoso', 'solene', 'maravilhoso'], temperature: 'WARM', tempo: 'FLOWING', notes: '' },
        palette: [
          swatch('Pedra de castelo', '#1f1c1a', 'BACKGROUND'),
          swatch('Pergaminho', '#ead9b5', 'SURFACE'),
          swatch('Tinta ferrugem', '#2b1d14', 'INK'),
          swatch('Brasa', '#b8431f', 'ACCENT'),
          swatch('Folha de ouro', '#c9a24a', 'HIGHLIGHT'),
          swatch('Musgo', '#3d4a32', 'SHADOW'),
        ],
        typography: { display: 'Cinzel', body: 'Cormorant Garamond', accent: 'IM Fell English', notes: 'Capitulares e iniciais iluminadas.' },
        materials: ['pergaminho', 'lacre de cera', 'ferro forjado', 'pedra úmida', 'couro gasto', 'escamas'],
        light: 'Tochas e velas; vitrais que tingem a pedra; brasa de dragão ao longe.',
        sound: 'Vento nas ameias, fogo crepitando, sinos distantes.',
        composition: 'Planos abertos para paisagens; detalhes de mãos, selos e armas para os momentos íntimos.',
        artifacts: [
          artifact('MAP', 'Mapa do reino', 'HUB', 'Desenhado à mão, com bordas queimadas e anotações na margem.', 'Os lugares da história, um a um.'),
          artifact('LETTER', 'Carta lacrada', 'COLLECTIBLE', 'Lacre de cera com um brasão.', 'Uma voz de dentro da história.'),
          artifact('BESTIARY', 'Bestiário', 'INDEX', 'Páginas ilustradas com notas de um estudioso.', 'Criaturas e as regras do mundo.'),
        ],
        avoid: ['clipart de dragão genérico', 'fontes "medievais" de parque temático', 'dourado brilhante de plástico'],
        stylePrompt: 'Ilustração pintada, luz de vela, textura de pergaminho, paleta terrosa com brasa e ouro velho, atmosfera solene.',
        sampleLine: '',
      },
    },
    {
      id: 'contemporary-intimate',
      name: 'Íntimo contemporâneo',
      description: 'Um apartamento, uma vida, os objetos de todo dia.',
      identity: {
        essence: { setting: 'Contemporâneo', era: 'Hoje', scale: 'INTIMATE', pointOfView: 'Primeira pessoa, próxima' },
        mood: { words: ['delicado', 'cotidiano', 'nostálgico', 'quieto'], temperature: 'WARM', tempo: 'STILL', notes: '' },
        palette: [
          swatch('Parede off-white', '#f4efe6', 'BACKGROUND'),
          swatch('Washi', '#fbf8f2', 'SURFACE'),
          swatch('Nanquim', '#2a2a2e', 'INK'),
          swatch('Matcha', '#7d8f5a', 'ACCENT'),
          swatch('Sakura apagada', '#d9a7a0', 'HIGHLIGHT'),
          swatch('Tatame', '#c8b48a', 'SHADOW'),
        ],
        typography: { display: 'Shippori Mincho', body: 'Zen Kaku Gothic New', accent: 'Caveat', notes: 'A manuscrita é a da personagem: bilhetes, listas.' },
        materials: ['papel washi', 'cerâmica', 'linho', 'madeira clara', 'vidro com condensação', 'fita adesiva'],
        light: 'Sol de fim de tarde atravessando a persiana; a luz fria da geladeira à noite.',
        sound: 'Chaleira, chuva na janela, trem ao longe, notificação do celular.',
        composition: 'Close em objetos e mãos; a casa vista em cantos, nunca inteira.',
        artifacts: [
          artifact('DIARY', 'Caderno dela', 'HUB', 'Capa de tecido, páginas com fita e colagens.', 'O que ela pensa e não diz.'),
          artifact('CHAT', 'Conversas no celular', 'INDEX', 'Tela do celular com o papel de parede dela.', 'As relações, mensagem a mensagem.'),
          artifact('PHOTO', 'Polaroids na geladeira', 'COLLECTIBLE', 'Presas com ímãs, algumas com legenda a caneta.', 'Momentos e pessoas.'),
          artifact('RECIPE', 'Receita da avó', 'DETAIL', 'Cartão manchado, letra antiga.', 'A herança da família.'),
        ],
        avoid: ['estereótipos de cultura pop', 'neon e cyberpunk', 'interfaces de app genéricas'],
        stylePrompt: 'Fotografia analógica, luz natural suave, tons quentes e lavados, objetos do cotidiano em close, intimidade e silêncio.',
        sampleLine: '',
      },
    },
    {
      id: 'gothic',
      name: 'Gótico e sobrenatural',
      description: 'Casarões, segredos de família, o que não se vê.',
      identity: {
        essence: { setting: 'Gótico', scale: 'PERSONAL' },
        mood: { words: ['inquietante', 'melancólico', 'sensual', 'secreto'], temperature: 'COLD', tempo: 'STILL', notes: '' },
        palette: [
          swatch('Noite de veludo', '#141218', 'BACKGROUND'),
          swatch('Papel envelhecido', '#d8d0c0', 'SURFACE'),
          swatch('Tinta ferrogálica', '#1c1a1f', 'INK'),
          swatch('Vinho', '#6e1f2b', 'ACCENT'),
          swatch('Vela', '#e3c27a', 'HIGHLIGHT'),
          swatch('Musgo de túmulo', '#3a4238', 'SHADOW'),
        ],
        typography: { display: 'Cormorant SC', body: 'EB Garamond', accent: 'La Belle Aurore', notes: '' },
        materials: ['veludo', 'prata oxidada', 'papel de parede descascando', 'flores secas', 'espelho manchado'],
        light: 'Uma vela num corredor escuro; luar azulado através de cortinas.',
        sound: 'Assoalho rangendo, relógio de pêndulo, respiração.',
        composition: 'Molduras dentro de molduras; portas entreabertas; rostos meio na sombra.',
        artifacts: [
          artifact('LETTER', 'Cartas da família', 'INDEX', 'Envelopes amarrados com fita preta.', 'O que a família escondeu.'),
          artifact('PHOTO', 'Retratos da galeria', 'HUB', 'Molduras ovais; um rosto foi raspado.', 'Quem viveu na casa.'),
        ],
        avoid: ['caveiras e morcegos de Halloween', 'vermelho-sangue saturado'],
        stylePrompt: 'Pintura a óleo escura, chiaroscuro, luz de vela, veludo e prata, atmosfera de segredo.',
        sampleLine: '',
      },
    },
    {
      id: 'noir-night',
      name: 'Noir e noite urbana',
      description: 'Chuva, néon refletido, dossiês e mentiras.',
      identity: {
        essence: { setting: 'Noir urbano', scale: 'PERSONAL' },
        mood: { words: ['tenso', 'cínico', 'chuvoso', 'solitário'], temperature: 'COLD', tempo: 'URGENT', notes: '' },
        palette: [
          swatch('Asfalto molhado', '#0f1114', 'BACKGROUND'),
          swatch('Papel de dossiê', '#e8e2d2', 'SURFACE'),
          swatch('Carbono', '#16181c', 'INK'),
          swatch('Néon âmbar', '#e0a33b', 'ACCENT'),
          swatch('Sinal vermelho', '#c2312e', 'HIGHLIGHT'),
          swatch('Neblina', '#4b5560', 'SHADOW'),
        ],
        typography: { display: 'Bebas Neue', body: 'IBM Plex Serif', accent: 'Special Elite', notes: 'A máquina de escrever é a voz dos relatórios.' },
        materials: ['papel carbono', 'clipes e grampos', 'vidro molhado', 'fumaça', 'metal frio'],
        light: 'Néon refletido em poças; abajur verde numa mesa de escritório.',
        sound: 'Chuva, sirene distante, máquina de escrever, saxofone abafado.',
        composition: 'Ângulos inclinados, sombras de persianas, silhuetas.',
        artifacts: [
          artifact('FILE', 'Dossiê do caso', 'HUB', 'Pasta parda com carimbos e fotos presas com clipe.', 'Suspeitos, pistas e mentiras.'),
          artifact('NEWSPAPER', 'Recortes de jornal', 'COLLECTIBLE', 'Manchetes amareladas.', 'O que a cidade acha que sabe.'),
        ],
        avoid: ['chapéu e sobretudo de fantasia', 'filtro sépia genérico'],
        stylePrompt: 'Fotografia noturna cinematográfica, chuva, néon refletido, alto contraste, grão de filme.',
        sampleLine: '',
      },
    },
  ]
}

/** Applies a starting point, keeping what the book already has of its own. */
export function applyPreset(identity: IdentityKit, preset: Preset): IdentityKit {
  const keep = (own: string, from?: string) => own.trim() || from || ''
  return {
    ...identity,
    ...preset.identity,
    presetId: preset.id,
    essence: {
      setting: keep(identity.essence.setting, preset.identity.essence.setting),
      era: keep(identity.essence.era, preset.identity.essence.era),
      place: identity.essence.place,
      culture: identity.essence.culture,
      scale: identity.essence.scale ?? preset.identity.essence.scale ?? null,
      pointOfView: keep(identity.essence.pointOfView, preset.identity.essence.pointOfView),
      promise: identity.essence.promise,
    },
    // Fresh ids, so applying a preset twice never shares rows.
    palette: preset.identity.palette.map((item) => ({ ...item, id: newId() })),
    artifacts: [...identity.artifacts, ...preset.identity.artifacts.map((item) => ({ ...item, id: newId() }))],
    sampleLine: identity.sampleLine,
    motifs: identity.motifs,
    moodboard: identity.moodboard,
    quotes: identity.quotes,
  }
}
