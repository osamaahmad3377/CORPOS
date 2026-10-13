// Barcode sticker rendering shared by the "Print barcode stickers" page and
// the Settings → Barcode stickers preview. Barcodes are drawn client-side
// with jsbarcode. Item names print exactly as entered; the price line and the
// font of the shop name follow the chosen language.
import JsBarcode from 'jsbarcode';
import { num, variantLabel } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { cx } from '../../components/ui';

// `label` / FORMATS values are English keys — show them through t()
// (Urdu in src/i18n/ur/settings.js).
// The common sticker rolls and sheets in Pakistan. `small` and `large` keep
// their old keys (saved in shops' settings).
export const LABEL_SIZES = {
  tiny: { w: 30, h: 20, label: '30 × 20 mm', barH: 7 },
  small: { w: 38, h: 25, label: 'Small — 38 × 25 mm', barH: 9 },
  s40x30: { w: 40, h: 30, label: '40 × 30 mm', barH: 11 },
  s50x25: { w: 50, h: 25, label: '50 × 25 mm', barH: 9 },
  large: { w: 50, h: 30, label: 'Large — 50 × 30 mm', barH: 11 },
  s60x40: { w: 60, h: 40, label: '60 × 40 mm', barH: 15 },
};

// One printer dot at 203 dpi (nearly every thermal sticker printer). Bars are
// drawn in whole dots so every bar prints the same width and scans first time.
const DOT_MM = 25.4 / 203;
const QUIET = 10; // quiet zone each side, in bar widths (CODE128 / EAN need 10)

export const FORMATS = {
  code128: 'CODE128 — for every item',
  ean13: 'EAN-13 — for 13-digit pack codes',
};

// A barcode that is missing or still a placeholder from product creation.
export function needsBarcode(code) {
  return !code || /^TMP-/i.test(code);
}

export function isValidEan13(code) {
  if (!/^\d{13}$/.test(code || '')) return false;
  const d = code.split('').map(Number);
  const sum = d.slice(0, 12).reduce((a, n, i) => a + n * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}

// 'ean13' preference only applies to codes that are valid EAN-13; anything
// else (SKUs, typed codes) prints as CODE128.
// A valid EAN-13 (manufacturer barcodes on packaged goods) always prints as
// EAN-13 so the label matches the pack; everything else is CODE128.
export function pickFormat(code) {
  return isValidEan13(code) ? 'EAN13' : 'CODE128';
}

const svgCache = new Map();

// Bars only, as SVG markup, plus the code's width in bar units (quiet zones
// included) — or null if the code can't be encoded.
export function barcodeSvg(code, format) {
  const key = `${format}:${code}`;
  if (svgCache.has(key)) return svgCache.get(key);
  let out = null;
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, { format, width: 1, height: 40, margin: QUIET, displayValue: false, flat: true, background: '#ffffff', lineColor: '#000000' });
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('style');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('style', 'width:100%;height:100%;display:block');
    out = { markup: svg.outerHTML, modules: w };
  } catch {
    out = null;
  }
  svgCache.set(key, out);
  return out;
}

// Width of one bar unit: the biggest whole number of printer dots that fits
// the sticker (wider bars scan more easily); only a code too long for the
// sticker gets squeezed below one dot per bar.
export function barWidthMm(modules, availMm) {
  const dots = Math.floor(availMm / (modules * DOT_MM));
  return dots >= 1 ? Math.min(dots, 3) * DOT_MM : availMm / modules;
}

// 13-digit pack codes read in the usual groups: 8 964000 123457
export function humanCode(code) {
  return isValidEan13(code) ? `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}` : code;
}

// One printable label. `item` is a ProductVariantResource (with product_name).
export function BarcodeLabel({ item, size = 'small', showShop, shopName, showPrice = true, format = 'code128', className, style }) {
  const { t, isUrdu } = useLang();
  // Urdu (Nastaliq) needs its own font and more line height to avoid clipping.
  const langText = isUrdu ? { fontFamily: 'var(--font-urdu)', lineHeight: 1.6 } : null;
  const dim = LABEL_SIZES[size] || LABEL_SIZES.small;
  const code = item.barcode || '';
  const bars = needsBarcode(code) ? null : barcodeSvg(code, pickFormat(code, format));
  const opts = variantLabel(item);
  const roomy = dim.w >= 40 && dim.h >= 30;
  const tiny = dim.w <= 30;
  const padX = 1.5;
  const barMm = bars ? barWidthMm(bars.modules, dim.w - padX * 2) : 0;
  const fs = (n) => `${tiny ? n - 1 : roomy ? n + 1 : n}pt`;

  return (
    <div
      className={cx('flex flex-col overflow-hidden bg-white text-center text-black', className)}
      style={{ width: `${dim.w}mm`, height: `${dim.h}mm`, padding: `1.2mm ${padX}mm`, fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.12, breakInside: 'avoid', ...style }}
    >
      {showShop && shopName && !tiny && (
        <div dir="auto" className={cx('truncate font-bold', !isUrdu && 'uppercase')} style={{ fontSize: fs(5.5), letterSpacing: isUrdu ? 0 : '0.06em', ...langText }}>{shopName}</div>
      )}
      <div dir="auto" className="line-clamp-2 font-semibold" style={{ fontSize: fs(7), overflowWrap: 'anywhere' }}>{item.product_name}</div>
      {opts && <div dir="auto" className="truncate" style={{ fontSize: fs(6) }}>{opts}</div>}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center" style={{ marginTop: '0.5mm' }}>
        {bars ? (
          <div data-barcode={code} data-bar-mm={barMm.toFixed(4)} style={{ width: `${(bars.modules * barMm).toFixed(3)}mm`, height: `${dim.barH}mm`, maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: bars.markup }} />
        ) : (
          <div className="grid w-full place-items-center border border-dashed border-black/40" style={{ height: `${dim.barH}mm`, fontSize: '6pt', ...langText }}>{t('No barcode')}</div>
        )}
        {bars && <div className="font-mono font-medium" dir="ltr" style={{ fontSize: fs(6), letterSpacing: '0.08em', marginTop: '0.3mm' }}>{humanCode(code)}</div>}
      </div>
      {showPrice && (
        <div className="font-extrabold" style={{ fontSize: fs(9.5), ...langText, lineHeight: isUrdu ? 1.3 : 1.05, marginTop: '0.3mm' }}>{t('Rs {amount}', { amount: num(item.selling_price) })}</div>
      )}
    </div>
  );
}
