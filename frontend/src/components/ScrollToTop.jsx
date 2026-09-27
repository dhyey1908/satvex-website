import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll position to the top on every route change (path or search),
 * since the browser otherwise preserves scroll across React Router
 * navigations. Mounted once at the app root so it covers every route,
 * including nested layouts (account, admin, checkout).
 */
export function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return null;
}
