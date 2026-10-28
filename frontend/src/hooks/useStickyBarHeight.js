import { useEffect } from 'react';

// Publishes a fixed bottom bar's real height as --sticky-bar-h so the page can
// reserve exactly that much room and never have its last content covered.
// The bar element is looked up through the ref on every size change.
export function useStickyBarHeight(ref) {
  useEffect(() => {
    const bar = ref.current;
    if (!bar || !('ResizeObserver' in window)) return undefined;
    const set = () => document.documentElement.style.setProperty('--sticky-bar-h', `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--sticky-bar-h');
    };
  });
}
