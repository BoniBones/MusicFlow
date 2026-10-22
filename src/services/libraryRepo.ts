import { blobToBytes, db, isQuotaError, uid } from './db';
import type { Collection, Score, ScoreFile } from '../types';
import { parseFileName } from '../library/query';
import { ImageScoreDocument, PdfScoreDocument, renderThumbnail, type ScoreDocument } from '../rendering/scoreDocument';

export const DEFAULT_COLLECTIONS: { name: string; color: string }[] = [
  { name: 'Currently Practising', color: '#f59e0b' },
  { name: 'Performance Repertoire', color: '#ef4444' },
  { name: 'Classical Music', color: '#8b5cf6' },
  { name: 'Film Soundtracks', color: '#0ea5e9' },
  { name: 'Video Game Music', color: '#10b981' },
  { name: 'Technical Exercises', color: '#64748b' },
];

export const COLLECTION_COLORS = ['#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#10b981', '#64748b', '#ec4899', '#14b8a6', '#a16207'];

/** Creates the default collections on first launch only. */
export async function ensureDefaultCollections(): Promise<void> {
  await db.transaction('rw', db.collections, db.kv, async () => {
    const seeded = await db.kv.get('collectionsSeeded');
    if (seeded) return;
    const now = Date.now();
    await db.collections.bulkAdd(
      DEFAULT_COLLECTIONS.map((c, i) => ({ id: uid(), name: c.name, color: c.color, order: i, createdAt: now })),
    );
    await db.kv.put({ key: 'collectionsSeeded', value: true });
  });
}

export class StorageFullError extends Error {
  constructor() {
    super('Browser storage is full. Delete some scores or export a backup and free space, then try again.');
    this.name = 'StorageFullError';
  }
}

export const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

export function classifyFile(file: File): 'pdf' | 'image' | null {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type === 'image/png' || file.type === 'image/jpeg' || /\.(png|jpe?g)$/.test(name)) return 'image';
  return null;
}

export interface ImportResult {
  imported: Score[];
  failed: { name: string; reason: string }[];
}

export interface ImportOptions {
  /** Combine all image files of this import into one multi-page score (ordered by file name). */
  combineImages?: boolean;
  collectionId?: string | null;
  onProgress?: (done: number, total: number, current: string) => void;
}

async function buildScore(files: File[], kind: 'pdf' | 'images', collectionId?: string | null): Promise<{ score: Score; rows: ScoreFile[] }> {
  let doc: ScoreDocument;
  if (kind === 'pdf') {
    doc = await PdfScoreDocument.open(await files[0].arrayBuffer());
  } else {
    doc = await ImageScoreDocument.open(files);
  }
  try {
    const thumbnail = await renderThumbnail(doc).catch(() => undefined);
    const id = uid();
    const { title, composer } = parseFileName(files[0].name);
    const score: Score = {
      id,
      title,
      composer,
      genre: '',
      difficulty: 0,
      tags: [],
      collectionIds: collectionId ? [collectionId] : [],
      favorite: false,
      notes: '',
      kind,
      pageCount: doc.pageCount,
      fileName: files[0].name,
      fileSize: files.reduce((n, f) => n + f.size, 0),
      thumbnail,
      createdAt: Date.now(),
    };
    const rows: ScoreFile[] = files.map((f, index) => ({
      id: `${id}:${index}`,
      scoreId: id,
      index,
      // Copy into a fresh Blob so the stored data doesn't reference the picked file handle.
      blob: new Blob([f], { type: f.type || (kind === 'pdf' ? 'application/pdf' : 'image/jpeg') }),
      mimeType: f.type || (kind === 'pdf' ? 'application/pdf' : 'image/jpeg'),
      name: f.name,
    }));
    return { score, rows };
  } finally {
    doc.destroy();
  }
}

async function persist(score: Score, rows: ScoreFile[]): Promise<void> {
  try {
    await db.transaction('rw', db.scores, db.files, async () => {
      await db.files.bulkAdd(rows);
      await db.scores.add(score);
    });
  } catch (err) {
    if (isQuotaError(err)) throw new StorageFullError();
    throw err;
  }
}

