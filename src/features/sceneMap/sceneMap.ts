import type { Slot } from '../../api/contracts'
import { normalizeForSearch, orderScenes } from '../scenes/sceneStatus'

/**
 * The scene map: the Arquivista's reading of each scene (narrators, place,
 * time, dramatic function, plot threads) laid out over the timeline, and what
 * a developmental editor looks for in it.
 */

export type NarratorPerson = 'FIRST' | 'SECOND' | 'THIRD'
export type Narration = 'SINGLE' | 'ALTERNATING' | 'SHARED' | 'OMNISCIENT' | 'UNCLEAR'
export type TimeRelation = 'CONTINUOUS' | 'LATER' | 'EARLIER' | 'UNKNOWN'
export type SceneFunction = 'SETUP' | 'INCITING' | 'RISING' | 'TURN' | 'REVEAL' | 'CLIMAX' | 'RESOLUTION' | 'TRANSITION' | 'REFLECTION'
export type ThreadAction = 'OPENED' | 'ADVANCED' | 'RESOLVED'

export interface SceneCard {
  narrators: Array<{ name: string; person: NarratorPerson }>
  narration: Narration
  place: string | null
  present: string[]
  time: { marker: string | null; relation: TimeRelation; elapsed: string | null }
  function: SceneFunction | null
  change: string | null
  threads: Array<{ name: string; action: ThreadAction; note?: string | null }>
}

export interface StoredSceneCard {
  slotId: string
  card: SceneCard
  updatedAt: string
}

export const narrationLabels: Record<Narration, string> = {
  SINGLE: 'um ponto de vista',
  ALTERNATING: 'ponto de vista alternado',
  SHARED: 'narradores juntos',
  OMNISCIENT: 'onisciente',
  UNCLEAR: 'indefinido',
}

export const personLabels: Record<NarratorPerson, string> = { FIRST: '1ª pessoa', SECOND: '2ª pessoa', THIRD: '3ª pessoa' }

export const timeLabels: Record<TimeRelation, string> = {
  CONTINUOUS: 'em seguida',
  LATER: 'salto à frente',
  EARLIER: 'volta no tempo',
  UNKNOWN: 'tempo incerto',
}

export const functionLabels: Record<SceneFunction, string> = {
  SETUP: 'Apresentação',
  INCITING: 'Incidente',
  RISING: 'Complicação',
  TURN: 'Virada',
  REVEAL: 'Revelação',
  CLIMAX: 'Clímax',
  RESOLUTION: 'Resolução',
  TRANSITION: 'Transição',
  REFLECTION: 'Reflexão',
}

export interface MapRow {
  slot: Slot
  // 0-based timeline position; null for unanchored scenes.
  position: number | null
  card: SceneCard | null
  // The scene was analysed again after its card was read.
  isStale: boolean
}

/** The scenes in reading order, each with its card when it has one. */
export function mapRows(slots: Slot[], cards: StoredSceneCard[]): MapRow[] {
  const bySlot = new Map(cards.map((card) => [card.slotId, card]))
  return orderScenes(slots).map((slot) => {
    const stored = bySlot.get(slot.id)
    const analyzed = slot.status?.lastAnalyzedAt ? new Date(slot.status.lastAnalyzedAt).getTime() : 0
    return {
      slot,
      position: slot.isUnanchored ? null : slot.timelinePosition,
      card: stored?.card ?? null,
      // A minute of slack: the card and the analysis are saved together.
      isStale: Boolean(stored && analyzed - new Date(stored.updatedAt).getTime() > 60_000),
    }
  })
}

const nameKey = (name: string) => normalizeForSearch(name)

export interface NarratorShare {
  name: string
  scenes: number
  persons: NarratorPerson[]
}

export interface PovReading {
  narrators: NarratorShare[]
  // Scenes whose cards list more than one narrator or a changing point of view.
  mixed: MapRow[]
  // Scenes where a narrator speaks in another grammatical person than usual.
  personShifts: Array<{ row: MapRow; name: string; person: NarratorPerson; usual: NarratorPerson }>
  // The book's usual way: a single narrator throughout, one per scene, or several at once.
  book: 'ONE' | 'ROTATING' | 'MIXED' | 'NONE'
}

