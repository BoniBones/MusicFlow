import { db, uid } from './db';
import type { Annotation, Bookmark, PageAnnotations, PracticeSection, ScorePosition, ScorePrefs } from '../types';

// ---- per-piece preferences ---------------------------------------------------

export async function getPrefs(scoreId: string): Promise<ScorePrefs | undefined> {
  return db.prefs.get(scoreId);
}

/** Shallow-merges preference changes (nested autoScroll/metronome objects are merged too). */
export async function savePrefs(scoreId: string, changes: Partial<Omit<ScorePrefs, 'scoreId'>>): Promise<void> {
  await db.transaction('rw', db.prefs, async () => {
    const prev = (await db.prefs.get(scoreId)) ?? { scoreId, updatedAt: 0 };
    const next: ScorePrefs = {
      ...prev,
      ...changes,
      autoScroll: changes.autoScroll ? { ...prev.autoScroll, ...changes.autoScroll } : prev.autoScroll,
      metronome: changes.metronome ? { ...prev.metronome, ...changes.metronome } : prev.metronome,
      scoreId,
      updatedAt: Date.now(),
    };
    await db.prefs.put(next);
  });
}

// ---- bookmarks ------------------------------------------------------------------

export const BOOKMARK_PRESETS = ['Difficult passage', 'Practise from here', 'Second movement', 'Coda', 'Repeat', 'Page turn'];
export const BOOKMARK_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6'];

export function comparePositions(a: ScorePosition, b: ScorePosition): number {
  return a.page - b.page || a.y - b.y;
}

export async function listBookmarks(scoreId: string): Promise<Bookmark[]> {
  const rows = await db.bookmarks.where('scoreId').equals(scoreId).toArray();
  return rows.sort((a, b) => comparePositions(a.position, b.position));
}

export async function addBookmark(scoreId: string, position: ScorePosition, label: string, color = BOOKMARK_COLORS[0]): Promise<Bookmark> {
  const b: Bookmark = { id: uid(), scoreId, position, label: label.trim() || 'Bookmark', color, createdAt: Date.now() };
  await db.bookmarks.add(b);
  return b;
}

export async function updateBookmark(id: string, changes: Partial<Omit<Bookmark, 'id' | 'scoreId'>>): Promise<void> {
  await db.bookmarks.update(id, changes);
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id);
}

// ---- practice sections ------------------------------------------------------------

export async function addSection(scoreId: string, start: ScorePosition, end: ScorePosition, label: string): Promise<PracticeSection> {
  const [s, e] = comparePositions(start, end) <= 0 ? [start, end] : [end, start];
  const sec: PracticeSection = { id: uid(), scoreId, start: s, end: e, label: label.trim() || 'Section', createdAt: Date.now() };
  await db.sections.add(sec);
  return sec;
}

export async function updateSection(id: string, changes: Partial<Omit<PracticeSection, 'id' | 'scoreId'>>): Promise<void> {
  await db.sections.update(id, changes);
}

export async function deleteSection(id: string): Promise<void> {
  await db.sections.delete(id);
}

// ---- annotations ----------------------------------------------------------------------

export function annotationKey(scoreId: string, page: number): string {
  return `${scoreId}:${page}`;
}

export async function loadAnnotations(scoreId: string): Promise<Map<number, Annotation[]>> {
  const rows = await db.annotations.where('scoreId').equals(scoreId).toArray();
  return new Map(rows.map((r) => [r.page, r.items]));
}

export async function savePageAnnotations(scoreId: string, page: number, items: Annotation[]): Promise<void> {
  const row: PageAnnotations = { id: annotationKey(scoreId, page), scoreId, page, items };
  if (items.length === 0) await db.annotations.delete(row.id);
  else await db.annotations.put(row);
}

export async function clearAnnotations(scoreId: string): Promise<void> {
  await db.annotations.where('scoreId').equals(scoreId).delete();
}