/** Imports PDFs and images into the library. Each file is processed independently so one bad file doesn't abort the batch. */
export async function importFiles(files: File[], opts: ImportOptions = {}): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] };
  const pdfs: File[] = [];
  const images: File[] = [];
  for (const f of files) {
    const c = classifyFile(f);
    if (c === 'pdf') pdfs.push(f);
    else if (c === 'image') images.push(f);
    else result.failed.push({ name: f.name, reason: 'Unsupported file type (use PDF, PNG or JPG).' });
  }
  const jobs: { files: File[]; kind: 'pdf' | 'images' }[] = pdfs.map((f) => ({ files: [f], kind: 'pdf' }));
  if (opts.combineImages && images.length > 1) {
    const sorted = [...images].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    jobs.push({ files: sorted, kind: 'images' });
  } else {
    for (const f of images) jobs.push({ files: [f], kind: 'images' });
  }
  let done = 0;
  for (const job of jobs) {
    opts.onProgress?.(done, jobs.length, job.files[0].name);
    try {
      const { score, rows } = await buildScore(job.files, job.kind, opts.collectionId);
      await persist(score, rows);
      result.imported.push(score);
    } catch (err) {
      if (err instanceof StorageFullError) {
        result.failed.push({ name: job.files[0].name, reason: err.message });
        // No point trying the rest once storage is full.
        for (const rest of jobs.slice(done + 1)) result.failed.push({ name: rest.files[0].name, reason: 'Skipped: storage full.' });
        break;
      }
      const msg = (err as Error)?.name === 'PasswordException' ? 'PDF is password protected.' : `Could not read file (${(err as Error)?.message ?? 'unknown error'}).`;
      result.failed.push({ name: job.files[0].name, reason: msg });
    }
    done++;
    opts.onProgress?.(done, jobs.length, '');
  }
  return result;
}

export async function getScoreFiles(scoreId: string): Promise<ScoreFile[]> {
  const rows = await db.files.where('scoreId').equals(scoreId).toArray();
  return rows.sort((a, b) => a.index - b.index);
}

export async function openScoreDocument(score: Score): Promise<ScoreDocument> {
  const rows = await getScoreFiles(score.id);
  if (rows.length === 0) throw new Error('The file for this score is missing from local storage.');
  if (score.kind === 'pdf') {
    const bytes = await blobToBytes(rows[0].blob);
    return PdfScoreDocument.open(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }
  return ImageScoreDocument.open(rows.map((r) => r.blob));
}

export async function updateScore(id: string, changes: Partial<Omit<Score, 'id'>>): Promise<void> {
  await db.scores.update(id, changes);
}

export async function markOpened(id: string): Promise<void> {
  await db.scores.update(id, { lastOpenedAt: Date.now() });
}

export async function toggleFavorite(score: Score): Promise<void> {
  await db.scores.update(score.id, { favorite: !score.favorite });
}

/** Deletes a score and everything attached to it (files, prefs, bookmarks, sections, annotations). */
export async function deleteScore(id: string): Promise<void> {
  await db.transaction('rw', [db.scores, db.files, db.prefs, db.bookmarks, db.sections, db.annotations], async () => {
    await db.files.where('scoreId').equals(id).delete();
    await db.bookmarks.where('scoreId').equals(id).delete();
    await db.sections.where('scoreId').equals(id).delete();
    await db.annotations.where('scoreId').equals(id).delete();
    await db.prefs.delete(id);
    await db.scores.delete(id);
  });
}

export async function createCollection(name: string, color?: string): Promise<Collection> {
  const count = await db.collections.count();
  const c: Collection = {
    id: uid(),
    name: name.trim() || 'New collection',
    color: color ?? COLLECTION_COLORS[count % COLLECTION_COLORS.length],
    order: count,
    createdAt: Date.now(),
  };
  await db.collections.add(c);
  return c;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  await db.collections.update(id, { name: name.trim() || 'Untitled' });
}

export async function deleteCollection(id: string): Promise<void> {
  await db.transaction('rw', db.collections, db.scores, async () => {
    await db.collections.delete(id);
    const affected = await db.scores.where('collectionIds').equals(id).toArray();
    for (const s of affected) {
      await db.scores.update(s.id, { collectionIds: s.collectionIds.filter((c) => c !== id) });
    }
  });
}

export async function setScoreCollections(scoreId: string, collectionIds: string[]): Promise<void> {
  await db.scores.update(scoreId, { collectionIds });
}
