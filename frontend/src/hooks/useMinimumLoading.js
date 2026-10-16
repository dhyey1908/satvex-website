import { useEffect, useRef, useState } from 'react';
import { GRACE_MS, MIN_VISIBLE_MS, remainingMs } from '../utils/minimumDelay';

/**
 * Wraps an existing `isLoading` flag so its loader never flickers.
 *
 * Returns true while loading, and — if the loader was on screen long enough to
 * be noticed (GRACE_MS) — keeps returning true until it has been up for
 * MIN_VISIBLE_MS. It never reports false while `isLoading` is still true, and
 * it adds no delay at all when the data arrives within the grace window.
 */
export function useMinimumLoading(isLoading, { grace = GRACE_MS, min = MIN_VISIBLE_MS } = {}) {
  const [holding, setHolding] = useState(false);
  const shownAt = useRef(null);

  useEffect(() => {
    if (isLoading) {
      if (shownAt.current != null) return undefined;
      const t = setTimeout(() => {
        shownAt.current = Date.now();
        setHolding(true);
      }, grace);
      return () => clearTimeout(t);
    }
    if (shownAt.current == null) return undefined;
    const t = setTimeout(() => {
      shownAt.current = null;
      setHolding(false);
    }, remainingMs(shownAt.current, min));
    return () => clearTimeout(t);
  }, [isLoading, grace, min]);

  return isLoading || holding;
}
