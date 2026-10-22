import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../services/db';
import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS, mergeSettings } from './defaults';

interface SettingsContextValue {
  settings: AppSettings;
  loaded: boolean;
  update: (changes: Partial<AppSettings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const KEY = 'appSettings';

export function applyTheme(theme: AppSettings['theme']): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', !!dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0a09' : '#fafaf9');
  try {
    localStorage.setItem('musicflow-theme', theme);
  } catch {
    /* private mode */
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    db.kv
      .get(KEY)
      .then((row) => {
        if (!alive) return;
        setSettings(mergeSettings(row?.value as Partial<AppSettings> | undefined));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [settings.theme]);

  const update = useCallback((changes: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...changes };
      void db.kv.put({ key: KEY, value: next });
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    void db.kv.put({ key: KEY, value: DEFAULT_SETTINGS });
  }, []);

  const value = useMemo(() => ({ settings, loaded, update, reset }), [settings, loaded, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
