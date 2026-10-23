import { useEffect, useMemo, useState } from "react";
import type { DiagnosticSeverity, SceneGroup, Slot } from "../api/contracts";
import { readAuthorName, type Note } from "../features/notes/notes";
import {
  buildReport,
  presetDefaults,
  severityNames,
  type ReportOptions,
  type ReportPreset,
} from "../features/report/reportModel";
import { renderReportPdf, reportFileName } from "../features/report/reportPdf";
import { renderReportDocx, reportDocxFileName } from "../features/report/reportDocx";
import type { StyleSheet } from "../features/style/styleSheet";
import { collectReportData, type CollectedReport } from "../features/report/collectReport";
import "./ProjectReviewExportPage.css";

interface ProjectReviewExportPageProps {
  projectId: string;
  projectKey: CryptoKey | null;
  slots: Slot[];
  groups: SceneGroup[];
  notes: Note[];
  styleSheet: StyleSheet | null;
  onError: (message: string) => void;
}

const presets: Array<{ id: ReportPreset; title: string; reader: string; description: string }> = [
  {
    id: "AUTHOR",
    title: "Relatório para o autor",
    reader: "Para enviar",
    description: "Resumo, prioridades, revisão estrutural e, por cena, só o que pede atenção.",
  },
  {
    id: "CHECKLIST",
    title: "Checklist de revisão",
    reader: "Para imprimir e trabalhar",
    description: "Uma linha por pendência, com caixa de seleção, na ordem da timeline.",
  },
  {
    id: "MANUSCRIPT",
    title: "Manuscrito anotado",
    reader: "Para revisão de linha",
    description: "O texto das cenas com as observações: em PDF, numeradas; no Word, como comentários.",
  },
];

