import { useCallback, useEffect, useState } from "react";
import type { InviteStatus } from "../api/contracts";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

export function formatDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : "—";
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/?convite=${encodeURIComponent(code)}`;
}

export const inviteStatusLabels: Record<InviteStatus, string> = {
  AVAILABLE: "Disponível",
  USED: "Usado",
  REVOKED: "Revogado",
};

// Loads a list for a section and reloads it on demand; errors show in the section.
export function useAdminData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    void load()
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Não foi possível carregar os dados."),
      );
  }, [load]);

  useEffect(reload, [reload]);

  return { data, setData, error, setError, reload };
}
