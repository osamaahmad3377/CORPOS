// Small fetch wrapper for the Laravel API (Bearer-token auth).
const BASE = import.meta.env.VITE_API_URL || '/api/v1';
const TOKEN_KEY = 'corepos_token';

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || {};
  }
}

// Several businesses on one computer (mart, restaurant…): the open one is
// remembered here and sent as X-Business; each has its own sign-in token.
const BUSINESS_KEY = 'corepos_business';
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export const business = {
  get: () => Math.max(1, Number(safe(() => localStorage.getItem(BUSINESS_KEY))) || 1),
  set: (id) => safe(() => localStorage.setItem(BUSINESS_KEY, String(id))),
};

const tokenKey = (id = business.get()) => (id === 1 ? TOKEN_KEY : `${TOKEN_KEY}:${id}`);

export const token = {
  get: (id) => safe(() => localStorage.getItem(tokenKey(id))),
  set: (t, id) => safe(() => localStorage.setItem(tokenKey(id), t)),
  clear: (id) => safe(() => localStorage.removeItem(tokenKey(id))),
  // signing out signs out of every business on this computer
  clearAll: () => safe(() => Object.keys(localStorage).filter((k) => k === TOKEN_KEY || k.startsWith(`${TOKEN_KEY}:`)).forEach((k) => localStorage.removeItem(k))),
};

// Open another business: sign the same person in there, then reload so every
// screen, setting, logo and colour comes from that business.
export async function switchBusiness(id) {
  const res = await request('POST', `/businesses/${id}/switch`);
  token.set(res.token, id);
  business.set(id);
  window.location.assign('/');
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function toQuery(params) {
  if (!params) return '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function request(method, path, { body, params, form } = {}) {
  const headers = { Accept: 'application/json' };
  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  const b = business.get();
  if (b !== 1) headers['X-Business'] = String(b);

  let payload;
  if (form) {
    payload = form; // FormData (file uploads) — browser sets the boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}${toQuery(params)}`, { method, headers, body: payload });
  } catch {
    throw new ApiError('Cannot reach the POS engine. Please restart CorePOS.', 0);
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (res.status === 401 && t) onUnauthorized();
  if (!res.ok) {
    const errors = data?.errors || {};
    const first = Object.values(errors)[0];
    const message = (Array.isArray(first) ? first[0] : null) || data?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, errors);
  }
  return data;
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path, body) => request('DELETE', path, { body }),
  upload: (path, form) => request('POST', path, { form }),
};

// Laravel paginator -> { rows, meta }
export function paged(res) {
  return { rows: res?.data || [], meta: res?.meta || null };
}
