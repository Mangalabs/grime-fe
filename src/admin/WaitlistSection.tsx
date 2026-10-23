import { useState } from "react";
import { admin } from "../api/client";
import type { AdminWaitlistEntry } from "../api/contracts";
import { formatDate, useAdminData } from "./adminData";
import { InviteCodeActions, StatusChip } from "./AdminParts";

type Filter = "WAITING" | "INVITED" | "REGISTERED" | "ALL";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "WAITING", label: "Aguardando" },
  { id: "INVITED", label: "Convidados" },
  { id: "REGISTERED", label: "Cadastrados" },
  { id: "ALL", label: "Todos" },
];

const statusChip: Record<AdminWaitlistEntry["status"], { tone: "neutral" | "good" | "warn"; label: string }> = {
  WAITING: { tone: "warn", label: "Aguardando" },
  INVITED: { tone: "neutral", label: "Convidado" },
  REGISTERED: { tone: "good", label: "Cadastrado" },
};

const loadWaitlist = () => admin.waitlist();

export function WaitlistSection() {
  const { data, setData, error, setError, reload } = useAdminData(loadWaitlist);
  const [filter, setFilter] = useState<Filter>("WAITING");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  // Just invited: stays in view with its code until the filter changes.
  const [justInvited, setJustInvited] = useState<Set<string>>(() => new Set());

  const entries = (data ?? []).filter(
    (entry) => filter === "ALL" || entry.status === filter || justInvited.has(entry.id),
  );
  const countOf = (id: Filter) => (data ?? []).filter((entry) => id === "ALL" || entry.status === id).length;

  async function invite(entry: AdminWaitlistEntry) {
    setBusyId(entry.id);
    try {
      const created = await admin.inviteFromWaitlist(entry.id);
      setJustInvited((current) => new Set(current).add(entry.id));
      setData((current) =>
        (current ?? []).map((item) =>
          item.id === entry.id
            ? { ...item, status: "INVITED", invite: { id: created.id, code: created.code, status: created.status } }
            : item,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o convite.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(entry: AdminWaitlistEntry) {
    setBusyId(entry.id);
    try {
      await admin.removeWaitlistEntry(entry.id);
      setConfirmingRemove(null);
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Administração</p>
        <h1>Lista de espera</h1>
        <p>
          Pessoas que pediram acesso na página de cadastro, na ordem em que chegaram. Convide, copie o código e
          envie você mesmo.
        </p>
      </header>

      <div className="admin-filters" role="tablist" aria-label="Filtrar lista de espera">
        {filters.map((option) => (
          <button
            aria-selected={filter === option.id}
            key={option.id}
            role="tab"
            type="button"
            onClick={() => {
              setFilter(option.id);
              setJustInvited(new Set());
            }}
          >
            {option.label} <span>{countOf(option.id)}</span>
          </button>
        ))}
      </div>

      {error && <p className="form-message">{error}</p>}
      {data && entries.length === 0 && <p className="empty-state">Ninguém por aqui.</p>}

      {entries.length > 0 && (
        <ul className="admin-cards">
          {entries.map((entry) => (
            <li className="admin-card" key={entry.id}>
              <div className="admin-card-head">
                <div>
                  <strong>{entry.name}</strong>
                  <span className="admin-muted">{entry.email}</span>
                </div>
                <StatusChip tone={statusChip[entry.status].tone}>{statusChip[entry.status].label}</StatusChip>
              </div>
              {entry.message && <p className="admin-card-message">“{entry.message}”</p>}
              <div className="admin-card-foot">
                <span className="admin-muted">Entrou em {formatDate(entry.createdAt)}</span>
                <div className="admin-card-actions">
                  {entry.status === "WAITING" && (
                    <button
                      className="button button-primary button-small"
                      disabled={busyId === entry.id}
                      type="button"
                      onClick={() => void invite(entry)}
                    >
                      {busyId === entry.id ? "Criando…" : "Convidar"}
                    </button>
                  )}
                  {entry.status === "INVITED" && entry.invite && <InviteCodeActions code={entry.invite.code} />}
                  {confirmingRemove === entry.id ? (
                    <>
                      <button className="button button-small button-secondary" type="button" onClick={() => setConfirmingRemove(null)}>
                        Cancelar
                      </button>
                      <button
                        className="button button-small button-danger"
                        disabled={busyId === entry.id}
                        type="button"
                        onClick={() => void remove(entry)}
                      >
                        Remover da lista
                      </button>
                    </>
                  ) : (
                    <button className="text-button destructive" type="button" onClick={() => setConfirmingRemove(entry.id)}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
