import type { MetronomeSettings, MetronomeSound } from '../types';
import { buildBarPattern, clampBpm, effectiveSubdivision, meterInfo, type Tick, type TickLevel } from './meter';

export interface ScheduledTick extends Tick {
  /** AudioContext time at which the tick sounds. */
  time: number;
  bar: number;
  countIn: boolean;
}

export type TickListener = (tick: ScheduledTick) => void;
export type StateListener = (running: boolean) => void;

type TimerHandle = { stop(): void };

/** Look-ahead parameters (Chris Wilson's "A Tale of Two Clocks" pattern). */
export const LOOKAHEAD_MS = 25; // how often the scheduler wakes up
export const SCHEDULE_AHEAD_S = 0.12; // how far ahead audio events are queued

/**
 * A background-tab-resistant interval: runs the scheduler tick from a tiny
 * Web Worker (worker timers are not throttled like main-thread timers when
 * the tab is hidden). Falls back to setInterval.
 */
function startTimer(cb: () => void, intervalMs: number): TimerHandle {
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const src = `let id=null;onmessage=e=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage(0),${intervalMs});}else{clearInterval(id);}}`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const worker = new Worker(url);
      worker.onmessage = () => cb();
      worker.postMessage('start');
      return {
        stop() {
          worker.postMessage('stop');
          worker.terminate();
          URL.revokeObjectURL(url);
        },
      };
    } catch {
      /* fall back below */
    }
  }
  const id = setInterval(cb, intervalMs);
  return { stop: () => clearInterval(id) };
}

export interface EngineOptions {
  createContext?: () => AudioContext;
  timer?: (cb: () => void, intervalMs: number) => TimerHandle;
}

/**
 * Sample-accurate metronome built on the Web Audio clock. JavaScript timers
 * only *wake up* the scheduler; every click is placed on the audio timeline
 * with `start(time)`, so jitter in the event loop never reaches the ear.
 */
