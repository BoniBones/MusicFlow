import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  Columns2,
  EyeOff,
  FileText,
  Keyboard,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  MoveVertical,
  Music2,
  PenTool,
  ScrollText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../services/db';
import { markOpened, openScoreDocument } from '../services/libraryRepo';
import {
  addBookmark,
  addSection,
  deleteBookmark,
  deleteSection,
  getPrefs,
  loadAnnotations,
  savePageAnnotations,
  savePrefs,
} from '../services/practiceRepo';
import { useSettings } from '../settings/SettingsContext';
import { useMetronome } from '../audio/MetronomeContext';
import { secondsPerBar } from '../audio/meter';
import { useFullscreen } from '../hooks/useFullscreen';
import { useWakeLock } from '../hooks/useWakeLock';
import type { ScoreDocument } from '../rendering/scoreDocument';
import {
  clampZoom,
  computeLayout,
  offsetToPosition,
  pageAtOffset,
  positionToOffset,
  READING_LINE,
  spreadIndexOfPage,
  spreadsFor,
} from './layout';
import {
  clampSecondsPerPage,
  lastMeasure,
  measureToOffset,
  offsetToMeasure,
  pixelsPerSecond,
  stepSpeed,
  toTimingPoints,
  validateMarkers,
} from './timing';
import { PageView } from './PageView';
import { AutoScrollBar } from './AutoScrollBar';
import { MetronomePopover } from './MetronomePopover';
import { AnnotationBar, ANNOTATION_COLORS, STROKE_WIDTHS } from './AnnotationBar';
import { PracticeDrawer, type DrawerTab } from './PracticeDrawer';
import { ShortcutModal } from './ShortcutModal';
import { eventToCombo, findAction, isEditableTarget, isModifierOnly } from '../shortcuts/keys';
import type {
  Annotation,
  AnnotationTool,
  AutoScrollSettings,
  FitMode,
  ScorePosition,
  TimingMarker,
  ViewMode,
} from '../types';

export interface ReaderViewProps {
  scoreId: string;
  onExit: () => void;
}

interface AnnotationHistoryEntry {
  page: number;
  prev: Annotation[];
  next: Annotation[];
}

