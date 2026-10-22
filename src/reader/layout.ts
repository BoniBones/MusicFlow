import type { FitMode, ScorePosition, ViewMode } from '../types';
import type { PageSize } from '../rendering/scoreDocument';

export interface PageBox {
  index: number;
  top: number;
  left: number;
  width: number;
  height: number;
  /** Display scale relative to the page's 100% size. */
  scale: number;
}

export interface Layout {
  pages: PageBox[]; // continuous: every page; paged: only the pages of the current spread
  totalWidth: number;
  totalHeight: number;
}

export interface LayoutInput {
  sizes: PageSize[];
  viewMode: ViewMode;
  fitMode: FitMode;
  zoom: number; // used when fitMode === 'custom' (1 = 100%)
  containerWidth: number;
  containerHeight: number;
  padding: number; // outer padding in CSS px
  gap: number; // space between pages
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Pages shown together in paged modes. Spread mode pairs pages 1–2, 3–4, … */
export function spreadsFor(pageCount: number, viewMode: ViewMode): number[][] {
  if (viewMode === 'spread') {
    const out: number[][] = [];
    for (let i = 0; i < pageCount; i += 2) out.push(i + 1 < pageCount ? [i, i + 1] : [i]);
    return out;
  }
  return Array.from({ length: pageCount }, (_, i) => [i]);
}

export function spreadIndexOfPage(page: number, viewMode: ViewMode): number {
  return viewMode === 'spread' ? Math.floor(page / 2) : page;
}

/** Scale that makes a row of pages (one or two side by side) fit according to the fit mode. */
function rowScale(sizes: PageSize[], fitMode: FitMode, zoom: number, availW: number, availH: number, gap: number): number {
  if (fitMode === 'custom') return zoom;
  const rowW = sizes.reduce((n, s) => n + s.width, 0);
  const rowH = Math.max(...sizes.map((s) => s.height));
  const w = Math.max(50, availW - gap * (sizes.length - 1));
  const byWidth = w / rowW;
  if (fitMode === 'width') return byWidth;
  return Math.min(byWidth, Math.max(50, availH) / rowH);
}

/**
 * Pure layout computation. All positions are in CSS pixels relative to the
 * scrollable content box. Pages are never stretched — width and height always
 * share one scale factor, so notation keeps its proportions.
 */
export function computeLayout(input: LayoutInput, spread?: number[]): Layout {
  const { sizes, viewMode, fitMode, zoom, containerWidth, containerHeight, padding, gap } = input;
  const availW = containerWidth - padding * 2;
  const availH = containerHeight - padding * 2;
  const pages: PageBox[] = [];

  if (viewMode === 'continuous') {
    let y = padding;
    let maxW = 0;
    sizes.forEach((s, index) => {
      const scale = rowScale([s], fitMode, zoom, availW, availH, gap);
      const width = s.width * scale;
      const height = s.height * scale;
      pages.push({ index, top: y, left: 0, width, height, scale });
      y += height + gap;
      maxW = Math.max(maxW, width);
    });
    const totalWidth = Math.max(containerWidth, maxW + padding * 2);
    for (const p of pages) p.left = (totalWidth - p.width) / 2;
    return { pages, totalWidth, totalHeight: Math.max(0, y - gap + padding) };
  }

  const indices = spread ?? [0];
  const rowSizes = indices.map((i) => sizes[i]).filter(Boolean);
  if (rowSizes.length === 0) return { pages, totalWidth: containerWidth, totalHeight: containerHeight };
  const scale = rowScale(rowSizes, fitMode, zoom, availW, availH, gap);
  const rowW = rowSizes.reduce((n, s) => n + s.width * scale, 0) + gap * (rowSizes.length - 1);
  const rowH = Math.max(...rowSizes.map((s) => s.height * scale));
  const totalWidth = Math.max(containerWidth, rowW + padding * 2);
  const totalHeight = Math.max(containerHeight, rowH + padding * 2);
  let x = (totalWidth - rowW) / 2;
  const top = Math.max(padding, (totalHeight - rowH) / 2);
  indices.forEach((index, k) => {
    const s = rowSizes[k];
    pages.push({ index, top, left: x, width: s.width * scale, height: s.height * scale, scale });
    x += s.width * scale + gap;
  });
  return { pages, totalWidth, totalHeight };
}

/** Converts a zoom-independent score position into a content offset (CSS px). */
export function positionToOffset(pos: ScorePosition, layout: Layout): number {
  const p = layout.pages.find((b) => b.index === pos.page) ?? layout.pages[0];
  if (!p) return 0;
  return p.top + Math.min(1, Math.max(0, pos.y)) * p.height;
}

/** Converts a content offset into a score position. Offsets in the gap belong to the following page. */
export function offsetToPosition(offset: number, layout: Layout): ScorePosition {
  const pages = layout.pages;
  if (pages.length === 0) return { page: 0, y: 0 };
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pages[mid].top <= offset) lo = mid;
    else hi = mid - 1;
  }
  const p = pages[lo];
  if (offset > p.top + p.height && lo + 1 < pages.length) {
    return { page: pages[lo + 1].index, y: 0 };
  }
  return { page: p.index, y: Math.min(1, Math.max(0, (offset - p.top) / p.height)) };
}

/** The page box covering an offset (or nearest). */
export function pageAtOffset(offset: number, layout: Layout): PageBox | undefined {
  const pos = offsetToPosition(offset, layout);
  return layout.pages.find((p) => p.index === pos.page);
}

/** Indices of pages intersecting [top, bottom]. */
export function visiblePages(layout: Layout, top: number, bottom: number): number[] {
  const out: number[] = [];
  for (const p of layout.pages) {
    if (p.top + p.height >= top && p.top <= bottom) out.push(p.index);
  }
  return out;
}

/** Fraction of the viewport height where "the music being played" is assumed to sit. */
export const READING_LINE = 0.2;
