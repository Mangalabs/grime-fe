import { type FormEvent, useState } from 'react'
import './Modal.css'
import type { ProjectEntity } from '../api/contracts'

interface EntityReconciliationDialogProps {
  entity: ProjectEntity
  mergeCandidates: ProjectEntity[]
  onClose: () => void
  onMerge: (sourceAliasId: string) => Promise<void>
  onSplit: (names: string[]) => Promise<void>
}

export function EntityReconciliationDialog({
  entity,
  mergeCandidates,
  onClose,
  onMerge,
  onSplit,
}: EntityReconciliationDialogProps) {
  const [mergeSourceId, setMergeSourceId] = useState('')
  const [splitNames, setSplitNames] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function run(action: () => Promise<void>, fallback: string) {
    setIsSaving(true)
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback)
    } finally {
      setIsSaving(false)
    }
  }

  function submitMerge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!mergeSourceId) return
    void run(() => onMerge(mergeSourceId), 'Não foi possível unir as entidades.')
  }

  function submitSplit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const names = splitNames
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    if (names.length < 2) {
      setError('Informe pelo menos dois nomes, separados por vírgulas.')
      return
    }
    void run(() => onSplit(names), 'Não foi possível separar a entidade.')
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="reconciliation-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <p className="eyebrow">Reconciliar entidade</p>
        <h2 id="reconciliation-title">{entity.name}</h2>
        <p>
          Una um nome duplicado como apelido desta entidade, ou separe-a quando
          o Arquivista aglutinou sujeitos diferentes.
        </p>

        <form className="reconciliation-form" onSubmit={submitMerge}>
          <label>
            <span>Unir como apelido</span>
            <select
              value={mergeSourceId}
              onChange={(event) => setMergeSourceId(event.target.value)}
              disabled={isSaving}
            >
              <option value="">Selecione uma entidade</option>
              {mergeCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                  {candidate.canonicalId ? ' (alias)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-secondary"
            type="submit"
            disabled={!mergeSourceId || isSaving}
          >
            Unir nesta entidade
          </button>
        </form>

        <form className="reconciliation-form" onSubmit={submitSplit}>
          <label>
            <span>Separar em nomes</span>
            <input
              value={splitNames}
              placeholder="Ex.: Aurèle, Julien"
              onChange={(event) => setSplitNames(event.target.value)}
              disabled={isSaving}
            />
          </label>
          <button
            className="button button-secondary"
            type="submit"
            disabled={!splitNames.trim() || isSaving}
          >
            Separar entidade
          </button>
        </form>

        {error && <p className="form-message">{error}</p>}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>
    </div>
  )
}
