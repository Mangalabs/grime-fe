import { useEffect, useRef, useState } from 'react'
import type { StyleFinding } from '../features/style/styleSheet'
import './StyleFindings.css'

interface StyleFindingsProps {
  findings: StyleFinding[]
  isLoading: boolean
  hasSlot: boolean
  showMarks: boolean
  focusKey: string | null
  busyKey: string | null
  onToggleMarks: (show: boolean) => void
  onLocate: (finding: StyleFinding) => void
  onToggleException: (finding: StyleFinding) => void
  onOpenSheet: () => void
}

const PREVIEW = 4

/** The text around an occurrence, with the occurrence itself marked. */
function Context({ finding }: { finding: StyleFinding }) {
  const index = finding.context.indexOf(finding.match)
  if (index < 0) return <>{finding.context}</>
  const before = finding.context.slice(0, index)
  const after = finding.context.slice(index + finding.match.length)
  const visible = (text: string) => text.replace(/ /g, '·')
  return (
    <>
      {before.length >= 24 ? '…' : ''}
      {before}
      {/* Spaces are shown, so "double space" findings are visible. */}
      <mark>{/^\s+$/.test(finding.match) ? visible(finding.match) : finding.match}</mark>
      {after}
      {after.length >= 24 ? '…' : ''}
    </>
  )
}

/**
 * The "Estilo" tab of the Revisor card: occurrences of the project's style
 * sheet in this scene, grouped by rule.
 */
export function StyleFindings({
  findings,
  isLoading,
  hasSlot,
  showMarks,
  focusKey,
  busyKey,
  onToggleMarks,
  onLocate,
  onToggleException,
  onOpenSheet,
}: StyleFindingsProps) {
  const [showKept, setShowKept] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)

  const kept = findings.filter((finding) => finding.isException)
  const visible = showKept ? findings : findings.filter((finding) => !finding.isException)
  const groups = new Map<string, StyleFinding[]>()
  for (const finding of visible) groups.set(finding.ruleId, [...(groups.get(finding.ruleId) ?? []), finding])

  // A click on a mark in the text opens its group and scrolls to it.
  const focusedRule = findings.find((finding) => finding.key === focusKey)?.ruleId
  useEffect(() => {
    if (!focusKey) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-style-key="${CSS.escape(focusKey)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusKey, focusedRule])

  if (!hasSlot) {
    return <p className="empty-state">A folha de estilo é verificada nas cenas salvas.</p>
  }
  if (isLoading) {
    return <p className="empty-state">Abrindo a folha de estilo…</p>
  }

  return (
    <div className="style-findings">
      <div className="style-toolbar">
        <label className="checkbox-label">
          <input checked={showMarks} type="checkbox" onChange={(event) => onToggleMarks(event.target.checked)} />
          <span>Marcar no texto</span>
        </label>
        <button className="text-button" type="button" onClick={onOpenSheet}>
          Editar folha de estilo
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <strong>{kept.length ? 'Só ocorrências mantidas' : 'Nada fora da folha de estilo'}</strong>
          <p>
            {kept.length
              ? 'As ocorrências desta cena foram marcadas como intencionais.'
              : 'Esta cena segue as regras de grafia, vocabulário e tipografia do projeto.'}
          </p>
        </div>
      ) : (
        <div className="style-groups" ref={listRef}>
          {[...groups].map(([ruleId, items]) => {
            const first = items[0]
            const isOpen = expanded.has(ruleId) || ruleId === focusedRule
            const shown = isOpen ? items : items.slice(0, PREVIEW)
            return (
              <section className="style-group" key={ruleId}>
                <header>
                  <span className="style-category">{first.category}</span>
                  <h3>{first.label}</h3>
                  <span className="style-count">{items.length}</span>
                </header>
                <p className="style-message">
                  {first.message}
                  {first.note && <span className="style-note"> {first.note}</span>}
                </p>
                <ul>
                  {shown.map((finding) => (
                    <li
                      className={`style-item${finding.key === focusKey ? ' is-focused' : ''}${finding.isException ? ' is-kept' : ''}`}
                      data-style-key={finding.key}
                      key={finding.key}
                    >
                      <button className="style-context" type="button" onClick={() => onLocate(finding)}>
                        <Context finding={finding} />
                      </button>
                      <button
                        className="text-button style-keep"
                        disabled={busyKey === finding.key}
                        title={
                          finding.isException
                            ? 'Voltar a apontar esta ocorrência'
                            : 'Esta ocorrência é intencional: deixa de ser apontada aqui'
                        }
                        type="button"
                        onClick={() => onToggleException(finding)}
                      >
                        {finding.isException ? 'Mantida · desfazer' : 'Manter aqui'}
                      </button>
                    </li>
                  ))}
                </ul>
                {items.length > shown.length && (
                  <button
                    className="text-button style-more"
                    type="button"
                    onClick={() => setExpanded((current) => new Set(current).add(ruleId))}
                  >
                    Ver mais {items.length - shown.length}
                  </button>
                )}
              </section>
            )
          })}
        </div>
      )}

      {kept.length > 0 && (
        <button className="text-button style-show-kept" type="button" onClick={() => setShowKept(!showKept)}>
          {showKept ? 'Ocultar mantidas' : `Mostrar ${kept.length} mantida(s)`}
        </button>
      )}
    </div>
  )
}
