import Dexie, { type EntityTable } from 'dexie';
import type {
  Bookmark,
  Collection,
  PageAnnotations,
  PracticeSection,
  Score,
  ScoreFile,
  ScorePrefs,
} from '../types';

export interface KeyValue {
  key: string;
  value: unknown;
}

/**
 * Local-first persistence. Everything — including the original PDF/image
 * bytes — lives in the browser's IndexedDB. Metadata (`scores`) is kept
 * separate from file bytes (`files`) so the library can be listed without
 * loading megabytes of PDF data.
 *
 * The repository layer (services/*Repo.ts) is the only code that talks to
 * this database, which keeps a future sync backend pluggable.
 */
export class MusicFlowDB extends Dexie {
  scores!: EntityTable<Score, 'id'>;
  files!: EntityTable<ScoreFile, 'id'>;
  collections!: EntityTable<Collection, 'id'>;
  prefs!: EntityTable<ScorePrefs, 'scoreId'>;
  bookmarks!: EntityTable<Bookmark, 'id'>;
  sections!: EntityTable<PracticeSection, 'id'>;
  annotations!: EntityTable<PageAnnotations, 'id'>;
  kv!: EntityTable<KeyValue, 'key'>;

  constructor(name = 'musicflow') {
    super(name);
    this.version(1).stores({
      scores: 'id, title, composer, genre, difficulty, createdAt, lastOpenedAt, favorite, *tags, *collectionIds',
      files: 'id, scoreId',
      collections: 'id, order',
      prefs: 'scoreId',
      bookmarks: 'id, scoreId',
      sections: 'id, scoreId',
      annotations: 'id, scoreId',
      kv: 'key',
    });
  }
}

export const db = new MusicFlowDB();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; inner?: { name?: string }; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.inner?.name === 'QuotaExceededError' ||
    /quota/i.test(e.message ?? '')
  );
}

/**
 * Safely reads a Blob, File, ArrayBuffer or Uint8Array into a Uint8Array across
 * all browser IndexedDB implementations and test environments.
 */
export async function blobToBytes(input: unknown): Promise<Uint8Array> {
  if (!input) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  const maybeBlob = input as Blob & { bytes?: Uint8Array };
  if (maybeBlob.bytes instanceof Uint8Array) return maybeBlob.bytes;
  if (typeof maybeBlob.arrayBuffer === 'function') {
    return new Uint8Array(await maybeBlob.arrayBuffer());
  }
  if (typeof FileReader !== 'undefined' && typeof (input as Blob).slice === 'function') {
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
        reader.readAsArrayBuffer(input as Blob);
      });
    } catch {
      /* fall through */
    }
  }
  if (typeof Response !== 'undefined') {
    try {
      return new Uint8Array(await new Response(input as BodyInit).arrayBuffer());
    } catch {
      /* fall through */
    }
  }
  return new Uint8Array(0);
}
