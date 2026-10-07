// Barcode label rendering shared by the Barcode labels page and the
// Settings → Barcode preview. Barcodes are drawn client-side with jsbarcode.
import JsBarcode from 'jsbarcode';
import { money, variantLabel } from '../../lib/format';
import { cx } from '../../components/ui';

export const LABEL_SIZES = {
  small: { w: 38, h: 25, label: 'Small — 38 × 25 mm', barH: 9 },
  large: { w: 50, h: 30, label: 'Large — 50 × 30 mm', barH: 11 },
};

export const FORMATS = {
  code128: 'CODE128 — works with any code',
  ean13: 'EAN-13 for 13-digit retail codes (CODE128 for the rest)',
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
// else (shop-generated 12-digit codes, SKUs) prints as CODE128.
// A valid EAN-13 (manufacturer barcodes on packaged goods) always prints as
// EAN-13 so the label matches the pack; everything else is CODE128.
export function pickFormat(code) {
  return isValidEan13(code) ? 'EAN13' : 'CODE128';
}

const svgCache = new Map();

// Returns SVG markup (bars only, scaled to fill its box) or null if the code
// can't be encoded.
export function barcodeSvg(code, format) {
  const key = `${format}:${code}`;
  if (svgCache.has(key)) return svgCache.get(key);
  let markup = null;
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, { format, width: 1, height: 40, margin: 6, displayValue: false, flat: true, background: '#ffffff', lineColor: '#000000' });
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('style');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('style', 'width:100%;height:100%;display:block');
    markup = svg.outerHTML;
  } catch {
    markup = null;
  }
  svgCache.set(key, markup);
  return markup;
}

// One printable label. `item` is a ProductVariantResource (with product_name).
export function BarcodeLabel({ item, size = 'small', showShop, shopName, showPrice = true, format = 'code128', className, style }) {
  const dim = LABEL_SIZES[size] || LABEL_SIZES.small;
  const code = item.barcode || '';
  const svg = needsBarcode(code) ? null : barcodeSvg(code, pickFormat(code, format));
  const opts = variantLabel(item);
  const small = size === 'small';

  return (
    <div
      className={cx('flex flex-col overflow-hidden bg-white text-center text-black', className)}
      style={{ width: `${dim.w}mm`, height: `${dim.h}mm`, padding: '1.2mm 1.5mm', fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.1, ...style }}
    >
      {showShop && shopName && <div className="truncate font-semibold uppercase" style={{ fontSize: small ? '5.5pt' : '6.5pt', letterSpacing: '0.03em' }}>{shopName}</div>}
      <div className="truncate font-semibold" style={{ fontSize: small ? '7pt' : '8.5pt' }}>{item.product_name}</div>
      {opts && <div className="truncate" style={{ fontSize: small ? '6pt' : '7pt' }}>{opts}</div>}
      <div className="flex min-h-0 flex-1 flex-col justify-center" style={{ marginTop: '0.6mm' }}>
        {svg ? (
          <div style={{ height: `${dim.barH}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="grid place-items-center border border-dashed border-black/40" style={{ height: `${dim.barH}mm`, fontSize: '6pt' }}>No barcode</div>
        )}
        <div className="font-mono" style={{ fontSize: small ? '6pt' : '7pt', marginTop: '0.3mm' }}>{svg ? code : ''}</div>
      </div>
      {showPrice && <div className="font-bold" style={{ fontSize: small ? '9pt' : '11pt' }}>{money(item.selling_price)}</div>}
    </div>
  );
}
