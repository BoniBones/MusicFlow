import { Keyboard, X } from 'lucide-react';
import { SHORTCUT_LABELS } from '../settings/defaults';
import { formatCombo } from '../shortcuts/keys';
import type { ShortcutAction } from '../types';

export interface ShortcutModalProps {
  shortcuts: Record<ShortcutAction, string[]>;
  onClose: () => void;
}

export function ShortcutModal({ shortcuts, onClose }: ShortcutModalProps) {
  const entries = Object.entries(SHORTCUT_LABELS) as [ShortcutAction, string][];

  return (
    <div
      data-testid="shortcut-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-stone-900 text-stone-100 border border-stone-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts reference"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto divide-y divide-stone-800/80 text-xs">
          {entries.map(([action, label]) => (
            <div key={action} className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-stone-200">{label}</span>
              <div className="flex flex-wrap gap-1.5 justify-end">
                {(shortcuts[action] ?? []).map((combo) => (
                  <kbd
                    key={combo}
                    className="px-2 py-1 rounded-md bg-stone-800 border border-stone-700 font-mono text-[11px] text-amber-300"
                  >
                    {formatCombo(combo)}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-stone-950/60 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between">
          <span>Shortcuts can be customised in Settings → Keyboard Shortcuts.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
