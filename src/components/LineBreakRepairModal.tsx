import { useEffect, useMemo, useState } from 'react'
import './Modal.css'
import './LineBreakRepairModal.css'
import { api } from '../api/client'
import type { Slot } from '../api/contracts'
import { decryptSceneDraft, encryptSceneDraft } from '../crypto/projectEncryption'
import { orderScenes, sceneNumberLabel, sceneTitle } from '../features/scenes/sceneStatus'
import { findSoftWraps, joinSoftWraps, type SoftWrap } from '../features/scenes/softWraps'

interface LineBreakRepairModalProps {
  projectKey: CryptoKey
  slots: Slot[]
  onClose: () => void
  // Scenes whose text was saved, so an open one can be reloaded.
  onApplied: (slotIds: string[]) => void
}

interface SceneWraps {
  slot: Slot
  draft: { content: string; genre: string; focusMode: string }
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
const plural = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`

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
  // The scenes as they were when the dialog opened; later list updates don't restart the scan.
  const [scanned] = useState(slots)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', done: 0, total: slots.length })
  const [scenes, setScenes] = useState<SceneWraps[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [openSceneId, setOpenSceneId] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    const ordered = orderScenes(scanned)
    const found: Array<SceneWraps | null> = new Array(ordered.length).fill(null)
    let next = 0
    let done = 0
    async function worker() {
      while (next < ordered.length) {
        const index = next
        next += 1
        const slot = ordered[index]
        const review = await api.getSlotReview(slot.id)
        if (review.content) {
          const draft = await decryptSceneDraft(projectKey, review.content.ciphertext, review.content.iv)
          const content = draft.content ?? ''
          const wraps = findSoftWraps(content)
          if (wraps.length) {
            found[index] = { slot, draft: { content, genre: draft.genre ?? '', focusMode: draft.focusMode ?? 'GENERAL' }, wraps }
          }
        }
        done += 1
        if (isCurrent) setPhase({ kind: 'loading', done, total: ordered.length })
      }
    }
    Promise.all(Array.from({ length: Math.min(6, ordered.length) }, worker))
      .then(() => {
        if (!isCurrent) return
        const withWraps = found.filter((scene): scene is SceneWraps => scene !== null)
        setScenes(withWraps)
        setOpenSceneId(withWraps[0]?.slot.id ?? null)
        setPhase({ kind: 'review' })
      })
      .catch((reason) => {
        if (isCurrent) setPhase({ kind: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível ler as cenas.' })
      })
    return () => {
      isCurrent = false
    }
  }, [projectKey, scanned])

  const chosen = useMemo(
    () => scenes.map((scene) => ({ scene, wraps: scene.wraps.filter((wrap) => !excluded.has(keyOf(scene.slot.id, wrap))) })),
    [scenes, excluded],
  )
  const totalChosen = chosen.reduce((sum, item) => sum + item.wraps.length, 0)
  const scenesChosen = chosen.filter((item) => item.wraps.length > 0).length

  const toggle = (keys: string[], include: boolean) =>
    setExcluded((current) => {
      const next = new Set(current)
      for (const key of keys) {
        if (include) next.delete(key)
        else next.add(key)
      }
      return next
    })

  async function apply() {
    const work = chosen.filter((item) => item.wraps.length > 0)
    setPhase({ kind: 'saving', done: 0, total: work.length })
    const saved: string[] = []
    try {
      for (const [index, { scene, wraps }] of work.entries()) {
        const content = joinSoftWraps(scene.draft.content, wraps)
        await api.saveSceneContent(scene.slot.id, await encryptSceneDraft(projectKey, { ...scene.draft, content }))
        saved.push(scene.slot.id)
        setPhase({ kind: 'saving', done: index + 1, total: work.length })
      }
      setPhase({ kind: 'done', scenes: saved.length, breaks: totalChosen })
    } catch (reason) {
      setPhase({
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
          <div className="linebreak-progress" role="status">
            <span>
              {phase.kind === 'loading' ? 'Lendo as cenas' : 'Salvando'} · {phase.done} de {phase.total}
            </span>
            <div aria-hidden="true">
              <span style={{ width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%` }} />
            </div>
          </div>
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
            <div className="linebreak-summary">
              <strong>
                {plural(totalChosen, 'quebra marcada', 'quebras marcadas')} em {plural(scenesChosen, 'cena', 'cenas')}
              </strong>
              <span>
                <button className="text-button" type="button" onClick={() => setExcluded(new Set())}>
                  Marcar todas
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setExcluded(new Set(scenes.flatMap((scene) => scene.wraps.map((wrap) => keyOf(scene.slot.id, wrap)))))}
                >
                  Desmarcar todas
                </button>
              </span>
            </div>
            <ul className="linebreak-scenes">
              {chosen.map(({ scene, wraps }) => {
                const keys = scene.wraps.map((wrap) => keyOf(scene.slot.id, wrap))
                const isOpen = openSceneId === scene.slot.id
                return (
                  <li key={scene.slot.id}>
                    <div className="linebreak-scene-head">
                      <input
                        aria-label={`Juntar as quebras de ${sceneTitle(scene.slot)}`}
                        checked={wraps.length > 0}
                        ref={(input) => {
                          if (input) input.indeterminate = wraps.length > 0 && wraps.length < scene.wraps.length
                        }}
                        type="checkbox"
                        onChange={(event) => toggle(keys, event.target.checked)}
                      />
                      <button aria-expanded={isOpen} type="button" onClick={() => setOpenSceneId(isOpen ? null : scene.slot.id)}>
                        <span className="linebreak-scene-number">{sceneNumberLabel(scene.slot)}</span>
                        <span className="linebreak-scene-title">{sceneTitle(scene.slot)}</span>
                        <span className="linebreak-count">
                          {wraps.length === scene.wraps.length ? scene.wraps.length : `${wraps.length} de ${scene.wraps.length}`}
                        </span>
                      </button>
                    </div>
                    {isOpen && (
                      <ol className="linebreak-list">
                        {scene.wraps.slice(0, LIST_LIMIT).map((wrap) => {
                          const key = keyOf(scene.slot.id, wrap)
                          const { before, after } = context(scene.draft.content, wrap)
                          return (
                            <li className={excluded.has(key) ? 'is-off' : undefined} key={key}>
                              <label>
                                <input checked={!excluded.has(key)} type="checkbox" onChange={(event) => toggle([key], event.target.checked)} />
                                <span>
                                  {before}
                                  <mark aria-label="quebra de linha">↵</mark>
                                  {after}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                        {scene.wraps.length > LIST_LIMIT && (
                          <li className="linebreak-more">
                            e mais {plural(scene.wraps.length - LIST_LIMIT, 'quebra', 'quebras')} nesta cena, que seguem a marcação da cena.
                          </li>
                        )}
                      </ol>
                    )}
                  </li>
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
