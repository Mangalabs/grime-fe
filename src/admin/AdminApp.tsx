import { useEffect, useState } from "react";
import type { AuthUser } from "../api/contracts";
import { AccountMenu } from "../components/AccountMenu";
import { initialTheme } from "../features/theme";
import { InvitesSection } from "./InvitesSection";
import { OverviewSection } from "./OverviewSection";
import { UsersSection } from "./UsersSection";
import { WaitlistSection } from "./WaitlistSection";
import "../App.css";
import "./Admin.css";

export type AdminSection = "overview" | "waitlist" | "invites" | "users";

// The hash keeps the section on reload and makes it linkable (/admin#convites).
const sectionHashes: Record<AdminSection, string> = {
  overview: "",
  waitlist: "lista-de-espera",
  invites: "convites",
  users: "usuarios",
};

const sectionLabels: Record<AdminSection, string> = {
  overview: "Visão geral",
  waitlist: "Lista de espera",
  invites: "Convites",
  users: "Usuários",
};

function sectionFromHash(): AdminSection {
  const hash = window.location.hash.replace("#", "");
  const match = (Object.keys(sectionHashes) as AdminSection[]).find((section) => sectionHashes[section] === hash);
  return match ?? "overview";
}

export function AdminApp({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [section, setSection] = useState<AdminSection>(sectionFromHash);

  useEffect(() => {
    document.documentElement.dataset.theme = initialTheme();
    document.title = "Petricor · Administração";
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function open(next: AdminSection) {
    const hash = sectionHashes[next];
    window.history.replaceState(null, "", hash ? `#${hash}` : window.location.pathname);
    setSection(next);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="brand" href="/admin" aria-label="Administração do Petricor">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Petricor</span>
          <span className="admin-badge">Admin</span>
        </a>
        <nav className="admin-nav" aria-label="Seções da administração">
          {(Object.keys(sectionLabels) as AdminSection[]).map((item) => (
            <button
              aria-current={section === item ? "page" : undefined}
              key={item}
              type="button"
              onClick={() => open(item)}
            >
              {sectionLabels[item]}
            </button>
          ))}
        </nav>
        <div className="admin-topbar-end">
          <a className="text-button admin-back" href="/">
            Voltar ao Petricor
          </a>
          <AccountMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      <main className="admin-main">
        {section === "overview" && <OverviewSection onOpen={open} />}
        {section === "waitlist" && <WaitlistSection />}
        {section === "invites" && <InvitesSection />}
        {section === "users" && <UsersSection />}
      </main>
    </div>
  );
}

// Signed in, but the account isn't an admin.
export function AdminForbidden() {
  return (
    <main className="admin-forbidden">
      <div>
        <p className="eyebrow">Administração</p>
        <h1>Esta área é restrita</h1>
        <p>Sua conta não tem acesso à administração do Petricor.</p>
        <a className="button button-primary" href="/">
          Voltar ao Petricor
        </a>
      </div>
    </main>
  );
}
