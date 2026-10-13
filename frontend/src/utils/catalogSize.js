// How many products the catalog had the last time we loaded it. Used ONLY
// to size the loading placeholders (ProductGrid) so a store with one product
// shows one placeholder — not a hardcoded six that then collapse into a
// single card. Never used for anything the customer is shown as a count.
const KEY = 'satvex_catalog_size';
const MAX_PLACEHOLDERS = 6;

export function getKnownProductCount() {
  try {
    const n = Number(localStorage.getItem(KEY));
    if (Number.isInteger(n) && n >= 1) return Math.min(n, MAX_PLACEHOLDERS);
  } catch {
    // storage unavailable (private mode etc.) — fall through to the default
  }
  // First visit / unknown: one placeholder never overstates the catalog.
  return 1;
}

export function rememberProductCount(count) {
  try {
    if (Number.isInteger(count) && count >= 1) localStorage.setItem(KEY, String(count));
  } catch {
    // ignore
  }
}
