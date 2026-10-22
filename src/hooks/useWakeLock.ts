import { useEffect, useState } from 'react';

/**
 * Requests a Screen Wake Lock while `enabled` is true so the tablet/laptop
 * display does not dim or sleep mid-piece. Automatically re-acquires when the
 * tab returns to the foreground and degrades gracefully on browsers without
 * `navigator.wakeLock`.
 */
export function useWakeLock(enabled: boolean): { active: boolean; supported: boolean } {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled || !supported) {
      setActive(false);
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        setActive(true);
        sentinel.addEventListener('release', () => {
          if (!cancelled) setActive(false);
        });
      } catch {
        if (!cancelled) setActive(false);
      }
    };

    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
      setActive(false);
    };
  }, [enabled, supported]);

  return { active, supported };
}
