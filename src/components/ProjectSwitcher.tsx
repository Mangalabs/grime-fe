import { useEffect, useRef } from "react";
import "./ProjectSwitcher.css";
import type { Project } from "../api/contracts";
import { usePopover } from "../features/usePopover";
import { CheckIcon, ChevronUpDownIcon, PlusIcon } from "./icons";

export function ProjectSwitcher({
  projects,
  projectId,
  sceneCount,
  onSelect,
  onCreate,
}: {
  projects: Project[] | null;
  projectId: string;
  sceneCount: number;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const { isOpen, openedWithKeyboard, close, toggle, containerRef, triggerRef } = usePopover();
  const listRef = useRef<HTMLUListElement>(null);
  const current = projects?.find((project) => project.id === projectId);

  // From the keyboard, focus the open project (or the first one) so arrow
  // keys start from there.
  useEffect(() => {
    if (!isOpen || !openedWithKeyboard) {
      return;
    }
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>("button");
    const selected = listRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    (selected ?? items?.[0])?.focus();
  }, [isOpen, openedWithKeyboard]);

  function moveFocus(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  }

  function choose(id: string) {
    close();
    if (id !== projectId) {
      onSelect(id);
    }
  }

  return (
    <div className="project-switcher" data-tour="project-switcher" ref={containerRef}>
      <p className="sidebar-section-label" id="project-switcher-label">Projeto</p>
      <button
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-labelledby="project-switcher-label project-switcher-current"
        className="project-switcher-trigger"
        ref={triggerRef}
        type="button"
        onClick={toggle}
      >
        <span className={`project-avatar${current ? "" : " is-empty"}`} aria-hidden="true">
          {current ? initialOf(current.title) : "?"}
        </span>
        <span className="project-switcher-text" id="project-switcher-current">
          <span className="project-switcher-title">
            {current?.title ?? "Nenhum projeto"}
          </span>
          <span className="project-switcher-meta">
            {current
              ? sceneCount === 1 ? "1 cena" : `${sceneCount} cenas`
              : projects === null
                ? "Carregando…"
                : projects.length === 0
                  ? "Crie o primeiro"
                  : "Escolha um projeto"}
          </span>
        </span>
        <ChevronUpDownIcon />
      </button>

      {isOpen && (
        <div className="project-switcher-popover">
          {projects && projects.length > 0 ? (
            <ul aria-label="Seus projetos" className="project-switcher-list" ref={listRef} onKeyDown={moveFocus}>
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    aria-current={project.id === projectId}
                    className="project-switcher-option"
                    type="button"
                    onClick={() => choose(project.id)}
                  >
                    <span className="project-avatar is-small" aria-hidden="true">
                      {initialOf(project.title)}
                    </span>
                    <span className="project-switcher-option-title">{project.title}</span>
                    {project.id === projectId && <CheckIcon />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="project-switcher-empty">
              {projects === null ? "Carregando projetos…" : "Você ainda não tem projetos."}
            </p>
          )}
          <button
            className="project-switcher-create"
            type="button"
            onClick={() => {
              close();
              onCreate();
            }}
          >
            <PlusIcon />
            Novo projeto
          </button>
        </div>
      )}
    </div>
  );
}

function initialOf(title: string): string {
  return title.trim().charAt(0).toUpperCase() || "?";
}
