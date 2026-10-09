// Vite plugin: makes the built CSS readable by older Chromium too.
//
// Tailwind 4 writes its colour palette as oklch() and gradients as
// "to right in oklab" — both need Chrome 111+. CorePOS also ships a Windows
// 7/8 build on Electron 22 (Chrome 108), where those colours would simply
// vanish. This turns every oklch() colour into the same colour in sRGB hex
// and drops the gradient interpolation hint. Newer computers look the same.

function oklchToHex(L, C, H, alpha) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const hex = lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  }).join('');
  return alpha == null || alpha >= 1 ? `#${hex}` : `#${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

const num = (v, percentScale = 1) => (v.endsWith('%') ? (parseFloat(v) / 100) * percentScale : parseFloat(v));

export function compatCss(css) {
  return css
    .replace(/oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)/g, (_, L, C, H, A) =>
      oklchToHex(num(L), num(C, 0.4), parseFloat(H), A == null ? null : num(A)))
    .replace(/(--tw-gradient-position:[^;}]*?)\s+in\s+(?:oklab|oklch)/g, '$1');
}

export default function compatColors() {
  return {
    name: 'corepos-compat-colors',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css')) file.source = compatCss(String(file.source));
      }
    },
  };
}
