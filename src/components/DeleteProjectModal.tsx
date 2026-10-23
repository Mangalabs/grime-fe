import { useState } from 'react'
import './DeleteProjectModal.css'
import './Modal.css'
import { api } from '../api/client'

export function DeleteProjectModal({
  projectId,
  onClose,
  onDeleted,
}: {
  projectId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  async function deleteProject() {
    setIsDeleting(true)
    setError('')
    try {
      await api.deleteProject(projectId, password)
      onDeleted()
    } catch {
      setError('Não foi possível excluir o projeto. Confira a senha e tente novamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true">
        <p className="eyebrow">Excluir projeto</p>
        <h2>Confirmar exclusão</h2>
        <p>Esta ação exclui permanentemente o projeto e seus dados.</p>
        <label>
          <span>Senha do projeto</span>
          <input
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>

        {error && <p className="form-message">{error}</p>}
        <div className="modal-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={!password || isDeleting}
            type="button"
            onClick={() => void deleteProject()}
          >
            {isDeleting ? 'Excluindo…' : 'Excluir projeto'}
          </button>
        </div>
      </section>
    </div>
  )
}
