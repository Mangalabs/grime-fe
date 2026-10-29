import { useEffect, useMemo, useRef, useState } from "react";
import { countWords, formatWords } from "../features/usage/usage";
import {
  focusModes,
  noteKinds,
  type DiagnosticSeverity,
  type FocusMode,
  type LinterDiagnostic,
  type NoteKind,
  type SceneGroup,
} from "../api/contracts";
import type { NoteAnchor } from "../features/notes/notes";
import { locateQuote } from "../features/scenes/quotes";
import "./SceneEditor.css";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

export interface SceneNavigation {
  label: string;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onOpenFinder: () => void;
}

export interface FocusedQuote {
  quote: string;
  origin: "text" | "diagnostic";
}

/** A selected passage of the scene, by offsets into its text. */
/**
 * The split point nearest to a click: a sentence or paragraph start, so a
 * scene isn't cut mid-sentence. Falls back to the nearest word boundary.
 */
function sentenceStarts(content: string): number[] {
  const starts: number[] = [];
  const pattern = /(?:[.!?…]["”»)\]]*\s+|\n+\s*)(?=\S)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    starts.push(match.index + match[0].length);
  }
  return starts.filter((start) => start > 0 && start < content.length);
}

function snapToSentence(content: string, offset: number): number {
  const candidates = sentenceStarts(content);
  if (candidates.length > 0) {
    return candidates.reduce((best, start) =>
      Math.abs(start - offset) < Math.abs(best - offset) ? start : best,
    );
  }
  const space = content.indexOf(" ", offset);
  return space > 0 && space < content.length - 1 ? space + 1 : Math.max(1, Math.min(offset, content.length - 1));
}

export interface StyleMark {
  key: string;
  start: number;
  end: number;
  label: string;
}

export interface SceneExcerpt {
  quote: string;
  start: number;
  end: number;
}

// Drops surrounding whitespace from a selection so the quote is clean.
function trimExcerpt(content: string, start: number, end: number): SceneExcerpt | null {
  let from = start;
  let to = end;
  while (from < to && /\s/.test(content[from])) from++;
  while (to > from && /\s/.test(content[to - 1])) to--;
  return to > from ? { quote: content.slice(from, to), start: from, end: to } : null;
}

interface SceneEditorProps {
  content: string;
  genre: string;
  focusMode: FocusMode;
  title: string;
  positionLabel: string;
  navigation: SceneNavigation | null;
  isUnanchored: boolean;
  insertionLabel: string;
  hasSlot: boolean;
  // Identifies the open scene; split mode ends when it changes.
  sceneId: string;
  isSubmitting: boolean;
  isLocked: boolean;
  diagnostics: LinterDiagnostic[];
  focusedQuote: FocusedQuote | null;
  onFocusQuote: (quote: string) => void;
  // Excerpt notes of this scene, already located in its text.
  noteAnchors: NoteAnchor[];
  // A request to show a note's excerpt (a new object per request).
  noteFocus: { noteId: string } | null;
  onFocusNote: (noteId: string) => void;
  onExcerptChange: (excerpt: SceneExcerpt | null) => void;
  // With a kind, the note composer opens already set to it.
  onAnnotate: (excerpt: SceneExcerpt, kind?: NoteKind) => void;
  isReadingMode?: boolean;
  onToggleReadingMode?: () => void;
  // Style sheet occurrences: a quieter layer than diagnostics.
  styleMarks: StyleMark[];
  styleFocus: { key: string } | null;
  onFocusStyle: (key: string) => void;
  // Structure: group membership, split and merge.
  groups: SceneGroup[];
  groupId: string | null;
  onGroupChange: (groupId: string | null) => void;
  nextSceneTitle: string | null;
  onRequestMerge: () => void;
  // Alt+X / Alt+J when the action can't run now: says why.
  onShortcutUnavailable: (message: string) => void;
  onSplit: (offset: number, newTitle: string) => Promise<void>;
  onContentChange: (content: string) => void;
  onGenreChange: (genre: string) => void;
  onFocusModeChange: (focusMode: FocusMode) => void;
  onTitleChange: (title: string) => void;
  onUnanchoredChange: (isUnanchored: boolean) => void;
  onSave: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
}

const annotateKindLabels: Record<NoteKind, string> = {
  NOTE: "Nota",
  QUESTION: "Pergunta",
  FIX: "Corrigir",
  IDEA: "Ideia",
};

const focusLabels: Record<FocusMode, string> = {
  GENERAL: "Revisão geral",
  PACING: "Ritmo e causalidade",
  WORLDBUILDING: "Mundo e continuidade",
  PROSE_STYLE: "Estilo de prosa",
};

// What the Revisor looks at under each focus; continuity is always checked.
const focusHints: Record<FocusMode, string> = {
  GENERAL: "Continuidade e até 3 pontos de ofício: mostrar × contar, causalidade, exposição, ambientação.",
  PACING: "Continuidade, mostrar × contar, causalidade e ambientação.",
  WORLDBUILDING: "Só continuidade com o cânone e exposição do mundo em diálogos.",
  PROSE_STYLE: "Continuidade e prosa: verbos de filtro, cadência, muletas e voz nos diálogos.",
};

const severityRank: Record<DiagnosticSeverity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  NOTE: 1,
};

