const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const TOKEN_STORAGE_KEY = 'satvex_auth_token';

// The httpOnly cookie is the normal auth path, but privacy-hardened
// browsers (Incognito/private windows, Safari ITP, "block third-party
// cookies" settings) can silently drop a cross-site cookie even though the
// frontend (CloudFront) and API (API Gateway) are different origins and the
// cookie is set with SameSite=None; Secure — login appears to succeed, then
// every subsequent request 401s with no cookie ever having been sent. The
// backend already accepts a Bearer token as a first-class alternative (see
// middleware/auth.js's getTokenFromRequest, checked before the cookie) —
// this just makes the frontend actually use the token login/register
// already return instead of silently discarding it.
let authToken = null;
try {
  authToken = localStorage.getItem(TOKEN_STORAGE_KEY);
} catch {
  // localStorage unavailable (disabled, quota, etc.) — token auth falls
  // back to cookie-only for this session, same as before this change.
}

function setAuthToken(token) {
  authToken = token || null;
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore — in-memory token still works for the rest of this session
  }
}

class ApiError extends Error {
  constructor(message, code, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    // Per-field validation errors from the backend (Zod), e.g.
    // [{ path: 'email', message: 'Invalid email' }] — see utils/formErrors.js
    // for turning this into a { fieldName: message } map for a form's state.
    this.details = details || null;
  }
}

async function doFetch(path, { method = 'GET', body, params } = {}) {
  let url = `${API_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // no body
  }

  if (!res.ok || !payload?.success) {
    const message = payload?.error?.message || 'Something went wrong. Please try again.';
    const code = payload?.error?.code || 'UNKNOWN_ERROR';
    throw new ApiError(message, code, res.status, payload?.error?.details);
  }

  return payload.data;
}

// A 401 here almost always just means the short-lived access token expired
// — not that the user is actually logged out, since the long-lived refresh
// cookie (see authController.refresh) is very likely still good. Rather
// than surfacing that as an error (which would force a fresh OTP), try one
// silent refresh-and-retry first. This is the whole point of the
// access/refresh split: it's what lets a returning device go up to ~2
// years between real OTP sends instead of needing one every time the
// access token lapses.
const NO_REFRESH_RETRY_PATHS = new Set(['/auth/login', '/auth/register', '/auth/verify-otp', '/auth/refresh', '/auth/logout']);
let refreshPromise = null;

// Several requests can all 401 at the same moment (e.g. a page firing a
// few parallel calls right as the access token expires). The refresh
// token is single-use/rotated, so two independent refresh calls would
// make the second one look like a replay of an already-rotated token and
// wrongly trigger reuse-detection (logging the user out everywhere). This
// dedup makes every concurrent caller await the SAME in-flight refresh.
function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = doFetch('/auth/refresh', { method: 'POST' })
      .then((data) => {
        setAuthToken(data.token);
        return true;
      })
      .catch(() => {
        setAuthToken(null);
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request(path, options = {}) {
  try {
    return await doFetch(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !NO_REFRESH_RETRY_PATHS.has(path)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return doFetch(path, options);
    }
    throw err;
  }
}

export const api = {
  get: (path, params) => request(path, { method: 'GET', params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export { ApiError, setAuthToken };
