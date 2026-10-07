// Server-side formatting helpers (fixed time zone => no hydration mismatches).
import { displayTimeZone } from './admin.js';

export function fmtDateTime(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: displayTimeZone(),
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(d));
}

export function fmtDate(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: displayTimeZone(), day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(d));
}

/** YYYY-MM-DD in the admin time zone (for <input type="date">). */
export function dateInputValue(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: displayTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(d));
}

export function effectiveStatus(k) {
  if (k.status === 'revoked') return 'revoked';
  if (k.expires_at && new Date(k.expires_at).getTime() <= Date.now()) return 'expired';
  return 'active';
}
