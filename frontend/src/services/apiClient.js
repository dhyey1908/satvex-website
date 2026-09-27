const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
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

export { ApiError };
