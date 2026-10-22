import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  HardDrive,
  Keyboard,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sun,
  Monitor,
  Upload,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useSettings } from './SettingsContext';
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS } from './defaults';
import { eventToCombo, formatCombo, isModifierOnly } from '../shortcuts/keys';
import {
  backupFileName,
  createBackup,
  downloadBlob,
  formatBytes,
  getStorageInfo,
  requestPersistentStorage,
  restoreBackup,
  type StorageInfo,
} from '../services/backup';
import type { FitMode, PaperTone, ShortcutAction, ThemePreference, ViewMode } from '../types';

export interface SettingsViewProps {
  onBack: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const { settings, update, reset } = useSettings();
  const [storage, setStorage] = useState<StorageInfo>({ usage: null, quota: null, persisted: null });
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void getStorageInfo().then(setStorage);
  }, []);

  // Capture key press when rebinding a shortcut
  useEffect(() => {
    if (!recordingAction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isModifierOnly(e.key)) return;
      const combo = eventToCombo(e);
      update({
        shortcuts: {
          ...settings.shortcuts,
          [recordingAction]: [combo],
        },
      });
      setRecordingAction(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recordingAction, settings.shortcuts, update]);

  const handleExportBackup = async () => {
    try {
      setBackupStatus({ type: 'info', text: 'Preparing backup archive…' });
      const blob = await createBackup((msg) => setBackupStatus({ type: 'info', text: msg }));
      downloadBlob(blob, backupFileName());
      setBackupStatus({
        type: 'success',
        text: `Exported backup (${formatBytes(blob.size)}). Store this .musicflow.zip file safely.`,
      });
    } catch (err) {
      setBackupStatus({ type: 'error', text: (err as Error)?.message ?? 'Backup export failed.' });
    }
  };

  const handleRestoreFile = async (file: File) => {
    try {
      setBackupStatus({ type: 'info', text: 'Restoring backup…' });
      const summary = await restoreBackup(file, restoreMode);
      const nextStorage = await getStorageInfo();
      setStorage(nextStorage);
      setBackupStatus({
        type: 'success',
        text: `Restore complete: ${summary.scoresAdded} score(s) added, ${summary.scoresSkipped} existing skipped.`,
      });
    } catch (err) {
      setBackupStatus({ type: 'error', text: (err as Error)?.message ?? 'Backup restore failed.' });
    }
  };

  const usagePercent =
    storage.usage !== null && storage.quota && storage.quota > 0
      ? Math.min(100, Math.round((storage.usage / storage.quota) * 100))
      : null;

  return (
    <div
      data-testid="settings-view"
      className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100"
    >
      <header className="sticky top-0 z-20 border-b border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="settings-back-btn"
              onClick={onBack}
              className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-1.5 text-xs font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Library</span>
            </button>
            <h1 className="text-base font-semibold">Settings & Backups</h1>
          </div>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs text-stone-600 dark:text-stone-300 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All Defaults
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8 text-xs">
        {/* Section 1: Appearance */}
        <section className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sun className="w-4 h-4 text-amber-500" />
            <h2>Appearance & Reading Surface</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-2">Interface Theme</label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'system', label: 'System', icon: Monitor },
                  ] as { id: ThemePreference; label: string; icon: typeof Sun }[]
                ).map((t) => {
                  const Icon = t.icon;
                  const active = settings.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`theme-btn-${t.id}`}
                      onClick={() => update({ theme: t.id })}
                      className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition-colors ${
                        active
                          ? 'bg-amber-500 text-stone-950 font-semibold border-amber-400'
                          : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-2">
                Score Paper Background
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'white', label: 'Pure White', bg: '#ffffff' },
                    { id: 'warm', label: 'Warm Ivory', bg: '#fbf8f1' },
                    { id: 'dim', label: 'Soft Dim', bg: '#e7e5e0' },
                  ] as { id: PaperTone; label: string; bg: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`paper-tone-${p.id}`}
                    onClick={() => update({ paperTone: p.id })}
                    className={`py-2.5 px-2 rounded-xl border flex items-center justify-center gap-2 font-medium ${
                      settings.paperTone === p.id
                        ? 'border-amber-500 ring-2 ring-amber-500/30 font-semibold'
                        : 'border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full border border-stone-300" style={{ backgroundColor: p.bg }} />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Reader & Practice Defaults */}
        <section className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sliders className="w-4 h-4 text-amber-500" />
            <h2>Reader & Practice Defaults</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">Default Display Mode</label>
              <select
                value={settings.defaultViewMode}
                onChange={(e) => update({ defaultViewMode: e.target.value as ViewMode })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
              >
                <option value="continuous">Continuous Vertical Scroll</option>
                <option value="single">Single Page</option>
                <option value="spread">Two-Page Spread</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">Default Zoom Fit</label>
              <select
                value={settings.defaultFitMode}
                onChange={(e) => update({ defaultFitMode: e.target.value as FitMode })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
              >
                <option value="width">Fit to Width</option>
                <option value="page">Fit Whole Page</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">
                Auto-Hide Reader Toolbar
              </label>
              <select
                value={settings.controlsHideDelayMs}
                onChange={(e) => update({ controlsHideDelayMs: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
              >
                <option value={1500}>After 1.5 seconds</option>
                <option value={2500}>After 2.5 seconds</option>
                <option value={5000}>After 5 seconds</option>
                <option value={0}>Only when tapped</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.clickZones}
                onChange={(e) => update({ clickZones: e.target.checked })}
                className="mt-0.5 accent-amber-500"
              />
              <div>
                <div className="font-medium">Left & Right Edge Click Zones</div>
                <div className="text-stone-500 dark:text-stone-400 text-[11px]">
                  Tap the left or right outer margin of the reader to turn pages quickly.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.keepAwake}
                onChange={(e) => update({ keepAwake: e.target.checked })}
                className="mt-0.5 accent-amber-500"
              />
              <div>
                <div className="font-medium">Prevent Screen Sleep While Reading</div>
                <div className="text-stone-500 dark:text-stone-400 text-[11px]">
                  Uses the Screen Wake Lock API so your display stays on while playing.
                </div>
              </div>
            </label>
          </div>
        </section>

        {/* Section 3: Storage & Backups */}
        <section className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <HardDrive className="w-4 h-4 text-amber-500" />
              <h2>Local Storage & Backups</h2>
            </div>
            {storage.persisted ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Persistent storage protected
              </span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await requestPersistentStorage();
                  setStorage(await getStorageInfo());
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-medium hover:bg-amber-500/25"
              >
                Request Persistent Storage Protection
              </button>
            )}
          </div>

          <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Browser IndexedDB Usage</span>
              <span className="font-mono text-stone-600 dark:text-stone-300">
                {formatBytes(storage.usage)} used of {formatBytes(storage.quota)}
                {usagePercent !== null ? ` (${usagePercent}%)` : ''}
              </span>
            </div>
            {usagePercent !== null && (
              <div className="w-full h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                <div
                  style={{ width: `${Math.max(2, usagePercent)}%` }}
                  className="h-full bg-amber-500 rounded-full"
                />
              </div>
            )}
            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed pt-1">
              <strong>Important:</strong> MusicFlow stores your sheet music, bookmarks, practice passages, and annotations locally inside this browser on this device. Clearing browser site data or switching to another device will not automatically transfer your library. Export a backup archive regularly to keep a portable copy or move your library between devices.
            </p>
          </div>

          {backupStatus && (
            <div
              data-testid="backup-status-banner"
              className={`p-3 rounded-xl border flex items-center gap-2 ${
                backupStatus.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  : backupStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
              }`}
            >
              {backupStatus.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{backupStatus.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <button
              type="button"
              data-testid="export-backup-btn"
              onClick={() => void handleExportBackup()}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold flex items-center gap-2 shadow-xs"
            >
              <Download className="w-4 h-4" />
              Export Full Backup (.musicflow.zip)
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Backup restore mode"
                value={restoreMode}
                onChange={(e) => setRestoreMode(e.target.value as 'merge' | 'replace')}
                className="px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
              >
                <option value="merge">Merge with current library</option>
                <option value="replace">Replace entire library</option>
              </select>
              <input
                ref={restoreInputRef}
                type="file"
                data-testid="restore-backup-input"
                accept=".zip,application/zip"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleRestoreFile(f);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                data-testid="restore-backup-btn"
                onClick={() => restoreInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 font-medium flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import Backup Archive
              </button>
            </div>
          </div>
        </section>

        {/* Section 4: Keyboard Shortcuts */}
        <section className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Keyboard className="w-4 h-4 text-amber-500" />
              <h2>Keyboard Shortcuts</h2>
            </div>
            <button
              type="button"
              onClick={() => update({ shortcuts: DEFAULT_SHORTCUTS })}
              className="text-amber-600 dark:text-amber-400 font-medium hover:underline"
            >
              Reset Shortcuts
            </button>
          </div>

          <div className="divide-y divide-stone-200 dark:divide-stone-800">
            {(Object.entries(SHORTCUT_LABELS) as [ShortcutAction, string][]).map(([action, label]) => {
              const isRecording = recordingAction === action;
              return (
                <div key={action} className="py-2.5 flex items-center justify-between gap-4">
                  <span className="text-stone-700 dark:text-stone-200">{label}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {(settings.shortcuts[action] ?? []).map((combo) => (
                        <kbd
                          key={combo}
                          className="px-2 py-1 rounded bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 font-mono text-[11px]"
                        >
                          {formatCombo(combo)}
                        </kbd>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRecordingAction(isRecording ? null : action)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium ${
                        isRecording
                          ? 'bg-amber-500 text-stone-950 border-amber-400 font-semibold animate-pulse'
                          : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      {isRecording ? 'Press any key…' : 'Change'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
