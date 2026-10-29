import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./api/client";
import {
  focusModes,
  type FocusMode,
  type LinterDiagnostic,
  type PendingFact,
  type Project,
  type ProjectFact,
  type SceneGroup,
  type Slot,
  type TimelineMove,
} from "./api/contracts";
import { AlertPanel } from "./components/AlertPanel";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { FactProposalPanel } from "./components/FactProposalPanel";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { AccountMenu } from "./components/AccountMenu";
import { HelpMenu } from "./components/HelpMenu";
import { GoogleDocsDialog } from "./components/googleDocs/GoogleDocsDialog";
import { useGoogleDocSync } from "./features/googleDocs/useGoogleDocSync";
import type { GoogleSyncResult } from "./features/googleDocs/syncGoogleDoc";
import { GuidePage } from "./components/guide/GuidePage";
import { ProductTour } from "./components/tour/ProductTour";
import { projectTour, welcomeTour, type TourId } from "./features/tour/tours";
import { ProjectCreationModal } from "./components/ProjectCreationModal";
import { DeleteProjectModal } from "./components/DeleteProjectModal";
import { ManuscriptImportModal } from "./components/ManuscriptImportModal";
import { ProjectUnlockModal } from "./components/ProjectUnlockModal";
import { forgetProjectKey } from "./crypto/projectKeyCache";
import {
  SceneEditor,
  type FocusedQuote,
  type SceneExcerpt,
} from "./components/SceneEditor";
import { SceneFinder } from "./components/SceneFinder";
import { MoveHistory } from "./components/MoveHistory";
import { GroupManager } from "./components/GroupManager";
import { MergeDialog } from "./components/MergeDialog";
import {
  NotesPanel,
  type AttachedExcerpt,
  type NotesTab,
} from "./components/notes/NotesPanel";
import {
  readAuthorName,
  resolveAnchor,
  type Note,
  type NoteAnchor,
} from "./features/notes/notes";
import { useNotes } from "./features/notes/useNotes";
import { Toast } from "./components/Toast";
import { positionLabel } from "./features/scenes/timelineMoves";
import {
  applyReorder,
  orderScenes,
  sceneTitle as titleOf,
} from "./features/scenes/sceneStatus";
import { Timeline } from "./components/Timeline";
import { ArchivePage } from "./components/archive/ArchivePage";
import { ArchitecturalReviewPage } from "./components/ArchitecturalReviewPage";
import { ProjectReviewExportPage } from "./components/ProjectReviewExportPage";
import { RhythmPage } from "./components/rhythm/RhythmPage";
import { StyleSheetPage } from "./components/style/StyleSheetPage";
import { StyleFindings } from "./components/StyleFindings";
import {
  AnalysisStartDialog,
  BackgroundAnalysisWidget,
} from "./components/analysis/BackgroundAnalysis";
import {
  useBackgroundAnalysis,
  type AnalysisState,
} from "./features/analysis/useBackgroundAnalysis";
import { useStyleSheet } from "./features/style/useStyleSheet";
import { usePipeline } from "./features/pipeline/usePipeline";
import { PipelinePage } from "./components/pipeline/PipelinePage";
import { LineBreakRepairModal } from "./components/LineBreakRepairModal";
import { SceneMapPage } from "./components/sceneMap/SceneMapPage";
import { readLastScene, writeLastScene } from "./features/scenes/lastScene";
import { locateQuote } from "./features/scenes/quotes";
import type { NewNote } from "./features/notes/useNotes";
import {
  checkScene,
  exceptionFor,
  sameException,
  type StyleFinding,
} from "./features/style/styleSheet";
import { useSceneReview } from "./features/review/useSceneReview";
import {
  decryptSceneDraft,
  encryptNote,
  encryptSceneDraft,
} from "./crypto/projectEncryption";
import { groupColors } from "./api/contracts";
import type { AuthUser, NoteKind } from "./api/contracts";
import { initialTheme, type Theme } from "./features/theme";
import {
  ArchiveIcon,
  BookIcon,
  CloseIcon,
  ExportIcon,
  GoogleDocIcon,
  LayersIcon,
  MenuIcon,
  MoonIcon,
  NoteIcon,
  PenIcon,
  PulseIcon,
  StagesIcon,
  JoinLinesIcon,
  MapIcon,
  SunIcon,
  TrashIcon,
  TypeIcon,
  UploadDocumentIcon,
} from "./components/icons";
import "./App.css";

type Page = "pipeline" | "review" | "archive" | "scene-map" | "style-sheet" | "architectural-review" | "rhythm" | "export" | "guide";

const pageLabels: Record<Page, string> = {
  pipeline: "Etapas do projeto",
  review: "Editor e timeline",
  archive: "Arquivo",
  "style-sheet": "Folha de estilo",
  "architectural-review": "Revisão arquitetural",
  rhythm: "Ritmo e tensão",
  "scene-map": "Mapa de cenas",
  export: "Exportar revisões",
  guide: "Guia",
};

// Stable empty lists, so memoized values don't recompute every render.
const noNames: string[] = [];
const noDiagnostics: LinterDiagnostic[] = [];

