import { useEffect, useState } from 'react'
import './Modal.css'

interface MergeDialogProps {
  title: string
  nextTitle: string
  onConfirm: (title: string) => Promise<void>
  onClose: () => void
}

/** Confirms joining the open scene with the next one in the timeline. */
export function MergeDialog({ title, nextTitle, onConfirm, onClose }: MergeDialogProps) {
  const [mergedTitle, setMergedTitle] = useState(title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [busy, onClose])

  async function confirm() {
    if (!mergedTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm(mergedTitle.trim())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível juntar as cenas.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <section
        aria-labelledby="merge-title"
        aria-modal="true"
        className="modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Estrutura</p>
        <h2 id="merge-title">Juntar com a próxima cena</h2>
        <p>
          O texto de <strong>“{nextTitle}”</strong> vai para o fim de <strong>“{title}”</strong>, e a
          cena seguinte deixa de existir. Fatos, alertas, notas e diagnósticos passam para a cena
          juntada.
        </p>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault()
            void confirm()
          }}
        >
          <label>
            <span>Título da cena juntada</span>
            <input autoFocus value={mergedTitle} onChange={(event) => setMergedTitle(event.target.value)} />
          </label>
          {error && <p className="form-message">{error}</p>}
          <div className="modal-actions">
            <button className="button button-secondary" disabled={busy} type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="button button-primary" disabled={busy || !mergedTitle.trim()} type="submit">
              {busy ? 'Juntando…' : 'Juntar cenas'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
