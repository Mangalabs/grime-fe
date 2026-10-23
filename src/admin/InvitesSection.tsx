import { useState, type FormEvent } from "react";
import { admin } from "../api/client";
import type { AdminInvite, InviteStatus } from "../api/contracts";
import { formatDate, inviteStatusLabels, useAdminData } from "./adminData";
import { InviteCodeActions, StatusChip } from "./AdminParts";

type Filter = InviteStatus | "ALL";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "AVAILABLE", label: "Disponíveis" },
  { id: "USED", label: "Usados" },
  { id: "REVOKED", label: "Revogados" },
  { id: "ALL", label: "Todos" },
];

const tones: Record<InviteStatus, "neutral" | "good" | "muted"> = {
  AVAILABLE: "neutral",
  USED: "good",
  REVOKED: "muted",
};

const loadInvites = () => admin.invites();

export function InvitesSection() {
  const { data, setData, error, setError } = useAdminData(loadInvites);
  const [filter, setFilter] = useState<Filter>("AVAILABLE");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState<AdminInvite | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  const invites = (data ?? []).filter((invite) => filter === "ALL" || invite.status === filter);
  const countOf = (id: Filter) => (data ?? []).filter((invite) => id === "ALL" || invite.status === id).length;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (isCreating) return;
    setIsCreating(true);
    setError("");
    try {
      const invite = await admin.createInvite({ email: email.trim() || undefined, note: note.trim() || undefined });
      setData((current) => [invite, ...(current ?? [])]);
      setCreated(invite);
      setEmail("");
      setNote("");
      setFilter("AVAILABLE");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o convite.");
    } finally {
      setIsCreating(false);
    }
  }

  async function revoke(invite: AdminInvite) {
    try {
      const revoked = await admin.revokeInvite(invite.id);
      setData((current) => (current ?? []).map((item) => (item.id === invite.id ? revoked : item)));
      setConfirmingRevoke(null);
      if (created?.id === invite.id) setCreated(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível revogar.");
    }
  }

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Administração</p>
        <h1>Convites</h1>
        <p>
          Cada código abre uma conta, uma vez. Com e-mail, só essa pessoa consegue usá-lo. Envie o código ou o link,
          que já abre o cadastro com o código preenchido.
        </p>
      </header>

      <form className="panel admin-create" onSubmit={(event) => void create(event)}>
        <h2>Novo convite</h2>
        <div className="admin-create-fields">
          <label>
            <span>E-mail (opcional)</span>
            <input
              placeholder="Qualquer e-mail, se vazio"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Nota (opcional)</span>
            <input
              maxLength={300}
              placeholder="Ex.: Oficina de escrita, turma de outubro"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button className="button button-primary" disabled={isCreating} type="submit">
            {isCreating ? "Criando…" : "Criar convite"}
          </button>
        </div>
        {created && (
          <div className="admin-created" role="status">
            <span>
              Convite criado{created.email ? ` para ${created.email}` : ""}. Envie para a pessoa:
            </span>
            <InviteCodeActions code={created.code} />
          </div>
        )}
      </form>

      <div className="admin-filters" role="tablist" aria-label="Filtrar convites">
        {filters.map((option) => (
          <button
            aria-selected={filter === option.id}
            key={option.id}
            role="tab"
            type="button"
            onClick={() => setFilter(option.id)}
          >
            {option.label} <span>{countOf(option.id)}</span>
          </button>
        ))}
      </div>

      {error && <p className="form-message">{error}</p>}
      {data && invites.length === 0 && <p className="empty-state">Nenhum convite aqui.</p>}

      {invites.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Para</th>
                <th>Status</th>
                <th>Criado</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td>
                    <code className="admin-code">{invite.code}</code>
                    {invite.note && <span className="admin-muted admin-note">{invite.note}</span>}
                  </td>
                  <td>{invite.email ?? <span className="admin-muted">Qualquer e-mail</span>}</td>
                  <td>
                    <StatusChip tone={tones[invite.status]}>{inviteStatusLabels[invite.status]}</StatusChip>
                    {invite.usedBy && (
                      <span className="admin-muted admin-note">
                        por {invite.usedBy.name} · {formatDate(invite.usedAt)}
                      </span>
                    )}
                  </td>
                  <td className="admin-date">
                    {formatDate(invite.createdAt)}
                    {invite.createdByName && <span className="admin-muted admin-note">por {invite.createdByName}</span>}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      {invite.status === "AVAILABLE" &&
                        (confirmingRevoke === invite.id ? (
                          <>
                            <button
                              className="button button-small button-secondary"
                              type="button"
                              onClick={() => setConfirmingRevoke(null)}
                            >
                              Cancelar
                            </button>
                            <button className="button button-small button-danger" type="button" onClick={() => void revoke(invite)}>
                              Revogar
                            </button>
                          </>
                        ) : (
                          <>
                            <InviteCodeActions code={invite.code} showCode={false} />
                            <button className="text-button destructive" type="button" onClick={() => setConfirmingRevoke(invite.id)}>
                              Revogar
                            </button>
                          </>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
