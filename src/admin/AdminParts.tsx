import { useEffect, useState } from "react";
import { byStatus, inviteLink } from "./adminData";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const reset = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(reset);
  }, [copied]);

  return (
    <button
      className="button button-secondary button-small admin-copy"
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? "Copiado ✓" : label}
    </button>
  );
}

// The code with its two ways of sending it: as text, or as a link that fills it in.
// Tables already show the code in its own column, so they pass showCode={false}.
export function InviteCodeActions({ code, showCode = true }: { code: string; showCode?: boolean }) {
  return (
    <span className="admin-invite-actions">
      {showCode && <code className="admin-code">{code}</code>}
      <CopyButton label="Copiar código" value={code} />
      <CopyButton label="Copiar link" value={inviteLink(code)} />
    </span>
  );
}

export function StatusChip({ tone, children }: { tone: "neutral" | "good" | "warn" | "muted"; children: string }) {
  return <span className={`admin-chip is-${tone}`}>{children}</span>;
}

/** Status tabs over a list, each with how many items it holds. */
export function FilterTabs<Status extends string>({
  label,
  filters,
  value,
  items,
  onChange,
}: {
  label: string;
  filters: Array<{ id: Status | "ALL"; label: string }>;
  value: Status | "ALL";
  items: Array<{ status: Status }>;
  onChange: (filter: Status | "ALL") => void;
}) {
  return (
    <div className="admin-filters" role="tablist" aria-label={label}>
      {filters.map((option) => (
        <button
          aria-selected={value === option.id}
          key={option.id}
          role="tab"
          type="button"
          onClick={() => onChange(option.id)}
        >
          {option.label} <span>{items.filter(byStatus(option.id)).length}</span>
        </button>
      ))}
    </div>
  );
}
