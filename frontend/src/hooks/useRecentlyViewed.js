import { useEffect, useState } from 'react';

const KEY = 'satvex:recentlyViewed';
const MAX = 8;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Remembers product slugs the visitor opened (most recent first, this browser
 * only) and returns them WITHOUT the current one. Storage failures (private
 * mode, blocked storage) just mean an empty list.
 */
export function useRecentlyViewed(currentSlug) {
  const [slugs, setSlugs] = useState([]);

  useEffect(() => {
    if (!currentSlug) return;
    const before = read();
    setSlugs(before.filter((s) => s !== currentSlug));
    try {
      localStorage.setItem(KEY, JSON.stringify([currentSlug, ...before.filter((s) => s !== currentSlug)].slice(0, MAX)));
    } catch {
      // storage unavailable — the row simply won't persist
    }
  }, [currentSlug]);

  return slugs;
}
