import { useEffect, useState, type FormEvent } from 'react'
import './Modal.css'
import { ApiError, api } from '../api/client'
import { resetProjectPassword, unlockProjectKey } from '../crypto/projectEncryption'
import {
  readRememberPreference,
  recallProjectKey,
  rememberProjectKey,
  writeRememberPreference,
} from '../crypto/projectKeyCache'

type Mode = 'unlock' | 'recover' | 'recovered'

export function ProjectUnlockModal({
  projectId,
  onClose,
  onUnlocked,
}: {
  projectId: string
  onClose: () => void
  onUnlocked: (projectId: string, projectKey: CryptoKey) => void
}) {
  const [mode, setMode] = useState<Mode>('unlock')
  const [password, setPassword] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [recoveredKey, setRecoveredKey] = useState<CryptoKey | null>(null)
  const [error, setError] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [remember, setRemember] = useState(readRememberPreference)
  // A project unlocked recently on this browser opens without asking.
  const [isRecalling, setIsRecalling] = useState(true)

  useEffect(() => {
    let isCurrent = true
    void recallProjectKey(projectId).then((key) => {
      if (!isCurrent) return
      if (key) onUnlocked(projectId, key)
      else setIsRecalling(false)
    })
    return () => {
      isCurrent = false
    }
    // Only when the modal opens for a project, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function open(key: CryptoKey) {
    writeRememberPreference(remember)
    if (remember) await rememberProjectKey(projectId, key)
    onUnlocked(projectId, key)
  }

  const mismatch = confirmation.length > 0 && confirmation !== newPassword
  const canRecover = recoveryKey.trim() !== '' && newPassword !== '' && confirmation === newPassword

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
  }

  async function unlock(event: FormEvent) {
    event.preventDefault()
    if (!password || isWorking) return
    setIsWorking(true)
    setError('')
    try {
      const envelope = await api.getProjectEncryption(projectId)
      await open(await unlockProjectKey(password, envelope))
    } catch {
      setError('Não foi possível desbloquear o projeto. Confira a senha e tente novamente.')
    } finally {
      setIsWorking(false)
    }
  }

  async function recover(event: FormEvent) {
    event.preventDefault()
    if (!canRecover || isWorking) return
    setIsWorking(true)
    setError('')
    const key = recoveryKey.trim()
    try {
      const envelope = await api.getProjectEncryption(projectId)
      let result: Awaited<ReturnType<typeof resetProjectPassword>>
      try {
        // Checked here first: a wrong key fails before anything is sent.
        result = await resetProjectPassword(key, newPassword, envelope)
      } catch {
        setError('Esta chave de recuperação não abre o projeto. Confira se copiou a chave inteira.')
        return
      }
      await api.resetProjectPassword(projectId, { recoveryKey: key, ...result.passwordEncryption })
      setRecoveredKey(result.projectKey)
      setMode('recovered')
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 429
          ? 'Muitas tentativas. Aguarde um minuto e tente novamente.'
          : reason instanceof ApiError && reason.status === 400
            ? reason.message
            : 'Não foi possível redefinir a senha. Tente novamente.',
      )
    } finally {
      setIsWorking(false)
    }
  }

  if (isRecalling) return null

  const rememberField = (
    <label className="modal-remember">
      <input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
      <span>
        Lembrar este projeto neste navegador por 1 dia
        <small>Não use em computadores compartilhados. Sair da conta esquece todos os projetos.</small>
      </span>
    </label>
  )

  return (
    <div className="modal-backdrop">
      <section aria-labelledby="unlock-project-title" aria-modal="true" className="modal" role="dialog">
        {mode === 'unlock' && (
          <form onSubmit={(event) => void unlock(event)}>
            <p className="eyebrow">Projeto protegido</p>
            <h2 id="unlock-project-title">Desbloquear projeto</h2>
            <label className="modal-field">
              <span>Senha do projeto</span>
              <input autoFocus onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
            </label>
            {rememberField}
            <button className="text-button modal-link" type="button" onClick={() => switchMode('recover')}>
              Esqueci a senha do projeto
            </button>
            {error && <p className="form-message">{error}</p>}
            <div className="modal-actions">
              <button className="button button-secondary" onClick={onClose} type="button">Cancelar</button>
              <button className="button button-primary" disabled={!password || isWorking} type="submit">
                {isWorking ? 'Desbloqueando…' : 'Desbloquear'}
              </button>
            </div>
          </form>
        )}

        {mode === 'recover' && (
          <form onSubmit={(event) => void recover(event)}>
            <p className="eyebrow">Recuperar acesso</p>
            <h2 id="unlock-project-title">Criar uma nova senha</h2>
            <p>
              Use a chave privada de recuperação que você guardou ao criar o projeto. Ela continua valendo depois
              da troca.
            </p>
            <label className="modal-field">
              <span>Chave de recuperação</span>
              <input
                autoComplete="off"
                autoFocus
                className="recovery-key-input"
                onChange={(event) => setRecoveryKey(event.target.value)}
                placeholder="Cole a chave inteira"
                spellCheck={false}
                value={recoveryKey}
              />
            </label>
            <label className="modal-field">
              <span>Nova senha do projeto</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
              />
            </label>
            <label className="modal-field">
              <span>Confirme a nova senha</span>
              <input
                aria-invalid={mismatch || undefined}
                autoComplete="new-password"
                onChange={(event) => setConfirmation(event.target.value)}
                type="password"
                value={confirmation}
              />
            </label>
            {mismatch && <p className="form-message">As senhas não coincidem.</p>}
            {error && <p className="form-message">{error}</p>}
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => switchMode('unlock')} type="button">
                Voltar
              </button>
              <button className="button button-primary" disabled={!canRecover || isWorking} type="submit">
                {isWorking ? 'Redefinindo…' : 'Redefinir senha'}
              </button>
            </div>
          </form>
        )}

        {mode === 'recovered' && recoveredKey && (
          <>
            <p className="eyebrow">Acesso recuperado</p>
            <h2 id="unlock-project-title">Senha redefinida</h2>
            <p>
              A nova senha já vale para abrir e excluir o projeto. A chave de recuperação continua a mesma:
              mantenha-a guardada.
            </p>
            {rememberField}
            <div className="modal-actions">
              <button
                autoFocus
                className="button button-primary"
                type="button"
                onClick={() => void open(recoveredKey)}
              >
                Abrir o projeto
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
