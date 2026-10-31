import { useEffect, useRef, useState } from 'react';

/** true for a moment each time `count` goes UP (a small scale bump on the bag badge); never on first render. */
export function useCountBump(count, ms = 450) {
  const [bump, setBump] = useState(false);
  const previous = useRef(count);
  useEffect(() => {
    const rose = count > previous.current;
    previous.current = count;
    if (!rose) return undefined;
    setBump(true);
    const timer = window.setTimeout(() => setBump(false), ms);
    return () => window.clearTimeout(timer);
  }, [count, ms]);
  return bump;
}
