import { useCallback, useEffect, useMemo, useState } from 'react'
import { google } from '../../api/client'
import type { GoogleDocSuggestionSection, Slot, SuggestionDecision } from '../../api/contracts'
import type { GoogleDocSyncState } from '../../features/googleDocs/useGoogleDocSync'
import { sceneNumberLabel } from '../../features/scenes/sceneStatus'
import { buildHunks, suggestionKind, type HunkPart } from '../../features/suggestions/hunks'
import { plural } from '../../features/text/plural'
import './SuggestionsPage.css'

interface SuggestionsPageProps {
  projectId: string
  projectTitle: string
  slots: Slot[]
  googleDocs: GoogleDocSyncState
}

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; sections: GoogleDocSuggestionSection[] }
  | { kind: 'error'; message: string }

// "Cena 3", "Avulsa" outside the timeline, "Cena nova" before its first sync.
function sceneLabel(slot: Slot | undefined) {
  if (!slot) return 'Cena nova'
  const number = sceneNumberLabel(slot)
  return /^\d+$/.test(number) ? `Cena ${number}` : number
}

const kindLabels = { replace: 'Troca', insert: 'Inclusão', delete: 'Remoção' } as const

function Parts({ parts }: { parts: HunkPart[] }) {
  if (parts.length === 0) return <span className="suggestion-empty">(nada)</span>
  return (
    <>
      {parts.map((part, index) =>
        part.change === 'removed' ? (
          <del key={index}>{part.text}</del>
        ) : part.change === 'added' ? (
          <ins key={index}>{part.text}</ins>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

/**
 * The suggested edits open in the linked Google Doc, scene by scene, each
 * shown as it is and as it would be. Accepting or declining here does it in
 * the doc itself, with Google's own accept and reject; the text then syncs.
 */
export function SuggestionsPage({ projectId, projectTitle, slots, googleDocs }: SuggestionsPageProps) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  // Suggestions being decided right now.
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState('')
  const { link, status } = googleDocs
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots])

  const reload = useCallback(async () => {
    try {
      setLoad({ kind: 'ready', sections: (await google.listSuggestions(projectId)).sections })
    } catch (reason) {
      setLoad({ kind: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível ler as sugestões do Google Docs.' })
    }
  }, [projectId])

  useEffect(() => {
    if (link) void reload()
  }, [link, reload])

  async function decide(decisions: SuggestionDecision[]) {
    const ids = decisions.map((decision) => decision.suggestionId)
    setBusy((current) => new Set([...current, ...ids]))
    setMessage('')
    try {
      const result = await google.decideSuggestions(projectId, decisions)
      setMessage(
        [result.accepted && plural(result.accepted, 'sugestão aceita', 'sugestões aceitas'), result.rejected && plural(result.rejected, 'sugestão recusada', 'sugestões recusadas')]
          .filter(Boolean)
          .join(' e ') + ' no Google Docs.',
      )
      // The doc changed: bring its text over, then list what is still open.
      await googleDocs.syncNow()
      await reload()
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Não foi possível decidir no Google Docs.')
    } finally {
      setBusy((current) => new Set([...current].filter((id) => !ids.includes(id))))
    }
  }

  const intro = (
    <div className="page-intro">
      <p className="eyebrow">{projectTitle}</p>
      <h1>Sugestões</h1>
      <p>
        As sugestões de edição abertas no Google Docs, cena por cena, como o texto está e como ficaria. Aceitar ou recusar
        aqui faz o mesmo no documento; o texto do Petricor acompanha na sincronização.
      </p>
    </div>
  )

  if (!status?.available || !link) {
    return (
      <section className="suggestions-page">
        {intro}
        <p className="empty-state">
          Vincule um Google Doc ao projeto (em Escrever → Google Docs) para revisar aqui as sugestões feitas nele.
        </p>
      </section>
    )
  }

  const sections = load.kind === 'ready' ? load.sections : []
  const total = sections.reduce((sum, section) => sum + section.suggestions.length, 0)

  return (
    <section className="suggestions-page">
      <header className="suggestions-header">
        {intro}
        <div className="suggestions-actions">
          <a className="button button-secondary" href={link.url} rel="noreferrer" target="_blank">
            Abrir no Google Docs
          </a>
          <button className="button button-secondary" disabled={load.kind === 'loading'} type="button" onClick={() => void reload()}>
            Atualizar
          </button>
        </div>
      </header>

      {!status.canComment && (
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
          Lendo o Google Docs…
        </p>
      )}
      {load.kind === 'error' && <p className="form-message">{load.message}</p>}
      {load.kind === 'ready' && total === 0 && <p className="empty-state">Nenhuma sugestão aberta no documento.</p>}

      {total > 0 && <p className="suggestions-muted">{plural(total, 'sugestão aberta', 'sugestões abertas')}</p>}

      {sections.map((section) => {
        const slot = section.slotId ? slotById.get(section.slotId) : undefined
        const ids = section.suggestions.map((suggestion) => suggestion.id)
        const sceneBusy = ids.some((id) => busy.has(id))
        return (
          <article className="suggestions-scene" key={section.key}>
            <header>
              <div>
                <span className="suggestions-scene-number">{sceneLabel(slot)}</span>
                <h2>{section.title}</h2>
              </div>
              {ids.length > 1 && (
                <span className="suggestions-actions">
                  <button
                    className="button button-secondary button-small"
                    disabled={sceneBusy || !status.canComment}
                    type="button"
                    onClick={() => void decide(ids.map((suggestionId) => ({ suggestionId, accept: false })))}
                  >
                    Recusar todas
                  </button>
                  <button
                    className="button button-primary button-small"
                    disabled={sceneBusy || !status.canComment}
                    type="button"
                    onClick={() => void decide(ids.map((suggestionId) => ({ suggestionId, accept: true })))}
                  >
                    Aceitar todas
                  </button>
                </span>
              )}
            </header>
            <ol className="suggestions-list">
              {buildHunks(section.text, section.suggestions).map((hunk) => {
                const { id } = hunk.suggestion
                return (
                  <li className={busy.has(id) ? 'is-busy' : undefined} key={id}>
                    <div className="suggestion-meta">
                      <span className="suggestion-kind">{kindLabels[suggestionKind(hunk.suggestion)]}</span>
                      <span className="suggestions-muted">do Docs</span>
                    </div>
                    <div className="suggestion-split">
                      <div>
                        <span className="suggestion-side">Atual</span>
                        <p>
                          <Parts parts={hunk.before} />
                        </p>
                      </div>
                      <div>
                        <span className="suggestion-side">Com a sugestão</span>
                        <p>
                          <Parts parts={hunk.after} />
                        </p>
                      </div>
                    </div>
                    <div className="suggestion-buttons">
                      <button
                        className="button button-secondary button-small"
                        disabled={busy.has(id) || !status.canComment}
                        type="button"
                        onClick={() => void decide([{ suggestionId: id, accept: false }])}
                      >
                        Recusar
                      </button>
                      <button
                        className="button button-primary button-small"
                        disabled={busy.has(id) || !status.canComment}
                        type="button"
                        onClick={() => void decide([{ suggestionId: id, accept: true }])}
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
    </section>
  )
}
