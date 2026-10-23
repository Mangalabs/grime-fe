import { useState } from "react";
import { admin } from "../api/client";
import type { AdminUser } from "../api/contracts";
import { formatDate, useAdminData } from "./adminData";
import { StatusChip } from "./AdminParts";

const loadUsers = () => admin.users();

export function UsersSection() {
  const { data, setData, error, setError } = useAdminData(loadUsers);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLocaleLowerCase("pt-BR");
  const users = (data ?? []).filter(
    (user) => !needle || `${user.name} ${user.email}`.toLocaleLowerCase("pt-BR").includes(needle),
  );

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Administração</p>
        <h1>Usuários</h1>
        <p>As contas, o que guardam no Petricor e quanto do limite mensal de palavras já usaram.</p>
      </header>

      <label className="admin-search">
        <span className="sr-only">Buscar usuários</span>
        <input
          placeholder="Buscar por nome ou e-mail"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {error && <p className="form-message">{error}</p>}
      {data && users.length === 0 && <p className="empty-state">Nenhuma conta encontrada.</p>}

      {users.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Cadastro</th>
                <th>Projetos</th>
                <th>Último acesso</th>
                <th>Uso do mês</th>
                <th>Limite mensal</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    {user.role === "ADMIN" && <StatusChip tone="neutral">Admin</StatusChip>}
                    <span className="admin-muted admin-note">{user.email}</span>
                  </td>
                  <td className="admin-date">{formatDate(user.createdAt)}</td>
                  <td>{user.projectCount}</td>
                  <td className="admin-date">{formatDate(user.lastProjectAccessAt)}</td>
                  <td>
                    <UsageCell user={user} />
                  </td>
                  <td>
                    <LimitEditor
                      user={user}
                      onSaved={(saved) =>
                        setData((current) => (current ?? []).map((item) => (item.id === saved.id ? saved : item)))
                      }
                      onError={setError}
                    />
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

function UsageCell({ user }: { user: AdminUser }) {
  const share = Math.min(1, user.wordsThisMonth / user.effectiveWordLimit);
  const tone = share >= 1 ? "is-exhausted" : share >= 0.8 ? "is-warning" : "";
  return (
    <span className="admin-usage">
      <span className={`admin-usage-bar ${tone}`} aria-hidden="true">
        <span style={{ width: `${share * 100}%` }} />
      </span>
      <span className="admin-muted">
        {user.wordsThisMonth.toLocaleString("pt-BR")} de {user.effectiveWordLimit.toLocaleString("pt-BR")}
      </span>
    </span>
  );
}

// Empty means the server default; a number gives this account its own allowance.
function LimitEditor({
  user,
  onSaved,
  onError,
}: {
  user: AdminUser;
  onSaved: (user: AdminUser) => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState(user.monthlyWordLimit?.toString() ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const parsed = value.trim() === "" ? null : Number(value.replace(/\D/g, ""));
  const isValid = parsed === null || (Number.isInteger(parsed) && parsed > 0);
  const isChanged = parsed !== user.monthlyWordLimit;

  async function save() {
    if (!isValid || !isChanged) return;
    setIsSaving(true);
    try {
      onSaved(await admin.setWordLimit(user.id, parsed));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Não foi possível salvar o limite.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="admin-limit"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <input
        aria-invalid={!isValid || undefined}
        aria-label={`Limite mensal de ${user.name}`}
        inputMode="numeric"
        placeholder="Padrão"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {isChanged && (
        <button className="button button-small button-primary" disabled={!isValid || isSaving} type="submit">
          {isSaving ? "…" : "Salvar"}
        </button>
      )}
    </form>
  );
}
