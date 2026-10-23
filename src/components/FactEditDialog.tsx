import { type FormEvent, useState } from "react";
import {
  factEntityTypes,
  type FactEntityType,
  type PendingFact,
} from "../api/contracts";
import "./Modal.css";

const entityLabels: Record<FactEntityType, string> = {
  CHARACTER: "Personagem",
  LOCATION: "Local",
  ITEM: "Item",
  FACTION: "Facção",
  WORLD_RULE: "Regra do mundo",
  EVENT: "Evento",
};

export function FactEditDialog({
  fact,
  isSaving,
  onClose,
  onSave,
}: {
  fact: PendingFact;
  isSaving: boolean;
  onClose: () => void;
  onSave: (fact: PendingFact) => Promise<void>;
}) {
  const [draft, setDraft] = useState(fact);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.isSubjective && !draft.sourceClaim?.trim()) {
      setError("Todo fato subjetivo precisa identificar a alegação de origem.");
      return;
    }
    await onSave(draft);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="fact-edit-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <p className="eyebrow">Fato aprovado</p>
        <h2 id="fact-edit-title">Editar fato</h2>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span>Entidade</span>
            <input
              onChange={(event) =>
                setDraft({ ...draft, entityName: event.target.value })
              }
              required
              value={draft.entityName}
            />
          </label>
          <label>
            <span>Tipo</span>
            <select
              onChange={(event) =>
                setDraft({
                  ...draft,
                  entityType: event.target.value as FactEntityType,
                })
              }
              value={draft.entityType}
            >
              {factEntityTypes.map((type) => (
                <option key={type} value={type}>
                  {entityLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Atributo</span>
            <input
              onChange={(event) =>
                setDraft({ ...draft, attribute: event.target.value })
              }
              required
              value={draft.attribute}
            />
          </label>
          <label>
            <span>Valor</span>
            <input
              onChange={(event) =>
                setDraft({ ...draft, value: event.target.value })
              }
              required
              value={draft.value}
            />
          </label>
          <label>
            <span>Refere-se a (opcional)</span>
            <input
              onChange={(event) =>
                setDraft({ ...draft, targetEntityName: event.target.value || null })
              }
              placeholder="Outra entidade citada no valor"
              value={draft.targetEntityName ?? ""}
            />
          </label>
          <label className="checkbox-label">
            <input
              checked={draft.isSubjective}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  isSubjective: event.target.checked,
                  sourceClaim: event.target.checked
                    ? (draft.sourceClaim ?? "")
                    : null,
                })
              }
              type="checkbox"
            />
            <span>Fato subjetivo</span>
          </label>
          {draft.isSubjective && (
            <label>
              <span>Alegação de origem</span>
              <input
                onChange={(event) =>
                  setDraft({ ...draft, sourceClaim: event.target.value })
                }
                required
                value={draft.sourceClaim ?? ""}
              />
            </label>
          )}
          {error && <p className="form-message">{error}</p>}
          <div className="modal-actions">
            <button
              className="button button-secondary"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="button button-primary"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Salvando…" : "Salvar fato"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
