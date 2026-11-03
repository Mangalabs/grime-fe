import { useMemo, useState } from 'react'
import '../Modal.css'
import '../LineBreakRepairModal.css'
import './CopyeditModal.css'
import { api } from '../../api/client'
import type { Slot } from '../../api/contracts'
import { encryptSceneDraft } from '../../crypto/projectEncryption'
import { sceneNumberLabel, sceneTitle } from '../../features/scenes/sceneStatus'
import { applyReplacements } from '../../features/style/ptBr'
import { checkScene, typographyRuleId, type StyleFinding, type StyleSheet } from '../../features/style/styleSheet'
import { plural } from '../../features/text/plural'
import { saveVersion } from '../../features/versions/versions'
import { ReviewGroup, ReviewItem, ReviewProgress, ReviewSummary } from '../review/BatchReview'
import { useExclusions, useSceneDrafts, type LoadedScene } from '../review/useBatchReview'

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

interface Occurrence {
  key: string
  scene: LoadedScene
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
  const [isSingleScene] = useState(slots.length === 1)
  const load = useSceneDrafts(slots, projectKey)
  // Saving and after; until then the phase follows the loading.
  const [applying, setApplying] = useState<Extract<Phase, { kind: 'saving' | 'done' | 'error' }> | null>(null)
  const phase: Phase = applying ?? (load.kind === 'ready' ? { kind: 'review' } : load)
  const scenes = useMemo(() => (load.kind === 'ready' ? load.scenes : []), [load])
  const { excluded, setExcluded, toggle } = useExclusions()
  const [openRule, setOpenRule] = useState<string | null>(null)

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

  async function apply() {
    const byScene = new Map<string, Occurrence[]>()
    for (const item of chosen) byScene.set(item.scene.slot.id, [...(byScene.get(item.scene.slot.id) ?? []), item])
    const saved: string[] = []
    try {
      setApplying({ kind: 'saving', step: 'Guardando uma versão do texto de antes…' })
      await saveVersion(projectId, projectKey, 'COPYEDIT', 'Antes da revisão ortotipográfica')
      let index = 0
      for (const items of byScene.values()) {
        index += 1
        const scene = items[0].scene
        setApplying({ kind: 'saving', step: `Corrigindo as cenas: ${index} de ${byScene.size}` })
        const content = applyReplacements(
          scene.draft.content,
          items.map(({ finding }) => ({ start: finding.start, end: finding.end, replacement: finding.replacement! })),
        )
        await api.saveSceneContent(scene.slot.id, await encryptSceneDraft(projectKey, { ...scene.draft, content }))
        saved.push(scene.slot.id)
      }
      setApplying({ kind: 'done', scenes: saved.length, fixes: chosen.length })
    } catch (reason) {
      setApplying({
        kind: 'error',
        message: `${reason instanceof Error ? reason.message : 'Não foi possível salvar.'} ${
          saved.length ? `${plural(saved.length, 'cena já foi corrigida', 'cenas já foram corrigidas')}; a versão de antes está em Versões.` : 'Nada foi alterado.'
        }`,
      })
    } finally {
      if (saved.length) onApplied(saved)
    }
  }

  return (
    <div className="modal-backdrop">
      <section aria-labelledby="copyedit-title" aria-modal="true" className="modal linebreak-modal copyedit-modal" role="dialog">
        <p className="eyebrow">Folha de estilo</p>
        <h2 id="copyedit-title">{isSingleScene ? 'Corrigir esta cena' : 'Revisão ortotipográfica'}</h2>
        <p>
          As regras ativas da folha de estilo, com a correção exata de cada ocorrência. Desmarque o que deve ficar como
          está (falas com erro proposital, citações, nomes) e só então corrija. Uma versão do texto é guardada antes.
        </p>

        {phase.kind === 'loading' && <ReviewProgress done={phase.done} label="Lendo as cenas" total={phase.total} />}
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
            <ReviewSummary
              onAll={() => setExcluded(new Set())}
              onNone={() => setExcluded(new Set(groups.flatMap(([, group]) => group.items.map((item) => item.key))))}
            >
              {plural(chosen.length, 'correção marcada', 'correções marcadas')} em {plural(scenesChosen, 'cena', 'cenas')}
            </ReviewSummary>
            <ul className="linebreak-scenes">
              {groups.map(([ruleId, group]) => {
                const keys = group.items.map((item) => item.key)
                const on = keys.filter((key) => !excluded.has(key)).length
                const isOpen = openRule === ruleId
                return (
                  <ReviewGroup
                    checkLabel={`Corrigir ${group.label}`}
                    isOpen={isOpen}
                    key={ruleId}
                    kicker={group.category}
                    on={on}
                    title={
                      <>
                        {group.label}
                        {judgementRules.has(ruleId) && <small className="copyedit-judgement"> · confira um a um</small>}
                      </>
                    }
                    total={keys.length}
                    onCheck={(checked) => toggle(keys, checked)}
                    onOpen={() => setOpenRule(isOpen ? null : ruleId)}
                  >
                    <ol className="linebreak-list copyedit-list">
                      {group.items.slice(0, LIST_LIMIT).map((item) => (
                        <ReviewItem isOn={!excluded.has(item.key)} key={item.key} onCheck={(checked) => toggle([item.key], checked)}>
                          {!isSingleScene && (
                            <small className="copyedit-scene">
                              {sceneNumberLabel(item.scene.slot)} · {sceneTitle(item.scene.slot)}
                            </small>
                          )}
                          <Change finding={item.finding} text={item.scene.draft.content} />
                        </ReviewItem>
                      ))}
                      {group.items.length > LIST_LIMIT && (
                        <li className="linebreak-more">
                          e mais {plural(group.items.length - LIST_LIMIT, 'ocorrência', 'ocorrências')}, que seguem a marcação da regra.
                        </li>
                      )}
                    </ol>
                  </ReviewGroup>
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
