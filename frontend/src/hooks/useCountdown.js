import { useCallback, useEffect, useState } from 'react';

/**
 * A seconds countdown (e.g. "Resend code in 42s"). Based on a fixed end time,
 * so it stays correct if the tab is throttled in the background.
 *   const { seconds, start } = useCountdown();
 *   start(60);   // seconds === 0 means it's finished / never started
 *   clear();     // forget it (e.g. the number changed)
 */
export function useCountdown() {
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(id);
    };
    const id = setInterval(tick, 500);
    tick();
    return () => clearInterval(id);
  }, [endsAt]);

  const start = useCallback((seconds) => {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + Math.max(0, Number(seconds) || 0) * 1000);
  }, []);

  const clear = useCallback(() => setEndsAt(0), []);

  const seconds = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  return { seconds, start, clear };
}

// 125 -> "2:05", 42 -> "0:42"
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
