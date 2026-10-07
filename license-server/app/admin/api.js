'use client';

/** Small fetch wrapper for the admin API. Throws Error(message) on failure. */
export async function adminFetch(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/admin/login';
    throw new Error('Session expired. Please log in again.');
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
