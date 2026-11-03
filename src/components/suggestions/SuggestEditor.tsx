import { useMemo, useState } from 'react'
import { google } from '../../api/client'
import { encryptScene } from '../../crypto/projectEncryption'
import { useCloseOnEscape } from '../../features/useCloseOnEscape'
import { editsBetween } from '../../features/suggestions/edits'
import { buildHunks } from '../../features/suggestions/hunks'
import { createSuggestions } from '../../features/suggestions/petricorSuggestions'
import { plural } from '../../features/text/plural'
import '../Modal.css'
import './SuggestionsPage.css'
import { HunkText } from './HunkText'

interface SuggestEditorProps {
  projectId: string
  projectKey: CryptoKey
  slotId: string
  sceneTitle: string
  // The scene's text as it is: the suggestions are changes to it.
  text: string
  // With a linked Google Doc the suggestions are made there, natively.
  isLinked: boolean
  onClose: () => void
  onSent: (count: number) => void
}

// The reviewer's name, remembered in this browser only.
const NAME_KEY = 'petricor:suggester-name'
const rememberedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Suggesting changes to a scene: the reviewer edits the text freely, and
 * each change becomes a suggestion the author accepts or declines. With a
 * linked Google Doc they are made in the doc, as if typed in Suggesting mode.
 */
export function SuggestEditor({ projectId, projectKey, slotId, sceneTitle, text, isLinked, onClose, onSent }: SuggestEditorProps) {
  const [edited, setEdited] = useState(text)
  const [name, setName] = useState(rememberedName)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  useCloseOnEscape(onClose, !isSending)

  const edits = useMemo(() => editsBetween(text, edited), [text, edited])
  const hunks = useMemo(
    () => buildHunks(text, edits.map((edit, index) => ({ id: String(index), ...edit }))),
    [text, edits],
  )

  async function send() {
    const author = name.trim()
    if (!author || edits.length === 0) return
    setIsSending(true)
    setError('')
    try {
      localStorage.setItem(NAME_KEY, author)
    } catch {
      // Only a convenience.
    }
    try {
      if (isLinked) {
        await google.createSuggestions(projectId, { slotId, edits, author: await encryptScene(projectKey, author) })
      } else {
        await createSuggestions(projectId, projectKey, slotId, text, edits, author)
      }
      onSent(edits.length)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar as sugestões.')
      setIsSending(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <section aria-labelledby="suggest-title" aria-modal="true" className="modal suggest-modal" role="dialog">
        <p className="eyebrow">{sceneTitle}</p>
        <h2 id="suggest-title">Sugerir alterações</h2>
        <p>
          Edite o texto como quiser: cada mudança vira uma sugestão, que o autor aceita ou recusa.
          {isLinked
            ? ' Elas vão para o Google Docs como sugestões do próprio Docs.'
            : ' O texto da cena só muda quando uma sugestão é aceita.'}
        </p>

        <label className="suggest-name">
          <span>Seu nome</span>
          <input maxLength={80} placeholder="Quem está sugerindo" value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <textarea
          aria-label="Texto com as suas sugestões"
          className="suggest-text"
          spellCheck
          value={edited}
          onChange={(event) => setEdited(event.target.value)}
        />

        {hunks.length > 0 && (
          <div className="suggest-preview">
            <p className="suggestions-muted">{plural(hunks.length, 'sugestão', 'sugestões')}</p>
            <ol className="suggestions-list">
              {hunks.map((hunk) => (
                <li key={hunk.suggestion.id}>
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
                </li>
              ))}
            </ol>
          </div>
        )}

        {error && <p className="form-message">{error}</p>}

        <div className="modal-actions">
          <button className="button button-secondary" disabled={isSending} type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={isSending || edits.length === 0 || !name.trim()}
            title={name.trim() ? undefined : 'Diga quem está sugerindo'}
            type="button"
            onClick={() => void send()}
          >
            {isSending ? 'Enviando…' : edits.length === 0 ? 'Sugerir' : `Sugerir ${plural(edits.length, 'alteração', 'alterações')}`}
          </button>
        </div>
      </section>
    </div>
  )
}
