import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './DiagnosticsPanel.css'
import './Modal.css'
import type {
  DiagnosticSeverity,
  DiagnosticType,
  LinterDiagnostic,
  Override,
} from '../api/contracts'
import { OverrideDialog } from './OverrideDialog'
import type { FocusedQuote } from './SceneEditor'

interface DiagnosticsPanelProps {
  diagnostics: LinterDiagnostic[]
  overrides: Override[]
  sceneText: string
  focusedQuote: FocusedQuote | null
  onLocateQuote: (quote: string) => void
  onSaveOverride: (signatureHash: string, justification: string) => Promise<void>
  onRemoveOverride: (signatureHash: string) => Promise<void>
  onDismiss: (signatureHash: string) => Promise<void>
  // The style sheet tab; absent when the backend has no style sheets.
  style?: {
    count: number
    content: ReactNode
  }
  tab: 'diagnostics' | 'style'
  onTabChange: (tab: 'diagnostics' | 'style') => void
}

const severityLabels: Record<DiagnosticSeverity, string> = {
  CRITICAL: 'Crítico',
  WARNING: 'Atenção',
  NOTE: 'Nota',
}

const severityIcons: Record<DiagnosticSeverity, string> = {
  CRITICAL: '●',
  WARNING: '▲',
  NOTE: '■',
}

const typeLabels: Record<DiagnosticType, string> = {
  CONTINUITY_BREAK: 'Quebra de continuidade',
  SHOW_TELL_IMBALANCE: 'Show x tell',
  PSYCHIC_DISTANCE_FILTER: 'Distância psíquica',
  WEAK_CAUSALITY: 'Causalidade fraca',
  FORCED_EXPOSITION: 'Exposição forçada',
  PROSE_MECHANICS: 'Mecânica de prosa',
  WHITE_ROOM_SYNDROME: 'Síndrome do quarto branco',
  OVERWRITING_CRUTCHES: 'Muletas e excesso de escrita',
  DIALOGUE_HOMOGENIZATION: 'Vozes homogêneas no diálogo',
}

