import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MetronomeSettings, MetronomeSound } from '../types';
import { DEFAULT_METRONOME } from '../settings/defaults';
import { clampBpm, TapTempo } from './meter';
import { MetronomeEngine, type ScheduledTick, type TickListener } from './metronomeEngine';

interface MetronomeContextValue {
  settings: MetronomeSettings;
  running: boolean;
  start: (countInBars?: number) => Promise<number>;
  stop: () => void;
  toggle: () => Promise<void>;
  update: (changes: Partial<MetronomeSettings>) => void;
  tap: () => number | null;
  preview: (sound: MetronomeSound) => Promise<void>;
  subscribeTick: (listener: TickListener) => () => void;
  engine: MetronomeEngine;
}

const MetronomeContext = createContext<MetronomeContextValue | null>(null);

export function MetronomeProvider({
  initialSettings = DEFAULT_METRONOME,
  children,
}: {
  initialSettings?: MetronomeSettings;
  children: ReactNode;
}) {
  const engineRef = useRef<MetronomeEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new MetronomeEngine(initialSettings);
  }
  const tapperRef = useRef(new TapTempo());
  const [settings, setSettings] = useState<MetronomeSettings>(() => engineRef.current!.currentSettings);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const engine = engineRef.current!;
    const unsub = engine.onState(setRunning);
    return () => {
      unsub();
      void engine.dispose();
    };
  }, []);

  const update = useCallback((changes: Partial<MetronomeSettings>) => {
    const engine = engineRef.current!;
    engine.update(changes);
    setSettings({ ...engine.currentSettings });
  }, []);

  const start = useCallback((countInBars = 0) => {
    return engineRef.current!.start(countInBars);
  }, []);

  const stop = useCallback(() => {
    engineRef.current!.stop();
  }, []);

  const toggle = useCallback(async () => {
    await engineRef.current!.toggle();
  }, []);

  const tap = useCallback(() => {
    const bpm = tapperRef.current.tap(performance.now());
    if (bpm !== null) {
      update({ bpm: clampBpm(bpm) });
    }
    return bpm;
  }, [update]);

  const preview = useCallback(async (sound: MetronomeSound) => {
    await engineRef.current!.preview(sound);
  }, []);

  const subscribeTick = useCallback((listener: TickListener) => {
    return engineRef.current!.onTick(listener);
  }, []);

  const value = useMemo<MetronomeContextValue>(
    () => ({
      settings,
      running,
      start,
      stop,
      toggle,
      update,
      tap,
      preview,
      subscribeTick,
      engine: engineRef.current!,
    }),
    [settings, running, start, stop, toggle, update, tap, preview, subscribeTick],
  );

  // Keep latest Tick type referenced for consumers
  void (null as unknown as ScheduledTick);

  return <MetronomeContext.Provider value={value}>{children}</MetronomeContext.Provider>;
}

export function useMetronome(): MetronomeContextValue {
  const ctx = useContext(MetronomeContext);
  if (!ctx) throw new Error('useMetronome must be used inside <MetronomeProvider>');
  return ctx;
}
