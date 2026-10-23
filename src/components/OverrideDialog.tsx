import { type FormEvent, useState } from 'react'
import './Modal.css'
import type { LinterDiagnostic } from '../api/contracts'

interface OverrideDialogProps {
  diagnostic: LinterDiagnostic
  onClose: () => void
  onSave: (justification: string) => Promise<void>
}

export function OverrideDialog({
  diagnostic,
  onClose,
  onSave,
}: OverrideDialogProps) {
  const [justification, setJustification] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!justification.trim()) {
      setError('Explique por que esta divergência é intencional.')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onSave(justification.trim())
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível registrar a exceção.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="override-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <p className="eyebrow">Override de continuidade</p>
        <h2 id="override-title">Registrar exceção intencional</h2>
        <p>
          O diagnóstico continua rastreável, mas esta divergência deixa de ser
          tratada como um erro de continuidade.
        </p>
        <blockquote>“{diagnostic.sourceQuote}”</blockquote>
        <form onSubmit={submit}>
          <label>
            <span>Justificativa</span>
            <textarea
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="Ex.: A personagem está mentindo deliberadamente."
              autoFocus
            />
          </label>
          {error && <p className="form-message">{error}</p>}
          <div className="modal-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="button button-primary" disabled={isSaving} type="submit">
              {isSaving ? 'Salvando…' : 'Salvar exceção'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
