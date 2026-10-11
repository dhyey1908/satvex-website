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

async function request(path, { method = 'GET', body, params } = {}) {
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

export const api = {
  get: (path, params) => request(path, { method: 'GET', params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export { ApiError, setAuthToken };
