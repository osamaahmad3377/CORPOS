// White-label theming: the shop picks one brand colour (Settings → Brand &
// look) and we derive the whole brand-50…900 scale from it, overriding the
// Tailwind --color-brand-* variables so every button/badge/link follows.
// Light/dark mode is a per-computer choice (like language), defaulting to
// the shop setting.

export const DEFAULT_BRAND = '#1BD173'; // CorePOS green (logo colour)

export const BRAND_PRESETS = [
  { name: 'CorePOS green', hex: '#1bd173' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Sky', hex: '#0284c7' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Brown', hex: '#92400e' },
  { name: 'Charcoal', hex: '#334155' },
  { name: 'Black', hex: '#18181b' },
];

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${Math.max(0, Math.min(100, s)).toFixed(1)}% ${Math.max(0, Math.min(100, l)).toFixed(1)}%)`;

// 600 = the chosen colour; lighter/darker steps keep its hue.
export function brandScale(hex) {
  const c = hexToHsl(hex) || hexToHsl(DEFAULT_BRAND);
  const { h, s, l } = c;
  const sat = (k) => s * k;
  const light = onBrand(hex) !== '#ffffff';
  return {
    50: hsl(h, sat(0.9), 97),
    100: hsl(h, sat(0.9), 94),
    200: hsl(h, sat(0.85), 87),
    300: hsl(h, sat(0.85), 77),
    400: hsl(h, sat(0.9), Math.min(l + 14, 68)),
    500: hsl(h, s, Math.min(l + 6, 60)),
    600: hex,
    // 700+ are used for brand-coloured text on white: a bright brand colour
    // (one that needs dark text on it) gets deeper shades so text stays readable.
    700: hsl(h, s, Math.max(l - (light ? 18 : 8), 12)),
    800: hsl(h, s, Math.max(l - (light ? 26 : 16), 9)),
    900: hsl(h, s, Math.max(l - (light ? 32 : 24), 7)),
  };
}

// Readable text colour on top of the brand colour. White is the usual
// choice; only when white would be hard to read (contrast below 3:1 — bright
// greens, yellows, limes) the text turns near-black.
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0.2;
  const n = parseInt(m[1], 16);
  const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}
export function onBrand(hex) {
  return 1.05 / (luminance(hex) + 0.05) >= 3 ? '#ffffff' : '#0b1324';
}

export function applyBrand(hex) {
  const root = document.documentElement;
  const scale = brandScale(hex);
  if (root.classList.contains('dark')) {
    // pale brand tints become translucent; dark brand text becomes lighter
    scale[50] = `color-mix(in srgb, ${hex} 16%, transparent)`;
    scale[100] = `color-mix(in srgb, ${hex} 24%, transparent)`;
    scale[200] = `color-mix(in srgb, ${hex} 34%, transparent)`;
    const light = brandScale(hex);
    scale[700] = light[300];
    scale[800] = light[200];
  }
  for (const [k, v] of Object.entries(scale)) root.style.setProperty(`--color-brand-${k}`, v);
  root.style.setProperty('--brand-ink', onBrand(hex));
  root.style.setProperty('--color-brand-ink', onBrand(hex));
}

const MODE_KEY = 'corepos_theme';

export function storedMode() {
  try { return localStorage.getItem(MODE_KEY); } catch { return null; }
}

export function applyMode(mode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', !!dark);
  return !!dark;
}

export function setStoredMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  return applyMode(mode);
}