export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: TimerHandle | null = null;
  private settings: MetronomeSettings;
  private pattern: Tick[] = [];
  private tickIndex = 0;
  private bar = 0;
  private nextTime = 0;
  private countInTicksLeft = 0;
  private queue: ScheduledTick[] = [];
  private tickListeners = new Set<TickListener>();
  private stateListeners = new Set<StateListener>();
  private raf = 0;
  private _running = false;
  private readonly opts: EngineOptions;
  /** Total number of ticks scheduled since start (diagnostics/tests). */
  scheduledCount = 0;
  /** Recent scheduled tick times (diagnostics/tests). */
  readonly history: number[] = [];

  constructor(settings: MetronomeSettings, opts: EngineOptions = {}) {
    this.settings = { ...settings };
    this.opts = opts;
    this.rebuildPattern();
  }

  get running(): boolean {
    return this._running;
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  get currentSettings(): MetronomeSettings {
    return this.settings;
  }

  /** Must be called from a user gesture the first time (browser autoplay policy). */
  async unlock(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        typeof window !== 'undefined' ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
      if (!this.opts.createContext && !Ctor) throw new Error('Web Audio is not supported in this browser.');
      // iOS: let the metronome play even when the ring/silent switch is on.
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) {
        try {
          nav.audioSession.type = 'playback';
        } catch {
          /* ignore */
        }
      }
      this.ctx = this.opts.createContext ? this.opts.createContext() : new Ctor!({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
      this.noise = this.makeNoise(this.ctx);
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* resume can reject if not in a gesture; caller will retry on next interaction */
      }
    }
    return this.ctx;
  }

  update(partial: Partial<MetronomeSettings>): void {
    const prev = this.settings;
    this.settings = { ...prev, ...partial, bpm: clampBpm(partial.bpm ?? prev.bpm) };
    if (
      partial.timeSignature !== undefined ||
      partial.compoundFeel !== undefined ||
      partial.subdivision !== undefined ||
      partial.accentFirst !== undefined
    ) {
      const oldLen = this.pattern.length;
      this.rebuildPattern();
      // Keep the musical position sensible when the bar length changes.
      if (this.pattern.length !== oldLen) this.tickIndex = this.tickIndex % this.pattern.length;
    }
    if (partial.volume !== undefined || partial.muted !== undefined) this.applyVolume();
  }

  private rebuildPattern(): void {
    const s = this.settings;
    this.pattern = buildBarPattern(s.timeSignature, s.compoundFeel, s.subdivision, s.accentFirst);
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    const v = this.settings.muted ? 0 : Math.pow(this.settings.volume, 1.6);
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  /** Seconds between two consecutive ticks (subdivision level). */
  get tickInterval(): number {
    const s = this.settings;
    return 60 / s.bpm / effectiveSubdivision(s.timeSignature, s.compoundFeel, s.subdivision);
  }

  get barDuration(): number {
    const s = this.settings;
    return (meterInfo(s.timeSignature, s.compoundFeel).beatsPerBar * 60) / s.bpm;
  }

  /**
   * Starts the metronome. With `countInBars > 0` the first bars are flagged as
   * count-in. Resolves with the AudioContext time of the first beat after the count-in.
   */
  async start(countInBars = 0): Promise<number> {
    const ctx = await this.unlock();
    if (this._running) return this.nextDownbeatAfter(countInBars);
    this._running = true;
    this.tickIndex = 0;
    this.bar = 0;
    this.queue = [];
    this.nextTime = ctx.currentTime + 0.06;
    this.countInTicksLeft = countInBars * this.pattern.length;
    const firstBeat = this.nextTime + countInBars * this.barDuration;
    this.scheduleAhead();
    this.timer = (this.opts.timer ?? startTimer)(() => this.scheduleAhead(), LOOKAHEAD_MS);
    this.startRaf();
    this.emitState();
    return firstBeat;
  }

  /** While running: AudioContext time of the downbeat `bars` bars from the next bar line. */
  private nextDownbeatAfter(bars: number): number {
    const ticksToBarLine = (this.pattern.length - this.tickIndex) % this.pattern.length;
    return this.nextTime + ticksToBarLine * this.tickInterval + Math.max(0, bars - 1) * this.barDuration;
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    this.timer?.stop();
    this.timer = null;
    this.queue = [];
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.emitState();
  }

  async toggle(): Promise<void> {
    if (this._running) this.stop();
    else await this.start();
  }

  /** Scheduler: queue every tick that falls inside the look-ahead window. Public for tests. */
  scheduleAhead(): void {
    if (!this.ctx || !this._running) return;
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_S;
    // If the tab was frozen and we fell far behind, resync instead of machine-gunning clicks.
    if (this.nextTime < this.ctx.currentTime - 0.25) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < horizon) {
      const tick = this.pattern[this.tickIndex];
      const countIn = this.countInTicksLeft > 0;
      const scheduled: ScheduledTick = { ...tick, time: this.nextTime, bar: this.bar, countIn };
      this.playTick(scheduled);
      this.queue.push(scheduled);
      this.scheduledCount++;
      this.history.push(this.nextTime);
      if (this.history.length > 512) this.history.shift();
      if (countIn) this.countInTicksLeft--;
      this.nextTime += this.tickInterval;
      this.tickIndex++;
      if (this.tickIndex >= this.pattern.length) {
        this.tickIndex = 0;
        this.bar++;
      }
    }
  }

  private playTick(t: ScheduledTick): void {
    if (!this.ctx || !this.master) return;
    synthesize(this.ctx, this.master, this.noise, this.settings.sound, t.countIn && t.level !== 'sub' ? 'accent' : t.level, t.time, t.countIn);
  }

  /** Plays a single preview click immediately (used by the sound picker). */
  async preview(sound: MetronomeSound): Promise<void> {
    const ctx = await this.unlock();
    if (!this.master) return;
    synthesize(ctx, this.master, this.noise, sound, 'accent', ctx.currentTime + 0.02, false);
  }

  // ---- visual sync ---------------------------------------------------------

  onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private emitState(): void {
    for (const l of this.stateListeners) l(this._running);
  }

  /** Fires tick listeners when each scheduled tick actually becomes audible. */
  private startRaf(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    const loop = () => {
      if (!this._running || !this.ctx) return;
      const latency = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
      const now = this.ctx.currentTime - (Number.isFinite(latency) ? latency : 0);
      while (this.queue.length && this.queue[0].time <= now) {
        const t = this.queue.shift()!;
        for (const l of this.tickListeners) l(t);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer | null {
    try {
      const len = Math.floor(ctx.sampleRate * 0.08);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    } catch {
      return null;
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    this.tickListeners.clear();
    this.stateListeners.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== 'closed') await ctx.close().catch(() => undefined);
  }
}

const LEVEL_GAIN: Record<TickLevel, number> = { accent: 1, group: 0.8, beat: 0.65, sub: 0.35 };

/** Synthesises a click entirely with Web Audio nodes — no audio files needed (works offline). */
function synthesize(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer | null,
  sound: MetronomeSound,
  level: TickLevel,
  time: number,
  countIn: boolean,
): void {
  const gain = ctx.createGain();
  gain.connect(out);
  const peak = LEVEL_GAIN[level];
  const pitchUp = countIn ? 1.25 : 1;
  const env = (attack: number, decay: number) => {
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  };
  const stopAt = time + 0.12;
  let last: AudioScheduledSourceNode | null = null;
  switch (sound) {
    case 'click': {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const f = { accent: 2400, group: 1900, beat: 1600, sub: 1100 }[level] * pitchUp;
      osc.frequency.setValueAtTime(f, time);
      osc.frequency.exponentialRampToValueAtTime(f * 0.6, time + 0.03);
      env(0.001, 0.035);
      osc.connect(gain);
      osc.start(time);
      osc.stop(stopAt);
      last = osc;
      break;
    }
    case 'beep': {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime({ accent: 1760, group: 1320, beat: 880, sub: 660 }[level] * pitchUp, time);
      env(0.002, 0.07);
      osc.connect(gain);
      osc.start(time);
      osc.stop(stopAt);
      last = osc;
      break;
    }
    case 'digital': {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime({ accent: 1250, group: 1000, beat: 850, sub: 600 }[level] * pitchUp, time);
      env(0.001, 0.025);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4000;
      osc.connect(lp).connect(gain);
      osc.start(time);
      osc.stop(stopAt);
      last = osc;
      break;
    }
    case 'wood': {
      // Woodblock: band-passed noise burst + a short pitched body.
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      const f = { accent: 2200, group: 1800, beat: 1500, sub: 1100 }[level] * pitchUp;
      bp.frequency.value = f;
      bp.Q.value = 6;
      if (noise) {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.connect(bp);
        src.start(time);
        src.stop(stopAt);
      }
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f / 2, time);
      osc.frequency.exponentialRampToValueAtTime(f / 3, time + 0.04);
      osc.connect(bp);
      osc.start(time);
      osc.stop(stopAt);
      last = osc;
      bp.connect(gain);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(peak * 1.6, time + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      break;
    }
  }
  // Disconnect the per-tick gain after it finishes to avoid node build-up.
  if (last) last.onended = () => gain.disconnect();
}
