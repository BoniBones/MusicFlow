import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from 'fflate';
import { blobToBytes, db } from './db';
import type { Bookmark, Collection, PageAnnotations, PracticeSection, Score, ScoreFile, ScorePrefs } from '../types';

/**
 * Backups are standard ZIP files (".musicflow.zip") containing a JSON
 * manifest plus the original PDF/image files, so they remain readable even
 * without MusicFlow.
 */
interface Manifest {
  format: 'musicflow-backup';
  version: 1;
  exportedAt: string;
  scores: (Omit<Score, 'thumbnail'> & { thumbnailPath?: string })[];
  files: (Omit<ScoreFile, 'blob'> & { path: string })[];
  collections: Collection[];
  prefs: ScorePrefs[];
  bookmarks: Bookmark[];
  sections: PracticeSection[];
  annotations: PageAnnotations[];
  settings?: unknown;
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
}

export async function createBackup(onProgress?: (msg: string) => void): Promise<Blob> {
  onProgress?.('Reading library…');
  const [scores, files, collections, prefs, bookmarks, sections, annotations, settings] = await Promise.all([
    db.scores.toArray(),
    db.files.toArray(),
    db.collections.toArray(),
    db.prefs.toArray(),
    db.bookmarks.toArray(),
    db.sections.toArray(),
    db.annotations.toArray(),
    db.kv.get('appSettings'),
  ]);
  const entries: Zippable = {};
  const manifest: Manifest = {
    format: 'musicflow-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    scores: [],
    files: [],
    collections,
    prefs,
    bookmarks,
    sections,
    annotations,
    settings: settings?.value,
  };
  for (const s of scores) {
    const { thumbnail, ...rest } = s;
    let thumbnailPath: string | undefined;
    if (thumbnail) {
      thumbnailPath = `thumbnails/${s.id}.jpg`;
      entries[thumbnailPath] = await blobToBytes(thumbnail);
    }
    manifest.scores.push({ ...rest, thumbnailPath });
  }
  let i = 0;
  for (const f of files) {
    onProgress?.(`Packing files ${++i}/${files.length}…`);
    const { blob, ...rest } = f;
    const path = `scores/${f.scoreId}/${f.index}-${safeName(f.name)}`;
    entries[path] = [await blobToBytes(blob), { level: 0 }];
    manifest.files.push({ ...rest, path });
  }
  entries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1));
  onProgress?.('Compressing…');
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out))),
  );
  return new Blob([data as BlobPart], { type: 'application/zip' });
}

export interface RestoreSummary {
  scoresAdded: number;
  scoresSkipped: number;
}

export async function restoreBackup(file: Blob, mode: 'merge' | 'replace'): Promise<RestoreSummary> {
  const buf = await blobToBytes(file);
  const files = await new Promise<Unzipped>((resolve, reject) => unzip(buf, (err, out) => (err ? reject(err) : resolve(out))));
  const manifestRaw = files['manifest.json'];
  if (!manifestRaw) throw new Error('This file is not a MusicFlow backup (manifest.json missing).');
  const manifest = JSON.parse(strFromU8(manifestRaw)) as Manifest;
  if (manifest.format !== 'musicflow-backup') throw new Error('Unrecognised backup format.');

  const summary: RestoreSummary = { scoresAdded: 0, scoresSkipped: 0 };
  await db.transaction('rw', [db.scores, db.files, db.collections, db.prefs, db.bookmarks, db.sections, db.annotations, db.kv], async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.scores.clear(),
        db.files.clear(),
        db.collections.clear(),
        db.prefs.clear(),
        db.bookmarks.clear(),
        db.sections.clear(),
        db.annotations.clear(),
      ]);
      if (manifest.settings) await db.kv.put({ key: 'appSettings', value: manifest.settings });
      await db.kv.put({ key: 'collectionsSeeded', value: true });
    }
    const existing = new Set(await db.scores.toCollection().primaryKeys());
    const existingCollections = new Set(await db.collections.toCollection().primaryKeys());
    for (const c of manifest.collections) if (!existingCollections.has(c.id)) await db.collections.put(c);

    const restored = new Set<string>();
    for (const s of manifest.scores) {
      if (existing.has(s.id)) {
        summary.scoresSkipped++;
        continue;
      }
      const { thumbnailPath, ...rest } = s;
      const thumb = thumbnailPath && files[thumbnailPath] ? new Blob([files[thumbnailPath] as BlobPart], { type: 'image/jpeg' }) : undefined;
      await db.scores.put({ ...rest, thumbnail: thumb });
      restored.add(s.id);
      summary.scoresAdded++;
    }
    for (const f of manifest.files) {
      if (!restored.has(f.scoreId)) continue;
      const bytes = files[f.path];
      if (!bytes) continue;
      const { path: _path, ...rest } = f;
      void _path;
      await db.files.put({ ...rest, blob: new Blob([bytes as BlobPart], { type: f.mimeType }) });
    }
    for (const p of manifest.prefs) if (restored.has(p.scoreId)) await db.prefs.put(p);
    for (const b of manifest.bookmarks) if (restored.has(b.scoreId)) await db.bookmarks.put(b);
    for (const s of manifest.sections) if (restored.has(s.scoreId)) await db.sections.put(s);
    for (const a of manifest.annotations) if (restored.has(a.scoreId)) await db.annotations.put(a);
  });
  return summary;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `musicflow-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.musicflow.zip`;
}

// ---- storage management -------------------------------------------------------------

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const info: StorageInfo = { usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      info.usage = est.usage ?? null;
      info.quota = est.quota ?? null;
    }
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
  } catch {
    /* unsupported */
  }
  return info;
}

/** Asks the browser not to evict MusicFlow's data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* unsupported */
  }
  return false;
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
