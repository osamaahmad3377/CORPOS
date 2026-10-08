// Scan-or-search box for picking a product variant. Used by Inventory (adjust
// stock) and Purchases (add items). Barcode scanners type the code and press
// Enter: Enter tries an exact barcode first, then a name/SKU search.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import useScanner from '../../lib/useScanner';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ScanBarcode } from 'lucide-react';
import { api } from '../../lib/api';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { qty, variantLabel } from '../../lib/format';
import { Input, cx, useToast } from '../../components/ui';

export const VariantFinder = forwardRef(function VariantFinder(
  { onPick, onUnknown, placeholder, autoFocus, className, size = 'md', scanAnywhere = true }, ref,
) {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [busy, setBusy] = useState(false);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  useEffect(() => {
    const h = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const results = useQuery({
    queryKey: ['product-variants', 'search', term],
    queryFn: () => api.get('/product-variants/search', { q: term }),
    enabled: term.length >= 2,
    select: (r) => r.data || [],
    staleTime: 10_000,
  });
  const list = term.length >= 2 ? results.data || [] : [];

  const pick = (variant) => {
    onPick(variant);
    setQ('');
    setTerm('');
    setOpen(false);
    setHi(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submit = () => {
    const code = q.trim();
    if (!code) return;
    if (open && hi >= 0 && list[hi]) { pick(list[hi]); return; }
    lookup(code);
  };

  // A barcode scanned while the cursor is elsewhere still lands here.
  useScanner((code) => lookup(code), { enabled: scanAnywhere, allowInDialog: true });

  const lookup = async (code) => {
    setBusy(true);
    try {
      const res = await api.get(`/barcodes/scan/${encodeURIComponent(code)}`);
      pick(res.variant);
    } catch (err) {
      if (err.status && err.status !== 404) { toast(err.message, 'error'); return; }
      const found = await api.get('/product-variants/search', { q: code }).then((r) => r.data || []).catch(() => []);
      if (found.length === 1) pick(found[0]);
      else if (!found.length) {
        if (onUnknown) { onUnknown(code); setQ(''); setOpen(false); } else toast(t('Nothing found for "{q}"', { q: code }), 'error');
      } else { setTerm(code); setOpen(true); setHi(0); }
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div ref={boxRef} className={cx('relative', className)}>
      <ScanBarcode className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2', size === 'lg' ? 'start-4 size-6 text-brand-700' : 'start-3 size-5 text-slate-400')} />
      <Input
        ref={inputRef}
        autoFocus={autoFocus}
        className={size === 'lg' ? 'h-14 ps-13 pe-10 text-lg' : 'ps-10 pe-9'}
        placeholder={placeholder || t('Scan barcode or type item name…')}
        autoComplete="off"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {(busy || results.isFetching) && <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" />}
      {open && term.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {!list.length ? (
            <div className="px-3 py-2.5 text-sm text-slate-500">{results.isFetching ? t('Searching…') : t('No item found. Press Enter to look it up by barcode.')}</div>
          ) : list.map((v, i) => {
            const label = variantLabel(v);
            return (
              <button
                key={v.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(v)}
                onMouseEnter={() => setHi(i)}
                className={cx('flex w-full items-center justify-between gap-3 px-3 py-3 text-start text-[15px]', i === hi ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{v.product_name}{label && <span className="font-normal text-slate-500"> · {label}</span>}</span>
                  <span className="block truncate text-xs text-slate-500">{v.sku}{v.barcode ? ` · ${v.barcode}` : ''}</span>
                </span>
                <span className="shrink-0 text-sm text-slate-500">{t('{n} in stock', { n: `${qty(v.stock_qty)} ${t(shop.unitLabel(v.unit))}` })}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

// Small helpers shared by the stock pages.
export function unitStep(shop, unit) {
  return shop.isFractional(unit) ? '0.001' : '1';
}

// Returns a (translated) problem with a typed quantity, or null when it's fine.
export function badQty(t, shop, unit, value, { allowZero = false } = {}) {
  const n = Number(value);
  if (value === '' || Number.isNaN(n)) return t('Enter a quantity');
  if (allowZero ? n < 0 : n <= 0) return allowZero ? t('Cannot be less than 0') : t('Enter a quantity above 0');
  if (!shop.isFractional(unit) && !Number.isInteger(n)) return t('Whole numbers only for this item');
  return null;
}

// "5 Piece" / "1.5 Kilogram" — number stays left-to-right, unit translated.
export function useUnitText() {
  const t = useT();
  const shop = useShop();
  return (unit) => t(shop.unitLabel(unit));
}
