import { useEffect, useMemo, useState } from 'react'
import '../Modal.css'
import '../LineBreakRepairModal.css'
import './CopyeditModal.css'
import { api } from '../../api/client'
import type { Slot } from '../../api/contracts'
import { decryptSceneDraft, encryptSceneDraft } from '../../crypto/projectEncryption'
import { orderScenes, sceneNumberLabel, sceneTitle } from '../../features/scenes/sceneStatus'
import { applyReplacements } from '../../features/style/ptBr'
import { checkScene, typographyRuleId, type StyleFinding, type StyleSheet } from '../../features/style/styleSheet'
import { saveVersion } from '../../features/versions/versions'

interface CopyeditModalProps {
  projectId: string
  projectKey: CryptoKey
  // The scenes to review: the whole book, or the open scene.
  slots: Slot[]
  sheet: StyleSheet
  names: string[]
  onClose: () => void
  // Scenes whose text was saved, so an open one can be reloaded.
  onApplied: (slotIds: string[]) => void
}

interface SceneText {
  slot: Slot
  draft: { content: string; genre: string; focusMode: string }
}

interface Occurrence {
  key: string
  scene: SceneText
  finding: StyleFinding
}

type Phase =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'review' }
  | { kind: 'saving'; step: string }
  | { kind: 'done'; scenes: number; fixes: number }
  | { kind: 'error'; message: string }

