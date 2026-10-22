import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clampCanvasSize, RenderCancelledError, type ScoreDocument } from '../rendering/scoreDocument';
import type { PageBox } from './layout';
import type { Annotation, AnnotationTool, PaperTone, ScorePosition, StrokeAnnotation, TextAnnotation } from '../types';
import { uid } from '../services/db';

export interface PageViewProps {
  doc: ScoreDocument;
  box: PageBox;
  paperTone: PaperTone;
  eager?: boolean;
  annotations: Annotation[];
  annotationMode: boolean;
  activeTool: AnnotationTool;
  activeColor: string;
  strokeWidth: number; // normalized fraction of page width, e.g. 0.003
  textSize: number; // normalized fraction of page width, e.g. 0.022
  onChangeAnnotations: (page: number, next: Annotation[]) => void;
  pickPositionMode?: 'marker' | 'bookmark' | 'sectionStart' | 'sectionEnd' | null;
  onPickPosition?: (pos: ScorePosition) => void;
}

const PAPER_BG: Record<PaperTone, string> = {
  white: '#ffffff',
  warm: '#fbf8f1',
  dim: '#e7e5e0',
};

export function PageView({
  doc,
  box,
  paperTone,
  eager = false,
  annotations,
  annotationMode,
  activeTool,
  activeColor,
  strokeWidth,
  textSize,
  onChangeAnnotations,
  pickPositionMode,
  onPickPosition,
}: PageViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scoreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inView, setInView] = useState(eager);
  const [renderedOnce, setRenderedOnce] = useState(false);
  const draftStrokeRef = useRef<StrokeAnnotation | null>(null);
  const erasingRef = useRef(false);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);

  // Observe visibility so 50+ page scores stay snappy
  useEffect(() => {
    if (eager) {
      setInView(true);
      return;
    }
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === el) setInView(entry.isIntersecting);
        }
      },
      { rootMargin: '1000px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  // Render the score bitmap at crisp device pixel resolution
  useEffect(() => {
    if (!inView) return;
    const canvas = scoreCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    const { w, h } = clampCanvasSize(box.width * dpr, box.height * dpr);
    const ac = new AbortController();
    const delay = renderedOnce ? 70 : 0;
    const timer = window.setTimeout(() => {
      doc
        .renderPage(box.index, canvas, w, h, ac.signal)
        .then(() => {
          if (!ac.signal.aborted) setRenderedOnce(true);
        })
        .catch((err) => {
          if (err instanceof RenderCancelledError || (err as Error)?.name === 'AbortError') return;
          console.error('Page render error:', err);
        });
    }, delay);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [doc, box.index, box.width, box.height, inView, renderedOnce]);

  // Paint annotations onto the overlay canvas
  const paintAnnotations = () => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pw = Math.max(1, Math.round(box.width * dpr));
    const ph = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, pw, ph);

    const all = draftStrokeRef.current ? [...annotations, draftStrokeRef.current] : annotations;
    for (const item of all) {
      if (item.type === 'pen' || item.type === 'highlighter') {
        const pts = item.points;
        if (pts.length < 2) continue;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = item.color;
        ctx.lineWidth = Math.max(1.5, item.width * pw);
        ctx.globalAlpha = item.type === 'highlighter' ? 0.34 : 0.92;
        ctx.beginPath();
        ctx.moveTo(pts[0] * pw, pts[1] * ph);
        if (pts.length === 2) {
          ctx.lineTo(pts[0] * pw + 0.5, pts[1] * ph + 0.5);
        } else {
          for (let i = 2; i < pts.length; i += 2) {
            ctx.lineTo(pts[i] * pw, pts[i + 1] * ph);
          }
        }
        ctx.stroke();
        ctx.restore();
      } else if (item.type === 'text') {
        ctx.save();
        const fontPx = Math.max(11, Math.round(item.size * pw));
        ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = item.color;
        ctx.textBaseline = 'top';
        const lines = item.text.split('\n');
        lines.forEach((line, idx) => {
          ctx.fillText(line, item.x * pw, item.y * ph + idx * fontPx * 1.2);
        });
        ctx.restore();
      }
    }
  };

  useEffect(() => {
    paintAnnotations();
  });

  const relCoords = (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height)));
    return { x, y };
  };

  const eraseAt = (x: number, y: number) => {
    const radius = 0.025;
    const r2 = radius * radius;
    const filtered = annotations.filter((item) => {
      if (item.type === 'text') {
        const dx = item.x - x;
        const dy = item.y - y;
        return dx * dx + dy * dy > r2 * 2.5;
      }
      for (let i = 0; i < item.points.length; i += 2) {
        const dx = item.points[i] - x;
        const dy = item.points[i + 1] - y;
        if (dx * dx + dy * dy <= r2) return false;
      }
      return true;
    });
    if (filtered.length !== annotations.length) {
      onChangeAnnotations(box.index, filtered);
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = relCoords(e);
    if (pickPositionMode && onPickPosition) {
      e.stopPropagation();
      onPickPosition({ page: box.index, y });
      return;
    }
    if (!annotationMode) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    if (activeTool === 'eraser') {
      erasingRef.current = true;
      eraseAt(x, y);
      return;
    }
    if (activeTool === 'text') {
      setTextDraft({ x, y, value: '' });
      return;
    }
    draftStrokeRef.current = {
      id: uid(),
      type: activeTool === 'highlighter' ? 'highlighter' : 'pen',
      color: activeColor,
      width: activeTool === 'highlighter' ? strokeWidth * 5 : strokeWidth,
      points: [x, y],
    };
    paintAnnotations();
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!annotationMode) return;
    if (erasingRef.current && activeTool === 'eraser') {
      const { x, y } = relCoords(e);
      eraseAt(x, y);
      return;
    }
    const draft = draftStrokeRef.current;
    if (!draft) return;
    const { x, y } = relCoords(e);
    const pts = draft.points;
    const lx = pts[pts.length - 2];
    const ly = pts[pts.length - 1];
    if ((x - lx) * (x - lx) + (y - ly) * (y - ly) > 0.000004) {
      pts.push(x, y);
      paintAnnotations();
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!annotationMode) return;
    if (erasingRef.current) {
      erasingRef.current = false;
      return;
    }
    const draft = draftStrokeRef.current;
    if (!draft) return;
    draftStrokeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onChangeAnnotations(box.index, [...annotations, draft]);
  };

  const commitTextDraft = () => {
    if (!textDraft) return;
    const trimmed = textDraft.value.trim();
    setTextDraft(null);
    if (!trimmed) return;
    const note: TextAnnotation = {
      id: uid(),
      type: 'text',
      color: activeColor,
      x: textDraft.x,
      y: textDraft.y,
      size: textSize,
      text: trimmed,
    };
    onChangeAnnotations(box.index, [...annotations, note]);
  };

  return (
    <div
      ref={containerRef}
      data-testid={`score-page-${box.index + 1}`}
      data-page-index={box.index}
      style={{
        position: 'absolute',
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        backgroundColor: PAPER_BG[paperTone],
      }}
      className="shadow-md rounded-[2px] select-none overflow-hidden transition-shadow"
    >
      <canvas
        ref={scoreCanvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          filter: paperTone === 'warm' ? 'sepia(0.08) brightness(0.99)' : paperTone === 'dim' ? 'brightness(0.92) contrast(0.96)' : 'none',
        }}
      />
      <canvas
        ref={annotCanvasRef}
        data-testid={`annotation-canvas-${box.index + 1}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: annotationMode || pickPositionMode ? 'none' : 'pan-x pan-y',
          pointerEvents: annotationMode || pickPositionMode ? 'auto' : 'none',
          cursor: pickPositionMode
            ? 'crosshair'
            : !annotationMode
              ? 'default'
              : activeTool === 'eraser'
                ? 'cell'
                : activeTool === 'text'
                  ? 'text'
                  : 'crosshair',
        }}
      />
      {textDraft && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(78, textDraft.x * 100)}%`,
            top: `${Math.min(88, textDraft.y * 100)}%`,
          }}
          className="z-20 bg-stone-900/95 text-stone-100 p-1.5 rounded-lg shadow-xl border border-amber-500/50 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            autoFocus
            placeholder="Annotation text…"
            value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTextDraft();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setTextDraft(null);
              }
            }}
            className="bg-stone-800 text-stone-100 text-xs px-2 py-1 rounded border border-stone-700 focus:outline-none focus:border-amber-400 w-40"
          />
          <button
            type="button"
            onClick={commitTextDraft}
            className="px-2 py-1 text-xs font-medium bg-amber-500 text-stone-950 rounded hover:bg-amber-400"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
