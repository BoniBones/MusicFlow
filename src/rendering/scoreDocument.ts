import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

/** Size of a page in CSS pixels at 100% zoom (1 PDF point = 96/72 CSS px). */
export interface PageSize {
  width: number;
  height: number;
}

/**
 * Format-agnostic score document used by the reader. PDF and image scores
 * implement the same interface, so every reader feature (layout, autoscroll,
 * annotations…) works identically for both.
 */
export interface ScoreDocument {
  readonly pageCount: number;
  readonly pageSizes: PageSize[];
  /** Render a page into a canvas at an exact device-pixel size. Rejects with AbortError when cancelled. */
  renderPage(index: number, canvas: HTMLCanvasElement, pixelWidth: number, pixelHeight: number, signal?: AbortSignal): Promise<void>;
  destroy(): void;
}

export class RenderCancelledError extends Error {
  constructor() {
    super('Render cancelled');
    this.name = 'AbortError';
  }
}

export const CSS_PX_PER_PT = 96 / 72;

// Browsers cap canvas area; stay well below (≈ 4096×4096 on iOS Safari).
export const MAX_CANVAS_PIXELS = 16_777_216;

export function clampCanvasSize(w: number, h: number): { w: number; h: number } {
  const area = w * h;
  if (area <= MAX_CANVAS_PIXELS) return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  const k = Math.sqrt(MAX_CANVAS_PIXELS / area);
  return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)) };
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/** Lazily loads PDF.js and wires up its web worker (rendering happens off the main thread). */
export function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).toString();
}

export async function openPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: assetUrl('pdfjs/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('pdfjs/standard_fonts/'),
    isEvalSupported: false,
  });
  return task.promise;
}

export class PdfScoreDocument implements ScoreDocument {
  readonly pageCount: number;
  readonly pageSizes: PageSize[];
  private pages = new Map<number, Promise<PDFPageProxy>>();
  private doc: PDFDocumentProxy;

  private constructor(doc: PDFDocumentProxy, sizes: PageSize[]) {
    this.doc = doc;
    this.pageCount = doc.numPages;
    this.pageSizes = sizes;
  }

  static async open(data: ArrayBuffer): Promise<PdfScoreDocument> {
    const doc = await openPdfDocument(data);
    const sizes: PageSize[] = [];
    const inst = new PdfScoreDocument(doc, sizes);
    // Page sizes are needed up-front to lay out every page (virtualised rendering).
    const all = await Promise.all(
      Array.from({ length: doc.numPages }, (_, i) => inst.getPage(i)),
    );
    for (const p of all) {
      const vp = p.getViewport({ scale: CSS_PX_PER_PT });
      sizes.push({ width: vp.width, height: vp.height });
    }
    return inst;
  }

  private getPage(index: number): Promise<PDFPageProxy> {
    let p = this.pages.get(index);
    if (!p) {
      p = this.doc.getPage(index + 1);
      this.pages.set(index, p);
    }
    return p;
  }

  async renderPage(index: number, canvas: HTMLCanvasElement, pixelWidth: number, pixelHeight: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new RenderCancelledError();
    const page = await this.getPage(index);
    if (signal?.aborted) throw new RenderCancelledError();
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pixelWidth / base.width });
    // Render into an offscreen canvas first, then blit: the visible canvas
    // keeps its previous (CSS-scaled) content until the sharp version is ready,
    // so zooming never flashes blank pages.
    const off = document.createElement('canvas');
    off.width = pixelWidth;
    off.height = pixelHeight;
    const ctx = off.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    const task: RenderTask = page.render({ canvasContext: ctx, canvas: off, viewport } as Parameters<PDFPageProxy['render']>[0]);
    const onAbort = () => task.cancel();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await task.promise;
    } catch (err) {
      if ((err as Error)?.name === 'RenderingCancelledException' || signal?.aborted) throw new RenderCancelledError();
      throw err;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
    if (signal?.aborted) throw new RenderCancelledError();
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const vctx = canvas.getContext('2d', { alpha: false });
    vctx?.drawImage(off, 0, 0);
    off.width = 0;
    off.height = 0;
  }

  destroy(): void {
    this.pages.clear();
    void this.doc.destroy();
  }
}

export class ImageScoreDocument implements ScoreDocument {
  readonly pageCount: number;
  readonly pageSizes: PageSize[];
  private bitmaps: (ImageBitmap | HTMLImageElement)[];

  private constructor(bitmaps: (ImageBitmap | HTMLImageElement)[]) {
    this.bitmaps = bitmaps;
    this.pageCount = bitmaps.length;
    this.pageSizes = bitmaps.map((b) => ({ width: b.width, height: b.height }));
  }

  static async open(blobs: Blob[]): Promise<ImageScoreDocument> {
    const bitmaps = await Promise.all(blobs.map(decodeImage));
    return new ImageScoreDocument(bitmaps);
  }

  async renderPage(index: number, canvas: HTMLCanvasElement, pixelWidth: number, pixelHeight: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new RenderCancelledError();
    const img = this.bitmaps[index];
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);
  }

  destroy(): void {
    for (const b of this.bitmaps) if ('close' in b) b.close();
    this.bitmaps = [];
  }
}

export async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Renders a JPEG thumbnail of a page, ~`targetWidth` px wide. */
export async function renderThumbnail(doc: ScoreDocument, targetWidth = 360): Promise<Blob | undefined> {
  const size = doc.pageSizes[0];
  if (!size) return undefined;
  const w = targetWidth;
  const h = Math.round((size.height / size.width) * w);
  const canvas = document.createElement('canvas');
  await doc.renderPage(0, canvas, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.82));
}