// Only the annotated manuscript has a Word version: it is the one edited.
type ExportFormat = "PDF" | "DOCX";

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ProjectReviewExportPage({
  projectId,
  projectKey,
  slots,
  groups,
  notes,
  styleSheet,
  onError,
}: ProjectReviewExportPageProps) {
  const sceneKey = `${projectId}:${slots.map((slot) => slot.id).join(",")}`;
  const [loaded, setLoaded] = useState<{ key: string; data: CollectedReport } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [reloads, setReloads] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chosenFormat, setFormat] = useState<ExportFormat>("PDF");
  const [options, setOptions] = useState<ReportOptions>(() => ({
    preset: "AUTHOR",
    scope: { kind: "ALL" },
    minSeverity: "WARNING",
    includeArchitect: true,
    notes: "OPEN",
    includeAlerts: true,
    includeStyle: true,
    includeRhythm: true,
    includeExceptions: false,
    reviewer: readAuthorName(),
    letter: "",
  }));
  const needsNames = Boolean(styleSheet?.typography.archiveNames);

  useEffect(() => {
    if (!projectKey || slots.length === 0) return;
    let isCurrent = true;
    const key = `${sceneKey}#${reloads}`;
    collectReportData(projectId, projectKey, slots, needsNames, (done, total) => {
      if (isCurrent) setProgress({ done, total });
    })
      .then((data) => {
        if (isCurrent) setLoaded({ key, data });
      })
      .catch((reason: unknown) => {
        if (isCurrent) onError(reason instanceof Error ? reason.message : "Não foi possível reunir as revisões.");
      })
      .finally(() => {
        if (isCurrent) setProgress(null);
      });
    return () => {
      isCurrent = false;
    };
    // The scene list is captured by its key; status changes don't reload everything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectKey, sceneKey, reloads, needsNames]);

  const data = loaded && loaded.key.startsWith(`${sceneKey}#`) ? loaded.data : null;
  const model = useMemo(
    () => (data ? buildReport({ ...data, notes, groups, styleSheet }, options) : null),
    [data, notes, groups, styleSheet, options],
  );

  const timelineCount = slots.filter((slot) => !slot.isUnanchored).length;
  const format: ExportFormat = options.preset === "MANUSCRIPT" ? chosenFormat : "PDF";
  const update = (patch: Partial<ReportOptions>) => {
    setResult(null);
    setOptions((current) => ({ ...current, ...patch }));
  };

  function generate() {
    if (!model) return;
    if (format === "DOCX") {
      setIsGenerating(true);
      renderReportDocx(model, { styleSheet, names: data?.names ?? [] })
        .then(({ blob, comments }) => {
          download(blob, reportDocxFileName(model));
          setResult(`Documento do Word gerado: ${comments} ${comments === 1 ? "comentário" : "comentários"}.`);
        })
        .catch((reason: unknown) => {
          onError(reason instanceof Error ? reason.message : "Não foi possível gerar o documento do Word.");
        })
        .finally(() => setIsGenerating(false));
      return;
    }
    setIsGenerating(true);
    // Let the button show its state before the (synchronous) drawing starts.
    window.setTimeout(() => {
      try {
        const { doc, pages } = renderReportPdf(model);
        doc.save(reportFileName(model));
        setResult(`PDF gerado: ${pages} ${pages === 1 ? "página" : "páginas"}.`);
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : "Não foi possível gerar o PDF.");
      } finally {
        setIsGenerating(false);
      }
    }, 30);
  }

  if (!projectId || !projectKey) {
    return (
      <section className="panel export-empty">
        <strong>Desbloqueie o projeto</strong>
        <p>O relatório é montado neste navegador, a partir do texto cifrado do projeto.</p>
      </section>
    );
  }

  const showsCover = options.preset !== "CHECKLIST";
  const isWord = format === "DOCX";
  const sectionsPreview: string[] = [];
  if (model) {
    if (showsCover && !isWord)
      sectionsPreview.push(options.letter.trim() ? "Capa com carta de revisão" : "Capa e sumário com links");
    if (options.preset === "AUTHOR") {
      sectionsPreview.push(`Resumo${model.rhythm ? " com extensão e tensão das cenas" : ""}`);
      if (model.priorities.length) sectionsPreview.push(`${model.priorities.length} prioridades, agrupadas`);
      if (model.structure) sectionsPreview.push(`Revisão estrutural: ${model.structure.findings.length} achados`);
    }
    if (model.generalNotes.length)
      sectionsPreview.push(`${model.generalNotes.length} ${model.generalNotes.length === 1 ? 'nota geral' : 'notas gerais'} do projeto`);
    sectionsPreview.push(
      isWord
        ? `${model.sections.length} cenas, cada uma com Título 1, e ${model.stats.items} observações como comentários${options.includeStyle && styleSheet ? ", mais as ocorrências da folha de estilo" : ""}`
        : options.preset === "MANUSCRIPT"
        ? `${model.sections.length} cenas com texto e ${model.stats.items} observações numeradas`
        : `${model.sections.length} de ${model.stats.scenes} cenas com pendências, ${model.stats.items} ${model.stats.items === 1 ? 'item' : 'itens'}`,
    );
    if (!options.includeExceptions && model.stats.exceptions) {
      sectionsPreview.push(
        model.stats.exceptions === 1
          ? '1 exceção intencional fica de fora'
          : `${model.stats.exceptions} exceções intencionais ficam de fora`,
      );
    }
  }

  return (
    <section className="export-page">
      <header className="page-intro">
        <p className="eyebrow">Documento de revisão</p>
        <h1>Exportar revisões</h1>
        <p>
          Escolha para quem é o documento. Ele traz só o que pede ação, em ordem de prioridade, e é montado neste
          navegador: o texto não sai daqui.
        </p>
      </header>

      <div className="export-layout">
        <div className="export-main">
          <section className="panel" aria-labelledby="export-kind">
            <h2 id="export-kind">Tipo de documento</h2>
            <div className="export-presets" role="radiogroup" aria-labelledby="export-kind">
              {presets.map((preset) => (
                <button
                  aria-checked={options.preset === preset.id}
                  className="export-preset"
                  key={preset.id}
                  role="radio"
                  type="button"
                  onClick={() => update({ preset: preset.id, ...presetDefaults[preset.id] })}
                >
                  <span className="export-preset-reader">{preset.reader}</span>
                  <strong>{preset.title}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
            {options.preset === "MANUSCRIPT" && (
              <fieldset className="export-format">
                <legend>Formato</legend>
                <label className="checkbox-label">
                  <input
                    checked={format === "PDF"}
                    name="export-format"
                    type="radio"
                    onChange={() => {
                      setResult(null);
                      setFormat("PDF");
                    }}
                  />
                  <span>PDF, com observações numeradas</span>
                </label>
                <label className="checkbox-label">
                  <input
                    checked={format === "DOCX"}
                    name="export-format"
                    type="radio"
                    onChange={() => {
                      setResult(null);
                      setFormat("DOCX");
                    }}
                  />
                  <span>Word (.docx), com cada observação como comentário no trecho</span>
                </label>
              </fieldset>
            )}
          </section>

          <section className="panel" aria-labelledby="export-content">
            <h2 id="export-content">Conteúdo</h2>
            <div className="export-fields">
              <label>
                <span>Abrangência</span>
                <select
                  value={options.scope.kind === "GROUP" ? `group:${options.scope.groupId}` : options.scope.kind}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "ALL") update({ scope: { kind: "ALL" } });
                    else if (value === "RANGE") update({ scope: { kind: "RANGE", from: 1, to: Math.max(1, timelineCount) } });
                    else update({ scope: { kind: "GROUP", groupId: value.slice(6) } });
                  }}
                >
                  <option value="ALL">Obra completa</option>
                  {groups.map((group) => (
                    <option key={group.id} value={`group:${group.id}`}>
                      Grupo: {group.name}
                    </option>
                  ))}
                  <option value="RANGE">Intervalo de cenas…</option>
                </select>
              </label>
              {options.scope.kind === "RANGE" && (
                <div className="export-range">
                  <label>
                    <span>Da cena</span>
                    <input
                      max={timelineCount}
                      min={1}
                      type="number"
                      value={options.scope.from}
                      onChange={(event) =>
                        options.scope.kind === "RANGE" &&
                        update({ scope: { ...options.scope, from: Math.max(1, Number(event.target.value) || 1) } })
                      }
                    />
                  </label>
                  <label>
                    <span>até</span>
                    <input
                      max={timelineCount}
                      min={1}
                      type="number"
                      value={options.scope.to}
                      onChange={(event) =>
                        options.scope.kind === "RANGE" &&
                        update({ scope: { ...options.scope, to: Math.max(1, Number(event.target.value) || 1) } })
                      }
                    />
                  </label>
                </div>
              )}
              <label>
                <span>Diagnósticos a partir de</span>
                <select
                  value={options.minSeverity}
                  onChange={(event) => update({ minSeverity: event.target.value as DiagnosticSeverity })}
                >
                  {(["CRITICAL", "WARNING", "NOTE"] as const).map((severity) => (
                    <option key={severity} value={severity}>
                      {severity === "NOTE" ? "Todos" : severity === "WARNING" ? "Atenção e críticos" : "Só críticos"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Notas de revisão</span>
                <select value={options.notes} onChange={(event) => update({ notes: event.target.value as ReportOptions["notes"] })}>
                  <option value="OPEN">Só abertas</option>
                  <option value="ALL">Abertas e resolvidas</option>
                  <option value="NONE">Nenhuma</option>
                </select>
              </label>
            </div>
            <div className="export-toggles">
              {(
                [
                  ["includeArchitect", "Revisão estrutural", options.preset === "AUTHOR"],
                  ["includeRhythm", "Extensão e tensão das cenas", options.preset === "AUTHOR"],
                  ["includeAlerts", "Continuidade a reler", true],
                  ["includeStyle", isWord ? "Ocorrências da folha de estilo, como comentários" : "Resumo da folha de estilo", true],
                  ["includeExceptions", "Exceções intencionais, com justificativa", true],
                ] as const
              )
                .filter(([, , available]) => available)
                .map(([key, label]) => (
                  <label className="checkbox-label" key={key}>
                    <input checked={options[key]} type="checkbox" onChange={(event) => update({ [key]: event.target.checked })} />
                    <span>{label}</span>
                  </label>
                ))}
            </div>
          </section>

          {showsCover && (
            <section className="panel" aria-labelledby="export-cover">
              <h2 id="export-cover">{isWord ? "Comentários" : "Capa"}</h2>
              <div className="export-fields">
                <label>
                  <span>{isWord ? "Autor dos comentários" : "Revisão por"}</span>
                  <input
                    placeholder="Seu nome (opcional)"
                    value={options.reviewer}
                    onChange={(event) => update({ reviewer: event.target.value })}
                  />
                </label>
                {!isWord && (
                <label className="export-letter">
                  <span>Carta de revisão (opcional)</span>
                  <textarea
                    placeholder="Uma visão geral para o autor: o que funciona, o que priorizar nesta rodada…"
                    rows={5}
                    value={options.letter}
                    onChange={(event) => update({ letter: event.target.value })}
                  />
                </label>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="export-aside">
          <section className="panel export-preview" aria-labelledby="export-preview-title" aria-live="polite">
            <h2 id="export-preview-title">O documento</h2>
            {!model ? (
              <div className="export-loading" role="status">
                <span>{progress ? `Reunindo revisões: ${progress.done} de ${progress.total} cenas…` : "Reunindo revisões…"}</span>
                {progress && (
                  <span className="export-progress">
                    <span style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
                  </span>
                )}
              </div>
            ) : (
              <>
                <p className="export-scope">
                  {model.scopeLabel} · {model.stats.scenes} {model.stats.scenes === 1 ? "cena" : "cenas"}
                  {options.minSeverity !== "NOTE" && ` · a partir de “${severityNames[options.minSeverity]}”`}
                </p>
                <ul className="export-contents">
                  {sectionsPreview.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {model.priorities.length > 0 && options.preset === "AUTHOR" && (
                  <div className="export-top">
                    <span>Primeiras prioridades</span>
                    <ol>
                      {model.priorities.slice(0, 3).map((priority) => (
                        <li className={`tone-${priority.tone}`} key={priority.title}>
                          {priority.title}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {model.warnings.map((warning) => (
                  <p className="export-warning" key={warning}>
                    {warning}
                  </p>
                ))}
                <button
                  className="button button-primary export-generate"
                  disabled={isGenerating || model.stats.scenes === 0}
                  type="button"
                  onClick={generate}
                >
                  {isGenerating
                    ? isWord
                      ? "Gerando documento…"
                      : "Gerando PDF…"
                    : isWord
                      ? "Gerar documento do Word"
                      : "Gerar PDF"}
                </button>
                {result && (
                  <p className="export-result" role="status">
                    {result}
                  </p>
                )}
                <button className="text-button export-refresh" type="button" onClick={() => setReloads((count) => count + 1)}>
                  Atualizar dados
                </button>
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
