import { useEffect, useState, type FormEvent } from "react";
import type { GoogleCommentSummary, GoogleHeadingLevel } from "../../api/contracts";
import type { CommentSource } from "../../features/googleDocs/buildComments";
import type { GoogleDocSyncState } from "../../features/googleDocs/useGoogleDocSync";
import "../Modal.css";
import "./GoogleDocsDialog.css";

const levelLabels: Record<GoogleHeadingLevel, string> = {
  1: "Título 1",
  2: "Título 2",
  3: "Título 3",
};

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function formatSyncedAgo(value: string | null): string {
  if (!value) return "ainda não sincronizado";
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (minutes > -1) return "sincronizado agora";
  if (minutes > -60) return `sincronizado ${relative.format(minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  if (hours > -24) return `sincronizado ${relative.format(hours, "hour")}`;
  return `sincronizado ${relative.format(Math.round(hours / 24), "day")}`;
}

const sourceLabels: Record<CommentSource, string> = {
  diagnostics: "Diagnósticos do Revisor",
  style: "Folha de estilo",
  architect: "Revisão arquitetural",
  notes: "Notas de revisão",
};

export function GoogleDocsDialog({
  sync,
  onClose,
  onOpenGuide,
  onPublishComments,
}: {
  sync: GoogleDocSyncState;
  onClose: () => void;
  onOpenGuide: () => void;
  // The caller has the decrypted notes and the style sheet.
  onPublishComments: (sources: Set<CommentSource>) => void;
}) {
  const [sources, setSources] = useState<Set<CommentSource>>(
    () => new Set<CommentSource>(["diagnostics", "style", "architect", "notes"]),
  );
  const [document, setDocument] = useState("");
  const [headingLevel, setHeadingLevel] = useState<GoogleHeadingLevel>(1);
  const [isLinking, setIsLinking] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const { status, link, lastResult } = sync;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    if (!document.trim() || isLinking) return;
    setIsLinking(true);
    try {
      await sync.linkDocument(document.trim(), headingLevel);
      setDocument("");
      await sync.syncNow();
    } catch {
      // The hook shows the message.
    } finally {
      setIsLinking(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="google-docs-title" aria-modal="true" className="modal google-docs-dialog" role="dialog">
        <p className="eyebrow">Integração</p>
        <h2 id="google-docs-title">Google Docs</h2>

        {!status?.connected ? (
          <>
            <p>
              Escreva no Google Docs e revise no Petricor. Cada título do documento vira uma cena, e as mudanças
              chegam aqui sozinhas enquanto o projeto está aberto.
            </p>
            <ul className="google-docs-points">
              <li>O Petricor só lê seus documentos: nunca altera nada no Google.</li>
              <li>O texto chega cifrado às cenas, como tudo no projeto.</li>
            </ul>
            <div className="modal-actions">
              <button className="button button-secondary" type="button" onClick={onClose}>
                Agora não
              </button>
              <button className="button button-primary" type="button" onClick={() => void sync.connect()}>
                Conectar conta Google
              </button>
            </div>
          </>
        ) : !link ? (
          <form onSubmit={(event) => void submitLink(event)}>
            <p>
              Cole o link do documento deste projeto. As cenas do documento entram na timeline, na ordem em que
              aparecem.
            </p>
            <label className="modal-field">
              <span>Link do documento</span>
              <input
                autoFocus
                placeholder="https://docs.google.com/document/d/…"
                value={document}
                onChange={(event) => setDocument(event.target.value)}
              />
            </label>
            <label className="modal-field">
              <span>Cada cena começa em um</span>
              <select
                value={headingLevel}
                onChange={(event) => setHeadingLevel(Number(event.target.value) as GoogleHeadingLevel)}
              >
                {([1, 2, 3] as const).map((level) => (
                  <option key={level} value={level}>
                    {levelLabels[level]}
                  </option>
                ))}
              </select>
            </label>
            <p className="google-docs-note">
              Depois de vinculado, o documento manda: mudanças feitas aqui no texto dessas cenas são substituídas
              pela versão do Google Docs na próxima sincronização.
            </p>
            <div className="modal-actions">
              <button className="button button-secondary" type="button" onClick={onClose}>
                Cancelar
              </button>
              <button className="button button-primary" disabled={!document.trim() || isLinking} type="submit">
                {isLinking ? "Importando…" : "Vincular e importar"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="google-docs-linked">
              <div>
                <a href={link.url} rel="noreferrer" target="_blank">
                  {link.title} ↗
                </a>
                <span>
                  {link.sceneCount === 1 ? "1 cena" : `${link.sceneCount} cenas`} · cenas em {levelLabels[link.headingLevel]} ·{" "}
                  {sync.isSyncing ? "sincronizando…" : formatSyncedAgo(link.lastSyncedAt)}
                </span>
              </div>
              <button
                className="button button-primary"
                disabled={sync.isSyncing}
                type="button"
                onClick={() => void sync.syncNow()}
              >
                {sync.isSyncing ? "Sincronizando…" : "Sincronizar agora"}
              </button>
            </div>
            {lastResult && !sync.isSyncing && (
              <p className="google-docs-result" role="status">
                {lastResult.upToDate ? "Tudo em dia com o documento." : describe(lastResult)}
              </p>
            )}
            <p className="google-docs-note">
              Sincroniza ao abrir o projeto e a cada 10 minutos enquanto ele está aberto. Cenas alteradas voltam a
              “não analisada”. O documento manda: edições feitas aqui nessas cenas são substituídas na próxima
              sincronização.
            </p>
            <section className="google-docs-comments" aria-labelledby="google-docs-comments-title">
              <h3 id="google-docs-comments-title">Comentários no documento</h3>
              {!status.canComment ? (
                <>
                  <p>
                    Publique as análises e as notas como comentários no Google Docs, cada um no trecho de que fala.
                    Para isso o Google pede uma permissão a mais, que ele descreve como “ver e editar seus
                    documentos”. O Petricor só a usa para comentar.
                  </p>
                  <button className="button button-secondary" type="button" onClick={() => void sync.connect("comment")}>
                    Permitir comentários
                  </button>
                </>
              ) : (
                <>
                  <fieldset className="google-docs-sources">
                    <legend className="sr-only">O que publicar</legend>
                    {(Object.keys(sourceLabels) as CommentSource[]).map((source) => (
                      <label className="checkbox-label" key={source}>
                        <input
                          checked={sources.has(source)}
                          type="checkbox"
                          onChange={(event) =>
                            setSources((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(source);
                              else next.delete(source);
                              return next;
                            })
                          }
                        />
                        <span>{sourceLabels[source]}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="google-docs-publish">
                    <button
                      className="button button-primary"
                      disabled={sources.size === 0 || sync.publishing !== null || sync.isSyncing}
                      type="button"
                      onClick={() => onPublishComments(sources)}
                    >
                      {sync.publishing
                        ? sync.publishing.total
                          ? `Lendo cenas ${sync.publishing.done} de ${sync.publishing.total}…`
                          : "Publicando…"
                        : "Publicar no documento"}
                    </button>
                    <span>
                      {link.lastCommentedAt
                        ? `Última publicação: ${new Date(link.lastCommentedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                        : "Ainda não publicado"}
                    </span>
                  </div>
                  {sync.commentSummary && (
                    <p className="google-docs-result" role="status">
                      {describeComments(sync.commentSummary)}
                    </p>
                  )}
                  <p className="google-docs-note">
                    Publicar de novo atualiza o que mudou e resolve no documento o que já não se aplica. Comentários
                    que você apagar ou resolver no Google Docs ficam como estão.
                  </p>
                </>
              )}
            </section>
            <div className="google-docs-unlink">
              {confirmingUnlink ? (
                <>
                  <span>As cenas continuam no projeto; só deixam de ser atualizadas.</span>
                  <button className="button button-small button-secondary" type="button" onClick={() => setConfirmingUnlink(false)}>
                    Cancelar
                  </button>
                  <button
                    className="button button-small button-danger"
                    type="button"
                    onClick={() => {
                      setConfirmingUnlink(false);
                      void sync.unlink();
                    }}
                  >
                    Desvincular
                  </button>
                </>
              ) : (
                <button className="text-button destructive" type="button" onClick={() => setConfirmingUnlink(true)}>
                  Desvincular documento
                </button>
              )}
            </div>
          </>
        )}

        {sync.error && <p className="form-message">{sync.error}</p>}

        <footer className="google-docs-footer">
          {status?.connected ? (
            <span>
              Conectado como {status.email || "sua conta Google"} ·{" "}
              <button className="inline-link" type="button" onClick={() => void sync.disconnect()}>
                Desconectar
              </button>
            </span>
          ) : (
            <span />
          )}
          <button className="inline-link" type="button" onClick={onOpenGuide}>
            Como funciona
          </button>
        </footer>
        {link && status?.connected && (
          <div className="modal-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>
              Fechar
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function describeComments(summary: GoogleCommentSummary) {
  const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
  const parts = [
    summary.created && count(summary.created, "comentário novo", "comentários novos"),
    summary.updated && count(summary.updated, "atualizado", "atualizados"),
    summary.resolved && count(summary.resolved, "resolvido", "resolvidos"),
  ].filter(Boolean);
  const done = parts.length > 0 ? `${parts.join(", ")}.` : "Nada novo para publicar.";
  const notes = [
    summary.unanchored &&
      `${count(summary.unanchored, "ficou", "ficaram")} no título da cena porque o trecho não está mais no documento.`,
    summary.closedInDoc && `${count(summary.closedInDoc, "comentário fechado", "comentários fechados")} no Google Docs não foi tocado.`,
  ].filter(Boolean);
  return [done, ...notes].join(" ");
}

function describe(result: { created: number; updated: number; removed: number }) {
  const parts = [
    result.created && (result.created === 1 ? "1 cena nova" : `${result.created} cenas novas`),
    result.updated && (result.updated === 1 ? "1 cena atualizada" : `${result.updated} cenas atualizadas`),
    result.removed &&
      (result.removed === 1
        ? "1 cena saiu do documento (continua no projeto)"
        : `${result.removed} cenas saíram do documento (continuam no projeto)`),
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(", ")}.` : "Nenhuma mudança nas cenas.";
}
