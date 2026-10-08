const moneyFmt = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });

export function money(v) {
  const n = Number(v || 0);
  return `Rs ${moneyFmt.format(Math.round(n * 100) / 100)}`;
}

export function num(v) {
  return moneyFmt.format(Number(v || 0));
}

// 2 -> "2", 1.5 -> "1.5", 0.333333 -> "0.333"
export function qty(v) {
  const n = Math.round(Number(v || 0) * 1000) / 1000;
  return String(n);
}

export function round3(v) {
  return Math.round(Number(v || 0) * 1000) / 1000;
}

// In Urdu mode dates are all digits (08/10/2026, 16:32) — no English month names.
const isUrdu = () => typeof document !== 'undefined' && document.documentElement.lang === 'ur';

export function date(v) {
  if (!v) return '';
  const d = new Date(v);
  return isUrdu()
    ? d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  return isUrdu()
    ? d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "Red / XL", or "" when a variant has no options
export function variantLabel(v) {
  return [v?.color, v?.size].filter((x) => x && x !== '-').join(' / ');
}
