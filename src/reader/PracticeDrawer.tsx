import { useState } from 'react';
import {
  Bookmark as BookmarkIcon,
  Repeat,
  MapPin,
  Plus,
  Trash2,
  X,
  Crosshair,
  CornerUpLeft,
  Play,
} from 'lucide-react';
import type { Bookmark, PracticeSection, ScorePosition, TimingMarker } from '../types';
import { BOOKMARK_COLORS, BOOKMARK_PRESETS } from '../services/practiceRepo';
import { validateMarkers } from './timing';

export type DrawerTab = 'bookmarks' | 'sections' | 'timing';

export interface PracticeDrawerProps {
  tab: DrawerTab;
  onChangeTab: (tab: DrawerTab) => void;
  bookmarks: Bookmark[];
  sections: PracticeSection[];
  activeSectionId: string | null;
  loopActiveSection: boolean;
  timingMarkers: TimingMarker[];
  currentPosition: ScorePosition;
  pickMode: 'marker' | 'bookmark' | 'sectionStart' | 'sectionEnd' | null;
  onSetPickMode: (mode: 'marker' | 'bookmark' | 'sectionStart' | 'sectionEnd' | null) => void;
  onJumpTo: (pos: ScorePosition) => void;
  onAddBookmark: (pos: ScorePosition, label: string, color: string) => void;
  onDeleteBookmark: (id: string) => void;
  onAddSection: (start: ScorePosition, end: ScorePosition, label: string) => void;
  onDeleteSection: (id: string) => void;
  onSelectActiveSection: (id: string | null) => void;
  onToggleLoopSection: (loop: boolean) => void;
  onAddTimingMarker: (pos: ScorePosition, measure: number) => void;
  onUpdateTimingMarker: (id: string, measure: number) => void;
  onDeleteTimingMarker: (id: string) => void;
  onClearTimingMarkers: () => void;
  onClose: () => void;
}

