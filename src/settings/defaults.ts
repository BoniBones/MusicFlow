import type { AppSettings, MetronomeSettings, ShortcutAction } from '../types';

export const DEFAULT_METRONOME: MetronomeSettings = {
  bpm: 80,
  timeSignature: '4/4',
  compoundFeel: 'dotted',
  subdivision: 1,
  accentFirst: true,
  sound: 'click',
  volume: 0.8,
  muted: false,
  countInBars: 1,
};

/** Key values follow KeyboardEvent.key (with 'Space' for ' '). */
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string[]> = {
  toggleAutoscroll: ['Space'],
  toggleMetronome: ['m'],
  toggleFullscreen: ['f'],
  nextPage: ['ArrowRight', 'PageDown'],
  prevPage: ['ArrowLeft', 'PageUp'],
  speedUp: ['+', '='],
  speedDown: ['-', '_'],
  escape: ['Escape'],
  resetScroll: ['Home'],
  togglePerformance: ['p'],
  zoomIn: ['Ctrl+='],
  zoomOut: ['Ctrl+-'],
  sectionStart: ['r'],
  addBookmark: ['b'],
  showShortcuts: ['?'],
  tapTempo: ['t'],
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggleAutoscroll: 'Start / pause autoscroll',
  toggleMetronome: 'Start / stop metronome',
  toggleFullscreen: 'Toggle fullscreen',
  nextPage: 'Next page',
  prevPage: 'Previous page',
  speedUp: 'Increase autoscroll speed',
  speedDown: 'Decrease autoscroll speed',
  escape: 'Exit fullscreen / close panels',
  resetScroll: 'Back to the beginning (reset position)',
  togglePerformance: 'Toggle performance mode',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  sectionStart: 'Jump to start of active practice section',
  addBookmark: 'Bookmark current position',
  showShortcuts: 'Show keyboard shortcuts',
  tapTempo: 'Tap tempo',
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  paperTone: 'white',
  defaultViewMode: 'continuous',
  defaultFitMode: 'width',
  controlsHideDelayMs: 2500,
  clickZones: true,
  keepAwake: true,
  libraryLayout: 'grid',
  librarySort: 'lastOpenedAt',
  autoScroll: { secondsPerPage: 60, countdown: 3, mode: 'continuous' },
  metronome: DEFAULT_METRONOME,
  shortcuts: DEFAULT_SHORTCUTS,
  onboardingDismissed: false,
};

/** Deep-ish merge so settings saved by older versions gain new defaults. */
export function mergeSettings(saved: Partial<AppSettings> | undefined): AppSettings {
  if (!saved) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    autoScroll: { ...DEFAULT_SETTINGS.autoScroll, ...saved.autoScroll },
    metronome: { ...DEFAULT_SETTINGS.metronome, ...saved.metronome },
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...saved.shortcuts },
  };
}