// Rules where a person should look at each case before fixing: they start unticked.
const judgementRules = new Set([typographyRuleId('repeatedWords'), typographyRuleId('porQueEnd')])
const LIST_LIMIT = 200
const plural = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`
const visible = (text: string) => (/^\s+$/.test(text) ? text.replace(/ /g, '·') : text)

/** The words around a fix, with the change shown as struck and inserted text. */
function Change({ text, finding }: { text: string; finding: StyleFinding }) {
  const before = text.slice(Math.max(0, finding.start - 40), finding.start).replace(/\s+/g, ' ')
  const after = text.slice(finding.end, finding.end + 40).replace(/\s+/g, ' ')
  return (
    <span className="copyedit-change">
      {finding.start > 40 ? '…' : ''}
      {before}
      <del>{visible(finding.match)}</del>
      <ins>{visible(finding.replacement ?? '') || '∅'}</ins>
      {after}
      {finding.end + 40 < text.length ? '…' : ''}
    </span>
  )
}

/**
 * Copyediting across the book with the style sheet's rules: every
 * occurrence that has an exact fix is listed by rule, the reviewer unticks
 * what should stay, and only then are the scenes changed. A version of the
 * text is saved first.
 */
export function CopyeditModal({ projectId, projectKey, slots, sheet, names, onClose, onApplied }: CopyeditModalProps) {
  const [scanned] = useState(slots)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', done: 0, total: slots.length })
  const [scenes, setScenes] = useState<SceneText[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [openRule, setOpenRule] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    const ordered = orderScenes(scanned)
    const loaded: Array<SceneText | null> = new Array(ordered.length).fill(null)
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
          loaded[index] = {
            slot,
            draft: { content: draft.content ?? '', genre: draft.genre ?? '', focusMode: draft.focusMode ?? 'GENERAL' },
          }
        }
        done += 1
        if (isCurrent) setPhase({ kind: 'loading', done, total: ordered.length })
      }
    }
    Promise.all(Array.from({ length: Math.min(6, ordered.length) }, worker))
      .then(() => {
        if (!isCurrent) return
        setScenes(loaded.filter((scene): scene is SceneText => scene !== null))
        setPhase({ kind: 'review' })
      })
      .catch((reason) => {
        if (isCurrent) setPhase({ kind: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível ler as cenas.' })
      })
    return () => {
      isCurrent = false
    }
  }, [projectKey, scanned])

  // Findings with an exact fix, by rule; the rest need the reviewer's hand.
  const { groups, manual } = useMemo(() => {
    const byRule = new Map<string, { label: string; category: string; message: string; items: Occurrence[] }>()
    let withoutFix = 0
    for (const scene of scenes) {
      for (const finding of checkScene(scene.draft.content, sheet, { slotId: scene.slot.id, names })) {
        if (finding.isException) continue
        if (finding.replacement === null || finding.replacement === finding.match) {
          withoutFix += 1
          continue
        }
        const group = byRule.get(finding.ruleId) ?? { label: finding.label, category: finding.category, message: finding.message, items: [] }
        group.items.push({ key: `${scene.slot.id}:${finding.key}`, scene, finding })
        byRule.set(finding.ruleId, group)
      }
    }
    return { groups: [...byRule], manual: withoutFix }
  }, [scenes, sheet, names])

  // Judgement rules start unticked, once, when the list first appears.
  const [seeded, setSeeded] = useState(false)
  if (!seeded && phase.kind === 'review') {
    setSeeded(true)
    setExcluded(new Set(groups.filter(([ruleId]) => judgementRules.has(ruleId)).flatMap(([, group]) => group.items.map((item) => item.key))))
  }

  const chosen = groups.flatMap(([, group]) => group.items).filter((item) => !excluded.has(item.key))
  const scenesChosen = new Set(chosen.map((item) => item.scene.slot.id)).size

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
    const byScene = new Map<string, Occurrence[]>()
    for (const item of chosen) byScene.set(item.scene.slot.id, [...(byScene.get(item.scene.slot.id) ?? []), item])
    const saved: string[] = []
    try {
      setPhase({ kind: 'saving', step: 'Guardando uma versão do texto de antes…' })
      await saveVersion(projectId, projectKey, 'COPYEDIT', 'Antes da revisão ortotipográfica')
      let index = 0
      for (const items of byScene.values()) {
        index += 1
        const scene = items[0].scene
        setPhase({ kind: 'saving', step: `Corrigindo as cenas: ${index} de ${byScene.size}` })
        const content = applyReplacements(
          scene.draft.content,
          items.map(({ finding }) => ({ start: finding.start, end: finding.end, replacement: finding.replacement! })),
        )
        await api.saveSceneContent(scene.slot.id, await encryptSceneDraft(projectKey, { ...scene.draft, content }))
        saved.push(scene.slot.id)
      }
      setPhase({ kind: 'done', scenes: saved.length, fixes: chosen.length })
    } catch (reason) {
      setPhase({
        kind: 'error',
        message: `${reason instanceof Error ? reason.message : 'Não foi possível salvar.'} ${
          saved.length ? `${plural(saved.length, 'cena já foi corrigida', 'cenas já foram corrigidas')}; a versão de antes está em Versões.` : 'Nada foi alterado.'
        }`,
      })
    } finally {
      if (saved.length) onApplied(saved)
    }
  }

  const isSingleScene = scanned.length === 1

  return (
    <div className="modal-backdrop">
      <section aria-labelledby="copyedit-title" aria-modal="true" className="modal linebreak-modal copyedit-modal" role="dialog">
        <p className="eyebrow">Folha de estilo</p>
        <h2 id="copyedit-title">{isSingleScene ? 'Corrigir esta cena' : 'Revisão ortotipográfica'}</h2>
        <p>
          As regras ativas da folha de estilo, com a correção exata de cada ocorrência. Desmarque o que deve ficar como
          está (falas com erro proposital, citações, nomes) e só então corrija. Uma versão do texto é guardada antes.
        </p>

        {phase.kind === 'loading' && (
          <div className="linebreak-progress" role="status">
            <span>
              Lendo as cenas · {phase.done} de {phase.total}
            </span>
            <div aria-hidden="true">
              <span style={{ width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        {phase.kind === 'saving' && (
          <p className="linebreak-done" role="status">
            {phase.step}
          </p>
        )}
        {phase.kind === 'error' && <p className="form-message">{phase.message}</p>}
        {phase.kind === 'done' && (
          <p className="linebreak-done" role="status">
            {plural(phase.fixes, 'correção feita', 'correções feitas')} em {plural(phase.scenes, 'cena', 'cenas')}. O texto
            de antes ficou em Versões.
          </p>
        )}

        {phase.kind === 'review' && groups.length === 0 && (
          <p className="linebreak-done">
            Nada a corrigir automaticamente{isSingleScene ? ' nesta cena' : ' na obra'}.
            {manual > 0 && ` ${plural(manual, 'apontamento pede', 'apontamentos pedem')} sua decisão na aba Estilo.`}
          </p>
        )}

        {phase.kind === 'review' && groups.length > 0 && (
          <>
            <div className="linebreak-summary">
              <strong>
                {plural(chosen.length, 'correção marcada', 'correções marcadas')} em {plural(scenesChosen, 'cena', 'cenas')}
              </strong>
              <span>
                <button className="text-button" type="button" onClick={() => setExcluded(new Set())}>
                  Marcar todas
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setExcluded(new Set(groups.flatMap(([, group]) => group.items.map((item) => item.key))))}
                >
                  Desmarcar todas
                </button>
              </span>
            </div>
            <ul className="linebreak-scenes">
              {groups.map(([ruleId, group]) => {
                const keys = group.items.map((item) => item.key)
                const on = keys.filter((key) => !excluded.has(key)).length
                const isOpen = openRule === ruleId
                return (
                  <li key={ruleId}>
                    <div className="linebreak-scene-head">
                      <input
                        aria-label={`Corrigir ${group.label}`}
                        checked={on > 0}
                        ref={(input) => {
                          if (input) input.indeterminate = on > 0 && on < keys.length
                        }}
                        type="checkbox"
                        onChange={(event) => toggle(keys, event.target.checked)}
                      />
                      <button aria-expanded={isOpen} type="button" onClick={() => setOpenRule(isOpen ? null : ruleId)}>
                        <span className="linebreak-scene-number">{group.category}</span>
                        <span className="linebreak-scene-title">
                          {group.label}
                          {judgementRules.has(ruleId) && <small className="copyedit-judgement"> · confira um a um</small>}
                        </span>
                        <span className="linebreak-count">{on === keys.length ? keys.length : `${on} de ${keys.length}`}</span>
                      </button>
                    </div>
                    {isOpen && (
                      <ol className="linebreak-list copyedit-list">
                        {group.items.slice(0, LIST_LIMIT).map((item) => (
                          <li className={excluded.has(item.key) ? 'is-off' : undefined} key={item.key}>
                            <label>
                              <input
                                checked={!excluded.has(item.key)}
                                type="checkbox"
                                onChange={(event) => toggle([item.key], event.target.checked)}
                              />
                              <span>
                                {!isSingleScene && (
                                  <small className="copyedit-scene">
                                    {sceneNumberLabel(item.scene.slot)} · {sceneTitle(item.scene.slot)}
                                  </small>
                                )}
                                <Change finding={item.finding} text={item.scene.draft.content} />
                              </span>
                            </label>
                          </li>
                        ))}
                        {group.items.length > LIST_LIMIT && (
                          <li className="linebreak-more">
                            e mais {plural(group.items.length - LIST_LIMIT, 'ocorrência', 'ocorrências')}, que seguem a marcação da regra.
                          </li>
                        )}
                      </ol>
                    )}
                  </li>
                )
              })}
            </ul>
            {manual > 0 && (
              <p className="copyedit-manual">
                {plural(manual, 'outro apontamento não tem', 'outros apontamentos não têm')} correção automática (termos a
                evitar, limites, números por extenso): ficam na aba Estilo de cada cena.
              </p>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="button button-secondary" disabled={phase.kind === 'saving'} type="button" onClick={onClose}>
            {phase.kind === 'done' ? 'Fechar' : 'Cancelar'}
          </button>
          {phase.kind === 'review' && groups.length > 0 && (
            <button className="button button-primary" disabled={chosen.length === 0} type="button" onClick={() => void apply()}>
              Corrigir {plural(chosen.length, 'ocorrência', 'ocorrências')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