/** Who tells the book, scene by scene, and where that breaks its own pattern. */
export function povReading(rows: MapRow[]): PovReading {
  const withCards = rows.filter((row) => row.card)
  const shares = new Map<string, { name: string; scenes: number; persons: Map<NarratorPerson, number> }>()
  for (const row of withCards) {
    for (const narrator of row.card!.narrators) {
      const key = nameKey(narrator.name)
      const share = shares.get(key) ?? { name: narrator.name, scenes: 0, persons: new Map() }
      share.scenes += 1
      share.persons.set(narrator.person, (share.persons.get(narrator.person) ?? 0) + 1)
      shares.set(key, share)
    }
  }
  const narrators = [...shares.values()]
    .map((share) => ({
      name: share.name,
      scenes: share.scenes,
      persons: [...share.persons.entries()].sort((a, b) => b[1] - a[1]).map(([person]) => person),
    }))
    .sort((a, b) => b.scenes - a.scenes)

  const mixed = withCards.filter(
    (row) => row.card!.narrators.length > 1 || row.card!.narration === 'ALTERNATING' || row.card!.narration === 'SHARED',
  )
  const usual = new Map(narrators.map((share) => [nameKey(share.name), share.persons[0]]))
  const personShifts = withCards.flatMap((row) =>
    row.card!.narrators
      .filter((narrator) => usual.get(nameKey(narrator.name)) && usual.get(nameKey(narrator.name)) !== narrator.person)
      .map((narrator) => ({ row, name: narrator.name, person: narrator.person, usual: usual.get(nameKey(narrator.name))! })),
  )

  const book: PovReading['book'] =
    narrators.length === 0 ? 'NONE' : narrators.length === 1 ? 'ONE' : mixed.length > withCards.length / 2 ? 'MIXED' : 'ROTATING'
  return { narrators, mixed, personShifts, book }
}

export interface ThreadTrack {
  name: string
  events: Array<{ row: MapRow; action: ThreadAction; note: string | null }>
  opened: MapRow | null
  resolved: MapRow | null
  // Scenes since it was last touched, for an open thread.
  idleFor: number | null
}

/** Each plot thread through the book: where it opens, moves and closes. */
export function threadTracks(rows: MapRow[]): ThreadTrack[] {
  const tracks = new Map<string, ThreadTrack>()
  const anchored = rows.filter((row) => row.position !== null)
  const lastPosition = anchored.at(-1)?.position ?? 0
  for (const row of anchored) {
    for (const thread of row.card?.threads ?? []) {
      const key = nameKey(thread.name)
      if (!key) continue
      const track = tracks.get(key) ?? { name: thread.name, events: [], opened: null, resolved: null, idleFor: null }
      track.events.push({ row, action: thread.action, note: thread.note ?? null })
      if (thread.action === 'OPENED' && !track.opened) track.opened = row
      if (thread.action === 'RESOLVED') track.resolved = row
      tracks.set(key, track)
    }
  }
  for (const track of tracks.values()) {
    const lastTouch = track.events.at(-1)!.row.position ?? lastPosition
    track.idleFor = track.resolved ? null : lastPosition - lastTouch
  }
  // Open threads first, the ones idle longest on top; then resolved ones in order.
  return [...tracks.values()].sort((a, b) => {
    if (!a.resolved !== !b.resolved) return a.resolved ? 1 : -1
    if (!a.resolved) return (b.idleFor ?? 0) - (a.idleFor ?? 0)
    return (a.events[0].row.position ?? 0) - (b.events[0].row.position ?? 0)
  })
}

/** The scene map as plain text: a reverse outline to paste into a letter or document. */
export function outlineText(rows: MapRow[]): string {
  return rows
    .map((row) => {
      const number = row.position === null ? 'Avulsa' : `Cena ${row.position + 1}`
      const title = row.slot.title?.trim() || 'Cena sem título'
      if (!row.card) return `${number} · ${title}\n  (sem leitura: analise a cena)`
      const card = row.card
      const lines = [
        `${number} · ${title}${card.function ? ` · ${functionLabels[card.function]}` : ''}`,
        card.narrators.length ? `  Narrador: ${card.narrators.map((narrator) => `${narrator.name} (${personLabels[narrator.person]})`).join(', ')}` : null,
        card.place ? `  Lugar: ${card.place}` : null,
        card.time.marker || card.time.relation !== 'UNKNOWN' ? `  Tempo: ${[card.time.marker, timeLabels[card.time.relation]].filter(Boolean).join(' · ')}` : null,
        card.present.length ? `  Presentes: ${card.present.join(', ')}` : null,
        card.change ? `  Muda: ${card.change}` : null,
        ...card.threads.map((thread) => `  Fio (${thread.action === 'OPENED' ? 'abre' : thread.action === 'RESOLVED' ? 'fecha' : 'avança'}): ${thread.name}`),
      ]
      return lines.filter(Boolean).join('\n')
    })
    .join('\n\n')
}
