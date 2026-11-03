import { useMemo, useState } from 'react'
import './Modal.css'
import './LineBreakRepairModal.css'
import { api } from '../api/client'
import type { Slot } from '../api/contracts'
import { encryptSceneDraft } from '../crypto/projectEncryption'
import { sceneNumberLabel, sceneTitle } from '../features/scenes/sceneStatus'
import { findSoftWraps, joinSoftWraps, type SoftWrap } from '../features/scenes/softWraps'
import { plural } from '../features/text/plural'
import { ReviewGroup, ReviewItem, ReviewProgress, ReviewSummary } from './review/BatchReview'
import { useExclusions, useSceneDrafts, type LoadedScene } from './review/useBatchReview'

interface LineBreakRepairModalProps {
  projectKey: CryptoKey
  slots: Slot[]
  onClose: () => void
  // Scenes whose text was saved, so an open one can be reloaded.
  onApplied: (slotIds: string[]) => void
}

interface SceneWraps extends LoadedScene {
  wraps: SoftWrap[]
}

type Phase =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'review' }
  | { kind: 'saving'; done: number; total: number }
  | { kind: 'done'; scenes: number; breaks: number }
  | { kind: 'error'; message: string }

// Words of context shown on each side of a break.
const CONTEXT_CHARS = 70
// Occurrences listed per opened scene; the rest still count and can be unticked with the scene.
const LIST_LIMIT = 150

const keyOf = (slotId: string, wrap: SoftWrap) => `${slotId}:${wrap.start}`

function context(text: string, wrap: SoftWrap) {
  const before = text.slice(Math.max(0, wrap.start - CONTEXT_CHARS), wrap.start)
  const after = text.slice(wrap.end, wrap.end + CONTEXT_CHARS)
  // Other line breaks nearby show as a mark, so the row stays one line of text.
  const flat = (part: string) => part.replace(/\s*\n\s*/g, ' ⏎ ')
  return {
    before: `${wrap.start > CONTEXT_CHARS ? '…' : ''}${flat(before.slice(before.search(/\s/) + 1 || 0))}`,
    after: `${flat(after.slice(0, after.lastIndexOf(' ') > 0 ? after.lastIndexOf(' ') : after.length))}…`,
  }
}

/**
 * Joins line breaks left in the middle of sentences by pasting from a PDF.
 * Everything is read and changed here, in the browser; nothing is saved
 * until the author reviews the list and confirms.
 */
