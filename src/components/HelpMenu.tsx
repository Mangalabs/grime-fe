import "./AccountMenu.css";
import type { TourId } from "../features/tour/tours";
import { usePopover } from "../features/usePopover";
import { BookIcon, CompassIcon, HelpIcon } from "./icons";

export function HelpMenu({
  hasOpenProject,
  onOpenGuide,
  onStartTour,
}: {
  hasOpenProject: boolean;
  onOpenGuide: (articleId: string | null) => void;
  onStartTour: (tour: TourId) => void;
}) {
  const { isOpen, openedWithKeyboard, close, toggle, containerRef, triggerRef } = usePopover();

  const item = (label: string, run: () => void, options: { icon: React.ReactNode; first?: boolean }) => (
    <button
      autoFocus={options.first && openedWithKeyboard}
      className="account-action"
      type="button"
      onClick={() => {
        close();
        run();
      }}
    >
      {options.icon}
      {label}
    </button>
  );

  return (
    <div className="account-menu" data-tour="help" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Ajuda"
        className="icon-button topbar-icon-button"
        ref={triggerRef}
        title="Ajuda"
        type="button"
        onClick={toggle}
      >
        <HelpIcon />
      </button>

      {isOpen && (
        <div className="account-popover help-popover">
          {item("Guia do Petricor", () => onOpenGuide(null), { icon: <BookIcon />, first: true })}
          {item("Tour de boas-vindas", () => onStartTour("welcome"), { icon: <CompassIcon /> })}
          {hasOpenProject && item("Tour do editor", () => onStartTour("project"), { icon: <CompassIcon /> })}
          {item("Atalhos de teclado", () => onOpenGuide("atalhos"), {
            icon: <kbd className="help-kbd">⌘</kbd>,
          })}
        </div>
      )}
    </div>
  );
}
