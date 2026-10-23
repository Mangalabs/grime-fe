import { useState } from "react";
import "./ProjectCreationModal.css";
import "./Modal.css";
import { api } from "../api/client";
import { createProjectEncryption } from "../crypto/projectEncryption";

export function ProjectCreationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string, projectKey: CryptoKey) => void;
}) {
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    if (!title || !password || !key || !confirmed) {
      setError("Gere, copie e confirme a chave privada antes de continuar.");
      return;
    }
    const { envelope, projectKey } = await createProjectEncryption(
      password,
      key,
    );
    const project = await api.createProject(title, envelope);
    onCreated(project.id, projectKey);
  }
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true">
        <p className="eyebrow">Novo projeto</p>
        {!key ? (
          <>
            <h2 className="create-key-title">Crie sua chave privada</h2>
            <button
              className="button button-primary"
              type="button"
              onClick={() =>
                setKey(`${crypto.randomUUID()}-${crypto.randomUUID()}`)
              }
            >
              Gerar chave privada
            </button>
          </>
        ) : (
          <>
            <label>
              <span>Chave privada de recuperação</span>
              <input
                value={key}
                readOnly
                onClick={(event) => {
                  (event.target as HTMLInputElement).select();
                  navigator.clipboard.writeText(key);
                  alert("Chave copiada para a área de transferência");
                }}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>Copiei e guardei esta chave.</span>
            </label>
            <label>
              <span>Título</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              <span>Senha</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        )}
        {error && <p className="form-message">{error}</p>}
        <div className="modal-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
          >
            Cancelar
          </button>
          {key && (
            <button
              className="button button-primary"
              type="button"
              onClick={() => void create()}
            >
              Criar projeto
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
