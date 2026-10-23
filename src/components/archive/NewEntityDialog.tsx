import { useEffect, useState } from 'react'
import { factEntityTypes, type FactEntityType } from '../../api/contracts'
import { entityTypeLabel } from '../../features/archive/entityModel'
import '../Modal.css'

interface NewEntityDialogProps {
  initialType: FactEntityType
  // Rejects with a message to show when the entity can't be created.
  onCreate: (name: string, type: FactEntityType) => Promise<void>
  onClose: () => void
}

/** Adds an entity by hand, e.g. to plan a character before writing it. */
export function NewEntityDialog({ initialType, onCreate, onClose }: NewEntityDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<FactEntityType>(initialType)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [busy, onClose])

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(name.trim(), type)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a entidade.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <section
        aria-labelledby="new-entity-title"
        aria-modal="true"
        className="modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Arquivo</p>
        <h2 id="new-entity-title">Nova entidade</h2>
        <p>
          Para planejar antes de escrever. Quando uma cena analisada citar exatamente este nome, os fatos dela
          passam a ser desta entidade.
        </p>
        <form
          className="modal-form new-entity-form"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <label>
            <span>Nome</span>
            <input autoFocus maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Tipo</span>
            <select value={type} onChange={(event) => setType(event.target.value as FactEntityType)}>
              {factEntityTypes.map((item) => (
                <option key={item} value={item}>
                  {entityTypeLabel(item)}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="form-message">{error}</p>}
          <div className="modal-actions">
            <button className="button button-secondary" disabled={busy} type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="button button-primary" disabled={busy || !name.trim()} type="submit">
              {busy ? 'Criando…' : 'Criar e abrir a ficha'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