interface TextSegment {
  text: string;
  diagnostic?: { quote: string; severity: DiagnosticSeverity };
  noteIds: string[];
  noteKind?: NoteKind;
  styleKeys: string[];
  styleLabel?: string;
}

/**
 * Splits the scene at every diagnostic and note boundary, so overlapping
 * highlights both stay visible. Diagnostic quotes that don't occur verbatim,
 * or overlap an earlier diagnostic, are left unmarked.
 */
function segmentContent(
  content: string,
  diagnostics: LinterDiagnostic[],
  notes: NoteAnchor[],
  styles: StyleMark[] = [],
): TextSegment[] {
  const severityByQuote = new Map<string, DiagnosticSeverity>();
  diagnostics.forEach(({ sourceQuote, severity }) => {
    const current = severityByQuote.get(sourceQuote);
    if (!current || severityRank[severity] > severityRank[current]) {
      severityByQuote.set(sourceQuote, severity);
    }
  });

  const diagnosticRanges: Array<{ start: number; end: number; quote: string; severity: DiagnosticSeverity }> = [];
  [...severityByQuote]
    .filter(([quote]) => quote.trim())
    .flatMap(([quote, severity]) => {
      const span = locateQuote(content, quote);
      return span ? [{ ...span, quote, severity }] : [];
    })
    .sort((a, b) => a.start - b.start)
    .forEach((range) => {
      const last = diagnosticRanges.at(-1);
      if (!last || range.start >= last.end) {
        diagnosticRanges.push(range);
      }
    });

  const boundaries = new Set([0, content.length]);
  [...diagnosticRanges, ...notes, ...styles].forEach(({ start, end }) => {
    boundaries.add(Math.max(0, Math.min(content.length, start)));
    boundaries.add(Math.max(0, Math.min(content.length, end)));
  });
  const points = [...boundaries].sort((a, b) => a - b);

  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [from, to] = [points[i], points[i + 1]];
    if (from === to) continue;
    const diagnostic = diagnosticRanges.find((range) => range.start <= from && range.end >= to);
    const covering = notes.filter((note) => note.start <= from && note.end >= to);
    const noteIds = covering.map((note) => note.noteId);
    const styleCovering = styles.filter((style) => style.start <= from && style.end >= to);
    const styleKeys = styleCovering.map((style) => style.key);
    const previous = segments.at(-1);
    if (
      previous &&
      previous.diagnostic?.quote === diagnostic?.quote &&
      previous.noteIds.join() === noteIds.join() &&
      previous.styleKeys.join() === styleKeys.join()
    ) {
      previous.text += content.slice(from, to);
      continue;
    }
    segments.push({
      text: content.slice(from, to),
      diagnostic: diagnostic ? { quote: diagnostic.quote, severity: diagnostic.severity } : undefined,
      noteIds,
      noteKind: covering[0]?.kind,
      styleKeys,
      styleLabel: styleCovering[0]?.label,
    });
  }
  return segments;
}

