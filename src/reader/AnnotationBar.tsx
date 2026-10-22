import { Pen, Highlighter, Type, Eraser, Undo2, Redo2, Trash2, X } from 'lucide-react';
import type { AnnotationTool } from '../types';

export interface AnnotationBarProps {
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: AnnotationTool) => void;
  onSelectColor: (color: string) => void;
  onSelectWidth: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearPage: () => void;
  onClose: () => void;
}

export const ANNOTATION_COLORS = [
  { value: '#dc2626', label: 'Crimson' },
  { value: '#2563eb', label: 'Cobalt' },
  { value: '#d97706', label: 'Amber' },
  { value: '#16a34a', label: 'Emerald' },
  { value: '#9333ea', label: 'Violet' },
  { value: '#1c1917', label: 'Ink Black' },
];

export const STROKE_WIDTHS = [
  { value: 0.0022, label: 'Fine' },
  { value: 0.0038, label: 'Medium' },
  { value: 0.0065, label: 'Bold' },
];

export function AnnotationBar({
  tool,
  color,
  strokeWidth,
  canUndo,
  canRedo,
  onSelectTool,
  onSelectColor,
  onSelectWidth,
  onUndo,
  onRedo,
  onClearPage,
  onClose,
}: AnnotationBarProps) {
  const tools: { id: AnnotationTool; label: string; icon: typeof Pen }[] = [
    { id: 'pen', label: 'Pencil', icon: Pen },
    { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
    { id: 'text', label: 'Text Note', icon: Type },
    { id: 'eraser', label: 'Eraser', icon: Eraser },
  ];

  return (
    <div
      data-testid="annotation-toolbar"
      className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-2xl bg-stone-900/95 text-stone-100 border border-amber-500/40 shadow-2xl backdrop-blur-md text-xs select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tool buttons */}
      <div className="flex items-center gap-1 pr-2 border-r border-stone-700">
        {tools.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`annot-tool-${t.id}`}
              onClick={() => onSelectTool(t.id)}
              title={t.label}
              className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 font-medium transition-colors ${
                active
                  ? 'bg-amber-500 text-stone-950 font-semibold'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Colors */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-stone-700">
        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={c.label}
            title={c.label}
            onClick={() => onSelectColor(c.value)}
            style={{ backgroundColor: c.value }}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${
              color === c.value ? 'border-white scale-115 shadow' : 'border-stone-600 hover:scale-105'
            }`}
          />
        ))}
      </div>

      {/* Stroke width */}
      <div className="flex items-center gap-1 pr-2 border-r border-stone-700">
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w.label}
            type="button"
            onClick={() => onSelectWidth(w.value)}
            className={`px-2 py-1 rounded-lg text-[11px] ${
              Math.abs(strokeWidth - w.value) < 0.0005
                ? 'bg-stone-700 text-amber-300 font-semibold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Undo / Redo / Clear */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="annot-undo-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo annotation"
          aria-label="Undo annotation"
          className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid="annot-redo-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo annotation"
          aria-label="Redo annotation"
          className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid="annot-clear-page-btn"
          onClick={onClearPage}
          title="Clear current page annotations"
          aria-label="Clear current page annotations"
          className="p-1.5 rounded-lg bg-stone-800 hover:bg-rose-900/60 text-stone-300 hover:text-rose-200"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid="annot-close-btn"
          onClick={onClose}
          title="Exit annotation mode"
          className="ml-1 px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
}
