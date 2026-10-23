import { useState } from "react";
import { admin } from "../api/client";
import type { AdminLlmModels } from "../api/contracts";
import { usageFeatureDescriptions, usageFeatureLabels, usageFeatureOrder } from "../features/usage/usage";
import { formatDate, useAdminData } from "./adminData";
import { StatusChip } from "./AdminParts";

const loadModels = () => admin.models();

type TaskModel = AdminLlmModels["tasks"][number];

export function ModelsSection() {
  const { data, setData, error, setError } = useAdminData(loadModels);
  const tasks = data
    ? usageFeatureOrder.flatMap((feature) => data.tasks.filter((task) => task.task === feature))
    : [];

  return (
    <>
      <header className="page-intro admin-intro">
        <p className="eyebrow">Administração</p>
        <h1>Modelos</h1>
        <p>
          O modelo que cada etapa de análise chama. A troca vale a partir da próxima análise, sem deploy; sem escolha,
          a etapa usa o padrão do servidor.
        </p>
      </header>

      {error && <p className="form-message">{error}</p>}
      {data && data.availableModels === null && (
        <p className="admin-muted">
          Não foi possível consultar a lista de modelos do provedor. Confira o nome antes de salvar: um modelo
          inexistente faz as análises daquela etapa falharem.
        </p>
      )}

      {tasks.length > 0 && (
        <>
          <datalist id="admin-model-options">
            {(data?.availableModels ?? []).map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <ul className="admin-cards">
            {tasks.map((task) => (
              <li className="admin-card" key={task.task}>
                <ModelEditor
                  task={task}
                  onSaved={(saved) => {
                    setData(saved);
                    setError("");
                  }}
                  onError={setError}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ModelEditor({
  task,
  onSaved,
  onError,
}: {
  task: TaskModel;
  onSaved: (models: AdminLlmModels) => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState(task.model);
  const [isSaving, setIsSaving] = useState(false);
  const trimmed = value.trim();
  const isChanged = trimmed !== "" && trimmed !== task.model;

  async function save(model: string | null) {
    setIsSaving(true);
    try {
      const saved = await admin.setModel(task.task, model);
      onSaved(saved);
      setValue(saved.tasks.find((item) => item.task === task.task)?.model ?? "");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Não foi possível salvar o modelo.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="admin-card-head">
        <div>
          <strong>{usageFeatureLabels[task.task]}</strong>
          <span className="admin-muted admin-note">{usageFeatureDescriptions[task.task]}</span>
        </div>
        {task.isDefault ? (
          <StatusChip tone="muted">Padrão do servidor</StatusChip>
        ) : (
          <StatusChip tone="good">Escolhido pelo admin</StatusChip>
        )}
      </div>
      <div className="admin-card-foot">
        <form
          className="admin-limit admin-model"
          onSubmit={(event) => {
            event.preventDefault();
            if (isChanged) void save(trimmed);
          }}
        >
          <input
            aria-label={`Modelo do ${usageFeatureLabels[task.task]}`}
            autoComplete="off"
            list="admin-model-options"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          {isChanged && (
            <button className="button button-small button-primary" disabled={isSaving} type="submit">
              {isSaving ? "…" : "Salvar"}
            </button>
          )}
        </form>
        <span className="admin-card-actions">
          <span className="admin-muted">
            {task.isDefault
              ? "Definido no .env do servidor"
              : `Padrão: ${task.defaultModel} · alterado em ${formatDate(task.updatedAt)}`}
          </span>
          {!task.isDefault && (
            <button className="text-button" disabled={isSaving} type="button" onClick={() => void save(null)}>
              Voltar ao padrão
            </button>
          )}
        </span>
      </div>
    </>
  );
}
