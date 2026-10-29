import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'

interface CanonApprovalBarProps {
  projectId: string
  // After a bulk approval, so the archive shows the new canon.
  onApproved: () => void
  onError: (message: string) => void
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`

/**
 * Whether the Arquivista's facts become canon on their own, and what is still
 * waiting from before. Hidden on backends without the setting.
 */
export function CanonApprovalBar({ projectId, onApproved, onError }: CanonApprovalBarProps) {
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null)
  const [pending, setPending] = useState<{ scenes: number; facts: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [settings, waiting] = await Promise.all([api.getCanonSettings(projectId), api.getPendingFacts(projectId)])
      setAutoApprove(settings.autoApproveFacts)
      setPending(waiting)
    } catch {
      // Older backend: approval stays scene by scene, as before.
      setAutoApprove(null)
    }
  }, [projectId])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  if (autoApprove === null) return null

  async function toggle(next: boolean) {
    setBusy(true)
    setDone(null)
    try {
      setAutoApprove((await api.saveCanonSettings(projectId, { autoApproveFacts: next })).autoApproveFacts)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível mudar a aprovação.')
    } finally {
      setBusy(false)
    }
  }

  async function approveAll() {
    setBusy(true)
    setDone(null)
    try {
      const result = await api.approvePendingFacts(projectId)
      setDone(
        `${plural(result.approvedFacts, 'fato aprovado', 'fatos aprovados')} em ${plural(result.scenes, 'cena', 'cenas')}${
          result.regressionAlerts ? ` · ${plural(result.regressionAlerts, 'alerta de revalidação', 'alertas de revalidação')}` : ''
        }.`,
      )
      await load()
      onApproved()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível aprovar os fatos pendentes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Aprovação dos fatos" className="canon-approval">
      <label className="canon-approval-switch">
        <input checked={autoApprove} disabled={busy} role="switch" type="checkbox" onChange={(event) => void toggle(event.target.checked)} />
        <span>
          <strong>Aprovar fatos automaticamente</strong>
          <small>
            {autoApprove
              ? 'O que o Arquivista extrai vira cânone ao fim de cada análise. Corrija ou remova pelo painel de fatos da cena.'
              : 'Os fatos de cada cena esperam a sua aprovação antes de entrar no cânone.'}
          </small>
        </span>
      </label>
      {pending && pending.scenes > 0 && (
        <div className="canon-approval-pending">
          <span>
            {plural(pending.facts, 'fato aguardando', 'fatos aguardando')} em {plural(pending.scenes, 'cena', 'cenas')}
          </span>
          <button className="button button-secondary button-small" disabled={busy} type="button" onClick={() => void approveAll()}>
            {busy ? 'Aprovando…' : 'Aprovar todos'}
          </button>
        </div>
      )}
      {done && (
        <p className="canon-approval-done" role="status">
          {done}
        </p>
      )}
    </section>
  )
}
