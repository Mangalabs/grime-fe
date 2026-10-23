import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { UsageSummary } from '../../api/contracts'
import {
  formatWords,
  usageFeatureDescriptions,
  usageFeatureLabels,
  usageFeatureOrder,
} from '../../features/usage/usage'
import '../Modal.css'
import './Usage.css'
import { UsageMeter } from './UsageMeter'

export function UsageDialog({ usage, onClose }: { usage: UsageSummary; onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const largest = Math.max(1, ...usageFeatureOrder.map((feature) => usage.byFeature[feature]))

  // Portaled: the top bar's backdrop blur would otherwise trap a fixed overlay inside it.
  return createPortal(
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="usage-title" aria-modal="true" className="modal usage-dialog" role="dialog">
        <p className="eyebrow">Sua conta</p>
        <h2 id="usage-title">Uso deste mês</h2>

        <UsageMeter usage={usage} />

        <h3 className="usage-section-title">Por recurso</h3>
        <ul className="usage-breakdown">
          {usageFeatureOrder.map((feature) => (
            <li key={feature}>
              <div className="usage-breakdown-head">
                <strong>{usageFeatureLabels[feature]}</strong>
                <span>{formatWords(usage.byFeature[feature])}</span>
              </div>
              <div className="usage-bar is-thin" aria-hidden="true">
                <span style={{ width: `${(usage.byFeature[feature] / largest) * 100}%` }} />
              </div>
              <p>{usageFeatureDescriptions[feature]}</p>
            </li>
          ))}
        </ul>

        <div className="usage-explainer">
          <strong>Como contamos</strong>
          <p>
            Cada recurso conta as palavras do seu texto que lê. Analisar uma cena de 1.000 palavras usa 2.000: o
            Revisor e o Arquivista leem a cena inteira. Se uma análise falha, as palavras voltam para o seu limite.
          </p>
        </div>

        <div className="modal-actions">
          <button autoFocus className="button button-primary" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
