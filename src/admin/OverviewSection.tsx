import { admin } from "../api/client";
import { useAdminData } from "./adminData";
import type { AdminSection } from "./AdminApp";

const loadOverview = () => admin.overview();

export function OverviewSection({ onOpen }: { onOpen: (section: AdminSection) => void }) {
  const { data, error } = useAdminData(loadOverview);

  const tiles = data
    ? [
        { label: "Contas", value: data.users, detail: `${data.newUsersThisMonth} novas este mês`, section: "users" as const },
        { label: "Na lista de espera", value: data.waitlistWaiting, detail: "aguardando convite", section: "waitlist" as const },
        { label: "Convites disponíveis", value: data.invitesAvailable, detail: "enviados e ainda não usados", section: "invites" as const },
        { label: "Convites usados", value: data.invitesUsed, detail: "viraram contas", section: "invites" as const },
        { label: "Projetos", value: data.projects, detail: "em todas as contas", section: "users" as const },
        { label: "Palavras analisadas", value: data.wordsThisMonth, detail: "neste mês, por todas as contas", section: "users" as const },
      ]
    : [];

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Administração</p>
        <h1>Visão geral</h1>
        <p>Quem pediu acesso, quem foi convidado e como as contas usam o Petricor.</p>
      </header>
      {error && <p className="form-message">{error}</p>}
      {data && (
        <>
          <div className="admin-tiles">
            {tiles.map((tile) => (
              <button className="admin-tile" key={tile.label} type="button" onClick={() => onOpen(tile.section)}>
                <span className="admin-tile-label">{tile.label}</span>
                <strong>{tile.value.toLocaleString("pt-BR")}</strong>
                <span className="admin-tile-detail">{tile.detail}</span>
              </button>
            ))}
          </div>
          {data.waitlistWaiting > 0 && (
            <div className="admin-callout">
              <span>
                {data.waitlistWaiting === 1
                  ? "1 pessoa espera um convite."
                  : `${data.waitlistWaiting} pessoas esperam um convite.`}
              </span>
              <button className="button button-primary button-small" type="button" onClick={() => onOpen("waitlist")}>
                Ver lista de espera
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
