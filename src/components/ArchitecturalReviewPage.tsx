import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api } from "../api/client";
import type {
  ArchitectReview,
  MacroDiagnostic,
  MacroDiagnosticSeverity,
  MacroDiagnosticType,
  SceneGroup,
  Slot,
} from "../api/contracts";
import { loadSceneTexts } from "../features/manuscript/loadSceneTexts";
import { formatResetDate, formatWords, useUsage } from "../features/usage/usage";
import {
  bySeverity,
  citedNumbers,
  diagnosticTypes,
  findSceneReferences,
  frameworkSuggestions,
  sceneResolver,
  severities,
  severityLabels,
  timelineDrift,
} from "../features/architect/architect";
import { groupRuns } from "../features/scenes/groups";
import { orderScenes, sceneTitle } from "../features/scenes/sceneStatus";
import { ArchitectMap, type MapFinding } from "./ArchitectMap";
import type { StripBand } from "./SceneStrip";
import "./SceneStrip.css";
import "./ArchitecturalReviewPage.css";

interface ArchitecturalReviewPageProps {
  projectId: string;
  projectKey: CryptoKey | null;
  slots: Slot[];
  groups: SceneGroup[];
  onError: (message: string) => void;
  onOpenScene: (slot: Slot) => void;
  onCreateNote: (body: string) => Promise<void>;
  onOpenNotes: () => void;
  onOpenRhythm: () => void;
}

