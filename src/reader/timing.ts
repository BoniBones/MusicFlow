import type { ScorePosition, TimingMarker } from '../types';

/**
 * Musical-timing autoscroll ("timed mode").
 *
 * Ordinary PDFs carry no machine-readable timing, so the user calibrates the
 * score manually: they drop reference markers on the score (e.g. at the start
 * of each system) and type the bar number at each marker. Between markers the
 * reader moves linearly, at the speed implied by the metronome tempo:
 *
 *    seconds per bar = beatsPerBar × 60 / BPM
 */

export interface TimingPoint {
  measure: number;
  offset: number; // content offset in CSS px for the current layout
}

/** Orders markers by position in the score and drops any that would make time run backwards. */
export function normaliseMarkers(markers: TimingMarker[]): TimingMarker[] {
  const sorted = [...markers].sort((a, b) => a.position.page - b.position.page || a.position.y - b.position.y);
  const out: TimingMarker[] = [];
  for (const m of sorted) {
    const prev = out[out.length - 1];
    if (prev && m.measure <= prev.measure) continue;
    out.push(m);
  }
  return out;
}

export function validateMarkers(markers: TimingMarker[]): string | null {
  if (markers.length < 2) return 'Add at least two timing markers (for example at bar 1 and at the start of a later system).';
  const sorted = [...markers].sort((a, b) => a.position.page - b.position.page || a.position.y - b.position.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].measure <= sorted[i - 1].measure) {
      return `Bar numbers must increase down the score (bar ${sorted[i].measure} comes after bar ${sorted[i - 1].measure}).`;
    }
  }
  return null;
}

export function toTimingPoints(markers: TimingMarker[], toOffset: (p: ScorePosition) => number): TimingPoint[] {
  return normaliseMarkers(markers).map((m) => ({ measure: m.measure, offset: toOffset(m.position) }));
}

/** Content offset for a (fractional) bar number; clamps outside the calibrated range. */
export function measureToOffset(points: TimingPoint[], measure: number): number {
  if (points.length === 0) return 0;
  if (measure <= points[0].measure) return points[0].offset;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (measure <= b.measure) {
      const t = (measure - a.measure) / (b.measure - a.measure);
      return a.offset + t * (b.offset - a.offset);
    }
  }
  return points[points.length - 1].offset;
}

/** Inverse of measureToOffset (used to start timed scrolling from the current view). */
export function offsetToMeasure(points: TimingPoint[], offset: number): number {
  if (points.length === 0) return 0;
  if (offset <= points[0].offset) return points[0].measure;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (offset <= b.offset) {
      const span = b.offset - a.offset;
      const t = span > 0 ? (offset - a.offset) / span : 0;
      return a.measure + t * (b.measure - a.measure);
    }
  }
  return points[points.length - 1].measure;
}

export function lastMeasure(points: TimingPoint[]): number {
  return points.length ? points[points.length - 1].measure : 0;
}

/** Continuous mode: pixels per second for a page of the given displayed height. */
export function pixelsPerSecond(pageHeightPx: number, secondsPerPage: number): number {
  return pageHeightPx / Math.max(1, secondsPerPage);
}

export const MIN_SECONDS_PER_PAGE = 8;
export const MAX_SECONDS_PER_PAGE = 600;

export function clampSecondsPerPage(s: number): number {
  return Math.min(MAX_SECONDS_PER_PAGE, Math.max(MIN_SECONDS_PER_PAGE, s));
}

/**
 * Speed slider ↔ seconds-per-page. Logarithmic so both very slow ballads and
 * fast pieces get fine control. Slider value 0–100, higher = faster.
 */
export function sliderToSecondsPerPage(v: number): number {
  const t = Math.min(100, Math.max(0, v)) / 100;
  const lnMax = Math.log(MAX_SECONDS_PER_PAGE);
  const lnMin = Math.log(MIN_SECONDS_PER_PAGE);
  return Math.exp(lnMax - t * (lnMax - lnMin));
}

export function secondsPerPageToSlider(s: number): number {
  const lnMax = Math.log(MAX_SECONDS_PER_PAGE);
  const lnMin = Math.log(MIN_SECONDS_PER_PAGE);
  return ((lnMax - Math.log(clampSecondsPerPage(s))) / (lnMax - lnMin)) * 100;
}

/** One "+"/"−" step changes speed by 5 %. */
export function stepSpeed(secondsPerPage: number, direction: 1 | -1, factor = 1.05): number {
  return clampSecondsPerPage(direction > 0 ? secondsPerPage / factor : secondsPerPage * factor);
}

export function formatSecondsPerPage(s: number): string {
  if (s >= 120) {
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}m ${r.toString().padStart(2, '0')}s / page`;
  }
  return `${s < 20 ? s.toFixed(1) : Math.round(s)} s / page`;
}

export const SPEED_PRESETS: { label: string; secondsPerPage: number }[] = [
  { label: 'Very slow', secondsPerPage: 180 },
  { label: 'Slow', secondsPerPage: 110 },
  { label: 'Medium', secondsPerPage: 70 },
  { label: 'Fast', secondsPerPage: 45 },
  { label: 'Very fast', secondsPerPage: 25 },
];
