import { useCallback, useEffect, useState } from 'react';
import { SettingsProvider, useSettings } from './settings/SettingsContext';
import { MetronomeProvider } from './audio/MetronomeContext';
import { LibraryView } from './library/LibraryView';
import { ReaderView } from './reader/ReaderView';
import { SettingsView } from './settings/SettingsView';

export type Route =
  | { view: 'library' }
  | { view: 'reader'; scoreId: string }
  | { view: 'settings' };

export function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, '').trim();
  if (cleaned.startsWith('reader/')) {
    const scoreId = decodeURIComponent(cleaned.slice('reader/'.length));
    if (scoreId) return { view: 'reader', scoreId };
  }
  if (cleaned === 'settings') return { view: 'settings' };
  return { view: 'library' };
}

function AppShell() {
  const { settings } = useSettings();
  const [route, setRoute] = useState<Route>(() =>
    typeof window !== 'undefined' ? parseHash(window.location.hash) : { view: 'library' },
  );

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash =
      next.view === 'reader'
        ? `#/reader/${encodeURIComponent(next.scoreId)}`
        : next.view === 'settings'
          ? '#/settings'
          : '#/library';
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setRoute(next);
  }, []);

  return (
    <MetronomeProvider initialSettings={settings.metronome}>
      {route.view === 'library' && (
        <LibraryView
          onOpenScore={(scoreId) => navigate({ view: 'reader', scoreId })}
          onOpenSettings={() => navigate({ view: 'settings' })}
        />
      )}
      {route.view === 'reader' && (
        <ReaderView scoreId={route.scoreId} onExit={() => navigate({ view: 'library' })} />
      )}
      {route.view === 'settings' && <SettingsView onBack={() => navigate({ view: 'library' })} />}
    </MetronomeProvider>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}
