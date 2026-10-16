// The loader runs before the settings API has answered, so the logo from the
// customer's last visit is remembered in localStorage and shown right away.
// Everything is best-effort: private windows / blocked storage just fall back to
// the SATVEX wordmark.
const KEY = 'satvex_logo_url';

export function getCachedLogoUrl() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function cacheLogoUrl(url) {
  try {
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
