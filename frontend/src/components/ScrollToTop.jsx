import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll position to the top on navigation, since the browser
 * otherwise preserves scroll across React Router navigations. Mounted once
 * at the app root so it covers every route, including nested layouts
 * (account, admin, checkout).
 *
 * Fires when the path/search changes, AND when navigating to the very same
 * URL again (e.g. tapping "Cart" while already on /cart) — React Router
 * gives that a fresh `location.key` even though pathname/search are
 * identical, and without this the page would silently stay wherever it was
 * scrolled. A hash-only change (e.g. #reviews) is deliberately left alone —
 * ProductDetail scrolls to its own anchor after navigating.
 */
export function ScrollToTop() {
  const { pathname, search, hash, key } = useLocation();
  const previousUrl = useRef(null);

  useEffect(() => {
    const url = pathname + search;
    const urlChanged = previousUrl.current !== url;
    previousUrl.current = url;
    if (urlChanged || !hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname, search, hash, key]);

  return null;
}