type Progress =
  | { phase: "reading"; done: number; total: number }
  | { phase: "analyzing"; startedAt: number };

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const isUnknown = (value: string) =>
  !value.trim() || /^desconhecid[oa]$/i.test(value.trim());

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ArchitecturalReviewPage({
  projectId,
  projectKey,
  slots,
  groups,
  onError,
  onOpenScene,
  onCreateNote,
  onOpenNotes,
  onOpenRhythm,
}: ArchitecturalReviewPageProps) {
  // Reports are kept per project, so switching projects never shows stale ones.
  const [loaded, setLoaded] = useState<{
    projectId: string;
    reports: ArchitectReview[];
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { usage } = useUsage();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [genre, setGenre] = useState("");
  const [framework, setFramework] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [severityFilter, setSeverityFilter] = useState<MacroDiagnosticSeverity | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<MacroDiagnosticType | "ALL">("ALL");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [notedKeys, setNotedKeys] = useState<Set<string>>(new Set());
  const [notingKey, setNotingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let isCurrent = true;
    api
      .listArchitecturalReviews(projectId)
      // Older backends only know the latest report.
      .catch(async (reason: unknown) => {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason;
        try {
          return [await api.getLatestArchitecturalReview(projectId)];
        } catch (inner) {
          if (inner instanceof ApiError && inner.status === 404) return [];
          throw inner;
        }
      })
      .then((reports) => {
        if (isCurrent) setLoaded({ projectId, reports });
      })
      .catch((reason: unknown) => {
        if (!isCurrent) return;
        setLoaded({ projectId, reports: [] });
        onError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar as revisões arquiteturais salvas.",
        );
      });
    return () => {
      isCurrent = false;
    };
  }, [onError, projectId]);

  useEffect(() => {
    if (progress?.phase !== "analyzing") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [progress?.phase]);

  const reports = loaded?.projectId === projectId ? loaded.reports : null;
  const report = reports?.find((item) => item.id === selectedId) ?? reports?.[0] ?? null;
  const scenes = useMemo(
    () => orderScenes(slots).filter((slot) => !slot.isUnanchored),
    [slots],
  );
  const showForm = isFormOpen || (reports !== null && reports.length === 0);

  const findings = useMemo(() => {
    if (!report) return [];
    const resolve = sceneResolver(report, slots);
    return report.diagnostics
      .map((diagnostic, index) => {
        const cited = citedNumbers(diagnostic)
          .map((number) => ({ number, slot: resolve(number) }));
        return {
          key: `${report.id}-${index}`,
          diagnostic,
          cited,
          positions: cited
            .map(({ slot }) => (slot ? scenes.findIndex((scene) => scene.id === slot.id) : -1))
            .filter((position) => position >= 0),
        };
      })
      .sort((left, right) => bySeverity(left.diagnostic, right.diagnostic));
  }, [report, slots, scenes]);

  const visible = findings.filter(
    ({ diagnostic }) =>
      (severityFilter === "ALL" || diagnostic.severity === severityFilter) &&
      (typeFilter === "ALL" || diagnostic.type === typeFilter),
  );
  const presentTypes = [...new Set(findings.map(({ diagnostic }) => diagnostic.type))];
  const drift = report ? timelineDrift(report, slots) : null;
  const hasReferences = findings.some(({ cited }) => cited.length > 0);

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const bands: StripBand[] = groupRuns(scenes)
    .filter((run) => groupById.has(run.groupId))
    .map((run) => {
      const group = groupById.get(run.groupId)!;
      return {
        key: group.id,
        start: run.start,
        length: run.length,
        label: group.name,
        colorClass: `group-${group.color}`,
        title: group.name,
      };
    });

  function selectFinding(key: string) {
    setActiveKey(key);
    document.getElementById(`finding-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function generateReport() {
    if (!projectKey) {
      onError("Desbloqueie o projeto antes de gerar a revisão arquitetural.");
      return;
    }

    try {
      // Only timeline scenes, numbered as the Arquiteto will cite them.
      const ordered = orderScenes(await api.listProjectSlots(projectId)).filter(
        (slot) => !slot.isUnanchored,
      );
      setProgress({ phase: "reading", done: 0, total: ordered.length });
      const drafts = await loadSceneTexts(projectKey, ordered, (done, total) =>
        setProgress({ phase: "reading", done, total }),
      );
      const manuscript = ordered
        .map((slot, index) =>
          drafts[index] ? `## Cena ${index + 1} — ${sceneTitle(slot)}\n${drafts[index]}` : null,
        )
        .filter((section): section is string => section !== null)
        .join("\n\n");
      if (!manuscript) {
        throw new Error("O projeto ainda não possui cenas com conteúdo para analisar.");
      }

      setProgress({ phase: "analyzing", startedAt: Date.now() });
      setNow(Date.now());
      const created = await api.createArchitecturalReview({
        projectId,
        genre: genre.trim() || "Desconhecido",
        narrativeFramework: framework.trim() || "Desconhecida",
        manuscript,
        sceneIds: ordered.map((slot) => slot.id),
      });
      setLoaded({ projectId, reports: [created, ...(reports ?? [])] });
      setSelectedId(created.id);
      setIsFormOpen(false);
      setSeverityFilter("ALL");
      setTypeFilter("ALL");
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível gerar o relatório arquitetural.",
      );
    } finally {
      setProgress(null);
    }
  }

  async function noteFinding(key: string, diagnostic: MacroDiagnostic) {
    setNotingKey(key);
    try {
      await onCreateNote(
        [
          `Revisão arquitetural · ${diagnosticTypes[diagnostic.type].label} (${diagnostic.affectedScope})`,
          ...diagnostic.clinicalSymptoms,
        ].join("\n"),
      );
      setNotedKeys((current) => new Set(current).add(key));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Não foi possível criar a nota.");
    } finally {
      setNotingKey(null);
    }
  }

  // Scene references inside the report's text become links to the scenes.
  function linked(text: string, resolve: (number: number) => Slot | null): ReactNode {
    const references = findSceneReferences(text);
    if (references.length === 0) return text;
    const parts: ReactNode[] = [];
    let cursor = 0;
    for (const reference of references) {
      parts.push(text.slice(cursor, reference.start));
      const target = resolve(reference.numbers[0]);
      const label = text.slice(reference.start, reference.end);
      parts.push(
        target ? (
          <button
            className="scene-ref"
            key={reference.start}
            title={`Abrir “${sceneTitle(target)}”`}
            type="button"
            onClick={() => onOpenScene(target)}
          >
            {label}
          </button>
        ) : (
          <span className="scene-ref is-missing" key={reference.start} title="Esta cena não existe mais">
            {label}
          </span>
        ),
      );
      cursor = reference.end;
    }
    parts.push(text.slice(cursor));
    return parts;
  }

  if (!projectId) {
    return (
      <section className="panel architect-empty">
        <strong>Selecione um projeto</strong>
        <p>Escolha e desbloqueie um projeto para analisar a estrutura do manuscrito.</p>
      </section>
    );
  }

  const resolve = report ? sceneResolver(report, slots) : () => null;
  const counts = Object.fromEntries(
    severities.map((severity) => [
      severity,
      findings.filter(({ diagnostic }) => diagnostic.severity === severity).length,
    ]),
  ) as Record<MacroDiagnosticSeverity, number>;

  return (
    <section className="architect-page">
      <header className="architect-header">
        <div className="page-intro">
          <p className="eyebrow">Diagnóstico do manuscrito</p>
          <h1>Revisão arquitetural</h1>
          <p>
            Sintomas estruturais da obra inteira: ritmo, tramas, arcos e clímax. O relatório
            descreve; não sugere como reescrever.
          </p>
        </div>
        {report && !showForm && (
          <button
            className="button button-secondary"
            disabled={!projectKey}
            type="button"
            onClick={() => setIsFormOpen(true)}
          >
            Nova análise
          </button>
        )}
      </header>

      {showForm && (
        <section className="panel architect-form" aria-labelledby="architect-form-title">
          <h2 id="architect-form-title">{report ? "Nova análise" : "Analisar a obra"}</h2>
          {!report && (
            <ul className="architect-types">
              {Object.entries(diagnosticTypes).map(([type, { label, description }]) => (
                <li key={type}>
                  <strong>{label}</strong>
                  <span>{description}</span>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void generateReport();
            }}
          >
            <div className="architect-parameters">
              <label>
                <span>Gênero</span>
                <input
                  disabled={progress !== null}
                  placeholder="Ex.: romance contemporâneo"
                  value={genre}
                  onChange={(event) => setGenre(event.target.value)}
                />
              </label>
              <label>
                <span>Estrutura pretendida</span>
                <input
                  disabled={progress !== null}
                  list="architect-frameworks"
                  placeholder="Deixe em branco para o Arquiteto identificar"
                  value={framework}
                  onChange={(event) => setFramework(event.target.value)}
                />
                <datalist id="architect-frameworks">
                  {frameworkSuggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </label>
            </div>
            <p className="architect-privacy">
              O texto das {scenes.length} cenas da timeline é descriptografado neste navegador e
              enviado ao serviço de análise. Cenas avulsas ficam de fora. O relatório, com citações
              curtas, fica salvo no projeto.
            </p>
            <p className="architect-privacy">
              O Arquiteto lê a obra inteira: cada revisão usa do seu limite mensal tantas palavras
              quanto as cenas somam.
              {usage && ` Restam ${formatWords(usage.remaining)} até ${formatResetDate(usage.resetsAt)}.`}
            </p>
            {progress && (
              <p className="architect-progress" role="status">
                <span className="architect-spinner" aria-hidden="true" />
                {progress.phase === "reading"
                  ? `Lendo cenas: ${progress.done} de ${progress.total}…`
                  : `O Arquiteto está lendo a obra… ${formatElapsed(now - progress.startedAt)}. Obras longas levam alguns minutos.`}
              </p>
            )}
            <div className="architect-form-actions">
              {report && (
                <button
                  className="button button-secondary"
                  disabled={progress !== null}
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancelar
                </button>
              )}
              <button
                className="button button-primary"
                disabled={!projectKey || progress !== null || scenes.length === 0}
                type="submit"
              >
                {progress ? "Analisando…" : "Gerar relatório"}
              </button>
            </div>
          </form>
        </section>
      )}

      {reports === null && <p className="architect-loading">Carregando relatórios…</p>}

      {report && (
        <>
          <section className="panel architect-summary" aria-label="Resumo do relatório">
            <div className="architect-framework">
              <p className="eyebrow">Estrutura identificada</p>
              <h2>{report.detectedFramework}</h2>
              <p>
                {isUnknown(report.narrativeFramework)
                  ? "Nenhuma estrutura informada; o Arquiteto identificou esta."
                  : `Você informou: ${report.narrativeFramework}.`}
                {!isUnknown(report.genre) && ` Gênero: ${report.genre}.`}
              </p>
            </div>
            <div className="architect-meta">
              {reports && reports.length > 1 ? (
                <label>
                  <span>Relatório</span>
                  <select
                    value={report.id}
                    onChange={(event) => {
                      setSelectedId(event.target.value);
                      setActiveKey(null);
                    }}
                  >
                    {reports.map((item, index) => (
                      <option key={item.id} value={item.id}>
                        {dateFormat.format(new Date(item.createdAt))}
                        {index === 0 ? " (mais recente)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>Gerado em {dateFormat.format(new Date(report.createdAt))}</p>
              )}
              {report.sceneIds && <p>{report.sceneIds.length} cenas analisadas</p>}
              {report.sceneMetrics && report.sceneMetrics.length > 0 && (
                <button className="text-button" type="button" onClick={onOpenRhythm}>
                  Ver curva de tensão →
                </button>
              )}
            </div>
            {drift && (
              <p className="architect-drift">
                A timeline mudou desde este relatório (
                {[
                  drift.added ? `${drift.added} cena(s) nova(s)` : null,
                  drift.removed ? `${drift.removed} removida(s)` : null,
                  drift.reordered ? "ordem alterada" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                ). Os links seguem cada cena até onde ela está agora; cenas novas não foram
                analisadas.
              </p>
            )}
            {!report.sceneIds && !hasReferences && report.diagnostics.length > 0 && (
              <p className="architect-drift">
                Relatório anterior à numeração de cenas: os capítulos citados não correspondem às
                cenas da timeline. Gere uma nova análise para ter links e o mapa.
              </p>
            )}
          </section>

          {findings.length === 0 ? (
            <section className="panel architect-empty">
              <strong>Nenhuma anomalia estrutural mapeada.</strong>
              <p>O Arquiteto não encontrou sintomas com estes parâmetros.</p>
            </section>
          ) : (
            <>
              <div className="architect-filters" role="toolbar" aria-label="Filtrar achados">
                <div className="architect-chips">
                  <button
                    aria-pressed={severityFilter === "ALL"}
                    className="architect-chip"
                    type="button"
                    onClick={() => setSeverityFilter("ALL")}
                  >
                    Todos <span>{findings.length}</span>
                  </button>
                  {severities
                    .filter((severity) => counts[severity] > 0)
                    .map((severity) => (
                      <button
                        aria-pressed={severityFilter === severity}
                        className={`architect-chip severity-${severity.toLowerCase()}`}
                        key={severity}
                        type="button"
                        onClick={() => setSeverityFilter(severityFilter === severity ? "ALL" : severity)}
                      >
                        <span className="severity-dot" aria-hidden="true" />
                        {severityLabels[severity]} <span>{counts[severity]}</span>
                      </button>
                    ))}
                </div>
                {presentTypes.length > 1 && (
                  <label>
                    <span className="sr-only">Tipo</span>
                    <select
                      value={typeFilter}
                      onChange={(event) => setTypeFilter(event.target.value as MacroDiagnosticType | "ALL")}
                    >
                      <option value="ALL">Todos os tipos</option>
                      {presentTypes.map((type) => (
                        <option key={type} value={type}>
                          {diagnosticTypes[type].label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {hasReferences && scenes.length > 0 && (
                <ArchitectMap
                  activeKey={activeKey}
                  bands={bands}
                  findings={visible.map(({ key, diagnostic, positions }): MapFinding => ({ key, diagnostic, positions }))}
                  scenes={scenes}
                  onSelectFinding={selectFinding}
                />
              )}

              {visible.length === 0 ? (
                <section className="panel architect-empty">
                  <strong>Nenhum achado com estes filtros.</strong>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setSeverityFilter("ALL");
                      setTypeFilter("ALL");
                    }}
                  >
                    Limpar filtros
                  </button>
                </section>
              ) : (
                <ol className="architect-findings">
                  {visible.map(({ key, diagnostic, cited }) => (
                    <li
                      className={`panel architect-finding severity-${diagnostic.severity.toLowerCase()}${key === activeKey ? " is-active" : ""}`}
                      id={`finding-${key}`}
                      key={key}
                    >
                      <header className="architect-finding-heading">
                        <span className="severity-badge">
                          <span className="severity-dot" aria-hidden="true" />
                          {severityLabels[diagnostic.severity]}
                        </span>
                        <h2>{diagnosticTypes[diagnostic.type].label}</h2>
                        <p className="architect-scope">{linked(diagnostic.affectedScope, resolve)}</p>
                      </header>
                      <ul className="architect-symptoms">
                        {diagnostic.clinicalSymptoms.map((symptom, index) => (
                          <li key={index}>{linked(symptom, resolve)}</li>
                        ))}
                      </ul>
                      {diagnostic.examples.length > 0 && (
                        <div className="architect-evidence">
                          <h3>Evidências no texto</h3>
                          <ul>
                            {diagnostic.examples.map((example, index) => (
                              <li key={index}>{linked(example, resolve)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <footer className="architect-finding-footer">
                        {cited.length > 0 && (
                          <div className="architect-cited">
                            <span>Cenas citadas</span>
                            <ul>
                              {cited.slice(0, 12).map(({ number, slot }) => (
                                <li key={number}>
                                  {slot ? (
                                    <button type="button" onClick={() => onOpenScene(slot)}>
                                      <span className="architect-cited-number">
                                        {slot.timelinePosition !== null && !slot.isUnanchored
                                          ? slot.timelinePosition + 1
                                          : "—"}
                                      </span>
                                      {sceneTitle(slot)}
                                    </button>
                                  ) : (
                                    <span className="is-missing">Cena {number} (removida)</span>
                                  )}
                                </li>
                              ))}
                              {cited.length > 12 && <li className="architect-cited-more">+{cited.length - 12}</li>}
                            </ul>
                          </div>
                        )}
                        <div className="architect-finding-actions">
                          {notedKeys.has(key) ? (
                            <button className="text-button" type="button" onClick={onOpenNotes}>
                              ✓ Nota criada · ver notas
                            </button>
                          ) : (
                            <button
                              className="button button-secondary button-small"
                              disabled={notingKey === key || !projectKey}
                              title="Cria uma nota de projeto “Corrigir” com este achado"
                              type="button"
                              onClick={() => void noteFinding(key, diagnostic)}
                            >
                              ✎ Anotar para revisão
                            </button>
                          )}
                        </div>
                      </footer>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
