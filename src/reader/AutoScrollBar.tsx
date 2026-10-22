import { Play, Pause, Square, RotateCcw, Plus, Minus, SlidersHorizontal, Timer, Gauge, MapPin } from 'lucide-react';
import { useState } from 'react';
import type { AutoScrollSettings, CountdownMode, TimingMarker } from '../types';
import {
  formatSecondsPerPage,
  secondsPerPageToSlider,
  sliderToSecondsPerPage,
  SPEED_PRESETS,
  stepSpeed,
  validateMarkers,
} from './timing';

export interface AutoScrollBarProps {
  settings: AutoScrollSettings;
  running: boolean;
  countdownRemaining: number | null;
  currentMeasure: number | null;
  markers: TimingMarker[];
  bpm: number;
  timeSignature: string;
  onStartPause: () => void;
  onStop: () => void;
  onResetPosition: () => void;
  onChange: (changes: Partial<AutoScrollSettings>) => void;
  onAddMarkerAtReadingLine: () => void;
  onOpenCalibrationDrawer: () => void;
}

const COUNTDOWN_OPTIONS: { value: CountdownMode; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 3, label: '3s' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 'bar', label: '1 Bar' },
];

export function AutoScrollBar({
  settings,
  running,
  countdownRemaining,
  currentMeasure,
  markers,
  bpm,
  timeSignature,
  onStartPause,
  onStop,
  onResetPosition,
  onChange,
  onAddMarkerAtReadingLine,
  onOpenCalibrationDrawer,
}: AutoScrollBarProps) {
  const [expanded, setExpanded] = useState(false);
  const sliderVal = secondsPerPageToSlider(settings.secondsPerPage);
  const markerWarning = settings.mode === 'timed' ? validateMarkers(markers) : null;

  return (
    <div
      data-testid="autoscroll-controller"
      className="flex flex-col items-center gap-2 max-w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Expanded settings card */}
      {expanded && (
        <div
          data-testid="autoscroll-expanded"
          className="w-80 sm:w-[26rem] rounded-2xl bg-stone-900/95 text-stone-100 border border-stone-700/80 shadow-2xl backdrop-blur-md p-3.5 text-xs"
        >
          {/* Mode switch */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              Autoscroll Engine
            </span>
            <div className="flex rounded-lg overflow-hidden border border-stone-700">
              <button
                type="button"
                data-testid="autoscroll-mode-continuous"
                onClick={() => onChange({ mode: 'continuous' })}
                className={`px-2.5 py-1 text-[11px] font-medium ${
                  settings.mode === 'continuous' ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-stone-800 text-stone-300'
                }`}
              >
                Continuous
              </button>
              <button
                type="button"
                data-testid="autoscroll-mode-timed"
                onClick={() => onChange({ mode: 'timed' })}
                className={`px-2.5 py-1 text-[11px] font-medium ${
                  settings.mode === 'timed' ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-stone-800 text-stone-300'
                }`}
              >
                Musical Timing (BPM)
              </button>
            </div>
          </div>

          {settings.mode === 'continuous' ? (
            <>
              {/* Speed presets */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1">
                  <span>Speed Presets</span>
                  <span data-testid="autoscroll-speed-readout" className="font-mono text-stone-200">
                    {formatSecondsPerPage(settings.secondsPerPage)}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {SPEED_PRESETS.map((p) => {
                    const active = Math.abs(settings.secondsPerPage - p.secondsPerPage) < 3;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => onChange({ secondsPerPage: p.secondsPerPage })}
                        className={`py-1.5 px-1 rounded-lg text-[10px] font-medium border transition-colors ${
                          active
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                            : 'bg-stone-800/80 border-stone-700 text-stone-300 hover:bg-stone-800'
                        }`}
                      >
                        <div>{p.label}</div>
                        <div className="font-mono text-[9px] text-stone-400">{p.secondsPerPage}s</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="mb-3 p-2.5 rounded-xl bg-stone-950/70 border border-stone-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-300 font-medium">
                  Calibrated to <strong className="text-amber-300 font-mono">{bpm} BPM</strong> ({timeSignature})
                </span>
                <span className="font-mono text-[11px] text-stone-400">
                  {markers.length} marker{markers.length === 1 ? '' : 's'}
                </span>
              </div>
              {markerWarning ? (
                <p className="text-[11px] text-amber-300/90 leading-relaxed">{markerWarning}</p>
              ) : (
                <p className="text-[11px] text-emerald-300/90">
                  Ready — advances between your bar reference points at {bpm} BPM.
                  {currentMeasure !== null && ` Current: Bar ${currentMeasure.toFixed(1)}`}
                </p>
              )}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  data-testid="add-timing-marker-btn"
                  onClick={onAddMarkerAtReadingLine}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700 flex items-center justify-center gap-1 text-[11px] font-medium"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  Mark bar here
                </button>
                <button
                  type="button"
                  onClick={onOpenCalibrationDrawer}
                  className="py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-medium"
                >
                  Edit markers ({markers.length})
                </button>
              </div>
            </div>
          )}

          {/* Countdown */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800">
            <span className="text-[11px] text-stone-400 flex items-center gap-1">
              <Timer className="w-3.5 h-3.5 text-stone-400" />
              Countdown before start
            </span>
            <div className="flex gap-1">
              {COUNTDOWN_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  data-testid={`countdown-opt-${opt.value}`}
                  onClick={() => onChange({ countdown: opt.value })}
                  className={`px-2 py-1 rounded text-[11px] font-mono border ${
                    settings.countdown === opt.value
                      ? 'bg-amber-500 text-stone-950 font-semibold border-amber-400'
                      : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compact Floating Pill */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-stone-900/95 text-stone-100 border border-stone-700/80 shadow-xl backdrop-blur-md">
        <button
          type="button"
          data-testid="autoscroll-toggle-btn"
          onClick={onStartPause}
          aria-label={running || countdownRemaining !== null ? 'Pause autoscroll' : 'Start autoscroll'}
          title="Start / Pause autoscroll (Space)"
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            running || countdownRemaining !== null
              ? 'bg-amber-500 text-stone-950 hover:bg-amber-400'
              : 'bg-stone-800 text-stone-100 hover:bg-stone-700 border border-stone-700'
          }`}
        >
          {running || countdownRemaining !== null ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>{countdownRemaining !== null ? `In ${Math.ceil(countdownRemaining)}s` : 'Pause'}</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Scroll</span>
            </>
          )}
        </button>

        {running && (
          <button
            type="button"
            data-testid="autoscroll-stop-btn"
            onClick={onStop}
            title="Stop autoscroll"
            aria-label="Stop autoscroll"
            className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          data-testid="autoscroll-reset-btn"
          onClick={onResetPosition}
          title="Reset position to start (Home)"
          aria-label="Reset position to start"
          className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Speed controls */}
        {settings.mode === 'continuous' ? (
          <div className="flex items-center gap-1 px-1">
            <button
              type="button"
              data-testid="autoscroll-speed-down"
              onClick={() => onChange({ secondsPerPage: stepSpeed(settings.secondsPerPage, -1) })}
              title="Decrease scroll speed (-)"
              aria-label="Decrease scroll speed"
              className="p-1 rounded-lg hover:bg-stone-800 text-stone-300"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              aria-label="Autoscroll speed"
              data-testid="autoscroll-speed-slider"
              min={0}
              max={100}
              step={1}
              value={Math.round(sliderVal)}
              onChange={(e) => onChange({ secondsPerPage: Math.round(sliderToSecondsPerPage(Number(e.target.value))) })}
              className="w-20 sm:w-28 accent-amber-500 cursor-pointer"
            />
            <button
              type="button"
              data-testid="autoscroll-speed-up"
              onClick={() => onChange({ secondsPerPage: stepSpeed(settings.secondsPerPage, 1) })}
              title="Increase scroll speed (+)"
              aria-label="Increase scroll speed"
              className="p-1 rounded-lg hover:bg-stone-800 text-stone-300"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <span
              data-testid="autoscroll-compact-speed"
              className="text-[11px] font-mono text-stone-300 min-w-[4.5rem] text-right hidden xs:inline"
            >
              {formatSecondsPerPage(settings.secondsPerPage)}
            </span>
          </div>
        ) : (
          <div className="px-2 py-0.5 text-xs font-mono text-amber-300 flex items-center gap-1.5">
            <span>{bpm} BPM</span>
            {currentMeasure !== null && <span className="text-stone-400">· m.{Math.max(1, Math.round(currentMeasure))}</span>}
          </div>
        )}

        <button
          type="button"
          data-testid="autoscroll-expand-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-label="Autoscroll options"
          title="Speed presets, countdown & musical timing calibration"
          className={`p-1.5 rounded-xl border transition-colors ${
            expanded
              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
              : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-300'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
