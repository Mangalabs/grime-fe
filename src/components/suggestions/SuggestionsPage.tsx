import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, google } from '../../api/client'
import type { Slot } from '../../api/contracts'
import { decryptScene, decryptSceneDraft } from '../../crypto/projectEncryption'
import type { GoogleDocSyncState } from '../../features/googleDocs/useGoogleDocSync'
import { orderScenes, sceneNumberLabel } from '../../features/scenes/sceneStatus'
import { buildHunks, decisionIds, mergeReplacements, suggestionKind, type Suggestion } from '../../features/suggestions/hunks'
import {
  decideSuggestions,
  listSuggestions,
  locate,
  type PetricorSuggestion,
} from '../../features/suggestions/petricorSuggestions'
import { plural } from '../../features/text/plural'
import { HunkText } from './HunkText'
import './SuggestionsPage.css'

interface SuggestionsPageProps {
  projectId: string
  projectTitle: string
  projectKey: CryptoKey | null
  slots: Slot[]
  googleDocs: GoogleDocSyncState
  // Scenes whose text an accepted suggestion changed, so open views reload.
  onTextChanged: (slotIds: string[]) => void
}

interface SceneSuggestions {
  key: string
  title: string
  slotId: string | null
  // The scene's text as it is, which the suggestions are placed in.
  text: string
  suggestions: Suggestion[]
}

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; scenes: SceneSuggestions[]; lost: PetricorSuggestion[] }
  | { kind: 'error'; message: string }

const kindLabels = { replace: 'Troca', insert: 'Inclusão', delete: 'Remoção' } as const

// "Cena 3", "Avulsa" outside the timeline, "Cena nova" before its first sync.
function sceneLabel(slot: Slot | undefined) {
  if (!slot) return 'Cena nova'
  const number = sceneNumberLabel(slot)
  return /^\d+$/.test(number) ? `Cena ${number}` : number
}

interface Read {
  load: Load
  petricor: Map<string, PetricorSuggestion>
}