export function PracticeDrawer({
  tab,
  onChangeTab,
  bookmarks,
  sections,
  activeSectionId,
  loopActiveSection,
  timingMarkers,
  currentPosition,
  pickMode,
  onSetPickMode,
  onJumpTo,
  onAddBookmark,
  onDeleteBookmark,
  onAddSection,
  onDeleteSection,
  onSelectActiveSection,
  onToggleLoopSection,
  onAddTimingMarker,
  onUpdateTimingMarker,
  onDeleteTimingMarker,
  onClearTimingMarkers,
  onClose,
}: PracticeDrawerProps) {
  const [bmLabel, setBmLabel] = useState('Practise from here');
  const [bmColor, setBmColor] = useState(BOOKMARK_COLORS[0]);

  const [secLabel, setSecLabel] = useState('Difficult passage');
  const [draftStart, setDraftStart] = useState<ScorePosition | null>(null);
  const [draftEnd, setDraftEnd] = useState<ScorePosition | null>(null);

  const nextDefaultMeasure =
    timingMarkers.length === 0 ? 1 : Math.max(...timingMarkers.map((m) => m.measure)) + 4;
  const [markerMeasure, setMarkerMeasure] = useState<number>(nextDefaultMeasure);

  const formatPos = (p: ScorePosition) => `Page ${p.page + 1} · ${Math.round(p.y * 100)}%`;

  const handleCreateSection = () => {
    const start = draftStart ?? currentPosition;
    const end =
      draftEnd ?? {
        page: start.page,
        y: Math.min(1, start.y + 0.35),
      };
    onAddSection(start, end, secLabel);
    setDraftStart(null);
    setDraftEnd(null);
  };

  const timingWarning = validateMarkers(timingMarkers);

  return (
    <aside
      data-testid="practice-drawer"
      className="w-80 sm:w-96 max-h-[calc(100vh-5.5rem)] flex flex-col rounded-2xl bg-stone-900/95 text-stone-100 border border-stone-700/80 shadow-2xl backdrop-blur-md overflow-hidden select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header & Tabs */}
      <div className="p-3 border-b border-stone-800 flex items-center justify-between">
        <div className="flex gap-1 bg-stone-950/80 p-1 rounded-xl border border-stone-800">
          <button
            type="button"
            data-testid="drawer-tab-bookmarks"
            onClick={() => onChangeTab('bookmarks')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
              tab === 'bookmarks' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-300 hover:text-white'
            }`}
          >
            <BookmarkIcon className="w-3.5 h-3.5" />
            Bookmarks ({bookmarks.length})
          </button>
          <button
            type="button"
            data-testid="drawer-tab-sections"
            onClick={() => onChangeTab('sections')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
              tab === 'sections' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-300 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            Sections ({sections.length})
          </button>
          <button
            type="button"
            data-testid="drawer-tab-timing"
            onClick={() => onChangeTab('timing')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
              tab === 'timing' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-300 hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Bars ({timingMarkers.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close practice drawer"
          className="p-1 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3.5 overflow-y-auto space-y-3 text-xs flex-1">
        {tab === 'bookmarks' && (
          <>
            <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                New Bookmark
              </div>
              <input
                type="text"
                data-testid="bookmark-label-input"
                value={bmLabel}
                onChange={(e) => setBmLabel(e.target.value)}
                placeholder="Bookmark label…"
                className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 text-xs focus:outline-none focus:border-amber-400"
              />
              {/* Quick presets */}
              <div className="flex flex-wrap gap-1">
                {BOOKMARK_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBmLabel(preset)}
                    className={`px-2 py-0.5 rounded-md text-[10px] border ${
                      bmLabel === preset
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              {/* Colors + Add buttons */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5">
                  {BOOKMARK_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBmColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-4 h-4 rounded-full border ${
                        bmColor === c ? 'border-white scale-120' : 'border-transparent opacity-75'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSetPickMode(pickMode === 'bookmark' ? null : 'bookmark')}
                    title="Click directly on the score to place this bookmark"
                    className={`px-2 py-1.5 rounded-lg border text-[11px] flex items-center gap-1 ${
                      pickMode === 'bookmark'
                        ? 'bg-amber-500 text-stone-950 font-semibold border-amber-400'
                        : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    Pick on score
                  </button>
                  <button
                    type="button"
                    data-testid="add-bookmark-btn"
                    onClick={() => onAddBookmark(currentPosition, bmLabel, bmColor)}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-[11px] flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Save here
                  </button>
                </div>
              </div>
            </div>

            {/* Saved bookmarks list */}
            {bookmarks.length === 0 ? (
              <p className="text-stone-400 text-center py-6">
                No bookmarks yet. Save positions like “Difficult passage”, “Second movement” or “Coda” to jump back in one tap.
              </p>
            ) : (
              <div className="space-y-1.5" data-testid="bookmark-list">
                {bookmarks.map((b) => (
                  <div
                    key={b.id}
                    data-testid={`bookmark-item-${b.label}`}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-800/70 hover:bg-stone-800 border border-stone-700/70"
                  >
                    <button
                      type="button"
                      onClick={() => onJumpTo(b.position)}
                      className="flex items-center gap-2 text-left flex-1 min-w-0"
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      <div className="truncate">
                        <div className="font-medium text-stone-100 truncate">{b.label}</div>
                        <div className="text-[10px] font-mono text-stone-400">{formatPos(b.position)}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBookmark(b.id)}
                      aria-label={`Delete bookmark ${b.label}`}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-rose-400 hover:bg-stone-900"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'sections' && (
          <>
            <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                Define Practice Passage (A → B)
              </div>
              <input
                type="text"
                data-testid="section-label-input"
                value={secLabel}
                onChange={(e) => setSecLabel(e.target.value)}
                placeholder="Passage name…"
                className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-100 text-xs focus:outline-none focus:border-amber-400"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="set-section-a-btn"
                  onClick={() => setDraftStart(currentPosition)}
                  className="py-1.5 px-2 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-left"
                >
                  <div className="text-[10px] text-amber-400 font-semibold">Set Start (A) Here</div>
                  <div className="text-[10px] font-mono text-stone-300">
                    {draftStart ? formatPos(draftStart) : formatPos(currentPosition)}
                  </div>
                </button>
                <button
                  type="button"
                  data-testid="set-section-b-btn"
                  onClick={() => setDraftEnd(currentPosition)}
                  className="py-1.5 px-2 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-left"
                >
                  <div className="text-[10px] text-emerald-400 font-semibold">Set End (B) Here</div>
                  <div className="text-[10px] font-mono text-stone-300">
                    {draftEnd ? formatPos(draftEnd) : 'Auto (+35% page)'}
                  </div>
                </button>
              </div>
              <button
                type="button"
                data-testid="save-section-btn"
                onClick={handleCreateSection}
                className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Save Practice Passage
              </button>
            </div>

            {activeSectionId && (
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loopActiveSection}
                    onChange={(e) => onToggleLoopSection(e.target.checked)}
                    className="accent-amber-500"
                  />
                  Loop passage on autoscroll
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const sec = sections.find((s) => s.id === activeSectionId);
                    if (sec) onJumpTo(sec.start);
                  }}
                  className="px-2 py-1 rounded-lg bg-amber-500 text-stone-950 font-semibold text-[11px] flex items-center gap-1"
                >
                  <CornerUpLeft className="w-3 h-3" />
                  To Start (R)
                </button>
              </div>
            )}

            {sections.length === 0 ? (
              <p className="text-stone-400 text-center py-6">
                No practice passages saved yet. Set a start (A) and end (B) point to drill difficult measures and loop them automatically.
              </p>
            ) : (
              <div className="space-y-1.5" data-testid="section-list">
                {sections.map((sec) => {
                  const active = sec.id === activeSectionId;
                  return (
                    <div
                      key={sec.id}
                      className={`p-2.5 rounded-xl border transition-colors ${
                        active
                          ? 'bg-amber-500/15 border-amber-400'
                          : 'bg-stone-800/70 border-stone-700/70 hover:bg-stone-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="font-semibold text-stone-100 truncate">{sec.label}</div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectActiveSection(active ? null : sec.id);
                              if (!active) onJumpTo(sec.start);
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                              active ? 'bg-amber-500 text-stone-950' : 'bg-stone-700 text-stone-200 hover:bg-stone-600'
                            }`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            {active ? 'Practising' : 'Practise'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSection(sec.id)}
                            aria-label={`Delete section ${sec.label}`}
                            className="p-1 rounded text-stone-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-stone-400 flex items-center justify-between">
                        <span>A: {formatPos(sec.start)}</span>
                        <span>B: {formatPos(sec.end)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'timing' && (
          <>
            <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                Musical Timing Calibration
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed">
                Mark at least two reference positions in the score with their bar (measure) numbers. In <strong>Musical Timing</strong> mode, autoscroll progresses between these points at your metronome BPM.
              </p>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-stone-300">Bar #</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={markerMeasure}
                  onChange={(e) => setMarkerMeasure(Math.max(1, Number(e.target.value)))}
                  className="w-20 px-2 py-1 rounded-lg bg-stone-900 border border-stone-700 font-mono text-xs text-stone-100"
                />
                <button
                  type="button"
                  onClick={() => onSetPickMode(pickMode === 'marker' ? null : 'marker')}
                  className={`px-2 py-1.5 rounded-lg border text-[11px] flex items-center gap-1 ${
                    pickMode === 'marker'
                      ? 'bg-amber-500 text-stone-950 font-semibold border-amber-400'
                      : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  Pick on score
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddTimingMarker(currentPosition, markerMeasure);
                    setMarkerMeasure(markerMeasure + 4);
                  }}
                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-[11px] flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add here
                </button>
              </div>
              {timingWarning && <p className="text-[11px] text-amber-300/90">{timingWarning}</p>}
            </div>

            {timingMarkers.length > 0 && (
              <div className="space-y-1.5">
                {timingMarkers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-800/70 border border-stone-700/70"
                  >
                    <button
                      type="button"
                      onClick={() => onJumpTo(m.position)}
                      className="text-left flex-1"
                    >
                      <div className="font-mono text-xs text-amber-300 font-semibold">Bar {m.measure}</div>
                      <div className="text-[10px] font-mono text-stone-400">{formatPos(m.position)}</div>
                    </button>
                    <input
                      type="number"
                      min={1}
                      aria-label={`Bar number for marker`}
                      value={m.measure}
                      onChange={(e) => onUpdateTimingMarker(m.id, Math.max(1, Number(e.target.value)))}
                      className="w-16 px-2 py-1 rounded bg-stone-900 border border-stone-700 font-mono text-xs text-stone-100"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteTimingMarker(m.id)}
                      className="p-1 rounded text-stone-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={onClearTimingMarkers}
                  className="w-full py-1.5 rounded-lg bg-stone-800 hover:bg-rose-950/60 text-stone-400 hover:text-rose-300 text-[11px]"
                >
                  Clear all timing markers
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