export function ReaderView({ scoreId, onExit }: ReaderViewProps) {
  const { settings } = useSettings();
  const metronome = useMetronome();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const { fullscreen, toggle: toggleFullscreen, exit: exitFullscreen } = useFullscreen(rootRef);

  const score = useLiveQuery(() => db.scores.get(scoreId), [scoreId]);
  const bookmarks = useLiveQuery(() => db.bookmarks.where('scoreId').equals(scoreId).toArray(), [scoreId], []);
  const sections = useLiveQuery(() => db.sections.where('scoreId').equals(scoreId).toArray(), [scoreId], []);

  const [doc, setDoc] = useState<ScoreDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Display state
  const [viewMode, setViewMode] = useState<ViewMode>(settings.defaultViewMode);
  const [fitMode, setFitMode] = useState<FitMode>(settings.defaultFitMode);
  const [zoom, setZoom] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  // Autoscroll state
  const [autoScroll, setAutoScroll] = useState<AutoScrollSettings>(settings.autoScroll);
  const [scrolling, setScrolling] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [timingMarkers, setTimingMarkers] = useState<TimingMarker[]>([]);
  const [currentMeasure, setCurrentMeasure] = useState<number | null>(null);

  // Resume prompt
  const [resumeOffer, setResumeOffer] = useState<ScorePosition | null>(null);

  // Panels & chrome visibility
  const [controlsVisible, setControlsVisible] = useState(true);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [showMetronome, setShowMetronome] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('bookmarks');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Practice sections
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [loopActiveSection, setLoopActiveSection] = useState(true);
  const [pickMode, setPickMode] = useState<'marker' | 'bookmark' | 'sectionStart' | 'sectionEnd' | null>(null);

  // Annotations
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotTool, setAnnotTool] = useState<AnnotationTool>('pen');
  const [annotColor, setAnnotColor] = useState(ANNOTATION_COLORS[0].value);
  const [annotWidth, setAnnotWidth] = useState(STROKE_WIDTHS[1].value);
  const [annotationsByPage, setAnnotationsByPage] = useState<Map<number, Annotation[]>>(new Map());
  const [undoStack, setUndoStack] = useState<AnnotationHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationHistoryEntry[]>([]);

  // Keep wake lock active while reading
  useWakeLock(settings.keepAwake);

  // Load document, per-piece preferences, and annotations
  useEffect(() => {
    let cancelled = false;
    let loadedDoc: ScoreDocument | null = null;
    setLoading(true);
    setError(null);

    async function init() {
      const s = await db.scores.get(scoreId);
      if (!s) {
        if (!cancelled) {
          setError('Score not found in your library.');
          setLoading(false);
        }
        return;
      }
      void markOpened(scoreId);
      const [openedDoc, prefs, annotMap] = await Promise.all([
        openScoreDocument(s),
        getPrefs(scoreId),
        loadAnnotations(scoreId),
      ]);
      if (cancelled) {
        openedDoc.destroy();
        return;
      }
      loadedDoc = openedDoc;
      setDoc(openedDoc);
      setAnnotationsByPage(annotMap);

      if (prefs) {
        if (prefs.viewMode) setViewMode(prefs.viewMode);
        if (prefs.fitMode) setFitMode(prefs.fitMode);
        if (prefs.zoom) setZoom(clampZoom(prefs.zoom));
        if (prefs.autoScroll) {
          setAutoScroll((prev) => ({ ...prev, ...prefs.autoScroll }));
        }
        if (prefs.metronome) {
          metronome.update(prefs.metronome);
        }
        if (prefs.timingMarkers) {
          setTimingMarkers(prefs.timingMarkers);
        }
        if (prefs.lastPosition && (prefs.lastPosition.page > 0 || prefs.lastPosition.y > 0.05)) {
          setResumeOffer(prefs.lastPosition);
        }
      }
      setLoading(false);
    }

    init().catch((err) => {
      if (!cancelled) {
        setError((err as Error)?.message ?? 'Failed to open score.');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      loadedDoc?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreId]);

  // Observe viewport size
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const updateSize = () => {
      setViewportSize({
        width: el.clientWidth || window.innerWidth,
        height: el.clientHeight || window.innerHeight,
      });
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Compute spreads & layout
  const spreads = useMemo(() => (doc ? spreadsFor(doc.pageCount, viewMode) : [[0]]), [doc, viewMode]);
  const currentSpreadIndex = useMemo(() => spreadIndexOfPage(currentPage, viewMode), [currentPage, viewMode]);
  const currentSpread = spreads[currentSpreadIndex] ?? [0];

  const layout = useMemo(() => {
    if (!doc) return { pages: [], totalWidth: viewportSize.width, totalHeight: viewportSize.height };
    return computeLayout(
      {
        sizes: doc.pageSizes,
        viewMode,
        fitMode,
        zoom,
        containerWidth: viewportSize.width,
        containerHeight: viewportSize.height,
        padding: performanceMode ? 4 : 16,
        gap: 18,
      },
      currentSpread,
    );
  }, [doc, viewMode, fitMode, zoom, viewportSize.width, viewportSize.height, performanceMode, currentSpread]);

  const effectiveScale = layout.pages[0]?.scale ?? zoom;

  // Compute current ScorePosition from scroll offset
  const getCurrentPosition = useCallback((): ScorePosition => {
    const vp = viewportRef.current;
    if (!vp || layout.pages.length === 0) return { page: currentPage, y: 0 };
    if (viewMode === 'continuous') {
      const readingOffset = vp.scrollTop + vp.clientHeight * READING_LINE;
      return offsetToPosition(readingOffset, layout);
    }
    const p = layout.pages[0];
    const maxScroll = Math.max(1, layout.totalHeight - vp.clientHeight);
    const y = layout.totalHeight > vp.clientHeight ? Math.min(1, Math.max(0, vp.scrollTop / maxScroll)) : 0;
    return { page: p.index, y };
  }, [layout, viewMode, currentPage]);

  // Jump to any ScorePosition smoothly or immediately
  const jumpToPosition = useCallback(
    (pos: ScorePosition) => {
      if (!doc) return;
      const targetPage = Math.min(doc.pageCount - 1, Math.max(0, pos.page));
      setCurrentPage(targetPage);
      const vp = viewportRef.current;
      if (!vp) return;
      if (viewMode === 'continuous') {
        const targetOffset = positionToOffset({ page: targetPage, y: pos.y }, layout);
        const top = Math.max(0, targetOffset - vp.clientHeight * READING_LINE * 0.5);
        vp.scrollTop = top;
        scrollAccumRef.current = top;
      } else {
        // Compute layout for target spread to set vertical offset
        const sp = spreadsFor(doc.pageCount, viewMode)[spreadIndexOfPage(targetPage, viewMode)] ?? [targetPage];
        const nextLayout = computeLayout(
          {
            sizes: doc.pageSizes,
            viewMode,
            fitMode,
            zoom,
            containerWidth: viewportSize.width,
            containerHeight: viewportSize.height,
            padding: performanceMode ? 4 : 16,
            gap: 18,
          },
          sp,
        );
        const maxScroll = Math.max(0, nextLayout.totalHeight - vp.clientHeight);
        const top = pos.y * maxScroll;
        vp.scrollTop = top;
        scrollAccumRef.current = top;
        pagedVirtualProgressRef.current = pos.y;
      }
      void savePrefs(scoreId, { lastPosition: { page: targetPage, y: pos.y } });
    },
    [doc, viewMode, layout, fitMode, zoom, viewportSize.width, viewportSize.height, performanceMode, scoreId],
  );

  // Track scroll position in continuous mode to update currentPage & persist lastPosition
  const savePosTimerRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || layout.pages.length === 0) return;
    if (viewMode === 'continuous') {
      const pos = offsetToPosition(vp.scrollTop + vp.clientHeight * READING_LINE, layout);
      if (pos.page !== currentPage) setCurrentPage(pos.page);
      if (autoScroll.mode === 'timed' && timingMarkers.length >= 2) {
        const pts = toTimingPoints(timingMarkers, (p) => positionToOffset(p, layout));
        setCurrentMeasure(offsetToMeasure(pts, vp.scrollTop + vp.clientHeight * READING_LINE));
      }
    }
    if (savePosTimerRef.current) window.clearTimeout(savePosTimerRef.current);
    savePosTimerRef.current = window.setTimeout(() => {
      const pos = getCurrentPosition();
      void savePrefs(scoreId, { lastPosition: pos });
    }, 350);
  }, [layout, viewMode, currentPage, autoScroll.mode, timingMarkers, getCurrentPosition, scoreId]);

  // Page navigation
  const goToPage = useCallback(
    (pageIndex: number) => {
      if (!doc) return;
      const clamped = Math.min(doc.pageCount - 1, Math.max(0, pageIndex));
      setCurrentPage(clamped);
      const vp = viewportRef.current;
      if (vp) {
        if (viewMode === 'continuous') {
          const box = layout.pages.find((p) => p.index === clamped);
          if (box) {
            const target = Math.max(0, box.top - 12);
            vp.scrollTop = target;
            scrollAccumRef.current = target;
          }
        } else {
          vp.scrollTop = 0;
          scrollAccumRef.current = 0;
          pagedVirtualProgressRef.current = 0;
        }
      }
      void savePrefs(scoreId, { lastPosition: { page: clamped, y: 0 } });
    },
    [doc, viewMode, layout.pages, scoreId],
  );

  const nextPage = useCallback(() => {
    if (!doc) return;
    const step = viewMode === 'spread' ? 2 : 1;
    if (currentPage + step < doc.pageCount) {
      goToPage(currentPage + step);
    } else if (currentPage < doc.pageCount - 1) {
      goToPage(doc.pageCount - 1);
    }
  }, [doc, viewMode, currentPage, goToPage]);

  const prevPage = useCallback(() => {
    const step = viewMode === 'spread' ? 2 : 1;
    goToPage(Math.max(0, currentPage - step));
  }, [viewMode, currentPage, goToPage]);

  // Auto-hide controls after inactivity
  const hideTimerRef = useRef<number | null>(null);
  const bumpActivity = useCallback(() => {
    if (performanceMode) return;
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (settings.controlsHideDelayMs > 0 && !showMetronome && !drawerOpen && !annotationMode && !showShortcuts) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, settings.controlsHideDelayMs);
    }
  }, [performanceMode, settings.controlsHideDelayMs, showMetronome, drawerOpen, annotationMode, showShortcuts]);

  useEffect(() => {
    bumpActivity();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [bumpActivity]);

  // ---- Autoscroll Engine (requestAnimationFrame + elapsed dt) -------------------
  const scrollAccumRef = useRef<number>(0);
  const pagedVirtualProgressRef = useRef<number>(0); // 0..1 progress in fit-to-page mode
  const latestStateRef = useRef({
    autoScroll,
    layout,
    viewMode,
    currentPage,
    pageCount: doc?.pageCount ?? 1,
    activeSection: sections.find((s) => s.id === activeSectionId) ?? null,
    loopActiveSection,
    timingMarkers,
    bpm: metronome.settings.bpm,
    timeSignature: metronome.settings.timeSignature,
    compoundFeel: metronome.settings.compoundFeel,
  });

  useEffect(() => {
    latestStateRef.current = {
      autoScroll,
      layout,
      viewMode,
      currentPage,
      pageCount: doc?.pageCount ?? 1,
      activeSection: sections.find((s) => s.id === activeSectionId) ?? null,
      loopActiveSection,
      timingMarkers,
      bpm: metronome.settings.bpm,
      timeSignature: metronome.settings.timeSignature,
      compoundFeel: metronome.settings.compoundFeel,
    };
  }, [
    autoScroll,
    layout,
    viewMode,
    currentPage,
    doc?.pageCount,
    sections,
    activeSectionId,
    loopActiveSection,
    timingMarkers,
    metronome.settings.bpm,
    metronome.settings.timeSignature,
    metronome.settings.compoundFeel,
  ]);

  // Countdown timer before autoscroll begins
  useEffect(() => {
    if (countdownRemaining === null) return;
    let rafId = 0;
    const startTs = performance.now();
    const initial = countdownRemaining;
    const tick = (now: number) => {
      const rem = initial - (now - startTs) / 1000;
      if (rem <= 0) {
        setCountdownRemaining(null);
        if (viewportRef.current) {
          scrollAccumRef.current = viewportRef.current.scrollTop;
        }
        setScrolling(true);
        return;
      }
      setCountdownRemaining(rem);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownRemaining !== null]);

  // Main requestAnimationFrame loop for autoscroll
  useEffect(() => {
    if (!scrolling) return;
    const vp = viewportRef.current;
    if (vp) scrollAccumRef.current = vp.scrollTop;
    let prevTs = performance.now();
    let rafId = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - prevTs) / 1000));
      prevTs = now;
      const vpEl = viewportRef.current;
      const st = latestStateRef.current;

      if (vpEl && st.layout.pages.length > 0) {
        if (st.viewMode === 'continuous') {
          const maxScroll = Math.max(0, st.layout.totalHeight - vpEl.clientHeight);
          let nextScroll = scrollAccumRef.current;

          if (st.autoScroll.mode === 'timed' && validateMarkers(st.timingMarkers) === null) {
            const pts = toTimingPoints(st.timingMarkers, (p) => positionToOffset(p, st.layout));
            const readingOffset = scrollAccumRef.current + vpEl.clientHeight * READING_LINE;
            const curM = offsetToMeasure(pts, readingOffset);
            const barSec = secondsPerBar(st.bpm, st.timeSignature, st.compoundFeel);
            const nextM = curM + dt / Math.max(0.1, barSec);
            setCurrentMeasure(nextM);
            if (nextM >= lastMeasure(pts)) {
              setScrolling(false);
              return;
            }
            const nextReadingOffset = measureToOffset(pts, nextM);
            nextScroll = Math.max(0, nextReadingOffset - vpEl.clientHeight * READING_LINE);
          } else {
            const curPage = pageAtOffset(scrollAccumRef.current + vpEl.clientHeight * READING_LINE, st.layout) ?? st.layout.pages[0];
            const speedPx = pixelsPerSecond(curPage.height, st.autoScroll.secondsPerPage);
            nextScroll = scrollAccumRef.current + speedPx * dt;
          }

          // Check active practice section loop
          if (st.activeSection && st.loopActiveSection) {
            const endOffset = positionToOffset(st.activeSection.end, st.layout) - vpEl.clientHeight * READING_LINE * 0.5;
            const startOffset = Math.max(
              0,
              positionToOffset(st.activeSection.start, st.layout) - vpEl.clientHeight * READING_LINE * 0.5,
            );
            if (nextScroll >= endOffset && endOffset > startOffset) {
              nextScroll = startOffset;
            }
          }

          if (nextScroll >= maxScroll) {
            vpEl.scrollTop = maxScroll;
            scrollAccumRef.current = maxScroll;
            setScrolling(false);
            return;
          }
          scrollAccumRef.current = nextScroll;
          vpEl.scrollTop = nextScroll;
        } else {
          // Single-page or two-page spread mode
          const pageBox = st.layout.pages[0];
          const maxScroll = Math.max(0, st.layout.totalHeight - vpEl.clientHeight);
          const speedPx = pixelsPerSecond(pageBox.height, st.autoScroll.secondsPerPage);
          if (maxScroll > 4) {
            const nextScroll = scrollAccumRef.current + speedPx * dt;
            if (nextScroll >= maxScroll) {
              const step = st.viewMode === 'spread' ? 2 : 1;
              if (st.currentPage + step < st.pageCount) {
                scrollAccumRef.current = 0;
                vpEl.scrollTop = 0;
                setCurrentPage(st.currentPage + step);
              } else {
                vpEl.scrollTop = maxScroll;
                setScrolling(false);
                return;
              }
            } else {
              scrollAccumRef.current = nextScroll;
              vpEl.scrollTop = nextScroll;
            }
          } else {
            // Fit-to-page where maxScroll == 0: advance virtual progress across the page duration
            pagedVirtualProgressRef.current += dt / Math.max(1, st.autoScroll.secondsPerPage);
            if (pagedVirtualProgressRef.current >= 1) {
              pagedVirtualProgressRef.current = 0;
              const step = st.viewMode === 'spread' ? 2 : 1;
              if (st.currentPage + step < st.pageCount) {
                setCurrentPage(st.currentPage + step);
              } else {
                setScrolling(false);
                return;
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [scrolling]);

  const startOrPauseAutoscroll = useCallback(() => {
    if (scrolling || countdownRemaining !== null) {
      setScrolling(false);
      setCountdownRemaining(null);
      return;
    }
    if (autoScroll.countdown === 'bar') {
      const barSec = secondsPerBar(
        metronome.settings.bpm,
        metronome.settings.timeSignature,
        metronome.settings.compoundFeel,
      );
      void metronome.start(1);
      setCountdownRemaining(barSec);
    } else if (autoScroll.countdown > 0) {
      setCountdownRemaining(autoScroll.countdown);
    } else {
      if (viewportRef.current) {
        scrollAccumRef.current = viewportRef.current.scrollTop;
      }
      setScrolling(true);
    }
  }, [scrolling, countdownRemaining, autoScroll.countdown, metronome]);

  const stopAutoscroll = useCallback(() => {
    setScrolling(false);
    setCountdownRemaining(null);
  }, []);

  const resetPosition = useCallback(() => {
    setScrolling(false);
    setCountdownRemaining(null);
    const activeSec = sections.find((s) => s.id === activeSectionId);
    if (activeSec) {
      jumpToPosition(activeSec.start);
    } else {
      jumpToPosition({ page: 0, y: 0 });
    }
  }, [sections, activeSectionId, jumpToPosition]);

  const updateAutoScroll = useCallback(
    (changes: Partial<AutoScrollSettings>) => {
      setAutoScroll((prev) => {
        const next: AutoScrollSettings = {
          ...prev,
          ...changes,
          secondsPerPage: clampSecondsPerPage(changes.secondsPerPage ?? prev.secondsPerPage),
        };
        void savePrefs(scoreId, { autoScroll: next });
        return next;
      });
    },
    [scoreId],
  );

  // Zoom helpers
  const changeZoom = useCallback(
    (nextZoom: number) => {
      const z = clampZoom(nextZoom);
      setFitMode('custom');
      setZoom(z);
      void savePrefs(scoreId, { fitMode: 'custom', zoom: z });
    },
    [scoreId],
  );

  const changeViewMode = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      void savePrefs(scoreId, { viewMode: mode });
    },
    [scoreId],
  );

  const changeFitMode = useCallback(
    (fit: FitMode) => {
      setFitMode(fit);
      void savePrefs(scoreId, { fitMode: fit });
    },
    [scoreId],
  );

  // Annotations change + undo/redo
  const handleChangeAnnotations = useCallback(
    (page: number, next: Annotation[]) => {
      setAnnotationsByPage((prevMap) => {
        const prev = prevMap.get(page) ?? [];
        setUndoStack((u) => [...u.slice(-39), { page, prev, next }]);
        setRedoStack([]);
        const copy = new Map(prevMap);
        copy.set(page, next);
        void savePageAnnotations(scoreId, page, next);
        return copy;
      });
    },
    [scoreId],
  );

  const handleUndoAnnotation = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const last = u[u.length - 1];
      setRedoStack((r) => [...r, last]);
      setAnnotationsByPage((prevMap) => {
        const copy = new Map(prevMap);
        copy.set(last.page, last.prev);
        void savePageAnnotations(scoreId, last.page, last.prev);
        return copy;
      });
      return u.slice(0, -1);
    });
  }, [scoreId]);

  const handleRedoAnnotation = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setUndoStack((u) => [...u, last]);
      setAnnotationsByPage((prevMap) => {
        const copy = new Map(prevMap);
        copy.set(last.page, last.next);
        void savePageAnnotations(scoreId, last.page, last.next);
        return copy;
      });
      return r.slice(0, -1);
    });
  }, [scoreId]);

  const handleClearPageAnnotations = useCallback(() => {
    handleChangeAnnotations(currentPage, []);
  }, [currentPage, handleChangeAnnotations]);

  // Timing markers
  const handleAddTimingMarker = useCallback(
    (pos: ScorePosition, measure?: number) => {
      setTimingMarkers((prev) => {
        const nextMeasure =
          measure ?? (prev.length === 0 ? 1 : Math.max(...prev.map((m) => m.measure)) + 4);
        const next = [...prev, { id: uid(), position: pos, measure: nextMeasure }].sort(
          (a, b) => a.position.page - b.position.page || a.position.y - b.position.y,
        );
        void savePrefs(scoreId, { timingMarkers: next });
        return next;
      });
    },
    [scoreId],
  );

  const handleUpdateTimingMarker = useCallback(
    (id: string, measure: number) => {
      setTimingMarkers((prev) => {
        const next = prev.map((m) => (m.id === id ? { ...m, measure } : m));
        void savePrefs(scoreId, { timingMarkers: next });
        return next;
      });
    },
    [scoreId],
  );

  const handleDeleteTimingMarker = useCallback(
    (id: string) => {
      setTimingMarkers((prev) => {
        const next = prev.filter((m) => m.id !== id);
        void savePrefs(scoreId, { timingMarkers: next });
        return next;
      });
    },
    [scoreId],
  );

  const handleClearTimingMarkers = useCallback(() => {
    setTimingMarkers([]);
    void savePrefs(scoreId, { timingMarkers: [] });
  }, [scoreId]);

  // Handle picking a position directly on a score page
  const handlePickPosition = useCallback(
    (pos: ScorePosition) => {
      if (pickMode === 'bookmark') {
        void addBookmark(scoreId, pos, `Page ${pos.page + 1} bookmark`);
      } else if (pickMode === 'marker') {
        handleAddTimingMarker(pos);
      }
      setPickMode(null);
    },
    [pickMode, scoreId, handleAddTimingMarker],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModifierOnly(e.key) || isEditableTarget(e.target)) return;
      bumpActivity();
      const combo = eventToCombo(e);
      const action = findAction(combo, settings.shortcuts);
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case 'toggleAutoscroll':
          startOrPauseAutoscroll();
          break;
        case 'toggleMetronome':
          void metronome.toggle();
          break;
        case 'toggleFullscreen':
          void toggleFullscreen();
          break;
        case 'nextPage':
          nextPage();
          break;
        case 'prevPage':
          prevPage();
          break;
        case 'speedUp':
          updateAutoScroll({ secondsPerPage: stepSpeed(autoScroll.secondsPerPage, 1) });
          break;
        case 'speedDown':
          updateAutoScroll({ secondsPerPage: stepSpeed(autoScroll.secondsPerPage, -1) });
          break;
        case 'escape':
          if (showShortcuts) setShowShortcuts(false);
          else if (performanceMode) {
            setPerformanceMode(false);
            setControlsVisible(true);
          } else if (annotationMode) setAnnotationMode(false);
          else if (showMetronome) setShowMetronome(false);
          else if (drawerOpen) setDrawerOpen(false);
          else if (fullscreen) void exitFullscreen();
          break;
        case 'resetScroll':
          resetPosition();
          break;
        case 'togglePerformance':
          setPerformanceMode((v) => !v);
          break;
        case 'zoomIn':
          changeZoom(effectiveScale * 1.15);
          break;
        case 'zoomOut':
          changeZoom(effectiveScale / 1.15);
          break;
        case 'sectionStart': {
          const sec = sections.find((s) => s.id === activeSectionId);
          if (sec) jumpToPosition(sec.start);
          else resetPosition();
          break;
        }
        case 'addBookmark':
          void addBookmark(scoreId, getCurrentPosition(), `Page ${currentPage + 1} mark`);
          break;
        case 'showShortcuts':
          setShowShortcuts((v) => !v);
          break;
        case 'tapTempo': {
          const next = metronome.tap();
          if (next !== null) void savePrefs(scoreId, { metronome: { bpm: next } });
          break;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    bumpActivity,
    settings.shortcuts,
    startOrPauseAutoscroll,
    metronome,
    toggleFullscreen,
    nextPage,
    prevPage,
    updateAutoScroll,
    autoScroll.secondsPerPage,
    showShortcuts,
    annotationMode,
    showMetronome,
    drawerOpen,
    performanceMode,
    fullscreen,
    exitFullscreen,
    resetPosition,
    changeZoom,
    effectiveScale,
    sections,
    activeSectionId,
    jumpToPosition,
    scoreId,
    getCurrentPosition,
    currentPage,
  ]);

  // Touch swipe gestures for single/spread page turn
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (annotationMode || e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      t: performance.now(),
    };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (annotationMode || !touchStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const dt = performance.now() - touchStartRef.current.t;
    touchStartRef.current = null;
    if (viewMode !== 'continuous' && dt < 450 && Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) nextPage();
      else prevPage();
    }
  };

  const pageCount = doc?.pageCount ?? score?.pageCount ?? 1;

  return (
    <div
      ref={rootRef}
      data-testid="reader-view"
      onMouseMove={bumpActivity}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        if (!performanceMode) setControlsVisible((v) => !v);
      }}
      className="fixed inset-0 z-30 flex flex-col bg-stone-900 overflow-hidden select-none"
    >
      {/* Top Floating Bar — auto-hides when reading */}
      {!performanceMode && (
        <header
          data-testid="reader-top-bar"
          onClick={(e) => e.stopPropagation()}
          className={`fixed top-3 left-3 right-3 z-40 flex items-center justify-between gap-2 pointer-events-none transition-all duration-250 ${
            controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3 pointer-events-none'
          }`}
        >
          {/* Left cluster: Back + Title + Page selector */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-stone-900/95 text-stone-100 border border-stone-700/80 shadow-xl backdrop-blur-md ${
              controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <button
              type="button"
              data-testid="reader-back-btn"
              onClick={() => {
                stopAutoscroll();
                onExit();
              }}
              aria-label="Back to library"
              title="Back to library"
              className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-200 flex items-center gap-1 text-xs font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Library</span>
            </button>

            <div className="h-4 w-px bg-stone-700" />

            <div className="max-w-[10rem] sm:max-w-xs truncate">
              <div data-testid="reader-score-title" className="text-xs font-semibold text-stone-100 truncate">
                {score?.title ?? 'Loading…'}
              </div>
              {score?.composer && <div className="text-[10px] text-stone-400 truncate">{score.composer}</div>}
            </div>

            <div className="h-4 w-px bg-stone-700" />

            {/* Page Navigation */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="reader-prev-page"
                onClick={prevPage}
                disabled={currentPage <= 0}
                aria-label="Previous page"
                title="Previous page (Left Arrow)"
                className="p-1 rounded-lg hover:bg-stone-800 disabled:opacity-35 text-stone-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                aria-label="Select page"
                data-testid="reader-page-select"
                value={currentPage}
                onChange={(e) => goToPage(Number(e.target.value))}
                className="bg-stone-800 text-stone-100 text-xs font-mono px-2 py-1 rounded-lg border border-stone-700 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                {Array.from({ length: pageCount }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1} / {pageCount}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="reader-next-page"
                onClick={nextPage}
                disabled={currentPage >= pageCount - 1}
                aria-label="Next page"
                title="Next page (Right Arrow)"
                className="p-1 rounded-lg hover:bg-stone-800 disabled:opacity-35 text-stone-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right cluster: View modes, Fit/Zoom, Practice tools, Metronome, Annotations, Performance, Fullscreen */}
          <div
            className={`flex flex-wrap items-center justify-end gap-1.5 px-2.5 py-1.5 rounded-2xl bg-stone-900/95 text-stone-100 border border-stone-700/80 shadow-xl backdrop-blur-md ${
              controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            {/* Display Mode: Continuous / Single / Spread */}
            <div className="flex items-center rounded-xl bg-stone-950/70 p-0.5 border border-stone-800">
              <button
                type="button"
                data-testid="view-mode-continuous"
                onClick={() => changeViewMode('continuous')}
                title="Continuous vertical scroll"
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${
                  viewMode === 'continuous' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-300 hover:text-white'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Scroll</span>
              </button>
              <button
                type="button"
                data-testid="view-mode-single"
                onClick={() => changeViewMode('single')}
                title="Single page view"
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${
                  viewMode === 'single' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-300 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">1 Page</span>
              </button>
              <button
                type="button"
                data-testid="view-mode-spread"
                onClick={() => changeViewMode('spread')}
                title="Two-page spread view"
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 ${
                  viewMode === 'spread' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-300 hover:text-white'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">2 Pages</span>
              </button>
            </div>

            {/* Fit & Zoom */}
            <div className="flex items-center rounded-xl bg-stone-950/70 p-0.5 border border-stone-800">
              <button
                type="button"
                data-testid="fit-mode-width"
                onClick={() => changeFitMode('width')}
                title="Fit to width"
                className={`p-1.5 rounded-lg text-xs ${
                  fitMode === 'width' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-300 hover:text-white'
                }`}
              >
                <MoveHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-testid="fit-mode-page"
                onClick={() => changeFitMode('page')}
                title="Fit whole page"
                className={`p-1.5 rounded-lg text-xs ${
                  fitMode === 'page' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-300 hover:text-white'
                }`}
              >
                <MoveVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-testid="zoom-out-btn"
                onClick={() => changeZoom(effectiveScale / 1.15)}
                aria-label="Zoom out"
                title="Zoom out"
                className="p-1.5 rounded-lg text-stone-300 hover:text-white"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span data-testid="zoom-percentage" className="px-1.5 text-[11px] font-mono text-stone-200">
                {Math.round(effectiveScale * 100)}%
              </span>
              <button
                type="button"
                data-testid="zoom-in-btn"
                onClick={() => changeZoom(effectiveScale * 1.15)}
                aria-label="Zoom in"
                title="Zoom in"
                className="p-1.5 rounded-lg text-stone-300 hover:text-white"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Metronome popover toggle */}
            <button
              type="button"
              data-testid="reader-metronome-btn"
              onClick={() => setShowMetronome((v) => !v)}
              title="Metronome (M)"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-colors ${
                metronome.running
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : showMetronome
                    ? 'bg-amber-500 text-stone-950 font-semibold border-amber-400'
                    : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
              }`}
            >
              <Music2 className="w-3.5 h-3.5" />
              <span className="font-mono">{metronome.settings.bpm}</span>
            </button>

            {/* Bookmarks & Practice Sections drawer toggle */}
            <button
              type="button"
              data-testid="reader-practice-btn"
              onClick={() => setDrawerOpen((v) => !v)}
              title="Bookmarks, Practice Sections & Timing Markers"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 border transition-colors ${
                drawerOpen || activeSectionId
                  ? 'bg-amber-500 text-stone-950 font-semibold border-amber-400'
                  : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
              }`}
            >
              <BookmarkIcon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Practice</span>
              {bookmarks.length > 0 && (
                <span className="px-1 rounded bg-stone-950/30 font-mono text-[10px]">{bookmarks.length}</span>
              )}
            </button>

            {/* Annotations toggle */}
            <button
              type="button"
              data-testid="reader-annotate-btn"
              onClick={() => setAnnotationMode((v) => !v)}
              title="Score Annotations"
              className={`p-1.5 rounded-xl border transition-colors ${
                annotationMode
                  ? 'bg-amber-500 text-stone-950 border-amber-400'
                  : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>

            {/* Performance mode */}
            <button
              type="button"
              data-testid="reader-performance-btn"
              onClick={() => {
                setShowMetronome(false);
                setDrawerOpen(false);
                setAnnotationMode(false);
                setPerformanceMode(true);
              }}
              title="Performance mode — hide all UI (P)"
              aria-label="Enter performance mode"
              className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>

            {/* Shortcuts reference */}
            <button
              type="button"
              data-testid="reader-shortcuts-btn"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
              className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200"
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              data-testid="reader-fullscreen-btn"
              onClick={() => void toggleFullscreen()}
              title="Toggle fullscreen (F)"
              aria-label="Toggle fullscreen"
              className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200"
            >
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>
      )}

      {/* Performance mode tiny exit pill */}
      {performanceMode && (
        <button
          type="button"
          data-testid="exit-performance-btn"
          onClick={(e) => {
            e.stopPropagation();
            setPerformanceMode(false);
            setControlsVisible(true);
          }}
          className="fixed top-2 right-2 z-50 px-2.5 py-1 rounded-full bg-stone-900/50 hover:bg-stone-900/90 text-stone-300 text-[11px] border border-stone-700/50 backdrop-blur-xs"
        >
          Exit Performance (Esc)
        </button>
      )}

      {/* Resume from previous reading position banner */}
      {resumeOffer && !performanceMode && (
        <div
          data-testid="resume-position-banner"
          onClick={(e) => e.stopPropagation()}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-stone-900/95 text-stone-100 border border-amber-500/50 shadow-2xl text-xs"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>
            Continue from <strong>Page {resumeOffer.page + 1}</strong> ({Math.round(resumeOffer.y * 100)}%)?
          </span>
          <button
            type="button"
            data-testid="resume-confirm-btn"
            onClick={() => {
              const target = resumeOffer;
              setResumeOffer(null);
              jumpToPosition(target);
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold"
          >
            Continue
          </button>
          <button
            type="button"
            data-testid="resume-dismiss-btn"
            onClick={() => setResumeOffer(null)}
            className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Pick-on-score hint banner */}
      {pickMode && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full bg-amber-500 text-stone-950 font-semibold text-xs shadow-xl flex items-center gap-2"
        >
          <span>Click anywhere on the score to place your {pickMode === 'bookmark' ? 'bookmark' : 'bar marker'}</span>
          <button type="button" onClick={() => setPickMode(null)} className="underline">
            Cancel
          </button>
        </div>
      )}

      {/* Floating Popovers: Metronome & Practice Drawer */}
      {showMetronome && !performanceMode && (
        <div className="fixed top-16 right-3 z-40">
          <MetronomePopover
            onClose={() => setShowMetronome(false)}
            onPersistScoreMetronome={(changes) => void savePrefs(scoreId, { metronome: changes })}
          />
        </div>
      )}

      {drawerOpen && !performanceMode && (
        <div className="fixed top-16 right-3 z-40">
          <PracticeDrawer
            tab={drawerTab}
            onChangeTab={setDrawerTab}
            bookmarks={bookmarks}
            sections={sections}
            activeSectionId={activeSectionId}
            loopActiveSection={loopActiveSection}
            timingMarkers={timingMarkers}
            currentPosition={getCurrentPosition()}
            pickMode={pickMode}
            onSetPickMode={setPickMode}
            onJumpTo={jumpToPosition}
            onAddBookmark={(pos, label, color) => void addBookmark(scoreId, pos, label, color)}
            onDeleteBookmark={(id) => void deleteBookmark(id)}
            onAddSection={(start, end, label) => void addSection(scoreId, start, end, label)}
            onDeleteSection={(id) => {
              if (activeSectionId === id) setActiveSectionId(null);
              void deleteSection(id);
            }}
            onSelectActiveSection={setActiveSectionId}
            onToggleLoopSection={setLoopActiveSection}
            onAddTimingMarker={handleAddTimingMarker}
            onUpdateTimingMarker={handleUpdateTimingMarker}
            onDeleteTimingMarker={handleDeleteTimingMarker}
            onClearTimingMarkers={handleClearTimingMarkers}
            onClose={() => setDrawerOpen(false)}
          />
        </div>
      )}

      {/* Score Viewport */}
      <div
        ref={viewportRef}
        data-testid="reader-scroll-viewport"
        onScroll={handleScroll}
        className="relative flex-1 overflow-auto"
      >
        {loading && (
          <div className="h-full flex items-center justify-center text-stone-300 text-sm">
            Rendering score…
          </div>
        )}
        {error && (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-rose-400 font-medium">{error}</p>
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-semibold text-xs"
            >
              Return to Library
            </button>
          </div>
        )}
        {doc && !loading && !error && (
          <div
            data-testid="reader-canvas-stage"
            style={{
              position: 'relative',
              width: `${layout.totalWidth}px`,
              height: `${layout.totalHeight}px`,
              margin: '0 auto',
            }}
          >
            {layout.pages.map((box) => (
              <PageView
                key={box.index}
                doc={doc}
                box={box}
                paperTone={settings.paperTone}
                eager={viewMode !== 'continuous' || box.index <= 1}
                annotations={annotationsByPage.get(box.index) ?? []}
                annotationMode={annotationMode}
                activeTool={annotTool}
                activeColor={annotColor}
                strokeWidth={annotWidth}
                textSize={0.022}
                onChangeAnnotations={handleChangeAnnotations}
                pickPositionMode={pickMode}
                onPickPosition={handlePickPosition}
              />
            ))}

            {/* Visual bookmark pins & active section markers on the score margin */}
            {bookmarks.map((bm) => {
              const p = layout.pages.find((pg) => pg.index === bm.position.page);
              if (!p) return null;
              const yPx = p.top + bm.position.y * p.height;
              return (
                <button
                  key={bm.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpToPosition(bm.position);
                  }}
                  style={{
                    position: 'absolute',
                    top: `${yPx - 10}px`,
                    left: `${Math.max(4, p.left - 8)}px`,
                    backgroundColor: bm.color,
                  }}
                  title={`Bookmark: ${bm.label}`}
                  className="z-20 px-2 py-0.5 rounded-r-full text-[10px] font-semibold text-stone-950 shadow-md hover:scale-105 transition-transform"
                >
                  {bm.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Optional Left / Right Page Turn Click Zones */}
      {settings.clickZones && !annotationMode && !pickMode && (
        <>
          <div
            data-testid="click-zone-prev"
            onClick={(e) => {
              e.stopPropagation();
              prevPage();
            }}
            title="Previous page"
            className="fixed inset-y-20 left-0 w-10 sm:w-14 z-20 cursor-w-resize opacity-0 hover:opacity-100 flex items-center justify-start pl-2 transition-opacity"
          >
            <div className="p-1.5 rounded-full bg-stone-900/60 text-stone-200">
              <ChevronLeft className="w-4 h-4" />
            </div>
          </div>
          <div
            data-testid="click-zone-next"
            onClick={(e) => {
              e.stopPropagation();
              nextPage();
            }}
            title="Next page"
            className="fixed inset-y-20 right-0 w-10 sm:w-14 z-20 cursor-e-resize opacity-0 hover:opacity-100 flex items-center justify-end pr-2 transition-opacity"
          >
            <div className="p-1.5 rounded-full bg-stone-900/60 text-stone-200">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </>
      )}

      {/* Bottom Floating Bar: Annotation Bar OR Autoscroll Controller */}
      {!performanceMode && (
        <div
          className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-40 transition-all duration-250 ${
            controlsVisible || scrolling || countdownRemaining !== null || annotationMode
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-3 pointer-events-none'
          }`}
        >
          {annotationMode ? (
            <AnnotationBar
              tool={annotTool}
              color={annotColor}
              strokeWidth={annotWidth}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onSelectTool={setAnnotTool}
              onSelectColor={setAnnotColor}
              onSelectWidth={setAnnotWidth}
              onUndo={handleUndoAnnotation}
              onRedo={handleRedoAnnotation}
              onClearPage={handleClearPageAnnotations}
              onClose={() => setAnnotationMode(false)}
            />
          ) : (
            <AutoScrollBar
              settings={autoScroll}
              running={scrolling}
              countdownRemaining={countdownRemaining}
              currentMeasure={currentMeasure}
              markers={timingMarkers}
              bpm={metronome.settings.bpm}
              timeSignature={metronome.settings.timeSignature}
              onStartPause={startOrPauseAutoscroll}
              onStop={stopAutoscroll}
              onResetPosition={resetPosition}
              onChange={updateAutoScroll}
              onAddMarkerAtReadingLine={() => handleAddTimingMarker(getCurrentPosition())}
              onOpenCalibrationDrawer={() => {
                setDrawerTab('timing');
                setDrawerOpen(true);
              }}
            />
          )}
        </div>
      )}

      {/* Shortcut reference modal */}
      {showShortcuts && (
        <ShortcutModal shortcuts={settings.shortcuts} onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}
