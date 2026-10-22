// Core domain types for MusicFlow.

export type ScoreKind = 'pdf' | 'images';

export type Difficulty = 0 | 1 | 2 | 3 | 4 | 5; // 0 = unspecified

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  0: 'Unrated',
  1: 'Beginner',
  2: 'Elementary',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
};

/** Library metadata for a piece. File bytes live in the separate `files` table. */
export interface Score {
  id: string;
  title: string;
  composer: string;
  genre: string;
  difficulty: Difficulty;
  tags: string[];
  collectionIds: string[];
  favorite: boolean;
  notes: string;
  kind: ScoreKind;
  pageCount: number;
  fileName: string;
  fileSize: number;
  thumbnail?: Blob;
  createdAt: number;
  lastOpenedAt?: number;
}

/** Original file bytes. PDFs have a single entry (index 0); image scores one per page. */
export interface ScoreFile {
  id: string; // `${scoreId}:${index}`
  scoreId: string;
  index: number;
  blob: Blob;
  mimeType: string;
  name: string;
}

export interface Collection {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
}

/** A zoom-independent location within a score: page index + vertical fraction (0–1). */
export interface ScorePosition {
  page: number;
  y: number;
}

export type ViewMode = 'continuous' | 'single' | 'spread';
export type FitMode = 'width' | 'page' | 'custom';

export type CompoundFeel = 'dotted' | 'eighth';
export type MetronomeSound = 'click' | 'wood' | 'beep' | 'digital';
export type Subdivision = 1 | 2 | 3 | 4;

export interface MetronomeSettings {
  bpm: number;
  timeSignature: string; // e.g. '4/4', '6/8'
  compoundFeel: CompoundFeel;
  subdivision: Subdivision;
  accentFirst: boolean;
  sound: MetronomeSound;
  volume: number; // 0–1
  muted: boolean;
  countInBars: number; // 0 = none
}

export interface TimingMarker {
  id: string;
  position: ScorePosition;
  measure: number;
}

export type CountdownMode = 0 | 3 | 5 | 10 | 'bar';

export interface AutoScrollSettings {
  /** Seconds needed to scroll through one page height. Zoom-independent. */
  secondsPerPage: number;
  countdown: CountdownMode;
  mode: 'continuous' | 'timed';
}

export interface ScorePrefs {
  scoreId: string;
  viewMode?: ViewMode;
  fitMode?: FitMode;
  zoom?: number;
  lastPosition?: ScorePosition;
  autoScroll?: Partial<AutoScrollSettings>;
  metronome?: Partial<MetronomeSettings>;
  timingMarkers?: TimingMarker[];
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  scoreId: string;
  label: string;
  color: string;
  position: ScorePosition;
  createdAt: number;
}

export interface PracticeSection {
  id: string;
  scoreId: string;
  label: string;
  start: ScorePosition;
  end: ScorePosition;
  createdAt: number;
}

export type AnnotationTool = 'pen' | 'highlighter' | 'text' | 'eraser';

/** Points are normalised to the page: x,y in 0–1 of page width/height. */
export interface StrokeAnnotation {
  id: string;
  type: 'pen' | 'highlighter';
  color: string;
  /** Width as a fraction of page width (zoom independent). */
  width: number;
  points: number[]; // flat [x0,y0,x1,y1,...]
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  color: string;
  x: number;
  y: number;
  /** Font size as a fraction of page width. */
  size: number;
  text: string;
}

export type Annotation = StrokeAnnotation | TextAnnotation;

export interface PageAnnotations {
  id: string; // `${scoreId}:${page}`
  scoreId: string;
  page: number;
  items: Annotation[];
}

export type ThemePreference = 'light' | 'dark' | 'system';
export type PaperTone = 'white' | 'warm' | 'dim';

export type ShortcutAction =
  | 'toggleAutoscroll'
  | 'toggleMetronome'
  | 'toggleFullscreen'
  | 'nextPage'
  | 'prevPage'
  | 'speedUp'
  | 'speedDown'
  | 'escape'
  | 'resetScroll'
  | 'togglePerformance'
  | 'zoomIn'
  | 'zoomOut'
  | 'sectionStart'
  | 'addBookmark'
  | 'showShortcuts'
  | 'tapTempo';

export interface AppSettings {
  theme: ThemePreference;
  paperTone: PaperTone;
  defaultViewMode: ViewMode;
  defaultFitMode: FitMode;
  controlsHideDelayMs: number;
  clickZones: boolean;
  keepAwake: boolean;
  libraryLayout: 'grid' | 'list';
  librarySort: LibrarySort;
  autoScroll: AutoScrollSettings;
  metronome: MetronomeSettings;
  shortcuts: Record<ShortcutAction, string[]>;
  onboardingDismissed: boolean;
}

export type LibrarySort = 'title' | 'composer' | 'createdAt' | 'lastOpenedAt' | 'difficulty';
