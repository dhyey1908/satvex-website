import { useEffect, useState } from 'react';
import { isMediaPreloaded, preloadMedia } from '../utils/mediaPreload';

/**
 * Returns the src to actually render for an image that can switch targets
 * (color variant, gallery thumbnail, etc.) — it keeps showing the previous
 * src until the newly-requested one has finished loading, then swaps, so
 * callers never have a moment with nothing loaded to display. Pair with
 * AnimatePresence in its default (sync) mode, not mode="wait", so the old
 * and new image can crossfade instead of the old fully exiting first.
 */
export function usePreloadedImage(targetSrc) {
  const [displaySrc, setDisplaySrc] = useState(targetSrc);

  useEffect(() => {
    if (!targetSrc || isMediaPreloaded(targetSrc)) {
      setDisplaySrc(targetSrc);
      return undefined;
    }
    let cancelled = false;
    preloadMedia(targetSrc).then(() => {
      if (!cancelled) setDisplaySrc(targetSrc);
    });
    return () => {
      cancelled = true;
    };
  }, [targetSrc]);

  return displaySrc;
}