// The open suggestions of the project, by scene, placed in each scene's text.
async function readSuggestions(
  projectId: string,
  projectKey: CryptoKey,
  isLinked: boolean,
  slotById: Map<string, Slot>,
): Promise<Read> {
  try {
    if (isLinked) {
      const { sections } = await google.listSuggestions(projectId)
      const scenes = await Promise.all(
        sections.map(async (section) => ({
          key: section.key,
          title: section.title,
          slotId: section.slotId,
          text: section.text,
          suggestions: mergeReplacements(
            await Promise.all(
              section.suggestions.map(async ({ author, ...suggestion }) => ({
                ...suggestion,
                author: author ? await decryptScene(projectKey, author.ciphertext, author.iv).catch(() => null) : null,
              })),
            ),
          ),
        })),
      )
      return { load: { kind: 'ready', scenes, lost: [] }, petricor: new Map() }
    }
    const open = (await listSuggestions(projectId, projectKey)).filter((suggestion) => suggestion.status === 'OPEN')
    const bySlot = new Map<string, PetricorSuggestion[]>()
    for (const suggestion of open) bySlot.set(suggestion.slotId, [...(bySlot.get(suggestion.slotId) ?? []), suggestion])
    const lost: PetricorSuggestion[] = []
    const scenes: SceneSuggestions[] = []
    for (const slot of orderScenes([...bySlot.keys()].flatMap((id) => slotById.get(id) ?? []))) {
      const review = await api.getSlotReview(slot.id)
      const text = review.content
        ? ((await decryptSceneDraft(projectKey, review.content.ciphertext, review.content.iv)).content ?? '')
        : ''
      const suggestions = bySlot.get(slot.id)!.flatMap((suggestion) => {
        const place = locate(text, suggestion)
        if (!place) lost.push(suggestion)
        return place ? [{ id: suggestion.id, ...place, inserted: suggestion.inserted, author: suggestion.author }] : []
      })
      if (suggestions.length > 0) scenes.push({ key: slot.id, title: slot.title ?? 'Sem título', slotId: slot.id, text, suggestions })
    }
    return { load: { kind: 'ready', scenes, lost }, petricor: new Map(open.map((suggestion) => [suggestion.id, suggestion])) }
  } catch (reason) {
    return { load: { kind: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível ler as sugestões.' }, petricor: new Map() }
  }
}

/**
 * Suggested edits, scene by scene, each shown as the text is and as it would
 * be. With a linked Google Doc they are the doc's own suggestions, decided
 * there with Google's accept and reject; without one, Petricor keeps them and
 * accepting changes the scene's text.
 */
export function SuggestionsPage({ projectId, projectTitle, projectKey, slots, googleDocs, onTextChanged }: SuggestionsPageProps) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  // Suggestions being decided right now.
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState('')
  const { link, status } = googleDocs
  const isLinked = Boolean(status?.available && link)
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots])
  // Petricor suggestions by id, for deciding them.
  const [petricor, setPetricor] = useState<Map<string, PetricorSuggestion>>(() => new Map())

  const reload = useCallback(async () => {
    if (!projectKey) return
    const read = await readSuggestions(projectId, projectKey, isLinked, slotById)
    setLoad(read.load)
    setPetricor(read.petricor)
  }, [isLinked, projectId, projectKey, slotById])

  useEffect(() => {
    if (!projectKey) return
    let isCurrent = true
    void readSuggestions(projectId, projectKey, isLinked, slotById).then((read) => {
      if (!isCurrent) return
      setLoad(read.load)
      setPetricor(read.petricor)
    })
    return () => {
      isCurrent = false
    }
  }, [isLinked, projectId, projectKey, slotById])

  async function decide(decisions: Array<{ suggestion: Suggestion; accept: boolean }>) {
    const ids = decisions.flatMap(({ suggestion }) => decisionIds(suggestion))
    setBusy((current) => new Set([...current, ...ids]))
    setMessage('')
    const accepted = decisions.filter((decision) => decision.accept).length
    const counted = [
      accepted && plural(accepted, 'sugestão aceita', 'sugestões aceitas'),
      decisions.length - accepted && plural(decisions.length - accepted, 'sugestão recusada', 'sugestões recusadas'),
    ]
      .filter(Boolean)
      .join(' e ')
    try {
      if (isLinked) {
        await google.decideSuggestions(
          projectId,
          decisions.flatMap(({ suggestion, accept }) => decisionIds(suggestion).map((suggestionId) => ({ suggestionId, accept }))),
        )
        setMessage(`${counted} no Google Docs.`)
        // The doc changed: bring its text over, then list what is still open.
        await googleDocs.syncNow()
      } else if (projectKey) {
        const result = await decideSuggestions(
          projectId,
          projectKey,
          decisions.flatMap(({ suggestion, accept }) => {
            const stored = petricor.get(suggestion.id)
            return stored ? [{ suggestion: stored, accept }] : []
          }),
        )
        if (result.changedSlotIds.length > 0) onTextChanged(result.changedSlotIds)
        setMessage(
          result.notFound.length > 0
            ? `${plural(result.notFound.length, 'sugestão não foi encontrada', 'sugestões não foram encontradas')} no texto atual e ficou aberta.`
            : `${counted}.`,
        )
      }
      await reload()
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Não foi possível registrar a decisão.')
    } finally {
      setBusy((current) => new Set([...current].filter((id) => !ids.includes(id))))
    }
  }

  async function discard(lost: PetricorSuggestion) {
    // The passage was rewritten some other way: the suggestion no longer applies.
    await api.updateSuggestions(projectId, [{ suggestionId: lost.id, status: 'CHANGED' }]).catch(() => undefined)
    await reload()
  }

  const intro = (
    <div className="page-intro">
      <p className="eyebrow">{projectTitle}</p>
      <h1>Sugestões</h1>
      <p>
        {isLinked
          ? 'As sugestões de edição abertas no Google Docs, cena por cena, como o texto está e como ficaria. Aceitar ou recusar aqui faz o mesmo no documento; o texto do Petricor acompanha na sincronização.'
          : 'As sugestões de edição abertas, cena por cena, como o texto está e como ficaria. Aceitar muda o texto da cena; recusar só fecha a sugestão. Para sugerir, abra a cena e use “Sugerir alterações”.'}
      </p>
    </div>
  )

  if (!projectKey) {
    return (
      <section className="suggestions-page">
        {intro}
        <p className="empty-state">Desbloqueie o projeto para ver as sugestões.</p>
      </section>
    )
  }

  const canDecide = !isLinked || Boolean(status?.canComment)
  const scenes = load.kind === 'ready' ? load.scenes : []
  const lost = load.kind === 'ready' ? load.lost : []
  const total = scenes.reduce((sum, scene) => sum + scene.suggestions.length, 0)

  return (
    <section className="suggestions-page">
      <header className="suggestions-header">
        {intro}
        <div className="suggestions-actions">
          {isLinked && link && (
            <a className="button button-secondary" href={link.url} rel="noreferrer" target="_blank">
              Abrir no Google Docs
            </a>
          )}
          <button className="button button-secondary" disabled={load.kind === 'loading'} type="button" onClick={() => void reload()}>
            Atualizar
          </button>
        </div>
      </header>

      {!canDecide && (
        <div className="suggestions-permission">
          <span>Para aceitar ou recusar daqui, o Petricor precisa da permissão de editar o documento.</span>
          <button className="button button-secondary button-small" type="button" onClick={() => void googleDocs.connect('comment')}>
            Permitir no Google
          </button>
        </div>
      )}
      {message && (
        <p className="suggestions-message" role="status">
          {message}
        </p>
      )}
      {load.kind === 'loading' && (
        <p className="suggestions-muted" role="status">
          {isLinked ? 'Lendo o Google Docs…' : 'Lendo as sugestões…'}
        </p>
      )}
      {load.kind === 'error' && <p className="form-message">{load.message}</p>}
      {load.kind === 'ready' && total === 0 && lost.length === 0 && <p className="empty-state">Nenhuma sugestão aberta.</p>}
      {total > 0 && <p className="suggestions-muted">{plural(total, 'sugestão aberta', 'sugestões abertas')}</p>}

      {scenes.map((scene) => {
        const sceneBusy = scene.suggestions.some((suggestion) => decisionIds(suggestion).some((id) => busy.has(id)))
        const all = (accept: boolean) => scene.suggestions.map((suggestion) => ({ suggestion, accept }))
        return (
          <article className="suggestions-scene" key={scene.key}>
            <header>
              <div>
                <span className="suggestions-scene-number">{sceneLabel(scene.slotId ? slotById.get(scene.slotId) : undefined)}</span>
                <h2>{scene.title}</h2>
              </div>
              {scene.suggestions.length > 1 && (
                <span className="suggestions-actions">
                  <button
                    className="button button-secondary button-small"
                    disabled={sceneBusy || !canDecide}
                    type="button"
                    onClick={() => void decide(all(false))}
                  >
                    Recusar todas
                  </button>
                  <button
                    className="button button-primary button-small"
                    disabled={sceneBusy || !canDecide}
                    type="button"
                    onClick={() => void decide(all(true))}
                  >
                    Aceitar todas
                  </button>
                </span>
              )}
            </header>
            <ol className="suggestions-list">
              {buildHunks(scene.text, scene.suggestions).map((hunk) => {
                const { suggestion } = hunk
                const isBusy = decisionIds(suggestion).some((id) => busy.has(id))
                return (
                  <li className={isBusy ? 'is-busy' : undefined} key={suggestion.id}>
                    <div className="suggestion-meta">
                      <span className="suggestion-kind">{kindLabels[suggestionKind(suggestion)]}</span>
                      <span className="suggestions-muted">{suggestion.author ? `de ${suggestion.author}` : 'do Docs'}</span>
                    </div>
                    <div className="suggestion-split">
                      <div>
                        <span className="suggestion-side">Atual</span>
                        <p>
                          <HunkText parts={hunk.before} />
                        </p>
                      </div>
                      <div>
                        <span className="suggestion-side">Com a sugestão</span>
                        <p>
                          <HunkText parts={hunk.after} />
                        </p>
                      </div>
                    </div>
                    <div className="suggestion-buttons">
                      <button
                        className="button button-secondary button-small"
                        disabled={isBusy || !canDecide}
                        type="button"
                        onClick={() => void decide([{ suggestion, accept: false }])}
                      >
                        Recusar
                      </button>
                      <button
                        className="button button-primary button-small"
                        disabled={isBusy || !canDecide}
                        type="button"
                        onClick={() => void decide([{ suggestion, accept: true }])}
                      >
                        Aceitar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          </article>
        )
      })}

      {lost.length > 0 && (
        <article className="suggestions-scene">
          <header>
            <div>
              <h2>Não encontradas no texto atual</h2>
              <p className="suggestions-muted">O trecho foi reescrito depois da sugestão. Confira e descarte as que não valem mais.</p>
            </div>
          </header>
          <ol className="suggestions-list">
            {lost.map((suggestion) => (
              <li key={suggestion.id}>
                <div className="suggestion-meta">
                  <span className="suggestions-muted">
                    {sceneLabel(slotById.get(suggestion.slotId))} · de {suggestion.author}
                  </span>
                </div>
                <p className="suggestion-lost">
                  <del>{suggestion.removed}</del> <ins>{suggestion.inserted}</ins>
                </p>
                <div className="suggestion-buttons">
                  <button className="button button-secondary button-small" type="button" onClick={() => void discard(suggestion)}>
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </article>
      )}
    </section>
  )
}
