import type { Difficulty, LibrarySort, Score } from '../types';

export interface LibraryFilter {
  query: string;
  collectionId: string | null; // null = all
  favoritesOnly: boolean;
  genre: string | null;
  difficulty: Difficulty | null;
  tag: string | null;
}

export const EMPTY_FILTER: LibraryFilter = {
  query: '',
  collectionId: null,
  favoritesOnly: false,
  genre: null,
  difficulty: null,
  tag: null,
};

function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Full-text search over all textual metadata. Every query word must match somewhere. */
export function matchesQuery(score: Score, query: string): boolean {
  const q = normalise(query.trim());
  if (!q) return true;
  const haystack = normalise(
    [score.title, score.composer, score.genre, score.notes, score.fileName, ...score.tags].join(' \u0001 '),
  );
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

export function filterScores(scores: Score[], f: LibraryFilter): Score[] {
  return scores.filter((s) => {
    if (f.favoritesOnly && !s.favorite) return false;
    if (f.collectionId && !s.collectionIds.includes(f.collectionId)) return false;
    if (f.genre && s.genre !== f.genre) return false;
    if (f.difficulty !== null && s.difficulty !== f.difficulty) return false;
    if (f.tag && !s.tags.includes(f.tag)) return false;
    return matchesQuery(s, f.query);
  });
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function sortScores(scores: Score[], sort: LibrarySort): Score[] {
  const out = [...scores];
  switch (sort) {
    case 'title':
      out.sort((a, b) => collator.compare(a.title, b.title));
      break;
    case 'composer':
      out.sort((a, b) => collator.compare(a.composer || '\uffff', b.composer || '\uffff') || collator.compare(a.title, b.title));
      break;
    case 'createdAt':
      out.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case 'lastOpenedAt':
      out.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.createdAt - a.createdAt);
      break;
    case 'difficulty':
      out.sort((a, b) => (a.difficulty || 99) - (b.difficulty || 99) || collator.compare(a.title, b.title));
      break;
  }
  return out;
}

/**
 * Derives a title and composer from a file name. Supports the common
 * "Title - Composer.pdf" convention (also "Title – Composer" and "Title by Composer").
 */
export function parseFileName(fileName: string): { title: string; composer: string } {
  let base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  base = base.replace(/\s*\((?:\d+|copy)\)$/i, '').trim();
  const dash = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) return { title: dash[1].trim(), composer: dash[2].trim() };
  const by = base.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { title: by[1].trim(), composer: by[2].trim() };
  return { title: base || 'Untitled score', composer: '' };
}

export function uniqueValues(scores: Score[], pick: (s: Score) => string | string[]): string[] {
  const set = new Set<string>();
  for (const s of scores) {
    const v = pick(s);
    for (const item of Array.isArray(v) ? v : [v]) if (item) set.add(item);
  }
  return [...set].sort((a, b) => collator.compare(a, b));
}
