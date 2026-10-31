import { api } from '../services/apiClient';

// Cart / checkout errors must never be silent: they are printed to the console while developing and sent to our
// own logs (POST /client-errors) in production. Best effort: reporting an error can never itself throw or loop.
export function reportError(area, err, extra = {}) {
  try {
    if (import.meta.env.DEV) console.error(`[${area}]`, err, extra);
    if (import.meta.env.PROD) {
      api
        .post('/client-errors', {
          area,
          message: String(err?.message || err || 'Unknown error').slice(0, 300),
          status: Number.isInteger(err?.status) ? err.status : undefined,
          code: err?.code ? String(err.code).slice(0, 60) : undefined,
          path: typeof window !== 'undefined' ? window.location.pathname.slice(0, 200) : undefined,
          ...extra,
        })
        .catch(() => {});
    }
  } catch {
    // never let error reporting break the page
  }
}
