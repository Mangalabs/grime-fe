import { useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { MarketingDraft } from '../api/contracts'
import { fontStack, useGoogleFonts } from './fonts'
import { buildDraftRequest } from './draftRequest'
import {
  applyDraftPart,
  draftPartLabels,
  draftParts,
  draftScenes,
  type DraftPart,
} from './identityDraft'
import { artifactKindLabels, quoteUseLabels, type IdentityKit } from './identityModel'
import type { MarketingKit } from './marketingKit'
import type { StoryData } from './worldPack'

export interface DraftState {
  draft: MarketingDraft
  applied: DraftPart[]
}

/**
 * Asks the Marketing model for a first version of the kit, read from the
 * public scenes and the public bible, and lets the author take it part by
 * part. Nothing is applied on its own.
 */
export function DraftCard({
  projectId,
  story,
  kit,
  projectKey,
  state,
  onState,
  onApply,
}: {
  projectId: string
  story: StoryData
  kit: MarketingKit
  projectKey: CryptoKey
  state: DraftState | null
  onState: (state: DraftState | null) => void
  onApply: (identity: IdentityKit) => void
}) {
  const [includeLater, setIncludeLater] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { publicSlots, laterSlots } = draftScenes(story, kit)
  const hasCut = kit.publicThroughSlotId !== null && publicSlots.length > 0

  async function generate() {
    setError('')
    try {
      setProgress('Abrindo as cenas…')
      const { request, words } = await buildDraftRequest(story, kit, projectKey, {
        includeLater,
        onProgress: (done, total) => setProgress(`Abrindo as cenas: ${done} de ${total}`),
      })
      if (!request.publicScenes.length) throw new Error('As cenas públicas ainda estão sem texto.')
      setProgress(`Escrevendo o rascunho a partir de ${words.toLocaleString('pt-BR')} palavras…`)
      onState({ draft: await api.draftMarketingIdentity(projectId, request), applied: [] })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o rascunho.')
    } finally {
      setProgress(null)
    }
  }

  function apply(parts: readonly DraftPart[]) {
    if (!state) return
    onApply(parts.reduce((identity, part) => applyDraftPart(identity, state.draft, part, story), kit.identity))
    onState({ ...state, applied: [...new Set([...state.applied, ...parts])] })
  }

  return (
    <section className="admin-card mk-card mk-draft">
      <h3>Rascunho com IA</h3>
      <p className="admin-muted">
        O modelo lê as cenas que o público conhece e as partes liberadas do Arquivo e das fichas e analisa o visual:
        paleta, letras, matéria, luz, motivos e os objetos que aparecem no texto, além de citações copiadas do livro e
        conferidas palavra por palavra. Ele não escreve texto para o livro: a promessa, as sinopses e o conteúdo dos
        objetos são seus. Nada é aplicado sozinho: você escolhe o que entra.
      </p>

      {!hasCut ? (
        <p className="form-message">
          Defina na aba Spoilers até que cena o público conhece: é dessas cenas que o rascunho sai.
        </p>
      ) : (
        <>
          <p className="admin-muted">
            Vai ler {publicSlots.length === 1 ? '1 cena pública' : `${publicSlots.length} cenas públicas`}. As palavras
            lidas contam no limite mensal (Marketing).
          </p>
          {laterSlots.length > 0 && (
            <label className="mk-radio">
              <input checked={includeLater} type="checkbox" onChange={(event) => setIncludeLater(event.target.checked)} />
              <span>
                <strong>Também ler as {laterSlots.length} cenas depois do corte, só pelos detalhes visuais</strong>
                <span className="admin-muted admin-note">
                  Para lugares e objetos que aparecem mais tarde. O modelo é instruído a não contar nada delas, e nenhuma
                  citação delas é aceita; ainda assim, revise o rascunho com cuidado. Custa mais palavras.
                </span>
              </span>
            </label>
          )}
          <div className="admin-card-actions">
            <button className="button button-primary" disabled={progress !== null} type="button" onClick={() => void generate()}>
              {state ? 'Gerar outro rascunho' : 'Gerar rascunho'}
            </button>
            {progress && (
              <span className="admin-muted" role="status">
                {progress}
              </span>
            )}
          </div>
        </>
      )}
      {error && <p className="form-message">{error}</p>}

      {state && (
        <DraftReview
          applied={state.applied}
          draft={state.draft}
          onApply={apply}
          onDiscard={() => onState(null)}
        />
      )}
    </section>
  )
}

function DraftReview({
  draft,
  applied,
  onApply,
  onDiscard,
}: {
  draft: MarketingDraft
  applied: DraftPart[]
  onApply: (parts: readonly DraftPart[]) => void
  onDiscard: () => void
}) {
  useGoogleFonts([draft.typography.display, draft.typography.body, draft.typography.accent])
  const pending = draftParts.filter((part) => !applied.includes(part))

  const previews: Record<DraftPart, ReactNode> = {
    essence: (
      <>
        <p>{[draft.essence.setting, draft.essence.era, draft.essence.place].filter(Boolean).join(' · ')}</p>
      </>
    ),
    mood: <p>{draft.mood.words.join(' · ')}</p>,
    palette: (
      <span className="mk-draft-palette">
        {draft.palette.map((swatch) => (
          <span key={`${swatch.hex}-${swatch.name}`} title={swatch.reason}>
            <span style={{ background: swatch.hex }} />
            {swatch.name}
          </span>
        ))}
      </span>
    ),
    typography: (
      <p>
        <span style={{ fontFamily: fontStack(draft.typography.display, 'serif'), fontSize: 20 }}>{draft.typography.display}</span>
        {' · '}
        <span style={{ fontFamily: fontStack(draft.typography.body, 'serif') }}>{draft.typography.body}</span>
        {' · '}
        <span style={{ fontFamily: fontStack(draft.typography.accent, 'cursive'), fontSize: 18 }}>{draft.typography.accent}</span>
      </p>
    ),
    matter: (
      <>
        <p>{draft.materials.join(' · ')}</p>
        {draft.light && <p className="admin-muted">{draft.light}</p>}
      </>
    ),
    motifs: <p>{draft.motifs.map((motif) => motif.name).join(' · ')}</p>,
    artifacts: (
      <ul className="mk-draft-list">
        {draft.artifacts.map((artifact) => (
          <li key={artifact.title}>
            <strong>{artifact.title}</strong> <span className="admin-muted">{artifactKindLabels[artifact.kind]}</span>
          </li>
        ))}
      </ul>
    ),
    quotes: (
      <ul className="mk-draft-list">
        {draft.quotes.map((quote) => (
          <li key={quote.text}>
            <span className="mk-draft-quote">“{quote.text}”</span>{' '}
            <span className="admin-muted">Cena {quote.scene} · {quoteUseLabels[quote.use]}</span>
          </li>
        ))}
      </ul>
    ),
    direction: <p className="admin-muted">{draft.stylePrompt}</p>,
  }

  return (
    <div className="mk-draft-review">
      <div className="mk-draft-review-head">
        <strong>Rascunho</strong>
        <span className="admin-card-actions">
          {pending.length > 0 && (
            <button className="button button-secondary button-small" type="button" onClick={() => onApply(pending)}>
              Aplicar tudo
            </button>
          )}
          <button className="text-button" type="button" onClick={onDiscard}>
            Descartar rascunho
          </button>
        </span>
      </div>
      <p className="admin-muted">
        Campos únicos são trocados pelo rascunho; listas ganham os itens novos; a paleta é trocada inteira. Objetos chegam
        como teaser e sem conteúdo: o que revelam e o que se lê neles é você quem escreve. Depois, salve o marketing.
      </p>
      {draftParts.map((part) => (
        <div className="mk-draft-part" key={part}>
          <div>
            <span className="mk-label">{draftPartLabels[part]}</span>
            {previews[part]}
          </div>
          {applied.includes(part) ? (
            <span className="mk-draft-done">Aplicado ✓</span>
          ) : (
            <button className="button button-small button-secondary" type="button" onClick={() => onApply([part])}>
              Aplicar
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