export function LineBreakRepairModal({ projectKey, slots, onClose, onApplied }: LineBreakRepairModalProps) {
  const load = useSceneDrafts(slots, projectKey)
  // Saving and after; until then the phase follows the loading.
  const [applying, setApplying] = useState<Extract<Phase, { kind: 'saving' | 'done' | 'error' }> | null>(null)
  const phase: Phase = applying ?? (load.kind === 'ready' ? { kind: 'review' } : load)
  const scenes = useMemo<SceneWraps[]>(
    () =>
      load.kind === 'ready'
        ? load.scenes.map((scene) => ({ ...scene, wraps: findSoftWraps(scene.draft.content) })).filter((scene) => scene.wraps.length > 0)
        : [],
    [load],
  )
  const { excluded, setExcluded, toggle } = useExclusions()
  const [openSceneId, setOpenSceneId] = useState<string | null>(null)

  // The first scene starts open, once, when the list first appears.
  const [seeded, setSeeded] = useState(false)
  if (!seeded && load.kind === 'ready') {
    setSeeded(true)
    setOpenSceneId(scenes[0]?.slot.id ?? null)
  }

  const chosen = useMemo(
    () => scenes.map((scene) => ({ scene, wraps: scene.wraps.filter((wrap) => !excluded.has(keyOf(scene.slot.id, wrap))) })),
    [scenes, excluded],
  )
  const totalChosen = chosen.reduce((sum, item) => sum + item.wraps.length, 0)
  const scenesChosen = chosen.filter((item) => item.wraps.length > 0).length

  async function apply() {
    const work = chosen.filter((item) => item.wraps.length > 0)
    setApplying({ kind: 'saving', done: 0, total: work.length })
    const saved: string[] = []
    try {
      for (const [index, { scene, wraps }] of work.entries()) {
        const content = joinSoftWraps(scene.draft.content, wraps)
        await api.saveSceneContent(scene.slot.id, await encryptSceneDraft(projectKey, { ...scene.draft, content }))
        saved.push(scene.slot.id)
        setApplying({ kind: 'saving', done: index + 1, total: work.length })
      }
      setApplying({ kind: 'done', scenes: saved.length, breaks: totalChosen })
    } catch (reason) {
      setApplying({
        kind: 'error',
        message: `${reason instanceof Error ? reason.message : 'Não foi possível salvar.'} ${saved.length ? `${plural(saved.length, 'cena já foi salva', 'cenas já foram salvas')}.` : 'Nada foi alterado.'}`,
      })
    } finally {
      if (saved.length) onApplied(saved)
    }
  }

  const busy = phase.kind === 'loading' || phase.kind === 'saving'

  return (
    <div className="modal-backdrop">
      <section aria-labelledby="linebreak-title" aria-modal="true" className="modal linebreak-modal" role="dialog">
        <p className="eyebrow">Texto colado de PDF</p>
        <h2 id="linebreak-title">Juntar linhas quebradas</h2>
        <p>
          Procura quebras de linha no meio de frases: a linha anterior não termina a frase e a seguinte continua em
          minúscula. Confira a lista, desmarque o que deve ficar como está (poemas, cartas, trechos com formatação
          especial) e só então junte. Diálogos e parágrafos novos não entram.
        </p>

        {(phase.kind === 'loading' || phase.kind === 'saving') && (
          <ReviewProgress done={phase.done} label={phase.kind === 'loading' ? 'Lendo as cenas' : 'Salvando'} total={phase.total} />
        )}

        {phase.kind === 'error' && <p className="form-message">{phase.message}</p>}

        {phase.kind === 'done' && (
          <p className="linebreak-done" role="status">
            {plural(phase.breaks, 'quebra juntada', 'quebras juntadas')} em {plural(phase.scenes, 'cena', 'cenas')}. As
            análises existentes continuam valendo; reanalise as cenas quando quiser.
          </p>
        )}

        {phase.kind === 'review' && scenes.length === 0 && (
          <p className="linebreak-done">Nenhuma quebra no meio de frase encontrada neste projeto.</p>
        )}

        {phase.kind === 'review' && scenes.length > 0 && (
          <>
            <ReviewSummary
              onAll={() => setExcluded(new Set())}
              onNone={() => setExcluded(new Set(scenes.flatMap((scene) => scene.wraps.map((wrap) => keyOf(scene.slot.id, wrap)))))}
            >
              {plural(totalChosen, 'quebra marcada', 'quebras marcadas')} em {plural(scenesChosen, 'cena', 'cenas')}
            </ReviewSummary>
            <ul className="linebreak-scenes">
              {chosen.map(({ scene, wraps }) => {
                const keys = scene.wraps.map((wrap) => keyOf(scene.slot.id, wrap))
                const isOpen = openSceneId === scene.slot.id
                return (
                  <ReviewGroup
                    checkLabel={`Juntar as quebras de ${sceneTitle(scene.slot)}`}
                    isOpen={isOpen}
                    key={scene.slot.id}
                    kicker={sceneNumberLabel(scene.slot)}
                    on={wraps.length}
                    title={sceneTitle(scene.slot)}
                    total={scene.wraps.length}
                    onCheck={(checked) => toggle(keys, checked)}
                    onOpen={() => setOpenSceneId(isOpen ? null : scene.slot.id)}
                  >
                    <ol className="linebreak-list">
                      {scene.wraps.slice(0, LIST_LIMIT).map((wrap) => {
                        const key = keyOf(scene.slot.id, wrap)
                        const { before, after } = context(scene.draft.content, wrap)
                        return (
                          <ReviewItem isOn={!excluded.has(key)} key={key} onCheck={(checked) => toggle([key], checked)}>
                            {before}
                            <mark aria-label="quebra de linha">↵</mark>
                            {after}
                          </ReviewItem>
                        )
                      })}
                      {scene.wraps.length > LIST_LIMIT && (
                        <li className="linebreak-more">
                          e mais {plural(scene.wraps.length - LIST_LIMIT, 'quebra', 'quebras')} nesta cena, que seguem a marcação da cena.
                        </li>
                      )}
                    </ol>
                  </ReviewGroup>
                )
              })}
            </ul>
          </>
        )}

        <div className="modal-actions">
          <button className="button button-secondary" disabled={phase.kind === 'saving'} type="button" onClick={onClose}>
            {phase.kind === 'done' ? 'Fechar' : 'Cancelar'}
          </button>
          {phase.kind === 'review' && scenes.length > 0 && (
            <button className="button button-primary" disabled={busy || totalChosen === 0} type="button" onClick={() => void apply()}>
              Juntar {plural(totalChosen, 'quebra', 'quebras')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