function App({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const [context, setContext] = useState({ projectId: "", slotId: "" });
  const [content, setContent] = useState("");
  const [genre, setGenre] = useState("");
  const [sceneTitle, setSceneTitle] = useState("");
  const [isUnanchored, setIsUnanchored] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>("GENERAL");
  const [focusedQuote, setFocusedQuote] = useState<FocusedQuote | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [canonFacts, setCanonFacts] = useState<ProjectFact[]>([]);
  const [savedDraft, setSavedDraft] = useState({ content: "", title: "" });
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  // Review notes: the floating panel and the excerpt it may be about.
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notesTab, setNotesTab] = useState<NotesTab>("scene");
  const [attachedExcerpt, setAttachedExcerpt] = useState<AttachedExcerpt | null>(null);
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const [noteFocus, setNoteFocus] = useState<{ noteId: string } | null>(null);
  // The passage currently selected in the scene, offered to Alt+A.
  const selectedExcerptRef = useRef<SceneExcerpt | null>(null);
  const setSelectedExcerpt = useCallback((excerpt: SceneExcerpt | null) => {
    selectedExcerptRef.current = excerpt;
  }, []);
  const [moves, setMoves] = useState<TimelineMove[]>([]);
  const [isMoveHistoryOpen, setIsMoveHistoryOpen] = useState(false);
  const [undoingMoveId, setUndoingMoveId] = useState<string | null>(null);
  const [toast, setToast] = useState<
    | { kind: "moved"; moveId: string; message: string }
    | { kind: "undone"; message: string }
    | { kind: "action"; message: string; actionLabel: string; onAction: () => void }
    | null
  >(null);
  const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false);
  // Scene groups (acts, journey stages, beats) and the structure dialogs.
  const [groups, setGroups] = useState<SceneGroup[]>([]);
  const [structureFocus, setStructureFocus] = useState<
    { groupId: string | null } | null
  >(null);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const dismissToast = useCallback(() => setToast(null), []);
  // Timeline writes run one at a time; the list is reloaded only once the
  // queue is empty, so a reload never overwrites a move still on its way.
  const timelineQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingTimelineWritesRef = useRef(0);
  const finderReturnFocusRef = useRef<HTMLElement | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isDeleteProjectModalOpen, setIsDeleteProjectModalOpen] =
    useState(false);
  const [isManuscriptImportOpen, setIsManuscriptImportOpen] = useState(false);
  const [projectKey, setProjectKey] = useState<CryptoKey | null>(null);
  const [projectToUnlock, setProjectToUnlock] = useState<string | null>(null);
  const [isEditingScene, setIsEditingScene] = useState(true);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [page, setPage] = useState<Page>("review");
  // Null until the first load answers.
  const [projects, setProjects] = useState<Project[] | null>(null);
  // Onboarding: the tour asked for, the tours already done, the guide article open.
  const [requestedTour, setActiveTour] = useState<TourId | null>(null);
  const [completedTours, setCompletedTours] = useState(() => user.completedTours);
  const [guideArticle, setGuideArticle] = useState<string | null>(null);
  const activeTour: TourId | null =
    requestedTour ?? (projects !== null && !completedTours.includes("welcome") ? "welcome" : null);
  const review = useSceneReview(context.slotId);
  // Revisor card: the LLM analysis first, the project's style sheet second.
  const [revisorTab, setRevisorTab] = useState<"diagnostics" | "style">("diagnostics");
  const [styleFocus, setStyleFocus] = useState<{ key: string } | null>(null);
  const [styleBusyKey, setStyleBusyKey] = useState<string | null>(null);
  const [showStyleMarks, setShowStyleMarks] = useState(() => {
    try {
      return localStorage.getItem("petricor-style-marks") !== "off";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Only an explicit choice is stored; otherwise the OS preference applies.
  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      localStorage.setItem("grime-theme", nextTheme);
    } catch {
      // Storage can be unavailable (private mode); the choice lasts the session.
    }
  }

  useEffect(() => {
    if (!isNavOpen) {
      return;
    }

    // During a tour the drawer opens for a step; focus stays on the tour card.
    if (!document.querySelector(".tour-root")) {
      sidebarCloseRef.current?.focus();
    }
    const toggleButton = navToggleRef.current;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNavOpen(false);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      // Hand focus back only if it was inside the closing drawer.
      if (document.activeElement?.closest(".sidebar")) {
        toggleButton?.focus();
      }
    };
  }, [isNavOpen]);

  const reloadProjects = useCallback(() => {
    void api
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects((current) => current ?? []));
  }, []);

  useEffect(reloadProjects, [reloadProjects]);

  // Finished, skipped or closed: the tour won't start on its own again.
  function finishTour(tour: TourId) {
    setActiveTour(null);
    if (completedTours.includes(tour)) return;
    setCompletedTours((current) => [...current, tour]);
    void api.completeTour(tour).catch(() => {
      // Not saved: the tour shows once more on the next visit. Harmless.
    });
  }

  // Fire and forget: a missed record only makes the project look older.
  function recordAccess(projectId: string) {
    void api.recordProjectAccess(projectId).catch(() => undefined);
  }

  function openGuide(articleId: string | null) {
    setGuideArticle(articleId);
    goTo("guide");
  }


  function goTo(nextPage: Page) {
    setPage(nextPage);
    setIsNavOpen(false);
  }

  useEffect(() => {
    if (!context.projectId) {
      return;
    }

    let isCurrent = true;
    void api
      .listProjectSlots(context.projectId)
      .then((nextSlots) => {
        if (isCurrent) {
          setSlots(nextSlots);
          setSlotsError(null);
        }
      })
      .catch((reason: unknown) => {
        if (isCurrent) {
          setSlotsError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar a timeline.",
          );
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [context.projectId, timelineVersion]);

  useEffect(() => {
    if (!context.projectId) {
      return;
    }

    let isCurrent = true;
    void api
      .listGroups(context.projectId)
      .then((nextGroups) => {
        if (isCurrent) setGroups(nextGroups);
      })
      .catch(() => {
        // Older backends have no groups; the structure tools stay empty.
        if (isCurrent) setGroups([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [context.projectId, timelineVersion]);

  const projectSlots = context.projectId ? slots : [];
  const resumeSceneRef = useRef<string | null>(null);
  // Reading mode applies to an open scene in the review page, outside editing.
  const isReadingActive = isReadingMode && page === "review" && Boolean(context.slotId) && !isEditingScene;
  const projectGroups = context.projectId ? groups : [];
  const selectedSlot = projectSlots.find((slot) => slot.id === context.slotId);
  const orderedScenes = orderScenes(projectSlots);
  const selectedSceneIndex = orderedScenes.findIndex(
    (slot) => slot.id === context.slotId,
  );
  const previousScene =
    selectedSceneIndex > 0 ? orderedScenes[selectedSceneIndex - 1] : null;
  const nextScene =
    selectedSceneIndex >= 0 ? orderedScenes[selectedSceneIndex + 1] ?? null : null;
  const anchoredSceneCount = projectSlots.filter(
    (slot) => !slot.isUnanchored,
  ).length;
  // Merging needs two neighbouring scenes on the timeline.
  const mergeTarget =
    selectedSlot && !selectedSlot.isUnanchored && nextScene && !nextScene.isUnanchored
      ? nextScene
      : null;

  // Unsaved edits: the editor differs from what was last loaded or saved.
  const isDirty =
    content !== savedDraft.content || sceneTitle !== savedDraft.title;

  function confirmDiscard(): boolean {
    return (
      !isDirty ||
      window.confirm("Descartar as alterações não salvas desta cena?")
    );
  }

  function openScene(slot: Slot) {
    if (!confirmDiscard()) {
      return;
    }
    setPage("review");
    selectSlot(slot);
  }

  function openFinder() {
    finderReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setIsFinderOpen(true);
  }

  function closeFinder() {
    setIsFinderOpen(false);
    finderReturnFocusRef.current?.focus();
  }

  // Global shortcuts read the latest handlers through a ref, so the listener
  // is registered once.
  const shortcutHandlers = useRef({
    toggleFinder: () => {},
    previous: () => {},
    next: () => {},
    undoLastMove: (): boolean => false,
    newScene: () => {},
    notes: () => {},
    toggleReading: () => {},
    exitReading: (): boolean => false,
  });
  useEffect(() => {
    shortcutHandlers.current = {
      toggleFinder: () => {
        if (!context.projectId || !projectKey) return;
        if (isFinderOpen) closeFinder();
        else openFinder();
      },
      previous: () => {
        if (page === "review" && previousScene) openScene(previousScene);
      },
      next: () => {
        if (page === "review" && nextScene) openScene(nextScene);
      },
      undoLastMove: () => {
        if (toast?.kind !== "moved" || undoingMoveId) return false;
        undoMove(toast.moveId);
        return true;
      },
      notes: () => {
        if (!context.projectId || !projectKey) return;
        const excerpt = selectedExcerptRef.current;
        if (excerpt && context.slotId) {
          annotate(excerpt);
          return;
        }
        if (isNotesOpen) setIsNotesOpen(false);
        else openNotes();
      },
      toggleReading: () => {
        if (page === "review" && context.slotId && !isEditingScene) setIsReadingMode((value) => !value);
      },
      exitReading: () => {
        if (!isReadingActive) return false;
        setIsReadingMode(false);
        return true;
      },
      newScene: () => {
        if (!context.projectId || !projectKey) return;
        if (isFinderOpen) setIsFinderOpen(false);
        setPage("review");
        if (startNewScene()) {
          // Start typing the title right away.
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLInputElement>(".scene-title-input")
              ?.focus(),
          );
        }
      },
    };
  });
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const otherDialogOpen = document.querySelector(
        '[aria-modal="true"]:not(.finder)',
      );
      if (otherDialogOpen) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        shortcutHandlers.current.toggleFinder();
        return;
      }

      // Alt+A: review notes (anotações). Works while typing, like Alt+N.
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyA") {
        event.preventDefault();
        shortcutHandlers.current.notes();
        return;
      }

      // Alt+N rather than Ctrl+N: browsers keep Ctrl+N for a new window.
      // Works while typing too; unsaved edits still ask before being dropped.
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.code === "KeyN"
      ) {
        event.preventDefault();
        shortcutHandlers.current.newScene();
        return;
      }

      const isUndo =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z";
      const isEditingText = target?.closest(
        "input, textarea, select, [contenteditable]",
      );
      // Outside text fields, Ctrl+Z undoes the move the toast is offering.
      if (isUndo && !isEditingText && shortcutHandlers.current.undoLastMove()) {
        event.preventDefault();
        return;
      }

      const isTyping =
        target?.closest("input, textarea, select, [contenteditable]") ??
        document.querySelector(".finder");
      if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "[") shortcutHandlers.current.previous();
      if (event.key === "]") shortcutHandlers.current.next();
      if (event.key.toLowerCase() === "l" && !event.shiftKey) shortcutHandlers.current.toggleReading();
      if (event.key === "Escape" && shortcutHandlers.current.exitReading()) event.preventDefault();
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  // Recent timeline moves, so a reorder can be undone later (also from its alerts).
  useEffect(() => {
    if (!context.projectId) {
      return;
    }

    let isCurrent = true;
    void api
      .listTimelineMoves(context.projectId)
      .then((nextMoves) => {
        if (isCurrent) {
          setMoves(nextMoves);
        }
      })
      .catch(() => {
        // Older backends have no move history; undo is simply unavailable.
        if (isCurrent) {
          setMoves([]);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [context.projectId, timelineVersion]);

  const notes = useNotes(context.projectId, projectKey);
  const openNoteCount = notes.notes.filter((note) => note.status === "OPEN").length;

  const styleSheet = useStyleSheet(context.projectId, projectKey);
  const pipeline = usePipeline(context.projectId, projectKey);
  const currentStage =
    pipeline.pipeline?.stages.find((stage) => stage.id === pipeline.pipeline?.currentStageId) ?? null;
  const stageNames = useMemo(
    () => (pipeline.pipeline ? new Map(pipeline.pipeline.stages.map((stage) => [stage.id, stage.name])) : undefined),
    [pipeline.pipeline],
  );

  // The letter stage's notebook starts the export's cover letter: the current
  // stage when it is a letter stage, otherwise the last letter stage written in.
  const letterDraft = useMemo(() => {
    const stages = pipeline.pipeline?.stages.filter((stage) => stage.kind === "carta" && stage.notebook.trim()) ?? [];
    const chosen = stages.find((stage) => stage.id === pipeline.pipeline?.currentStageId) ?? stages.at(-1);
    return chosen ? { stageName: chosen.name, text: chosen.notebook.trim() } : null;
  }, [pipeline.pipeline]);

  // New notes belong to the stage the project is in.
  function createNote(note: NewNote) {
    return notes.create({ stageId: currentStage?.id ?? null, ...note });
  }

  const [isGoogleDocsOpen, setIsGoogleDocsOpen] = useState(false);
  const [noteKindRequest, setNoteKindRequest] = useState<{ kind: NoteKind; at: number } | null>(null);
  const [isLineBreakRepairOpen, setIsLineBreakRepairOpen] = useState(false);
  const googleDocs = useGoogleDocSync({
    projectId: context.projectId,
    projectKey,
    onSynced: handleGoogleDocSynced,
  });

  // New or changed scenes from the linked doc. The open scene shows the new
  // text, unless it's being edited: then the author decides.
  function handleGoogleDocSynced(result: GoogleSyncResult, automatic: boolean) {
    refreshProjectState();
    const openSlotChanged = Boolean(context.slotId) && result.changedSlotIds.includes(context.slotId);
    const openSlot = slots.find((slot) => slot.id === context.slotId);
    if (openSlotChanged && openSlot && !isEditingScene) {
      selectSlot(openSlot);
    }
    if (!automatic) return;
    const parts = [
      result.created && (result.created === 1 ? "1 cena nova" : `${result.created} cenas novas`),
      result.updated && (result.updated === 1 ? "1 cena atualizada" : `${result.updated} cenas atualizadas`),
    ].filter(Boolean);
    if (parts.length === 0) return;
    setToast({
      kind: "undone",
      message:
        `Google Docs: ${parts.join(", ")}.` +
        (openSlotChanged && isEditingScene ? " A cena que você está editando mudou no documento." : ""),
    });
  }

  // Background analysis of scenes not analysed yet.
  function handleBackgroundSceneAnalysed(slotId: string) {
    // The open scene shows its new diagnostics, unless it's being edited.
    if (slotId === context.slotId && !isEditingScene) {
      void api
        .getSlotReview(slotId)
        .then((slotReview) => review.loadReview(slotId, slotReview))
        .then(() => review.refreshResources(slotId))
        .catch(() => {
          // The scene shows the new results when it's opened again.
        });
    }
  }

  function handleBackgroundFinished(state: AnalysisState) {
    refreshProjectState();
    const parts = [
      `${state.done.length} ${state.done.length === 1 ? "cena analisada" : "cenas analisadas"}`,
      state.failed.length ? `${state.failed.length} com falha` : null,
    ].filter(Boolean);
    setToast({
      kind: "undone",
      message: `Análise em segundo plano ${state.wasCancelled ? "cancelada" : "concluída"}: ${parts.join(", ")}.`,
    });
  }

  const backgroundAnalysis = useBackgroundAnalysis({
    projectId: context.projectId,
    projectKey,
    onSceneAnalysed: handleBackgroundSceneAnalysed,
    onRefresh: refreshProjectState,
    onFinished: handleBackgroundFinished,
  });
  // Scenes the server has never analysed (needs a backend that tracks it).
  const unanalysedCount = projectSlots.filter((slot) => slot.status?.lastAnalyzedAt === null).length;
  const tracksAnalysis = projectSlots.some((slot) => slot.status?.lastAnalyzedAt !== undefined);
  const isAnalysisBusy =
    backgroundAnalysis.state.status === "running" ||
    backgroundAnalysis.state.status === "waiting" ||
    backgroundAnalysis.state.status === "paused";
  // Archive names, only needed when the sheet checks how they're written.
  const checksNames = Boolean(styleSheet.sheet?.typography.archiveNames);
  const [archiveNames, setArchiveNames] = useState<{ projectId: string; names: string[] } | null>(null);
  useEffect(() => {
    if (!context.projectId || !checksNames) return;
    let isCurrent = true;
    void api
      .listProjectEntities(context.projectId)
      .then((entities) => {
        if (!isCurrent) return;
        const names = entities
          .filter((entity) => !entity.canonicalId)
          .flatMap((entity) => [entity.name, ...entity.aliases.map((alias) => alias.name)]);
        setArchiveNames({ projectId: context.projectId, names });
      })
      .catch(() => {
        // Without names, that one convention simply finds nothing.
      });
    return () => {
      isCurrent = false;
    };
  }, [context.projectId, checksNames, timelineVersion]);
  const projectNames = archiveNames?.projectId === context.projectId ? archiveNames.names : noNames;

  const styleFindings = useMemo<StyleFinding[]>(
    () =>
      styleSheet.sheet && context.slotId
        ? checkScene(content, styleSheet.sheet, { slotId: context.slotId, names: projectNames })
        : [],
    [styleSheet.sheet, context.slotId, content, projectNames],
  );
  const activeStyleFindings = styleFindings.filter((finding) => !finding.isException);
  const styleMarks = useMemo(
    () =>
      showStyleMarks
        ? styleFindings
            .filter((finding) => !finding.isException)
            .map(({ key, start, end, label }) => ({ key, start, end, label }))
        : [],
    [showStyleMarks, styleFindings],
  );

  function focusStyle(key: string) {
    setRevisorTab("style");
    setStyleFocus({ key });
  }

  async function toggleStyleException(finding: StyleFinding) {
    const sheet = styleSheet.sheet;
    if (!sheet || !context.slotId) return;
    const exception = exceptionFor(finding, context.slotId);
    setStyleBusyKey(finding.key);
    try {
      await styleSheet.save({
        ...sheet,
        exceptions: finding.isException
          ? sheet.exceptions.filter((item) => !sameException(item, exception))
          : [...sheet.exceptions, exception],
      });
    } catch (reason) {
      setContextError(
        reason instanceof Error ? reason.message : "Não foi possível salvar a exceção.",
      );
    } finally {
      setStyleBusyKey(null);
    }
  }
  // Open excerpt notes of this scene, found in its current text.
  const noteAnchors = useMemo<NoteAnchor[]>(
    () =>
      notes.notes
        .filter((note) => note.slotId === context.slotId && note.status === "OPEN")
        .map((note) => resolveAnchor(content, note))
        .filter((anchor): anchor is NoteAnchor => anchor !== null),
    [notes.notes, context.slotId, content],
  );

  function openNotes(tab?: NotesTab) {
    setNotesTab(tab ?? (context.slotId ? "scene" : "project"));
    setIsNotesOpen(true);
  }

  function annotate(excerpt: SceneExcerpt, kind?: NoteKind) {
    if (!context.slotId) return;
    setAttachedExcerpt({ slotId: context.slotId, ...excerpt });
    if (kind) setNoteKindRequest({ kind, at: Date.now() });
    openNotes("scene");
  }

  // Shows a note's excerpt, opening its scene first when needed.
  function locateNote(note: Note) {
    setFocusedNoteId(note.id);
    if (!note.slotId) return;
    if (note.slotId !== context.slotId || page !== "review") {
      const slot = projectSlots.find((item) => item.id === note.slotId);
      if (!slot) return;
      openScene(slot);
    }
    setNoteFocus({ noteId: note.id });
  }

  const projectMoves = context.projectId ? moves : [];
  const undoableMoveCount = projectMoves.filter((move) => !move.undoneAt).length;

  function undoMove(moveId: string) {
    const move = projectMoves.find((item) => item.id === moveId);
    const slot = projectSlots.find((item) => item.id === move?.slotId);
    const projectId = context.projectId;
    setUndoingMoveId(moveId);
    pendingTimelineWritesRef.current += 1;
    timelineQueueRef.current = timelineQueueRef.current.then(() =>
      api
        .undoTimelineMove(projectId, moveId)
        // Moves stay blocked until the restored order is loaded.
        .then(() => api.listProjectSlots(projectId))
        .then((nextSlots) => {
          setSlots(nextSlots);
          setToast({
            kind: "undone",
            message: slot
              ? `“${titleOf(slot)}” voltou para o lugar anterior.`
              : "Movimento desfeito.",
          });
          void review.refreshResources();
        })
        .catch((reason: unknown) =>
          setContextError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível desfazer o movimento.",
          ),
        )
        .finally(() => {
          setUndoingMoveId(null);
          pendingTimelineWritesRef.current -= 1;
          if (pendingTimelineWritesRef.current === 0) {
            refreshProjectState();
          }
        }),
    );
  }

  // Active canon facts, used to flag proposed facts that contradict it.
  useEffect(() => {
    if (!context.projectId) {
      return;
    }

    let isCurrent = true;
    void api
      .listProjectFacts(context.projectId)
      .then((facts) => {
        if (isCurrent) {
          setCanonFacts(facts);
        }
      })
      .catch(() => {
        // Conflict hints are advisory; the canon pages surface load errors.
      });
    return () => {
      isCurrent = false;
    };
  }, [context.projectId, timelineVersion]);

  // Slot statuses and canon facts change after analyses and fact decisions.
  function refreshProjectState() {
    setTimelineVersion((current) => current + 1);
  }

  function activateContext(
    projectId: string,
    slotId = "",
    key: CryptoKey | null = null,
    isEditing = !slotId,
  ) {
    const nextContext = { projectId, slotId };
    setContext(nextContext);
    setContextError(null);
    setProjectKey(key);
    setIsEditingScene(isEditing);
    setFocusedQuote(null);
    setStyleFocus(null);
    review.resetReview();
    void review.refreshResources(nextContext.slotId);
    setTimelineVersion((current) => current + 1);
  }

  function updateFact(index: number, patch: Partial<PendingFact>) {
    review.setFacts((current) =>
      current.map((fact, factIndex) =>
        factIndex === index ? { ...fact, ...patch } : fact,
      ),
    );
  }

  function submitScene() {
    if (!context.projectId) {
      setContextError("Selecione um projeto antes de criar a cena.");
      return;
    }
    if (!projectKey) {
      setContextError("Desbloqueie o projeto antes de analisar uma cena.");
      return;
    }
    setContextError(null);
    void createAndSubmitScene();
  }

  async function createAndSubmitScene() {
    try {
      if (!projectKey) {
        throw new Error("Desbloqueie o projeto antes de analisar uma cena.");
      }
      const slot = await api.createProjectSlot(context.projectId, {
        title: sceneTitle.trim(),
        isUnanchored,
        afterSlotId:
          isUnanchored || !context.slotId ? undefined : context.slotId,
      });
      activateContext(context.projectId, slot.id, projectKey);
      await api.saveSceneContent(
        slot.id,
        await encryptSceneDraft(projectKey, { content, genre, focusMode }),
      );
      await review.submit({
        projectId: context.projectId,
        slotId: slot.id,
        rawContent: content,
        genreOverride: genre.trim() || undefined,
        focusMode,
      });
      backgroundAnalysis.forget(slot.id);
      setSavedDraft({ content, title: sceneTitle });
      refreshProjectState();
    } catch (reason) {
      setContextError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível criar a cena.",
      );
    }
  }

  function saveEditedScene() {
    if (!context.projectId || !context.slotId) {
      return;
    }

    if (!projectKey) {
      setContextError("Desbloqueie o projeto antes de refazer a análise.");
      return;
    }

    void (async () => {
      try {
        await api.saveSceneContent(
          context.slotId,
          await encryptSceneDraft(projectKey, { content, genre, focusMode }),
        );
        await review.submit({
          projectId: context.projectId,
          slotId: context.slotId,
          rawContent: content,
          genreOverride: genre.trim() || undefined,
          focusMode,
        });
        backgroundAnalysis.forget(context.slotId);
        setIsEditingScene(false);
        setSavedDraft({ content, title: sceneTitle });
        refreshProjectState();
      } catch (reason) {
        setContextError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível salvar o fragmento protegido.",
        );
      }
    })();
  }

  function renameScene() {
    if (!context.projectId || !context.slotId) {
      return;
    }
    if (
      content !== savedDraft.content &&
      !window.confirm(
        "Só o título será salvo; as alterações no texto serão descartadas. Continuar?",
      )
    ) {
      return;
    }

    setIsEditingScene(false);

    void api
      .renameProjectSlot(context.projectId, context.slotId, sceneTitle.trim())
      .then(() => {
        // Renaming keeps the stored text; leaving edit mode restores it too.
        setContent(savedDraft.content);
        setSavedDraft((current) => ({ ...current, title: sceneTitle }));
        setTimelineVersion((current) => current + 1);
      })
      .catch((reason: unknown) =>
        setContextError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível atualizar o título da cena.",
        ),
      );
  }

  function deleteScene() {
    if (!context.projectId || !context.slotId) {
      return;
    }
    if (!window.confirm(`Excluir permanentemente a cena "${sceneTitle}"?`)) {
      return;
    }

    void api
      .deleteProjectSlot(context.projectId, context.slotId)
      .then(() => {
        activateContext(context.projectId, "", projectKey, true);
        setContent("");
        setGenre("");
        setFocusMode("GENERAL");
        setSceneTitle("");
        setIsUnanchored(false);
        setSavedDraft({ content: "", title: "" });
      })
      .catch((reason: unknown) =>
        setContextError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível excluir a cena.",
        ),
      );
  }

  // Reopens the last scene of a project just unlocked, once its scenes load.
  useEffect(() => {
    const target = resumeSceneRef.current;
    if (!target || !projectKey || !context.projectId || context.slotId) return;
    const slot = projectSlots.find((item) => item.id === target && item.projectId === context.projectId);
    if (!slot) return;
    resumeSceneRef.current = null;
    selectSlot(slot);
    // selectSlot is redefined every render; the scene list is what this waits for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSlots, projectKey, context.projectId, context.slotId]);

  function selectSlot(slot: Slot) {
    if (!projectKey || !context.projectId) {
      return;
    }
    writeLastScene(context.projectId, slot.id);

    activateContext(context.projectId, slot.id, projectKey, false);
    void (async () => {
      try {
        const slotReview = await api.getSlotReview(slot.id);
        if (!slotReview.content) {
          throw new Error("Esta cena ainda não possui um fragmento protegido.");
        }
        const draft = await decryptSceneDraft(
          projectKey,
          slotReview.content.ciphertext,
          slotReview.content.iv,
        );
        setContent(draft.content ?? "");
        setGenre(draft.genre ?? "");
        setFocusMode(
          draft.focusMode && focusModes.includes(draft.focusMode as FocusMode)
            ? (draft.focusMode as FocusMode)
            : "GENERAL",
        );
        setSceneTitle(slot.title ?? "");
        setSavedDraft({ content: draft.content ?? "", title: slot.title ?? "" });
        setIsUnanchored(slot.isUnanchored);
        review.loadReview(slot.id, slotReview);
      } catch (reason) {
        setContextError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar a cena selecionada.",
        );
      }
    })();
  }

  function reorderScene(
    slotId: string,
    targetPosition: number,
    isUnanchored: boolean,
  ) {
    if (undoingMoveId) {
      return;
    }
    const slot = projectSlots.find((item) => item.id === slotId);
    const fromPosition = slot?.isUnanchored ? null : slot?.timelinePosition ?? null;
    const projectId = context.projectId;
    // Show the new order now, so a quick second move starts from it.
    setSlots((current) =>
      applyReorder(current, slotId, targetPosition, isUnanchored),
    );
    pendingTimelineWritesRef.current += 1;
    timelineQueueRef.current = timelineQueueRef.current.then(() =>
      api
        .reorderTimeline(projectId, {
          slotId,
          targetPosition,
          isUnanchored,
        })
        .then((result) => {
          if (result.moveId) {
            setToast({
              kind: "moved",
              moveId: result.moveId,
              message: `“${slot ? titleOf(slot) : "Cena"}” movida: ${positionLabel(
                fromPosition,
              )} → ${positionLabel(isUnanchored ? null : targetPosition)}.`,
            });
          }
        })
        .catch((reason: unknown) =>
          setContextError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível reordenar a timeline.",
          ),
        )
        .finally(() => {
          pendingTimelineWritesRef.current -= 1;
          if (pendingTimelineWritesRef.current === 0) {
            refreshProjectState();
          }
        }),
    );
  }

  async function reloadGroups() {
    setGroups(await api.listGroups(context.projectId));
  }

  async function assignGroup(slotIds: string[], groupId: string | null) {
    try {
      await api.assignGroup(context.projectId, slotIds, groupId);
      setSlots((current) =>
        current.map((slot) =>
          slotIds.includes(slot.id) ? { ...slot, groupId } : slot,
        ),
      );
    } catch (reason) {
      setContextError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar o grupo.",
      );
    }
  }

  async function createGroupAndAssign(name: string, slotIds: string[]) {
    try {
      const [group] = await api.createGroups(context.projectId, [
        { name, color: groupColors[projectGroups.length % groupColors.length] },
      ]);
      setGroups((current) => [...current, group]);
      await assignGroup(slotIds, group.id);
    } catch (reason) {
      setContextError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível criar o grupo.",
      );
    }
  }

  const reanalyseHint = "Refaça a análise das cenas alteradas para atualizar os diagnósticos.";

  // Cuts the open scene at `offset`: both parts are re-encrypted here, and the
  // server moves diagnostics and excerpt notes that now belong to the second.
  async function splitScene(offset: number, newTitle: string) {
    if (!projectKey || !context.projectId || !context.slotId) return;
    const first = content.slice(0, offset).trimEnd();
    const secondStart = offset + (content.slice(offset).length - content.slice(offset).trimStart().length);
    const second = content.slice(secondStart);
    if (!first || !second) {
      throw new Error("As duas partes precisam ter texto.");
    }
    const moveDiagnosticHashes = (review.report?.diagnostics ?? [])
      .filter(
        (diagnostic) =>
          diagnostic.signatureHash &&
          diagnostic.sourceQuote &&
          second.includes(diagnostic.sourceQuote) &&
          !first.includes(diagnostic.sourceQuote),
      )
      .map((diagnostic) => diagnostic.signatureHash!);
    const movedNotes = await Promise.all(
      notes.notes
        .filter((note) => note.slotId === context.slotId && !note.isUnreadable)
        .map((note) => ({ note, anchor: resolveAnchor(content, note) }))
        .filter(({ anchor }) => anchor && anchor.start >= secondStart)
        .map(async ({ note, anchor }) => ({
          id: note.id,
          ...(await encryptNote(projectKey, {
            body: note.body,
            author: note.author,
            excerpt: {
              quote: note.excerpt!.quote,
              start: anchor!.start - secondStart,
              end: anchor!.end - secondStart,
            },
          })),
        })),
    );
    await api.splitSlot(context.projectId, context.slotId, {
      newTitle,
      first: await encryptSceneDraft(projectKey, { content: first, genre, focusMode }),
      second: await encryptSceneDraft(projectKey, { content: second, genre, focusMode }),
      moveDiagnosticHashes,
      movedNotes,
    });
    setContent(first);
    setSavedDraft({ content: first, title: sceneTitle });
    void review.refreshResources();
    void notes.reload();
    refreshProjectState();
    setToast({
      kind: "undone",
      message: `Cena dividida: “${newTitle}” vem logo depois. ${reanalyseHint}`,
    });
  }

  // Appends the next scene to the open one; its excerpt notes are shifted to
  // the merged text and re-encrypted before the server moves the rest.
  async function mergeWithNext(title: string) {
    if (!projectKey || !context.projectId || !context.slotId || !mergeTarget) return;
    const nextReview = await api.getSlotReview(mergeTarget.id);
    const nextDraft = nextReview.content
      ? await decryptSceneDraft(projectKey, nextReview.content.ciphertext, nextReview.content.iv)
      : { content: "" };
    const nextContent = nextDraft.content ?? "";
    const separator = "\n\n";
    const merged = nextContent ? `${content.trimEnd()}${separator}${nextContent}` : content;
    const shift = content.trimEnd().length + separator.length;
    const movedNotes = await Promise.all(
      notes.notes
        .filter((note) => note.slotId === mergeTarget.id && !note.isUnreadable && note.excerpt)
        .map(async (note) => {
          const anchor = resolveAnchor(nextContent, note);
          return {
            id: note.id,
            ...(await encryptNote(projectKey, {
              body: note.body,
              author: note.author,
              excerpt: anchor
                ? { quote: note.excerpt!.quote, start: anchor.start + shift, end: anchor.end + shift }
                : note.excerpt,
            })),
          };
        }),
    );
    await api.mergeWithNext(context.projectId, context.slotId, {
      nextSlotId: mergeTarget.id,
      title,
      content: await encryptSceneDraft(projectKey, { content: merged, genre, focusMode }),
      movedNotes,
    });
    setIsMergeOpen(false);
    setContent(merged);
    setSceneTitle(title);
    setSavedDraft({ content: merged, title });
    void review.refreshResources();
    void notes.reload();
    refreshProjectState();
    setToast({
      kind: "undone",
      message: `Cenas juntadas em “${title}”. ${reanalyseHint}`,
    });
  }

  // Returns false when nothing changed (no project, or the author kept edits).
  function startNewScene(): boolean {
    if (!context.projectId) {
      setContextError("Selecione um projeto antes de criar uma cena.");
      return false;
    }
    if (!confirmDiscard()) {
      return false;
    }

    activateContext(context.projectId, "", projectKey, true);
    setContent("");
    setGenre("");
    setFocusMode("GENERAL");
    setSceneTitle("");
    setIsUnanchored(false);
    setSavedDraft({ content: "", title: "" });
    return true;
  }

  // Intentional exceptions stay listed in the Revisor but no longer mark the text.
  const reportDiagnostics = review.report?.diagnostics ?? noDiagnostics;
  const highlightedDiagnostics = useMemo(
    () =>
      reportDiagnostics.filter(
        (diagnostic) =>
          !review.overrides.some(
            (override) => override.diagnosticSignatureHash === diagnostic.signatureHash,
          ),
      ),
    [reportDiagnostics, review.overrides],
  );

  const hasOpenProject = Boolean(context.projectId && projectKey);

  // The editor tour waits for the page to render its targets.
  const wantsProjectTour =
    hasOpenProject &&
    page === "review" &&
    activeTour === null &&
    completedTours.includes("welcome") &&
    !completedTours.includes("project");
  useEffect(() => {
    if (!wantsProjectTour) return;
    const start = window.setTimeout(() => setActiveTour("project"), 700);
    return () => window.clearTimeout(start);
  }, [wantsProjectTour]);
  const currentProject = projects?.find((project) => project.id === context.projectId);
  const needsProject = "Abra um projeto primeiro";
  const navGroups: Array<{
    label: string;
    items: Array<{
      page: Page;
      label: string;
      icon: ReactNode;
      disabled?: boolean;
      disabledReason?: string;
    }>;
  }> = [
    {
      label: "Projeto",
      items: [
        {
          page: "pipeline",
          label: "Etapas",
          icon: <StagesIcon />,
          disabled: !hasOpenProject || !pipeline.isAvailable,
          disabledReason: hasOpenProject ? "Etapas indisponíveis" : needsProject,
        },
      ],
    },
    {
      label: "Escrever",
      items: [{ page: "review", label: pageLabels.review, icon: <PenIcon /> }],
    },
    {
      label: "Analisar",
      items: [
        { page: "archive", label: pageLabels.archive, icon: <ArchiveIcon />, disabled: !hasOpenProject, disabledReason: needsProject },
        {
          page: "style-sheet",
          label: pageLabels["style-sheet"],
          icon: <TypeIcon />,
          disabled: !hasOpenProject || !styleSheet.isAvailable,
          disabledReason: hasOpenProject ? "Folha de estilo indisponível" : needsProject,
        },
        { page: "architectural-review", label: pageLabels["architectural-review"], icon: <LayersIcon />, disabled: !hasOpenProject, disabledReason: needsProject },
        { page: "rhythm", label: pageLabels.rhythm, icon: <PulseIcon />, disabled: !hasOpenProject, disabledReason: needsProject },
        { page: "scene-map", label: pageLabels["scene-map"], icon: <MapIcon />, disabled: !hasOpenProject, disabledReason: needsProject },
      ],
    },
    {
      label: "Entregar",
      items: [
        { page: "export", label: pageLabels.export, icon: <ExportIcon />, disabled: !hasOpenProject, disabledReason: needsProject },
      ],
    },
    {
      label: "Ajuda",
      items: [{ page: "guide", label: pageLabels.guide, icon: <BookIcon /> }],
    },
  ];

  return (
    <main className={`app-shell${isNavOpen ? " nav-open" : ""}${isReadingActive ? " reading-mode" : ""}${isNotesOpen && context.projectId && projectKey ? " notes-docked" : ""}`}>
      <header className="topbar">
        <div className="topbar-start">
          <button
            aria-controls="sidebar"
            aria-expanded={isNavOpen}
            aria-label="Abrir navegação"
            className="icon-button nav-toggle"
            ref={navToggleRef}
            type="button"
            onClick={() => setIsNavOpen(true)}
          >
            <MenuIcon />
          </button>
          <a className="brand" href="/" aria-label="Petricor, início">
            <span className="brand-mark" aria-hidden="true">P</span>
            <span className="brand-name">Petricor</span>
          </a>
        </div>
        {/* The guide belongs to no project, so it shows on its own. */}
        {(currentProject || page === "guide") && (
          <nav aria-label="Localização" className="topbar-breadcrumb">
            {currentProject && page !== "guide" && (
              <>
                <span className="breadcrumb-project" title={currentProject.title}>
                  {currentProject.title}
                </span>
                <span aria-hidden="true" className="breadcrumb-separator">/</span>
              </>
            )}
            <span aria-current="page" className="breadcrumb-page">{pageLabels[page]}</span>
            {currentProject && page !== "guide" && page !== "pipeline" && pipeline.pipeline && (
              <button
                className="breadcrumb-stage"
                title="Etapa do projeto"
                type="button"
                onClick={() => goTo("pipeline")}
              >
                {pipeline.pipeline.finishedAt ? "Concluído" : (currentStage?.name ?? "Sem etapa")}
              </button>
            )}
          </nav>
        )}
        <div className="topbar-actions">
          {context.projectId && projectKey && (
            <button
              aria-keyshortcuts="Alt+A"
              aria-pressed={isNotesOpen}
              className="button button-secondary topbar-notes"
              data-tour="notes"
              title="Notas de revisão (Alt+A)"
              type="button"
              onClick={() => (isNotesOpen ? setIsNotesOpen(false) : openNotes())}
            >
              <NoteIcon />
              Notas
              {openNoteCount > 0 && <span className="topbar-notes-count">{openNoteCount}</span>}
            </button>
          )}
          <HelpMenu
            hasOpenProject={Boolean(context.projectId && projectKey)}
            onOpenGuide={openGuide}
            onStartTour={setActiveTour}
          />
          <button
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            className="icon-button topbar-icon-button"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            type="button"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <AccountMenu user={user} onLogout={onLogout} />
        </div>
      </header>

      <div className="app-layout">
        <div
          aria-hidden="true"
          className="nav-backdrop"
          onClick={() => setIsNavOpen(false)}
        />
        <aside className="sidebar" id="sidebar" aria-label="Navegação principal">
          <button
            aria-label="Fechar navegação"
            className="icon-button sidebar-close"
            ref={sidebarCloseRef}
            type="button"
            onClick={() => setIsNavOpen(false)}
          >
            <CloseIcon />
          </button>
          <ProjectSwitcher
            projectId={context.projectId}
            projects={projects}
            sceneCount={projectSlots.length}
            onCreate={() => {
              setIsNavOpen(false);
              setIsProjectModalOpen(true);
            }}
            onSelect={(projectId) => {
              setIsNavOpen(false);
              setProjectToUnlock(projectId);
            }}
          />

          {!hasOpenProject && (
            <p className="sidebar-hint">
              Abra ou crie um projeto para usar o arquivo, as análises e a exportação.
            </p>
          )}

          <nav className="sidebar-navigation" aria-label="Seções do projeto" data-tour="sidebar-nav">
            {navGroups.map((group) => (
              <div className="sidebar-group" key={group.label}>
                <p className="sidebar-section-label">{group.label}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.page}>
                      <button
                        aria-current={page === item.page ? "page" : undefined}
                        className="sidebar-link"
                        disabled={item.disabled}
                        title={item.disabled ? item.disabledReason : undefined}
                        type="button"
                        onClick={() => goTo(item.page)}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    </li>
                  ))}
                  {group.label === "Escrever" && googleDocs.status?.available && (
                    <li>
                      <button
                        className="sidebar-link"
                        disabled={!hasOpenProject}
                        title={hasOpenProject ? undefined : needsProject}
                        type="button"
                        onClick={() => {
                          setIsNavOpen(false);
                          setIsGoogleDocsOpen(true);
                        }}
                      >
                        <GoogleDocIcon />
                        <span>Google Docs</span>
                        {googleDocs.link && (
                          <span className="sidebar-link-badge" title="Documento vinculado">
                            {googleDocs.isSyncing ? "…" : "✓"}
                          </span>
                        )}
                      </button>
                    </li>
                  )}
                  {group.label === "Escrever" && (
                    <li>
                      <button
                        className="sidebar-link"
                        disabled={!hasOpenProject}
                        title={hasOpenProject ? undefined : needsProject}
                        type="button"
                        onClick={() => {
                          setIsNavOpen(false);
                          setIsManuscriptImportOpen(true);
                        }}
                      >
                        <UploadDocumentIcon />
                        <span>Importar manuscrito</span>
                      </button>
                    </li>
                  )}
                  {group.label === "Escrever" && (
                    <li>
                      <button
                        className="sidebar-link"
                        disabled={!hasOpenProject}
                        title={hasOpenProject ? "Juntar quebras de linha no meio de frases (texto colado de PDF)" : needsProject}
                        type="button"
                        onClick={() => {
                          // The open scene may be rewritten; unsaved edits would be lost.
                          if (!confirmDiscard()) return;
                          setIsNavOpen(false);
                          setIsLineBreakRepairOpen(true);
                        }}
                      >
                        <JoinLinesIcon />
                        <span>Juntar linhas quebradas</span>
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </nav>

          {context.projectId && (
            <div className="sidebar-footer">
              <button
                className="sidebar-link sidebar-link-danger"
                type="button"
                onClick={() => {
                  setIsNavOpen(false);
                  setIsDeleteProjectModalOpen(true);
                }}
              >
                <TrashIcon />
                <span>Excluir projeto…</span>
              </button>
            </div>
          )}
        </aside>

        <div className="workspace">
          {(contextError || review.error) && (
            <div className="error-banner" role="alert">
              <span>{contextError || review.error}</span>
              <button
                aria-label="Fechar mensagem"
                type="button"
                onClick={() => {
                  setContextError(null);
                  review.clearError();
                }}
              >
                ×
              </button>
            </div>
          )}

          {page === "pipeline" && context.projectId && (
            <PipelinePage
              canUseProduction={Boolean(user.marketingEnabled)}
              error={pipeline.error}
              isLoading={pipeline.isLoading}
              notes={notes.notes}
              pipeline={pipeline.pipeline}
              projectTitle={currentProject?.title ?? ""}
              saveState={pipeline.saveState}
              slots={projectSlots}
              onGoTo={goTo}
              onLocateNote={(note) => {
                if (note.slotId) {
                  locateNote(note);
                } else {
                  setFocusedNoteId(note.id);
                  openNotes("project");
                }
              }}
              onOpenNotes={() => openNotes()}
              onOpenScene={openScene}
              onSetNoteStatus={async (note, status) => {
                await notes.setStatus(note, status);
                refreshProjectState();
              }}
              onUpdate={pipeline.update}
            />
          )}

          {page === "archive" && (
            <ArchivePage
              key={context.projectId}
              projectId={context.projectId}
              projectKey={projectKey}
              groups={projectGroups}
              slots={projectSlots}
              onError={setContextError}
              onOpenScene={openScene}
            />
          )}

          {page === "architectural-review" && (
            <ArchitecturalReviewPage
              groups={projectGroups}
              projectId={context.projectId}
              projectKey={projectKey}
              slots={projectSlots}
              onCreateNote={async (body) => {
                await createNote({
                  slotId: null,
                  kind: "FIX",
                  payload: { body, author: readAuthorName(), excerpt: null },
                });
                refreshProjectState();
              }}
              onError={setContextError}
              onOpenNotes={() => openNotes("project")}
              onOpenRhythm={() => goTo("rhythm")}
              onOpenScene={openScene}
            />
          )}

          {page === "style-sheet" && context.projectId && (
            <StyleSheetPage
              error={styleSheet.error}
              isLoading={styleSheet.isLoading}
              names={projectNames}
              projectKey={projectKey}
              sheet={styleSheet.sheet}
              slots={projectSlots}
              onOpenScene={openScene}
              onSave={styleSheet.save}
            />
          )}

          {page === "rhythm" && context.projectId && (
            <RhythmPage
              groups={projectGroups}
              projectId={context.projectId}
              projectKey={projectKey}
              slots={projectSlots}
              onOpenArchitect={() => goTo("architectural-review")}
              onOpenScene={openScene}
            />
          )}

          {page === "scene-map" && context.projectId && (
            <SceneMapPage
              key={context.projectId}
              projectId={context.projectId}
              projectTitle={currentProject?.title ?? ""}
              slots={projectSlots}
              onAnalyse={isAnalysisBusy ? undefined : () => setIsAnalysisDialogOpen(true)}
              onOpenScene={openScene}
            />
          )}

          {page === "export" && (
            <ProjectReviewExportPage
              groups={projectGroups}
              notes={notes.notes}
              projectId={context.projectId}
              projectKey={projectKey}
              slots={projectSlots}
              styleSheet={styleSheet.sheet}
              letterDraft={letterDraft}
              onOpenPipeline={pipeline.isAvailable ? () => goTo("pipeline") : undefined}
              onError={setContextError}
            />
          )}

          {page === "guide" && (
            <GuidePage
              articleId={guideArticle}
              hasOpenProject={hasOpenProject}
              onOpenArticle={setGuideArticle}
              onStartTour={(tour) => {
                if (tour === "project") goTo("review");
                setActiveTour(tour);
              }}
            />
          )}

          {page === "review" && !context.projectId && (
            <section className="welcome-state">
              <p className="eyebrow">Linter narrativo</p>
              <h1>Abra um projeto para revisar suas cenas.</h1>
              <p>
                Escolha um projeto na barra lateral ou crie um novo. Cada cena
                é analisada contra o cânone do projeto; o texto fica
                criptografado com a senha do projeto e nunca é reescrito.
              </p>
              <button
                className="button button-primary"
                type="button"
                onClick={() => setIsProjectModalOpen(true)}
              >
                Criar projeto
              </button>
            </section>
          )}

          {page === "review" && context.projectId && (
            <div className="review-layout" id="review">
              <Timeline
                projectId={context.projectId}
                slots={projectSlots}
                error={slotsError}
                selectedSlotId={context.slotId}
                onSelect={openScene}
                onCreate={startNewScene}
                onOpenFinder={openFinder}
                hasMoveHistory={projectMoves.length > 0}
                undoableMoveCount={undoableMoveCount}
                onOpenHistory={() => setIsMoveHistoryOpen(true)}
                groups={projectGroups}
                onOpenStructure={(groupId) => setStructureFocus({ groupId })}
                analysis={
                  tracksAnalysis && projectKey
                    ? {
                        pending: unanalysedCount,
                        isBusy: isAnalysisBusy,
                        onStart: () => setIsAnalysisDialogOpen(true),
                      }
                    : undefined
                }
                onAssignGroup={assignGroup}
                onCreateGroupAndAssign={createGroupAndAssign}
              />
              <div className="review-columns">
                <div className="review-main">
                  <SceneEditor
                    content={content}
                    focusMode={focusMode}
                    genre={genre}
                    diagnostics={highlightedDiagnostics}
                    focusedQuote={focusedQuote}
                    onFocusQuote={(quote) =>
                      setFocusedQuote({ quote, origin: "text" })
                    }
                    isSubmitting={review.isSubmitting}
                    isLocked={Boolean(context.slotId) && !isEditingScene}
                    hasSlot={Boolean(context.slotId)}
                    sceneId={context.slotId}
                    title={sceneTitle}
                    positionLabel={context.slotId ? "Cena" : "Nova cena"}
                    navigation={
                      selectedSlot
                        ? {
                            label:
                              selectedSlot.isUnanchored ||
                              selectedSlot.timelinePosition === null
                                ? "Cena avulsa"
                                : `Cena ${selectedSlot.timelinePosition + 1} de ${anchoredSceneCount}`,
                            onPrevious: previousScene
                              ? () => openScene(previousScene)
                              : null,
                            onNext: nextScene ? () => openScene(nextScene) : null,
                            onOpenFinder: openFinder,
                          }
                        : null
                    }
                    isUnanchored={isUnanchored}
                    insertionLabel="No fim da timeline"
                    onContentChange={setContent}
                    onFocusModeChange={setFocusMode}
                    onTitleChange={setSceneTitle}
                    onUnanchoredChange={setIsUnanchored}
                    onGenreChange={setGenre}
                    onSave={context.slotId ? saveEditedScene : submitScene}
                    onEdit={() => setIsEditingScene(true)}
                    onCancelEdit={() => {
                      if (selectedSlot) {
                        selectSlot(selectedSlot);
                      }
                    }}
                    onRename={renameScene}
                    onDelete={deleteScene}
                    noteAnchors={noteAnchors}
                    noteFocus={noteFocus}
                    onAnnotate={annotate}
                    isReadingMode={isReadingActive}
                    onToggleReadingMode={() => setIsReadingMode((value) => !value)}
                    onExcerptChange={setSelectedExcerpt}
                    onFocusNote={(noteId) => {
                      setFocusedNoteId(noteId);
                      openNotes("scene");
                    }}
                    groups={projectGroups}
                    groupId={selectedSlot?.groupId ?? null}
                    onGroupChange={(groupId) => {
                      if (context.slotId) void assignGroup([context.slotId], groupId);
                    }}
                    styleMarks={styleMarks}
                    styleFocus={styleFocus}
                    onFocusStyle={focusStyle}
                    nextSceneTitle={mergeTarget ? titleOf(mergeTarget) : null}
                    onRequestMerge={() => setIsMergeOpen(true)}
                    onShortcutUnavailable={(message) => setToast({ kind: "undone", message })}
                    onSplit={splitScene}
                  />
                  {(context.slotId || review.facts.length > 0) && (
                    <FactProposalPanel
                      facts={review.facts}
                      factStatus={review.factStatus}
                      isDeciding={review.isDecidingFacts}
                      slotId={context.slotId}
                      canonFacts={canonFacts}
                      slots={projectSlots}
                      approval={review.approval}
                      onApprove={() =>
                        void review.approve().then(refreshProjectState)
                      }
                      onChange={updateFact}
                      onReject={() =>
                        void review.reject().then(refreshProjectState)
                      }
                      onUpdateApprovedFact={(index, fact) =>
                        review
                          .updateApprovedFact(index, fact)
                          .then(refreshProjectState)
                      }
                      onRemove={(index) =>
                        review.setFacts((current) =>
                          current.filter((_, factIndex) => factIndex !== index),
                        )
                      }
                      onSelectSlot={openScene}
                    />
                  )}
                </div>
                <aside className="review-aside" aria-label="Diagnósticos e alertas">
                  <DiagnosticsPanel
                    diagnostics={reportDiagnostics}
                    overrides={review.overrides}
                    sceneText={content}
                    focusedQuote={focusedQuote}
                    onLocateQuote={(quote) =>
                      setFocusedQuote({ quote, origin: "diagnostic" })
                    }
                    onSaveOverride={(signatureHash, justification) =>
                      review.saveOverride(signatureHash, justification).then(refreshProjectState)
                    }
                    onRemoveOverride={(signatureHash) =>
                      review.removeOverride(signatureHash).then(refreshProjectState)
                    }
                    onDismiss={(signatureHash) =>
                      review.dismissDiagnostic(signatureHash).then(refreshProjectState)
                    }
                    onMakeNote={
                      context.slotId && projectKey
                        ? async (diagnostic) => {
                            // The finding becomes the reviewer's own note on the passage, to edit at will.
                            const span = locateQuote(content, diagnostic.sourceQuote);
                            try {
                              const note = await createNote({
                                slotId: context.slotId,
                                kind: "FIX",
                                payload: {
                                  body: diagnostic.correctionHint
                                    ? `${diagnostic.message}\n\n${diagnostic.correctionHint}`
                                    : diagnostic.message,
                                  author: readAuthorName(),
                                  excerpt: span
                                    ? { quote: content.slice(span.start, span.end), start: span.start, end: span.end }
                                    : null,
                                },
                              });
                              refreshProjectState();
                              openNotes("scene");
                              setFocusedNoteId(note.id);
                            } catch (reason) {
                              setContextError(reason instanceof Error ? reason.message : "Não foi possível criar a nota.");
                            }
                          }
                        : undefined
                    }
                    tab={revisorTab}
                    onTabChange={setRevisorTab}
                    style={
                      styleSheet.isAvailable
                        ? {
                            count: activeStyleFindings.length,
                            content: (
                              <StyleFindings
                                busyKey={styleBusyKey}
                                findings={styleFindings}
                                focusKey={styleFocus?.key ?? null}
                                hasSlot={Boolean(context.slotId)}
                                isLoading={styleSheet.isLoading}
                                showMarks={showStyleMarks}
                                onLocate={(finding) => setStyleFocus({ key: finding.key })}
                                onOpenSheet={() => goTo("style-sheet")}
                                onToggleException={(finding) => void toggleStyleException(finding)}
                                onToggleMarks={(show) => {
                                  setShowStyleMarks(show);
                                  try {
                                    localStorage.setItem("petricor-style-marks", show ? "on" : "off");
                                  } catch {
                                    // The choice lasts the session.
                                  }
                                }}
                              />
                            ),
                          }
                        : undefined
                    }
                  />
                  {context.slotId && (
                    <div id="alerts">
                      <AlertPanel
                        alerts={review.alerts}
                        slots={projectSlots}
                        isLoading={review.isLoadingResources}
                        onSelectSlot={openScene}
                        moves={projectMoves}
                        undoingMoveId={undoingMoveId}
                        onUndoMove={undoMove}
                        onAcknowledge={(alertId) =>
                          void review
                            .acknowledgeAlert(alertId)
                            .then(refreshProjectState)
                        }
                        onRefresh={() => void review.refreshResources()}
                      />
                    </div>
                  )}
                </aside>
              </div>
            </div>
          )}
        </div>
      </div>
      {isGoogleDocsOpen && hasOpenProject && (
        <GoogleDocsDialog
          sync={googleDocs}
          onPublishComments={(sources) =>
            void googleDocs.publishComments({
              slots: projectSlots,
              notes: notes.notes,
              styleSheet: styleSheet.sheet,
              sources,
            })
          }
          onClose={() => setIsGoogleDocsOpen(false)}
          onOpenGuide={() => {
            setIsGoogleDocsOpen(false);
            openGuide("google-docs");
          }}
        />
      )}
      {activeTour && (
        <ProductTour
          finalAction={
            activeTour === "welcome" && projects?.length === 0
              ? { label: "Criar meu primeiro projeto", run: () => setIsProjectModalOpen(true) }
              : undefined
          }
          key={activeTour}
          steps={activeTour === "welcome" ? welcomeTour : projectTour}
          onClose={() => finishTour(activeTour)}
          onOpenArticle={openGuide}
          onSidebarNeeded={setIsNavOpen}
        />
      )}
      {isProjectModalOpen && (
        <ProjectCreationModal
          onClose={() => setIsProjectModalOpen(false)}
          onCreated={(projectId, key) => {
            activateContext(projectId, "", key);
            recordAccess(projectId);
            reloadProjects();
            setIsProjectModalOpen(false);
          }}
        />
      )}
      {projectToUnlock && (
        <ProjectUnlockModal
          projectId={projectToUnlock}
          onClose={() => setProjectToUnlock(null)}
          onUnlocked={(projectId, key) => {
            // Picks up at the last scene once the project's scenes arrive.
            resumeSceneRef.current = readLastScene(projectId);
            activateContext(projectId, "", key);
            recordAccess(projectId);
            setProjectToUnlock(null);
          }}
        />
      )}
      {isDeleteProjectModalOpen && context.projectId && (
        <DeleteProjectModal
          projectId={context.projectId}
          onClose={() => setIsDeleteProjectModalOpen(false)}
          onDeleted={() => {
            void forgetProjectKey(context.projectId);
            activateContext("");
            reloadProjects();
            setIsDeleteProjectModalOpen(false);
          }}
        />
      )}
      {structureFocus && context.projectId && (
        <GroupManager
          focusGroupId={structureFocus.groupId}
          groups={projectGroups}
          scenes={orderedScenes.filter((slot) => !slot.isUnanchored)}
          onClose={() => setStructureFocus(null)}
          onCreate={async (newGroups) => {
            await api.createGroups(context.projectId, newGroups);
            await reloadGroups();
          }}
          onDelete={async (group) => {
            await api.deleteGroup(group.id);
            setSlots((current) =>
              current.map((slot) =>
                slot.groupId === group.id ? { ...slot, groupId: null } : slot,
              ),
            );
            await reloadGroups();
          }}
          onUpdate={async (groupId, patch) => {
            await api.updateGroup(groupId, patch);
            await reloadGroups();
          }}
        />
      )}
      {isMergeOpen && mergeTarget && (
        <MergeDialog
          nextTitle={titleOf(mergeTarget)}
          title={sceneTitle}
          onClose={() => setIsMergeOpen(false)}
          onConfirm={mergeWithNext}
        />
      )}
      {isMoveHistoryOpen && context.projectId && (
        <MoveHistory
          moves={projectMoves}
          slots={projectSlots}
          undoingMoveId={undoingMoveId}
          onClose={() => setIsMoveHistoryOpen(false)}
          onSelectSlot={(slot) => {
            setIsMoveHistoryOpen(false);
            openScene(slot);
          }}
          onUndo={undoMove}
        />
      )}
      {isLineBreakRepairOpen && projectKey && (
        <LineBreakRepairModal
          projectKey={projectKey}
          slots={projectSlots}
          onApplied={(slotIds) => {
            const open = projectSlots.find((slot) => slot.id === context.slotId);
            if (open && slotIds.includes(open.id)) selectSlot(open);
          }}
          onClose={() => setIsLineBreakRepairOpen(false)}
        />
      )}
      {context.projectId && projectKey && (
        <NotesPanel
          attachedExcerpt={attachedExcerpt}
          currentSlotId={context.slotId}
          error={notes.error}
          focusedNoteId={focusedNoteId}
          isOpen={isNotesOpen}
          currentStageId={currentStage?.id ?? null}
          notes={notes.notes}
          slots={projectSlots}
          requestedKind={noteKindRequest}
          stageNames={stageNames}
          tab={notesTab}
          onCreate={async (note) => {
            await createNote(note);
            refreshProjectState();
          }}
          onDetachExcerpt={() => setAttachedExcerpt(null)}
          onEdit={notes.edit}
          onLocate={locateNote}
          onOpenChange={setIsNotesOpen}
          onOpenScene={(slotId) => {
            const slot = projectSlots.find((item) => item.id === slotId);
            if (slot) openScene(slot);
          }}
          onRemove={async (note) => {
            await notes.remove(note);
            refreshProjectState();
          }}
          onSetStatus={async (note, status) => {
            await notes.setStatus(note, status);
            refreshProjectState();
          }}
          onTabChange={setNotesTab}
        />
      )}
      {toast && (
        <Toast
          actionLabel={
            toast.kind === "moved" ? "Desfazer" : toast.kind === "action" ? toast.actionLabel : undefined
          }
          actionShortcut={toast.kind === "moved" ? "Control+Z" : undefined}
          key={toast.kind === "moved" ? toast.moveId : toast.message}
          onAction={
            toast.kind === "moved"
              ? () => undoMove(toast.moveId)
              : toast.kind === "action"
                ? toast.onAction
                : undefined
          }
          onDismiss={dismissToast}
          durationMs={toast.kind === "undone" ? 5000 : 12000}
        >
          {toast.message}
        </Toast>
      )}
      {isFinderOpen && context.projectId && (
        <SceneFinder
          groups={projectGroups}
          slots={projectSlots}
          selectedSlotId={context.slotId}
          onClose={closeFinder}
          onReorder={reorderScene}
          onSelect={(slot) => {
            setIsFinderOpen(false);
            openScene(slot);
          }}
        />
      )}
      {isAnalysisDialogOpen && context.projectId && projectKey && (
        <AnalysisStartDialog
          slots={projectSlots}
          onClose={() => setIsAnalysisDialogOpen(false)}
          onStart={(slotIds, concurrency) => {
            setIsAnalysisDialogOpen(false);
            backgroundAnalysis.start(slotIds, concurrency);
          }}
        />
      )}
      {context.projectId && projectKey && (
        <BackgroundAnalysisWidget
          key={context.projectId}
          processed={backgroundAnalysis.processed}
          slots={projectSlots}
          state={backgroundAnalysis.state}
          onCancel={backgroundAnalysis.cancel}
          onDismiss={backgroundAnalysis.dismiss}
          onOpenScene={openScene}
          onPause={backgroundAnalysis.pause}
          onResume={backgroundAnalysis.resume}
          onRetryFailed={backgroundAnalysis.retryFailed}
        />
      )}
      {isManuscriptImportOpen && context.projectId && projectKey && (
        <ManuscriptImportModal
          projectId={context.projectId}
          projectKey={projectKey}
          onClose={() => setIsManuscriptImportOpen(false)}
          onCompleted={() => {
            activateContext(context.projectId, "", projectKey);
            setIsManuscriptImportOpen(false);
            setToast({
              kind: "action",
              message: "Importação concluída. Quer analisar as cenas em segundo plano enquanto trabalha?",
              actionLabel: "Analisar agora",
              onAction: () => setIsAnalysisDialogOpen(true),
            });
          }}
        />
      )}
    </main>
  );
}

export default App;
