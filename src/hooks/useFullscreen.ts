import { useCallback, useEffect, useState, type RefObject } from 'react';

interface VendorDoc extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface VendorEl extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/**
 * True fullscreen hook with fallback: uses the Fullscreen API when available
 * (`requestFullscreen` / `webkitRequestFullscreen`) and falls back to an
 * in-window fullscreen state on browsers/webviews that restrict the API.
 */
export function useFullscreen(targetRef?: RefObject<HTMLElement | null>): {
  fullscreen: boolean;
  toggle: () => Promise<void>;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
} {
  const [pseudo, setPseudo] = useState(false);
  const [nativeFs, setNativeFs] = useState(false);

  useEffect(() => {
    const sync = () => {
      const doc = document as VendorDoc;
      setNativeFs(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = (targetRef?.current ?? document.documentElement) as VendorEl;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        return;
      }
      if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        return;
      }
    } catch {
      /* fall through to pseudo fullscreen */
    }
    setPseudo(true);
  }, [targetRef]);

  const exit = useCallback(async () => {
    const doc = document as VendorDoc;
    try {
      if (doc.fullscreenElement && doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      /* ignore */
    }
    setPseudo(false);
  }, []);

  const toggle = useCallback(async () => {
    if (nativeFs || pseudo) await exit();
    else await enter();
  }, [nativeFs, pseudo, enter, exit]);

  return { fullscreen: nativeFs || pseudo, toggle, enter, exit };
}
