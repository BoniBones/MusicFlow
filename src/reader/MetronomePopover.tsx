import { useEffect, useState } from 'react';
import { Volume2, VolumeX, Play, Square, Hand, Sparkles, X } from 'lucide-react';
import { useMetronome } from '../audio/MetronomeContext';
import {
  clampBpm,
  effectiveSubdivision,
   MAX_BPM,
  meterInfo,
  MIN_BPM,
  TEMPO_PRESETS,
  tempoName,
  TIME_SIGNATURES,
} from '../audio/meter';
import type { CompoundFeel, MetronomeSettings, MetronomeSound, Subdivision } from '../types';

export interface MetronomePopoverProps {
  onClose?: () => void;
  onPersistScoreMetronome?: (changes: Partial<MetronomeSettings>) => void;
}

const SOUND_LABELS: { id: MetronomeSound; label: string }[] = [
  { id: 'click', label: 'Studio Click' },
  { id: 'wood', label: 'Woodblock' },
  { id: 'beep', label: 'Harmonic Beep' },
  { id: 'digital', label: 'Quartz Digital' },
];

export function MetronomePopover({ onClose, onPersistScoreMetronome }: MetronomePopoverProps) {
  const { settings, running, toggle, update, tap, preview, subscribeTick } = useMetronome();
  const [activeBeat, setActiveBeat] = useState<{ beat: number; sub: number; countIn: boolean } | null>(null);
  const info = meterInfo(settings.timeSignature, settings.compoundFeel);
  const currentSub = effectiveSubdivision(settings.timeSignature, settings.compoundFeel, settings.subdivision);

  useEffect(() => {
    if (!running) {
      setActiveBeat(null);
      return;
    }
    return subscribeTick((t) => {
      setActiveBeat({ beat: t.beat, sub: t.sub, countIn: t.countIn });
    });
  }, [running, subscribeTick]);

  const apply = (changes: Partial<MetronomeSettings>) => {
    update(changes);
    onPersistScoreMetronome?.(changes);
  };

  return (
    <div
      data-testid="metronome-panel"
      className="w-80 sm:w-96 rounded-2xl bg-stone-900/95 text-stone-100 border border-stone-700/80 shadow-2xl backdrop-blur-md p-4 select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header + Visual Beat Indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Metronome</span>
          {activeBeat?.countIn && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Count-in
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close metronome panel"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Beat Lamps */}
      <div
        data-testid="metronome-beat-lamps"
        className="flex items-center justify-center gap-2 py-2.5 px-3 mb-3 rounded-xl bg-stone-950/80 border border-stone-800"
      >
        {Array.from({ length: info.beatsPerBar }, (_, b) => {
          const isActive = running && activeBeat?.beat === b;
          const isAccent = b === 0 && settings.accentFirst;
          const isGroup = info.compound && settings.compoundFeel === 'eighth' && b > 0 && b % 3 === 0;
          return (
            <div key={b} className="flex flex-col items-center gap-1">
              <div
                className={`w-4 h-4 rounded-full transition-all duration-75 ${
                  isActive
                    ? isAccent
                      ? 'bg-amber-400 scale-125 shadow-[0_0_12px_rgba(251,191,36,0.9)]'
                      : 'bg-emerald-400 scale-115 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                    : isAccent
                      ? 'bg-amber-500/30 border border-amber-400/50'
                      : isGroup
                        ? 'bg-stone-700 border border-stone-500'
                        : 'bg-stone-800 border border-stone-700'
                }`}
              />
              <span className="text-[10px] font-mono text-stone-400">{b + 1}</span>
            </div>
          );
        })}
      </div>

      {/* BPM readout and controls */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span data-testid="metronome-bpm-value" className="text-3xl font-bold font-mono tracking-tight text-white">
              {settings.bpm}
            </span>
            <span className="text-xs text-stone-400 uppercase tracking-wider">BPM</span>
            <span className="text-xs font-serif italic text-amber-300/90">{tempoName(settings.bpm)}</span>
          </div>
          <p className="text-[11px] text-stone-400">Beat = {info.beatUnitLabel}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="metronome-tap-btn"
            onClick={() => {
              const next = tap();
              if (next !== null) onPersistScoreMetronome?.({ bpm: next });
            }}
            className="px-2.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-medium text-stone-200 flex items-center gap-1 border border-stone-700"
            title="Tap repeatedly to set tempo (Shortcut: T)"
          >
            <Hand className="w-3.5 h-3.5 text-amber-400" />
            Tap
          </button>
          <button
            type="button"
            data-testid="metronome-toggle-btn"
            onClick={() => void toggle()}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              running
                ? 'bg-rose-500 hover:bg-rose-400 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-stone-950'
            }`}
          >
            {running ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {running ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Slider & fine step buttons */}
      <div className="flex items-center gap-1.5 mb-3">
        <button
          type="button"
          onClick={() => apply({ bpm: clampBpm(settings.bpm - 5) })}
          className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-mono"
        >
          -5
        </button>
        <button
          type="button"
          data-testid="metronome-bpm-dec"
          onClick={() => apply({ bpm: clampBpm(settings.bpm - 1) })}
          className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-mono"
        >
          -1
        </button>
        <input
          type="range"
          aria-label="Tempo BPM"
          data-testid="metronome-bpm-slider"
          min={MIN_BPM}
          max={MAX_BPM}
          value={settings.bpm}
          onChange={(e) => apply({ bpm: clampBpm(Number(e.target.value)) })}
          className="flex-1 accent-amber-500 cursor-pointer"
        />
        <button
          type="button"
          data-testid="metronome-bpm-inc"
          onClick={() => apply({ bpm: clampBpm(settings.bpm + 1) })}
          className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-mono"
        >
          +1
        </button>
        <button
          type="button"
          onClick={() => apply({ bpm: clampBpm(settings.bpm + 5) })}
          className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-mono"
        >
          +5
        </button>
      </div>

      {/* Tempo Presets */}
      <div className="grid grid-cols-6 gap-1 mb-3">
        {TEMPO_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => apply({ bpm: p.bpm })}
            className={`py-1 px-1 rounded-lg text-[10px] font-medium border transition-colors ${
              settings.bpm === p.bpm
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-stone-800/70 border-stone-700/70 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <div>{p.name}</div>
            <div className="font-mono text-[9px] text-stone-400">{p.bpm}</div>
          </button>
        ))}
      </div>

      {/* Time Signature */}
      <div className="mb-3">
        <div className="text-[11px] font-medium text-stone-400 mb-1">Time Signature</div>
        <div className="grid grid-cols-5 sm:grid-cols-9 gap-1">
          {TIME_SIGNATURES.map((sig) => (
            <button
              key={sig}
              type="button"
              data-testid={`time-sig-${sig}`}
              onClick={() => apply({ timeSignature: sig })}
              className={`py-1 rounded-lg text-xs font-mono border transition-colors ${
                settings.timeSignature === sig
                  ? 'bg-amber-500 text-stone-950 font-bold border-amber-400'
                  : 'bg-stone-800/80 border-stone-700 text-stone-300 hover:bg-stone-700'
              }`}
            >
              {sig}
            </button>
          ))}
        </div>
      </div>

      {/* Compound feel selector when 6/8, 9/8, 12/8 */}
      {info.compound && (
        <div className="mb-3 flex items-center justify-between gap-2 bg-stone-950/60 p-2 rounded-xl border border-stone-800">
          <span className="text-[11px] text-stone-300">Compound grouping</span>
          <div className="flex rounded-lg overflow-hidden border border-stone-700">
            {(['dotted', 'eighth'] as CompoundFeel[]).map((feel) => (
              <button
                key={feel}
                type="button"
                onClick={() => apply({ compoundFeel: feel })}
                className={`px-2 py-1 text-[11px] ${
                  settings.compoundFeel === feel ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-stone-800 text-stone-300'
                }`}
              >
                {feel === 'dotted' ? `Dotted (${info.numerator / 3} beats)` : `Eighths (${info.numerator})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subdivisions, Accent & Count-in */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-stone-950/60 p-2 rounded-xl border border-stone-800">
          <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">Subdivision</div>
          <div className="flex gap-1">
            {info.allowedSubdivisions.map((sub: Subdivision) => (
              <button
                key={sub}
                type="button"
                onClick={() => apply({ subdivision: sub })}
                className={`flex-1 py-1 rounded text-xs font-mono border ${
                  currentSub === sub
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-semibold'
                    : 'bg-stone-800 border-stone-700 text-stone-300'
                }`}
              >
                ×{sub}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-stone-950/60 p-2 rounded-xl border border-stone-800">
          <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">Count-in</div>
          <div className="flex gap-1">
            {[0, 1, 2].map((bars) => (
              <button
                key={bars}
                type="button"
                onClick={() => apply({ countInBars: bars })}
                className={`flex-1 py-1 rounded text-xs border ${
                  settings.countInBars === bars
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-semibold'
                    : 'bg-stone-800 border-stone-700 text-stone-300'
                }`}
              >
                {bars === 0 ? 'Off' : `${bars}b`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sound & Accent toggle */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-stone-400">Timbre</span>
          <label className="flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.accentFirst}
              onChange={(e) => apply({ accentFirst: e.target.checked })}
              className="accent-amber-500 rounded"
            />
            <Sparkles className="w-3 h-3 text-amber-400" />
            Accent beat 1
          </label>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {SOUND_LABELS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                apply({ sound: s.id });
                if (!running) void preview(s.id);
              }}
              className={`py-1.5 px-2.5 rounded-lg text-xs text-left border transition-colors ${
                settings.sound === s.id
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-medium'
                  : 'bg-stone-800/80 border-stone-700 text-stone-300 hover:bg-stone-800'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Volume & Mute */}
      <div className="flex items-center gap-2 pt-2 border-t border-stone-800">
        <button
          type="button"
          data-testid="metronome-mute-btn"
          onClick={() => apply({ muted: !settings.muted })}
          className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200"
          aria-label={settings.muted ? 'Unmute metronome' : 'Mute metronome'}
        >
          {settings.muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
        </button>
        <input
          type="range"
          aria-label="Metronome volume"
          min={0}
          max={1}
          step={0.02}
          value={settings.muted ? 0 : settings.volume}
          onChange={(e) => apply({ volume: Number(e.target.value), muted: false })}
          className="flex-1 accent-amber-500 cursor-pointer"
        />
        <span className="text-xs font-mono text-stone-400 w-9 text-right">
          {settings.muted ? 'Mute' : `${Math.round(settings.volume * 100)}%`}
        </span>
      </div>
    </div>
  );
}
