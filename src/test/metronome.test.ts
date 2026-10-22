import { describe, expect, it } from 'vitest';
import { buildBarPattern, clampBpm, meterInfo, parseTimeSignature, secondsPerBar, TapTempo } from '../audio/meter';
import { MetronomeEngine } from '../audio/metronomeEngine';
import { DEFAULT_METRONOME } from '../settings/defaults';

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  sampleRate = 44100;
  destination = {};

  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
  createGain() {
    const node = {
      gain: {
        value: 1,
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
        setTargetAtTime: () => undefined,
      },
      connect: () => node,
      disconnect: () => undefined,
    };
    return node;
  }
  createOscillator() {
    const osc = {
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
      },
      onended: null as (() => void) | null,
      connect: () => osc,
      start: () => undefined,
      stop: () => undefined,
    };
    return osc;
  }
  createBiquadFilter() {
    const f = {
      type: 'lowpass',
      frequency: { value: 1000 },
      Q: { value: 1 },
      connect: () => f,
    };
    return f;
  }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const arr = new Float32Array(length);
    return {
      length,
      sampleRate,
      getChannelData: () => arr,
    };
  }
  createBufferSource() {
    const s = {
      buffer: null,
      connect: () => s,
      start: () => undefined,
      stop: () => undefined,
    };
    return s;
  }
}

describe('Time signature & meter calculations', () => {
  it('distinguishes simple and compound meters and supports compound feel options', () => {
    expect(parseTimeSignature('4/4')).toEqual({ numerator: 4, denominator: 4 });
    expect(meterInfo('4/4', 'dotted').compound).toBe(false);
    expect(meterInfo('4/4', 'dotted').beatsPerBar).toBe(4);

    const sixEightDotted = meterInfo('6/8', 'dotted');
    expect(sixEightDotted.compound).toBe(true);
    expect(sixEightDotted.beatsPerBar).toBe(2);
    expect(sixEightDotted.allowedSubdivisions).toEqual([1, 3]);

    const sixEightEighths = meterInfo('6/8', 'eighth');
    expect(sixEightEighths.beatsPerBar).toBe(6);

    const pat = buildBarPattern('6/8', 'eighth', 1, true);
    expect(pat.map((t) => t.level)).toEqual(['accent', 'sub', 'sub', 'group', 'sub', 'sub']);
  });

  it('computes bar duration and tap tempo accurately', () => {
    expect(secondsPerBar(120, '4/4', 'dotted')).toBeCloseTo(2.0, 5);
    expect(secondsPerBar(60, '3/4', 'dotted')).toBeCloseTo(3.0, 5);
    expect(clampBpm(5)).toBe(20);
    expect(clampBpm(999)).toBe(300);

    const tapper = new TapTempo();
    expect(tapper.tap(0)).toBeNull();
    expect(tapper.tap(500)).toBe(120); // 500ms = 120 BPM
    expect(tapper.tap(1000)).toBe(120);
  });
});

describe('MetronomeEngine Web Audio look-ahead scheduler', () => {
  it('schedules ticks on exact AudioContext intervals across tempo changes', async () => {
    const fakeCtx = new FakeAudioContext();
    const engine = new MetronomeEngine(
      { ...DEFAULT_METRONOME, bpm: 120, timeSignature: '4/4', subdivision: 1 },
      {
        createContext: () => fakeCtx as unknown as AudioContext,
        timer: () => ({ stop: () => undefined }),
      },
    );

    await engine.start(0);
    expect(engine.running).toBe(true);
    // Advance simulated AudioContext clock in 50ms steps over 2 seconds
    for (let i = 1; i <= 40; i++) {
      fakeCtx.currentTime = i * 0.05;
      engine.scheduleAhead();
    }
    expect(engine.history.length).toBeGreaterThanOrEqual(4);
    // At 120 BPM, beats are exactly 0.500s apart
    for (let i = 1; i < engine.history.length; i++) {
      expect(engine.history[i] - engine.history[i - 1]).toBeCloseTo(0.5, 5);
    }

    // Change BPM to 240 while running -> 0.250s interval
    const prevCount = engine.history.length;
    engine.update({ bpm: 240 });
    for (let i = 41; i <= 60; i++) {
      fakeCtx.currentTime = i * 0.05;
      engine.scheduleAhead();
    }
    expect(engine.history.length).toBeGreaterThan(prevCount + 2);
    const lastIdx = engine.history.length - 1;
    expect(engine.history[lastIdx] - engine.history[lastIdx - 1]).toBeCloseTo(0.25, 5);

    engine.stop();
    expect(engine.running).toBe(false);
  });
});
