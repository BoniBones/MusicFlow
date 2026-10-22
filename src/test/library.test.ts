import { beforeEach, describe, expect, it } from 'vitest';
import { db, uid } from '../services/db';
import {
  createCollection,
  deleteCollection,
  deleteScore,
  ensureDefaultCollections,
  renameCollection,
  toggleFavorite,
  updateScore,
} from '../services/libraryRepo';
import { EMPTY_FILTER, filterScores, matchesQuery, parseFileName, sortScores } from '../library/query';
import { createBackup, restoreBackup } from '../services/backup';
import type { Score } from '../types';

function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    id: uid(),
    title: 'Fantaisie-Impromptu Op. 66',
    composer: 'Frédéric Chopin',
    genre: 'Romantic',
    difficulty: 5,
    tags: ['impromptu', 'polyrythm'],
    collectionIds: [],
    favorite: false,
    notes: 'Practise 4 against 3 slowly',
    kind: 'pdf',
    pageCount: 8,
    fileName: 'Fantaisie Impromptu - Chopin Op.66.pdf',
    fileSize: 663111,
    createdAt: 1000,
    ...overrides,
  };
}

describe('Library query & metadata helpers', () => {
  it('extracts title and composer from common filename patterns', () => {
    expect(parseFileName('Fantaisie Impromptu - Chopin Op.66.pdf')).toEqual({
      title: 'Fantaisie Impromptu',
      composer: 'Chopin Op.66',
    });
    expect(parseFileName('Moonlight Sonata – Beethoven (1).pdf')).toEqual({
      title: 'Moonlight Sonata',
      composer: 'Beethoven',
    });
    expect(parseFileName('Clair de Lune by Claude Debussy.pdf')).toEqual({
      title: 'Clair de Lune',
      composer: 'Claude Debussy',
    });
  });

  it('performs accent-insensitive full-text search across title, composer, tags, and notes', () => {
    const s = makeScore();
    expect(matchesQuery(s, 'frederic chopin')).toBe(true);
    expect(matchesQuery(s, 'polyrhythm')).toBe(false);
    expect(matchesQuery(s, 'polyrythm slowly')).toBe(true);
    expect(matchesQuery(s, 'op. 66 romantic')).toBe(true);
  });

  it('filters and sorts scores by multiple criteria', () => {
    const a = makeScore({ id: 'a', title: 'Ballade No. 1', composer: 'Chopin', difficulty: 5, favorite: true, createdAt: 100 });
    const b = makeScore({ id: 'b', title: 'Arabesque No. 1', composer: 'Debussy', genre: 'Impressionist', difficulty: 3, createdAt: 300 });
    const c = makeScore({ id: 'c', title: 'Für Elise', composer: 'Beethoven', genre: 'Classical', difficulty: 2, createdAt: 200 });

    expect(filterScores([a, b, c], { ...EMPTY_FILTER, favoritesOnly: true }).map((s) => s.id)).toEqual(['a']);
    expect(filterScores([a, b, c], { ...EMPTY_FILTER, genre: 'Impressionist' }).map((s) => s.id)).toEqual(['b']);
    expect(filterScores([a, b, c], { ...EMPTY_FILTER, difficulty: 2 }).map((s) => s.id)).toEqual(['c']);

    expect(sortScores([a, b, c], 'title').map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(sortScores([a, b, c], 'composer').map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(sortScores([a, b, c], 'difficulty').map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(sortScores([a, b, c], 'createdAt').map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('IndexedDB persistence & backup round-trip', () => {
  beforeEach(async () => {
    await Promise.all([
      db.scores.clear(),
      db.files.clear(),
      db.collections.clear(),
      db.prefs.clear(),
      db.bookmarks.clear(),
      db.sections.clear(),
      db.annotations.clear(),
      db.kv.clear(),
    ]);
  });

  it('seeds default collections once and manages collection lifecycle', async () => {
    await ensureDefaultCollections();
    const initial = await db.collections.toArray();
    expect(initial.length).toBe(6);

    const custom = await createCollection('Recital 2027');
    await renameCollection(custom.id, 'Spring Recital');
    const updated = await db.collections.get(custom.id);
    expect(updated?.name).toBe('Spring Recital');

    const score = makeScore({ collectionIds: [custom.id] });
    await db.scores.add(score);
    await deleteCollection(custom.id);
    const scoreAfter = await db.scores.get(score.id);
    expect(scoreAfter?.collectionIds).toEqual([]);
  });

  it('updates, favourites, backs up, and restores scores with their files and bookmarks', async () => {
    const score = makeScore();
    await db.scores.add(score);
    await db.files.add({
      id: `${score.id}:0`,
      scoreId: score.id,
      index: 0,
      blob: new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }),
      mimeType: 'application/pdf',
      name: score.fileName,
    });
    await db.bookmarks.add({
      id: uid(),
      scoreId: score.id,
      label: 'Coda',
      color: '#f59e0b',
      position: { page: 4, y: 0.5 },
      createdAt: Date.now(),
    });

    await toggleFavorite(score);
    await updateScore(score.id, { title: 'Fantaisie-Impromptu (Edited)' });
    expect((await db.scores.get(score.id))?.favorite).toBe(true);
    expect((await db.scores.get(score.id))?.title).toBe('Fantaisie-Impromptu (Edited)');

    const backupBlob = await createBackup();
    await deleteScore(score.id);
    expect(await db.scores.count()).toBe(0);
    expect(await db.bookmarks.count()).toBe(0);

    const summary = await restoreBackup(backupBlob, 'replace');
    expect(summary.scoresAdded).toBe(1);
    expect((await db.scores.get(score.id))?.title).toBe('Fantaisie-Impromptu (Edited)');
    expect(await db.bookmarks.count()).toBe(1);
  });
});
