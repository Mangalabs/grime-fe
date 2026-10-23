import { useState } from "react";
import "./AccountMenu.css";
import type { AuthUser } from "../api/contracts";
import { usageLevel, useUsage } from "../features/usage/usage";
import { usePopover } from "../features/usePopover";
import { CompassIcon, LayersIcon, LogoutIcon } from "./icons";
import { UsageDialog } from "./usage/UsageDialog";
import { UsageMeter } from "./usage/UsageMeter";

export function AccountMenu({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const { isOpen, openedWithKeyboard, close, toggle, containerRef, triggerRef } = usePopover();
  const { usage, reload } = useUsage();
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const level = usage ? usageLevel(usage) : "ok";

  return (
    <div className="account-menu" data-tour="account" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={
          level === "ok"
            ? `Conta de ${user.name}`
            : `Conta de ${user.name} (${level === "exhausted" ? "limite mensal esgotado" : "limite mensal quase no fim"})`
        }
        className={`account-trigger${level === "ok" ? "" : ` is-${level}`}`}
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          // Usage also moves in the background (imports); show it fresh.
          if (!isOpen) reload();
          toggle(event);
        }}
      >
        <span className="account-avatar" aria-hidden="true">{initialsOf(user.name)}</span>
      </button>

      {isOpen && (
        <div className="account-popover">
          <div className="account-identity">
            <span className="account-avatar is-large" aria-hidden="true">{initialsOf(user.name)}</span>
            <span className="account-identity-text">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </span>
          </div>
          {usage && (
            <div className="account-usage">
              <p className="account-usage-label">Uso deste mês</p>
              <UsageMeter compact usage={usage} />
              <button
                autoFocus={openedWithKeyboard}
                className="text-button"
                type="button"
                onClick={() => {
                  close();
                  setIsUsageOpen(true);
                }}
              >
                Ver detalhes do uso
              </button>
            </div>
          )}
          {user.marketingEnabled && window.location.pathname.replace(/\/+$/, "") !== "/marketing" && (
            <a className="account-action" href="/marketing">
              <CompassIcon />
              Marketing
            </a>
          )}
          {user.role === "ADMIN" && window.location.pathname.replace(/\/+$/, "") !== "/admin" && (
            <a className="account-action" href="/admin">
              <LayersIcon />
              Administração
            </a>
          )}
          <button
            autoFocus={openedWithKeyboard && !usage}
            className="account-action"
            type="button"
            onClick={() => {
              close();
              onLogout();
            }}
          >
            <LogoutIcon />
            Sair da conta
          </button>
        </div>
      )}

      {isUsageOpen && usage && <UsageDialog usage={usage} onClose={() => setIsUsageOpen(false)} />}
    </div>
  );
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "?").slice(0, 2);
  return initials.toUpperCase();
}
