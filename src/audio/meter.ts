import type { CompoundFeel, Subdivision } from '../types';

export type TickLevel = 'accent' | 'group' | 'beat' | 'sub';

export interface MeterInfo {
  numerator: number;
  denominator: number;
  compound: boolean;
  /** Number of counted beats per bar (what BPM refers to). */
  beatsPerBar: number;
  /** Subdivisions allowed for this meter/feel. */
  allowedSubdivisions: Subdivision[];
  /** Human description of what one BPM beat is. */
  beatUnitLabel: string;
}

export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '2/2', '3/8', '6/8', '9/8', '12/8'] as const;

export function parseTimeSignature(sig: string): { numerator: number; denominator: number } {
  const m = sig.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return { numerator: 4, denominator: 4 };
  const numerator = Math.min(16, Math.max(1, parseInt(m[1], 10)));
  const denominator = [1, 2, 4, 8, 16].includes(parseInt(m[2], 10)) ? parseInt(m[2], 10) : 4;
  return { numerator, denominator };
}

const NOTE_NAMES: Record<number, string> = { 1: 'whole note', 2: 'half note', 4: 'quarter note', 8: 'eighth note', 16: 'sixteenth note' };
const DOTTED_NAMES: Record<number, string> = { 4: 'dotted half note', 8: 'dotted quarter note', 16: 'dotted eighth note' };

export function meterInfo(sig: string, feel: CompoundFeel): MeterInfo {
  const { numerator, denominator } = parseTimeSignature(sig);
  // 6/8, 9/8, 12/8 (and x/16 equivalents) are compound: beats group in threes.
  const compound = denominator >= 8 && numerator % 3 === 0 && numerator > 3;
  if (compound && feel === 'dotted') {
    return {
      numerator,
      denominator,
      compound,
      beatsPerBar: numerator / 3,
      allowedSubdivisions: [1, 3],
      beatUnitLabel: DOTTED_NAMES[denominator] ?? 'dotted beat',
    };
  }
  return {
    numerator,
    denominator,
    compound,
    beatsPerBar: numerator,
    allowedSubdivisions: compound ? [1, 2] : [1, 2, 3, 4],
    beatUnitLabel: NOTE_NAMES[denominator] ?? 'beat',
  };
}

export interface Tick {
  beat: number; // beat index within the bar
  sub: number; // subdivision index within the beat
  level: TickLevel;
}

/** Builds the sequence of ticks for one bar. All ticks are evenly spaced (one per subdivision). */
export function buildBarPattern(sig: string, feel: CompoundFeel, subdivision: Subdivision, accentFirst: boolean): Tick[] {
  const info = meterInfo(sig, feel);
  const sub = info.allowedSubdivisions.includes(subdivision) ? subdivision : 1;
  const ticks: Tick[] = [];
  for (let b = 0; b < info.beatsPerBar; b++) {
    for (let s = 0; s < sub; s++) {
      let level: TickLevel;
      if (s > 0) level = 'sub';
      else if (b === 0) level = accentFirst ? 'accent' : 'beat';
      else if (info.compound && feel === 'eighth' && b % 3 === 0) level = 'group';
      else if (info.compound && feel === 'eighth') level = 'sub';
      else level = 'beat';
      ticks.push({ beat: b, sub: s, level });
    }
  }
  return ticks;
}

export function effectiveSubdivision(sig: string, feel: CompoundFeel, subdivision: Subdivision): Subdivision {
  const info = meterInfo(sig, feel);
  return info.allowedSubdivisions.includes(subdivision) ? subdivision : 1;
}

export function secondsPerBar(bpm: number, sig: string, feel: CompoundFeel): number {
  return (meterInfo(sig, feel).beatsPerBar * 60) / bpm;
}

export const MIN_BPM = 20;
export const MAX_BPM = 300;

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 80;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

export const TEMPO_PRESETS: { name: string; bpm: number }[] = [
  { name: 'Largo', bpm: 50 },
  { name: 'Adagio', bpm: 70 },
  { name: 'Andante', bpm: 90 },
  { name: 'Moderato', bpm: 110 },
  { name: 'Allegro', bpm: 132 },
  { name: 'Presto', bpm: 180 },
];

export function tempoName(bpm: number): string {
  if (bpm < 40) return 'Grave';
  if (bpm < 60) return 'Largo';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 156) return 'Allegro';
  if (bpm < 176) return 'Vivace';
  if (bpm < 200) return 'Presto';
  return 'Prestissimo';
}

/** Tap-tempo estimator: averages recent tap intervals, resets after a pause. */
export class TapTempo {
  private taps: number[] = [];
  constructor(private resetAfterMs = 2000, private maxTaps = 8) {}

  /** Registers a tap (timestamp in ms). Returns the BPM estimate once at least two taps exist. */
  tap(now: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && now - last > this.resetAfterMs) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > this.maxTaps) this.taps.shift();
    if (this.taps.length < 2) return null;
    const intervals: number[] = [];
    for (let i = 1; i < this.taps.length; i++) intervals.push(this.taps[i] - this.taps[i - 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return clampBpm(60000 / avg);
  }

  reset(): void {
    this.taps = [];
  }

  get count(): number {
    return this.taps.length;
  }
}