export function SceneEditor({
  content,
  genre,
  focusMode,
  title,
  positionLabel,
  navigation,
  isUnanchored,
  insertionLabel,
  hasSlot,
  sceneId,
  isSubmitting,
  isLocked,
  diagnostics,
  focusedQuote,
  onFocusQuote,
  noteAnchors,
  noteFocus,
  onFocusNote,
  onExcerptChange,
  onAnnotate,
  isReadingMode = false,
  onToggleReadingMode,
  styleMarks,
  styleFocus,
  onFocusStyle,
  groups,
  groupId,
  onGroupChange,
  nextSceneTitle,
  onRequestMerge,
  onShortcutUnavailable,
  onSplit,
  onContentChange,
  onGenreChange,
  onFocusModeChange,
  onTitleChange,
  onUnanchoredChange,
  onSave,
  onEdit,
  onCancelEdit,
  onRename,
  onDelete,
}: SceneEditorProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(
    () => segmentContent(content, diagnostics, noteAnchors, styleMarks),
    [content, diagnostics, noteAnchors, styleMarks],
  );

  // Locating an occurrence from the Estilo tab brings its mark into view.
  useEffect(() => {
    if (!styleFocus) return;
    readingRef.current
      ?.querySelector<HTMLElement>(`[data-style-keys~="${CSS.escape(styleFocus.key)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [styleFocus]);

  // A style occurrence inside a diagnostic or note keeps its own click.
  function styledText(segment: TextSegment) {
    if (!segment.styleKeys.length) return segment.text;
    const key = segment.styleKeys[0];
    return (
      <span
        className={`style-mark${styleFocus && segment.styleKeys.includes(styleFocus.key) ? " style-mark-active" : ""}`}
        data-style-keys={segment.styleKeys.join(" ")}
        title={segment.styleLabel ? `Folha de estilo: ${segment.styleLabel}` : "Folha de estilo"}
        onClick={(event) => {
          if (window.getSelection()?.isCollapsed === false) return;
          event.stopPropagation();
          onFocusStyle(key);
        }}
      >
        {segment.text}
      </span>
    );
  }

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitOffset, setSplitOffset] = useState<number | null>(null);
  const [splitTitle, setSplitTitle] = useState("");
  const [isSavingSplit, setIsSavingSplit] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const splitBarRef = useRef<HTMLDivElement>(null);

  // Split mode belongs to the text it started on: another scene, or this
  // one finishing loading, ends it (adjusted while rendering, not in an effect).
  const [splitBase, setSplitBase] = useState({ sceneId, content });
  if (splitBase.sceneId !== sceneId || splitBase.content !== content) {
    setSplitBase({ sceneId, content });
    if (isSplitting) {
      setIsSplitting(false);
      setSplitOffset(null);
    }
  }

  // From the keyboard, focus moves into the split bar, so the arrows only
  // move the cut (and not, say, the scene bar that had focus before).
  const [focusSplitBar, setFocusSplitBar] = useState(false);
  useEffect(() => {
    if (!focusSplitBar || !isSplitting) return;
    splitBarRef.current?.focus();
  }, [focusSplitBar, isSplitting]);

  useEffect(() => {
    if (!isMenuOpen && !isSplitting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        setIsSplitting(false);
        return;
      }
      if (!isSplitting || isSavingSplit || document.querySelector('[aria-modal="true"]')) return;
      const inField = (event.target as HTMLElement | null)?.closest("input, textarea, select");
      // Enter on a focused button (e.g. Cancelar) is that button's own action.
      const onButton = (event.target as HTMLElement | null)?.closest("button");
      if (event.key === "Enter" && !onButton && !event.altKey && !event.ctrlKey) {
        event.preventDefault();
        void confirmSplitRef.current();
        return;
      }
      // Arrows move the cut between sentences, except while typing the title.
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!step || inField || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const starts = sentenceStarts(content);
      if (starts.length === 0) return;
      setSplitOffset((current) => {
        if (current === null) return starts[Math.floor(starts.length / 2)];
        const index = starts.indexOf(current);
        const from = index >= 0 ? index : starts.findIndex((start) => start > current);
        return starts[Math.max(0, Math.min(starts.length - 1, from + step))];
      });
    };
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [isMenuOpen, isSplitting, isSavingSplit, content]);

  // Keep the chosen cut in view as it moves.
  useEffect(() => {
    if (splitOffset === null) return;
    document.querySelector(".split-marker")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [splitOffset]);

  // From the keyboard the cut starts mid-scene, so the arrows have somewhere to go.
  function startSplit(fromKeyboard = false) {
    const starts = fromKeyboard ? sentenceStarts(content) : [];
    setIsMenuOpen(false);
    setIsSplitting(true);
    setFocusSplitBar(fromKeyboard);
    setSplitOffset(starts.length ? starts[Math.floor(starts.length / 2)] : null);
    setSplitTitle(`${title || "Cena"} (parte 2)`);
    setSplitError(null);
  }

  // Click position in the text → offset, snapped to a sentence start.
  function pickSplitPoint(event: React.MouseEvent<HTMLDivElement>) {
    const container = event.currentTarget;
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let node: Node | null = null;
    let offsetInNode = 0;
    if (doc.caretPositionFromPoint) {
      const position = doc.caretPositionFromPoint(event.clientX, event.clientY);
      if (position) {
        node = position.offsetNode;
        offsetInNode = position.offset;
      }
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        node = range.startContainer;
        offsetInNode = range.startOffset;
      }
    }
    if (!node || !container.contains(node) || (node as Element).closest?.(".split-marker")) return;
    const before = document.createRange();
    before.selectNodeContents(container);
    before.setEnd(node, offsetInNode);
    // The marker's own text isn't part of the scene.
    const markerText = container.querySelector(".split-marker")?.textContent ?? "";
    let offset = before.toString().length;
    if (splitOffset !== null && offset > splitOffset) offset -= markerText.length;
    setSplitOffset(snapToSentence(content, offset));
  }

  // Alt+X and Alt+J, registered once; they read the latest state through a ref.
  const shortcutRef = useRef({ split: () => {}, merge: () => {} });
  useEffect(() => {
    shortcutRef.current = {
      split: () => {
        if (!hasSlot) onShortcutUnavailable("Salve a cena antes de dividi-la.");
        else if (!isLocked) onShortcutUnavailable("Termine ou cancele a edição antes de dividir a cena.");
        else if (!isSplitting && !isSubmitting) startSplit(true);
      },
      merge: () => {
        if (!hasSlot || !nextSceneTitle)
          onShortcutUnavailable("Só uma cena da timeline com uma cena seguinte pode ser juntada.");
        else if (!isLocked) onShortcutUnavailable("Termine ou cancele a edição antes de juntar cenas.");
        else if (!isSplitting && !isSubmitting) {
          setIsMenuOpen(false);
          onRequestMerge();
        }
      },
    };
  });
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.code !== "KeyX" && event.code !== "KeyJ") return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      if (event.code === "KeyX") shortcutRef.current.split();
      else shortcutRef.current.merge();
    }
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, []);

  // Enter in split mode confirms with the latest offset and title.
  const confirmSplitRef = useRef(async () => {});
  useEffect(() => {
    confirmSplitRef.current = confirmSplit;
  });

  async function confirmSplit() {
    if (splitOffset === null || !splitTitle.trim()) return;
    setIsSavingSplit(true);
    setSplitError(null);
    try {
      await onSplit(splitOffset, splitTitle.trim());
      setIsSplitting(false);
    } catch (reason) {
      setSplitError(reason instanceof Error ? reason.message : "Não foi possível dividir a cena.");
    } finally {
      setIsSavingSplit(false);
    }
  }

  // Each locate request is handled once, so later content edits don't
  // steal the author's cursor.
  const handledQuoteRef = useRef<FocusedQuote | null>(null);

  useEffect(() => {
    if (
      focusedQuote?.origin !== "diagnostic" ||
      focusedQuote === handledQuoteRef.current
    ) {
      return;
    }
    handledQuoteRef.current = focusedQuote;

    if (isLocked) {
      const mark = [
        ...(readingRef.current?.querySelectorAll<HTMLElement>("mark") ?? []),
      ].find((element) => element.dataset.quote === focusedQuote.quote);
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
      mark?.focus({ preventScroll: true });
      return;
    }

    const span = locateQuote(content, focusedQuote.quote);
    if (!span || !editorRef.current) {
      return;
    }
    editorRef.current.focus();
    editorRef.current.setSelectionRange(span.start, span.end);
    // Selecting text in a textarea doesn't reliably scroll it into view.
    editorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [content, focusedQuote, isLocked]);

  // Scroll to a note's excerpt when the notes panel asks for it.
  const handledNoteRef = useRef<{ noteId: string } | null>(null);
  useEffect(() => {
    if (!noteFocus || noteFocus === handledNoteRef.current) return;
    // Stays pending until the excerpt is in the text (e.g. the scene is loading).
    const anchor = noteAnchors.find((item) => item.noteId === noteFocus.noteId);
    if (!anchor) return;
    handledNoteRef.current = noteFocus;
    if (isLocked) {
      const mark = readingRef.current?.querySelector<HTMLElement>(
        `[data-note-ids~="${noteFocus.noteId}"]`,
      );
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
      mark?.focus({ preventScroll: true });
      return;
    }
    editorRef.current?.focus();
    editorRef.current?.setSelectionRange(anchor.start, anchor.end);
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [noteFocus, noteAnchors, isLocked]);

  // The current selection, offered for an excerpt note.
  const [selection, setSelection] = useState<
    (SceneExcerpt & { x: number; y: number }) | null
  >(null);

  // While text is selected, 1–4 annotate it as Nota, Pergunta, Corrigir or Ideia.
  useEffect(() => {
    if (!selection) return;
    const current = selection;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      const kind = noteKinds[Number(event.key) - 1];
      if (!kind) return;
      event.preventDefault();
      onAnnotate(current, kind);
      window.getSelection()?.removeAllRanges();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, onAnnotate]);
  const readingFrameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLocked) return;
    const update = () => {
      const container = readingRef.current;
      const frame = readingFrameRef.current;
      const current = window.getSelection();
      if (!container || !frame || !current || current.rangeCount === 0 || current.isCollapsed) {
        setSelection(null);
        onExcerptChange(null);
        return;
      }
      const range = current.getRangeAt(0);
      if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
        setSelection(null);
        onExcerptChange(null);
        return;
      }
      const before = document.createRange();
      before.selectNodeContents(container);
      before.setEnd(range.startContainer, range.startOffset);
      const start = before.toString().length;
      const excerpt = trimExcerpt(content, start, start + range.toString().length);
      if (!excerpt) {
        setSelection(null);
        onExcerptChange(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      setSelection({
        ...excerpt,
        x: rect.left + rect.width / 2 - frameRect.left,
        y: rect.top - frameRect.top,
      });
      onExcerptChange(excerpt);
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
    // onExcerptChange is a stable setter from the parent.
  }, [content, isLocked, onExcerptChange]);

  // In edit mode the textarea selection is the excerpt.
  const [textareaExcerpt, setTextareaExcerpt] = useState<SceneExcerpt | null>(null);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <section className="scene" aria-labelledby="scene-title" data-tour="editor">
      <header className="scene-header">
        <div className="scene-heading">
          {navigation ? (
            <nav className="scene-nav" aria-label="Navegar entre cenas">
              <button
                aria-keyshortcuts="["
                aria-label="Cena anterior"
                className="scene-nav-step"
                disabled={!navigation.onPrevious}
                title="Cena anterior ( [ )"
                type="button"
                onClick={() => navigation.onPrevious?.()}
              >
                <ChevronLeftIcon />
              </button>
              <button
                aria-keyshortcuts="Control+K"
                aria-label={`${navigation.label} — encontrar outra cena`}
                className="scene-nav-label"
                type="button"
                onClick={navigation.onOpenFinder}
              >
                {navigation.label}
                <ChevronDownIcon />
              </button>
              <button
                aria-keyshortcuts="]"
                aria-label="Próxima cena"
                className="scene-nav-step"
                disabled={!navigation.onNext}
                title="Próxima cena ( ] )"
                type="button"
                onClick={() => navigation.onNext?.()}
              >
                <ChevronRightIcon />
              </button>
            </nav>
          ) : (
            <p className="eyebrow">{positionLabel}</p>
          )}
          {isLocked ? (
            <h1 className="scene-title" id="scene-title">
              {title || "Cena sem título"}
            </h1>
          ) : (
            <label className="scene-title-field">
              <span className="sr-only" id="scene-title">
                Título da cena
              </span>
              <input
                className="scene-title-input"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder="Título da cena"
              />
            </label>
          )}
          {isLocked && (
            <p className="scene-meta">
              {[genre || null, focusLabels[focusMode], `${wordCount} palavras`]
                .filter(Boolean)
                .join(" · ")}
              {hasSlot && groups.length > 0 && (
                <label className={`scene-group${groupId ? ` group-${groups.find((group) => group.id === groupId)?.color}` : ""}`}>
                  <span className="sr-only">Grupo da cena</span>
                  <span className="scene-group-dot" aria-hidden="true" />
                  <select
                    value={groupId ?? ""}
                    onChange={(event) => onGroupChange(event.target.value || null)}
                  >
                    <option value="">Sem grupo</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </p>
          )}
        </div>
        {isLocked && !isSubmitting && !isSplitting && (
          <div className="scene-header-actions">
            {onToggleReadingMode && (
              <button
                aria-keyshortcuts="L"
                aria-pressed={isReadingMode}
                className="button button-secondary"
                title={isReadingMode ? "Voltar ao editor completo (Esc)" : "Só o texto, sem timeline nem diagnósticos (L)"}
                type="button"
                onClick={onToggleReadingMode}
              >
                {isReadingMode ? "Sair da leitura" : "Modo leitura"}
              </button>
            )}
            <button
              className="button button-secondary"
              type="button"
              onClick={onEdit}
            >
              Editar cena
            </button>
            <div className="scene-menu" ref={menuRef}>
              <button
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                className="text-button"
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
              >
                Mais ações ▾
              </button>
              {isMenuOpen && (
                <div className="scene-menu-list" role="menu">
                  <button aria-keyshortcuts="Alt+X" role="menuitem" type="button" onClick={() => startSplit()}>
                    <strong>
                      ✂ Dividir cena… <kbd>Alt X</kbd>
                    </strong>
                    <span>Escolha no texto onde a nova cena começa</span>
                  </button>
                  <button
                    aria-keyshortcuts="Alt+J"
                    disabled={!nextSceneTitle}
                    role="menuitem"
                    title={nextSceneTitle ? undefined : "Só cenas da timeline com uma cena seguinte"}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onRequestMerge();
                    }}
                  >
                    <strong>
                      ⇣ Juntar com a próxima… <kbd>Alt J</kbd>
                    </strong>
                    <span>{nextSceneTitle ? `com “${nextSceneTitle}”` : "Não há cena seguinte"}</span>
                  </button>
                  <hr />
                  <button
                    className="destructive"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <strong>Excluir cena…</strong>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {!isLocked && (
        <div className="scene-settings">
          <label>
            <span>Foco da revisão</span>
            <select
              value={focusMode}
              onChange={(event) =>
                onFocusModeChange(event.target.value as FocusMode)
              }
            >
              {focusModes.map((mode) => (
                <option key={mode} value={mode}>
                  {focusLabels[mode]}
                </option>
              ))}
            </select>
            <small className="scene-focus-hint">{focusHints[focusMode]}</small>
          </label>
          <label>
            <span>Gênero (opcional)</span>
            <input
              value={genre}
              onChange={(event) => onGenreChange(event.target.value)}
              placeholder="Ex.: Fantasia"
            />
          </label>
          {!hasSlot && (
            <div className="scene-placement">
              <label className="checkbox-label">
                <input
                  checked={isUnanchored}
                  type="checkbox"
                  onChange={(event) => onUnanchoredChange(event.target.checked)}
                />
                <span>Cena avulsa</span>
              </label>
              <small>{isUnanchored ? "Fora da timeline" : insertionLabel}</small>
            </div>
          )}
        </div>
      )}

      {isLocked && isSplitting ? (
        <div className="split-mode">
          <div aria-label="Dividir cena" className="split-bar" ref={splitBarRef} role="region" tabIndex={-1}>
            {splitOffset === null ? (
              <p>
                <strong>Clique no texto onde a nova cena deve começar.</strong> O ponto se ajusta ao
                início da frase mais próxima. <span className="split-keys">← → escolhem pelo teclado.</span>
              </p>
            ) : (
              <>
                <p>
                  Parte 1: <strong>{countWords(content.slice(0, splitOffset))} palavras</strong> · Parte 2:{" "}
                  <strong>{countWords(content.slice(splitOffset))} palavras</strong>. Clique de novo para ajustar.{" "}
                  <span className="split-keys">← → movem o ponto · Enter divide · Esc cancela</span>
                </p>
                <label>
                  <span>Título da nova cena</span>
                  <input value={splitTitle} onChange={(event) => setSplitTitle(event.target.value)} />
                </label>
              </>
            )}
            {splitError && <p className="form-message">{splitError}</p>}
            <div className="split-actions">
              <button className="button button-secondary" type="button" onClick={() => setIsSplitting(false)}>
                Cancelar
              </button>
              <button
                className="button button-primary"
                disabled={splitOffset === null || !splitTitle.trim() || isSavingSplit}
                type="button"
                onClick={() => void confirmSplit()}
              >
                {isSavingSplit ? "Dividindo…" : "Dividir cena"}
              </button>
            </div>
          </div>
          <div
            aria-label="Texto da cena: clique onde a nova cena começa"
            className="scene-reading is-splitting"
            onClick={pickSplitPoint}
          >
            {splitOffset === null ? (
              content
            ) : (
              <>
                <span>{content.slice(0, splitOffset)}</span>
                <span className="split-marker" aria-hidden="true">
                  {" ✂ a nova cena começa aqui "}
                </span>
                <span className="split-second">{content.slice(splitOffset)}</span>
              </>
            )}
          </div>
        </div>
      ) : isLocked ? (
        <div className="scene-reading-frame" ref={readingFrameRef}>
        <div
          aria-label="Fragmento da cena (somente leitura)"
          className="scene-reading"
          ref={readingRef}
        >
          {segments.map((segment, index) => {
            const noteIdList = segment.noteIds.join(" ");
            const kindClass = segment.noteKind ? ` kind-${segment.noteKind.toLowerCase()}` : "";
            if (segment.diagnostic) {
              const quote = segment.diagnostic.quote;
              return (
                <mark
                  aria-label={`Trecho com diagnóstico: ${segment.text}`}
                  className={`quote-mark severity-${segment.diagnostic.severity.toLowerCase()}${
                    focusedQuote?.quote === quote ? " quote-mark-active" : ""
                  }${segment.noteIds.length ? ` has-note${kindClass}` : ""}`}
                  data-note-ids={noteIdList || undefined}
                  data-quote={quote}
                  key={index}
                  role="button"
                  tabIndex={0}
                  onClick={() => onFocusQuote(quote)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onFocusQuote(quote);
                    }
                  }}
                >
                  {styledText(segment)}
                </mark>
              );
            }
            if (segment.noteIds.length) {
              const noteId = segment.noteIds[0];
              return (
                <mark
                  aria-label={`Trecho com nota: ${segment.text}`}
                  className={`note-mark${kindClass}${
                    noteFocus && segment.noteIds.includes(noteFocus.noteId) ? " note-mark-active" : ""
                  }`}
                  data-note-ids={noteIdList}
                  key={index}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // Selecting text inside a note shouldn't count as a click on it.
                    if (window.getSelection()?.isCollapsed !== false) onFocusNote(noteId);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onFocusNote(noteId);
                    }
                  }}
                >
                  {styledText(segment)}
                </mark>
              );
            }
            return <span key={index}>{styledText(segment)}</span>;
          })}
        </div>
        {selection && (
          <div
            className="annotate-button annotate-kinds"
            role="group"
            aria-label="Anotar o trecho selecionado"
            style={{ left: selection.x, top: selection.y }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <button
              aria-keyshortcuts="Alt+A"
              type="button"
              onClick={() => {
                onAnnotate(selection);
                window.getSelection()?.removeAllRanges();
              }}
            >
              ✎ Anotar <kbd>Alt A</kbd>
            </button>
            {noteKinds.map((kind, index) => (
              <button
                aria-keyshortcuts={String(index + 1)}
                className={`kind-${kind.toLowerCase()}`}
                key={kind}
                title={`${annotateKindLabels[kind]} (${index + 1})`}
                type="button"
                onClick={() => {
                  onAnnotate(selection, kind);
                  window.getSelection()?.removeAllRanges();
                }}
              >
                {annotateKindLabels[kind]} <kbd>{index + 1}</kbd>
              </button>
            ))}
          </div>
        )}
        </div>
      ) : (
        <label className="editor-field">
          <span className="sr-only">Fragmento a analisar</span>
          <textarea
            ref={editorRef}
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            onSelect={(event) => {
              const target = event.currentTarget;
              const excerpt =
                target.selectionStart !== target.selectionEnd
                  ? trimExcerpt(content, target.selectionStart, target.selectionEnd)
                  : null;
              setTextareaExcerpt(excerpt);
              onExcerptChange(excerpt);
            }}
            placeholder="Cole ou escreva o fragmento que deseja revisar…"
            spellCheck
          />
        </label>
      )}

      <footer className="scene-footer">
        <p>
          {isLocked
            ? "Texto salvo com criptografia. A análise aponta problemas; nunca reescreve."
            : // The Revisor and the Arquivista each read the whole scene.
              `${formatWords(countWords(content))} · analisar usa ${formatWords(countWords(content) * 2)} do seu limite mensal. O texto é salvo com criptografia e nunca reescrito.`}
        </p>
        {!isLocked && (
          <div className="editor-actions">
            {hasSlot && textareaExcerpt && (
              <button
                aria-keyshortcuts="Alt+A"
                className="button button-secondary"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onAnnotate(textareaExcerpt)}
              >
                ✎ Anotar seleção
              </button>
            )}
            {hasSlot && (
              <>
                <button
                  className="button button-secondary"
                  disabled={isSubmitting}
                  type="button"
                  onClick={onCancelEdit}
                >
                  Cancelar
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={onRename}
                  disabled={!title.trim() || isSubmitting}
                >
                  Salvar só o título
                </button>
              </>
            )}
            <button
              className="button button-primary"
              data-tour="analyze"
              type="button"
              onClick={onSave}
              disabled={!content.trim() || !title.trim() || isSubmitting}
            >
              {isSubmitting ? "Salvando e analisando…" : "Salvar e analisar"}
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