export function DiagnosticsPanel({
  diagnostics,
  overrides,
  sceneText,
  focusedQuote,
  onLocateQuote,
  onSaveOverride,
  onRemoveOverride,
  onDismiss,
  style,
  tab,
  onTabChange,
}: DiagnosticsPanelProps) {
  const [severity, setSeverity] = useState<'ALL' | DiagnosticSeverity>('ALL')
  const [type, setType] = useState<'ALL' | DiagnosticType>('ALL')
  const [overrideTarget, setOverrideTarget] = useState<LinterDiagnostic | null>(
    null,
  )
  // The card asking "delete?", and the card whose request is in flight.
  const [confirmingDismiss, setConfirmingDismiss] = useState<string | null>(null)
  const [busyHash, setBusyHash] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const overrideFor = (diagnostic: LinterDiagnostic) =>
    overrides.find((item) => item.diagnosticSignatureHash === diagnostic.signatureHash)

  // Intentional exceptions go last: what still needs attention comes first.
  const filteredDiagnostics = useMemo(() => {
    const isIntentional = (diagnostic: LinterDiagnostic) =>
      overrides.some((item) => item.diagnosticSignatureHash === diagnostic.signatureHash)
    return diagnostics
      .filter(
        (diagnostic) =>
          (severity === 'ALL' || diagnostic.severity === severity) &&
          (type === 'ALL' || diagnostic.type === type),
      )
      .sort((a, b) => Number(isIntentional(a)) - Number(isIntentional(b)))
  }, [diagnostics, overrides, severity, type])
  const openCount = diagnostics.filter((diagnostic) => !overrideFor(diagnostic)).length

  async function runOnCard(signatureHash: string, action: () => Promise<void>) {
    setBusyHash(signatureHash)
    try {
      await action()
    } catch {
      // The review hook shows the error banner.
    } finally {
      setBusyHash(null)
    }
  }

  useEffect(() => {
    if (focusedQuote?.origin !== 'text') {
      return
    }
    const card = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[data-quote]') ?? []),
    ].find((element) => element.dataset.quote === focusedQuote.quote)
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusedQuote])

  return (
    <>
      <section className="panel diagnostics-panel" aria-labelledby="diagnostics-heading" data-tour="revisor">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Revisor</p>
            <h2 id="diagnostics-heading">Diagnósticos</h2>
          </div>
          {!style && <span className="count-badge">{openCount}</span>}
        </div>

        {style && (
          <div className="revisor-tabs" role="tablist" aria-label="Achados da cena">
            <button
              aria-controls="revisor-diagnostics"
              aria-selected={tab === 'diagnostics'}
              id="revisor-tab-diagnostics"
              role="tab"
              type="button"
              onClick={() => onTabChange('diagnostics')}
            >
              Análise <span className="count-badge">{openCount}</span>
            </button>
            <button
              aria-controls="revisor-style"
              aria-selected={tab === 'style'}
              id="revisor-tab-style"
              role="tab"
              title="Regras da folha de estilo do projeto"
              type="button"
              onClick={() => onTabChange('style')}
            >
              Estilo <span className="count-badge count-badge-quiet">{style.count}</span>
            </button>
          </div>
        )}

        {style && tab === 'style' ? (
          <div aria-labelledby="revisor-tab-style" id="revisor-style" role="tabpanel">
            {style.content}
          </div>
        ) : (
        <div aria-labelledby={style ? 'revisor-tab-diagnostics' : undefined} id="revisor-diagnostics" role={style ? 'tabpanel' : undefined}>
        <div className="filter-row">
          <label>
            <span className="sr-only">Filtrar por gravidade</span>
            <select
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as 'ALL' | DiagnosticSeverity)
              }
            >
              <option value="ALL">Todas as gravidades</option>
              {Object.entries(severityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por categoria</span>
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as 'ALL' | DiagnosticType)
              }
            >
              <option value="ALL">Todas as categorias</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {diagnostics.length === 0 ? (
          <EmptyDiagnostics />
        ) : filteredDiagnostics.length === 0 ? (
          <p className="empty-state">Nenhum diagnóstico corresponde aos filtros.</p>
        ) : (
          <div className="diagnostic-list" ref={listRef}>
            {filteredDiagnostics.map((diagnostic, index) => {
              const override = overrideFor(diagnostic)
              const signatureHash = diagnostic.signatureHash
              const isBusy = signatureHash !== undefined && busyHash === signatureHash
              const isLocatable =
                Boolean(diagnostic.sourceQuote.trim()) &&
                sceneText.includes(diagnostic.sourceQuote)
              const isActive = focusedQuote?.quote === diagnostic.sourceQuote
              return (
                <article
                  className={`diagnostic-card severity-${diagnostic.severity.toLowerCase()}${
                    isActive ? ' diagnostic-card-active' : ''
                  }${override ? ' diagnostic-card-intentional' : ''}`}
                  data-quote={diagnostic.sourceQuote}
                  key={`${diagnostic.type}-${index}`}
                >
                  <div className="diagnostic-meta">
                    <span className="severity-label">
                      <span aria-hidden="true">{severityIcons[diagnostic.severity]}</span>
                      {severityLabels[diagnostic.severity]}
                    </span>
                    <span>{typeLabels[diagnostic.type]}</span>
                  </div>
                  <p className="diagnostic-message">{diagnostic.message}</p>
                  {isLocatable ? (
                    <button
                      aria-label={`Localizar no texto: ${diagnostic.sourceQuote}`}
                      className="diagnostic-quote"
                      type="button"
                      onClick={() => onLocateQuote(diagnostic.sourceQuote)}
                    >
                      “{diagnostic.sourceQuote}”
                    </button>
                  ) : (
                    <blockquote className="diagnostic-quote">
                      “{diagnostic.sourceQuote}”
                      <small>Trecho não encontrado no texto atual.</small>
                    </blockquote>
                  )}
                  {diagnostic.correctionHint && (
                    <p className="diagnostic-hint">
                      <strong>Orientação</strong>
                      {diagnostic.correctionHint}
                    </p>
                  )}
                  {signatureHash &&
                    (override ? (
                      <div className="diagnostic-exception">
                        <p className="override-status">Exceção intencional registrada</p>
                        <p className="override-justification">{override.justification}</p>
                        <div className="diagnostic-actions">
                          <button
                            className="text-button"
                            disabled={isBusy}
                            type="button"
                            onClick={() => void runOnCard(signatureHash, () => onRemoveOverride(signatureHash))}
                          >
                            {isBusy ? 'Desfazendo…' : 'Desfazer exceção'}
                          </button>
                        </div>
                      </div>
                    ) : confirmingDismiss === signatureHash ? (
                      <div className="diagnostic-confirm" role="group" aria-label="Confirmar exclusão">
                        <p>Excluir este diagnóstico? Ele não volta nas próximas análises deste trecho.</p>
                        <div className="diagnostic-actions">
                          <button
                            className="button button-small button-secondary"
                            disabled={isBusy}
                            type="button"
                            onClick={() => setConfirmingDismiss(null)}
                          >
                            Cancelar
                          </button>
                          <button
                            autoFocus
                            className="button button-small button-danger"
                            disabled={isBusy}
                            type="button"
                            onClick={() =>
                              void runOnCard(signatureHash, async () => {
                                await onDismiss(signatureHash)
                                setConfirmingDismiss(null)
                              })
                            }
                          >
                            {isBusy ? 'Excluindo…' : 'Excluir'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="diagnostic-actions">
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => setOverrideTarget(diagnostic)}
                        >
                          Marcar como exceção intencional
                        </button>
                        <button
                          className="text-button destructive"
                          type="button"
                          onClick={() => setConfirmingDismiss(signatureHash)}
                        >
                          Excluir
                        </button>
                      </div>
                    ))}
                </article>
              )
            })}
          </div>
        )}
        </div>
        )}
      </section>
      {overrideTarget?.signatureHash && (
        <OverrideDialog
          diagnostic={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onSave={async (justification) => {
            await onSaveOverride(overrideTarget.signatureHash!, justification)
            setOverrideTarget(null)
          }}
        />
      )}
    </>
  )
}

function EmptyDiagnostics() {
  return (
    <div className="empty-state">
      <strong>Aguardando análise</strong>
      <p>Os achados rastreáveis do Linter aparecerão aqui.</p>
    </div>
  )
}
