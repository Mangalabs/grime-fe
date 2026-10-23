import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./ProductTour.css";

export type TourStep = {
  // The `data-tour` value of the element to spotlight; absent for a centred card.
  target?: string;
  title: string;
  body: ReactNode;
  // Lives in the sidebar, which is a closed drawer on narrow screens.
  inSidebar?: boolean;
  // A guide article that explains the step in depth.
  learnMore?: string;
};

export type TourFinalAction = { label: string; run: () => void };

type Rect = { top: number; left: number; width: number; height: number };

const spotlightPadding = 8;
const cardGap = 14;
const viewportMargin = 16;

function targetOf(step: TourStep): HTMLElement | null {
  if (!step.target) return null;
  const element = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
  return element && element.getClientRects().length > 0 ? element : null;
}

function isNarrow() {
  return window.matchMedia("(max-width: 1180px)").matches;
}

export function ProductTour({
  steps,
  finalAction,
  onClose,
  onOpenArticle,
  onSidebarNeeded,
}: {
  steps: TourStep[];
  finalAction?: TourFinalAction;
  // Finishing, skipping and closing all count as done: the tour doesn't nag.
  onClose: () => void;
  onOpenArticle: (articleId: string) => void;
  onSidebarNeeded: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(() => firstAvailable(steps, 0, 1));
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardPosition, setCardPosition] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const isLast = firstAvailable(steps, index + 1, 1) === -1;
  const isFirst = firstAvailable(steps, index - 1, -1) === -1;
  // Counted over the steps that will show, so "3 de 5" never skips a number.
  const shown = steps.filter((candidate, position) => position === index || isAvailable(candidate));
  const shownIndex = shown.indexOf(step);

  const measure = useCallback(() => {
    const element = step ? targetOf(step) : null;
    if (!element) {
      setRect(null);
      return;
    }
    const box = element.getBoundingClientRect();
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, [step]);

  // Show the drawer for sidebar steps on narrow screens, then bring the target into view.
  useLayoutEffect(() => {
    if (!step) return;
    const needsDrawer = Boolean(step.inSidebar) && isNarrow();
    onSidebarNeeded(needsDrawer);
    const element = targetOf(step);
    element?.scrollIntoView({ block: "center", inline: "nearest" });
    // Reads the layout the browser just produced; that is what a layout effect is for.
    // oxlint-disable-next-line react/set-state-in-effect
    measure();
    // The drawer slides in; measure again once it has settled.
    const settle = window.setTimeout(measure, needsDrawer ? 260 : 60);
    return () => window.clearTimeout(settle);
  }, [step, measure, onSidebarNeeded]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [measure]);

  // Beside the target where it fits: below, above, right, then left.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (!rect || window.matchMedia("(max-width: 600px)").matches) {
      // Centred or docked by CSS; placed from the measured card otherwise.
      // oxlint-disable-next-line react/set-state-in-effect
      setCardPosition(null);
      return;
    }
    const { width, height } = card.getBoundingClientRect();
    const spot = {
      top: rect.top - spotlightPadding,
      left: rect.left - spotlightPadding,
      bottom: rect.top + rect.height + spotlightPadding,
      right: rect.left + rect.width + spotlightPadding,
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centredLeft = rect.left + rect.width / 2 - width / 2;
    const centredTop = rect.top + rect.height / 2 - height / 2;
    const candidates = [
      { top: spot.bottom + cardGap, left: centredLeft, fits: spot.bottom + cardGap + height <= vh - viewportMargin },
      { top: spot.top - cardGap - height, left: centredLeft, fits: spot.top - cardGap - height >= viewportMargin },
      { top: centredTop, left: spot.right + cardGap, fits: spot.right + cardGap + width <= vw - viewportMargin },
      { top: centredTop, left: spot.left - cardGap - width, fits: spot.left - cardGap - width >= viewportMargin },
    ];
    // A target taller than the screen: sit the card over its lower part.
    const chosen = candidates.find((candidate) => candidate.fits) ?? {
      top: vh - height - viewportMargin,
      left: centredLeft,
    };
    setCardPosition({
      top: clamp(chosen.top, viewportMargin, vh - height - viewportMargin),
      left: clamp(chosen.left, viewportMargin, vw - width - viewportMargin),
    });
  }, [rect, index]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  const go = useCallback(
    (direction: 1 | -1) => {
      const next = firstAvailable(steps, index + direction, direction);
      if (next !== -1) setIndex(next);
      else if (direction === 1) onClose();
    },
    [index, onClose, steps],
  );

  // Captured so the app's own shortcuts (Escape closes drawers, [ ] change scenes) stay quiet.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        go(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        go(-1);
      } else if (event.key === "Tab") {
        // Focus stays in the card while the tour is open.
        const focusable = [...(cardRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
        if (focusable.length === 0) return;
        const position = focusable.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? position <= 0 ? focusable.length - 1 : position - 1
          : position === focusable.length - 1 ? 0 : position + 1;
        event.preventDefault();
        focusable[next].focus();
      } else if (event.key === "[" || event.key === "]") {
        event.stopPropagation();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  // Hand the drawer back closed when the tour ends.
  useEffect(() => () => onSidebarNeeded(false), [onSidebarNeeded]);

  if (!step) return null;

  return createPortal(
    <div className="tour-root">
      {/* Blocks the page: the tour talks, the author listens or skips. */}
      <div className={`tour-blocker${rect ? "" : " is-dimmed"}`} />
      {rect && (
        <div
          aria-hidden="true"
          className="tour-spotlight"
          style={{
            top: rect.top - spotlightPadding,
            left: rect.left - spotlightPadding,
            width: rect.width + spotlightPadding * 2,
            height: rect.height + spotlightPadding * 2,
          }}
        />
      )}
      <div
        aria-describedby="tour-body"
        aria-labelledby="tour-title"
        aria-modal="true"
        className={`tour-card${rect ? "" : " is-centred"}${cardPosition ? "" : " is-docked"}`}
        ref={cardRef}
        role="dialog"
        style={cardPosition ?? undefined}
        tabIndex={-1}
      >
        <div className="tour-card-head">
          <span className="tour-progress">
            {shownIndex + 1} de {shown.length}
          </span>
          <button className="tour-skip" type="button" onClick={onClose}>
            {isLast ? "Fechar" : "Pular tour"}
          </button>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <div className="tour-body" id="tour-body">
          {step.body}
        </div>
        <div className="tour-dots" aria-hidden="true">
          {shown.map((item, position) => (
            <span className={position === shownIndex ? "is-current" : ""} key={item.title} />
          ))}
        </div>
        <div className="tour-actions">
          {step.learnMore ? (
            <button
              className="tour-learn-more"
              type="button"
              onClick={() => {
                onOpenArticle(step.learnMore!);
                onClose();
              }}
            >
              Saiba mais no Guia
            </button>
          ) : (
            <span />
          )}
          <div className="tour-nav">
            {!isFirst && (
              <button className="button button-secondary button-small" type="button" onClick={() => go(-1)}>
                Voltar
              </button>
            )}
            {isLast && finalAction ? (
              <button
                className="button button-primary button-small"
                type="button"
                onClick={() => {
                  onClose();
                  finalAction.run();
                }}
              >
                {finalAction.label}
              </button>
            ) : (
              <button className="button button-primary button-small" type="button" onClick={() => go(1)}>
                {isLast ? "Concluir" : "Próximo"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// A step shows when it has no target or its target is on screen. Sidebar
// steps count as available on narrow screens: the drawer opens for them.
function isAvailable(step: TourStep): boolean {
  if (!step.target) return true;
  if (step.inSidebar && isNarrow()) return document.querySelector(`[data-tour="${step.target}"]`) !== null;
  return targetOf(step) !== null;
}

function firstAvailable(steps: TourStep[], from: number, direction: 1 | -1): number {
  for (let position = from; position >= 0 && position < steps.length; position += direction) {
    if (isAvailable(steps[position])) return position;
  }
  return -1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
