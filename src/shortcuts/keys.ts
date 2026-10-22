import type { ShortcutAction } from '../types';

/** Converts a KeyboardEvent into a canonical combo string such as "Ctrl+=", "Space", "m", "ArrowRight". */
export function eventToCombo(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string {
  let key = e.key;
  if (key === ' ' || key === 'Spacebar') key = 'Space';
  if (key.length === 1) key = key.toLowerCase();
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  // Shift is implied by printable characters ('+', '?', 'M'); only record it for named keys.
  if (e.shiftKey && key.length > 1 && key !== 'Shift') mods.push('Shift');
  return [...mods, key].join('+');
}

export function isModifierOnly(key: string): boolean {
  return ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'OS'].includes(key);
}

/** True if the event originates from a control where keys must keep their normal meaning. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target as HTMLElement).tagName) return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    // Range sliders and checkboxes don't consume letters, but arrow keys do move sliders.
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type);
  }
  return false;
}

export function findAction(combo: string, map: Record<ShortcutAction, string[]>): ShortcutAction | null {
  for (const [action, combos] of Object.entries(map) as [ShortcutAction, string[]][]) {
    if (combos.some((c) => c.toLowerCase() === combo.toLowerCase())) return action;
  }
  return null;
}

export function formatCombo(combo: string): string {
  const pretty: Record<string, string> = {
    ArrowRight: '→',
    ArrowLeft: '←',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Escape: 'Esc',
    PageDown: 'PgDn',
    PageUp: 'PgUp',
  };
  return splitCombo(combo)
    .map((p) => pretty[p] ?? (p.length === 1 ? p.toUpperCase() : p))
    .join(' + ');
}

/** Splits "Ctrl+=" → ["Ctrl", "="], handling a literal "+" key ("+", "Ctrl++"). */
export function splitCombo(combo: string): string[] {
  if (combo === '+') return ['+'];
  if (combo.endsWith('++')) return [...combo.slice(0, -2).split('+'), '+'];
  return combo.split('+');
}
