// Scan-or-search box for picking a product variant. Used by Inventory (adjust
// stock) and Purchases (add items). Barcode scanners type the code and press
// Enter: Enter tries an exact barcode first, then a name/SKU search.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ScanBarcode } from 'lucide-react';
import { api } from '../../lib/api';
import { qty, variantLabel } from '../../lib/format';
import { Input, cx, useToast } from '../../components/ui';

export const VariantFinder = forwardRef(function VariantFinder(
  { onPick, onUnknown, placeholder = 'Scan barcode or type product name / SKU…', autoFocus, className }, ref,
) {
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
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
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

  const submit = async () => {
    const code = q.trim();
    if (!code) return;
    if (open && hi >= 0 && list[hi]) { pick(list[hi]); return; }
    setBusy(true);
    try {
      const res = await api.get(`/barcodes/scan/${encodeURIComponent(code)}`);
      pick(res.variant);
    } catch (err) {
      if (err.status && err.status !== 404) { toast(err.message, 'error'); return; }
      const found = await api.get('/product-variants/search', { q: code }).then((r) => r.data || []).catch(() => []);
      if (found.length === 1) pick(found[0]);
      else if (!found.length) {
        if (onUnknown) { onUnknown(code); setQ(''); setOpen(false); } else toast(`Nothing found for "${code}"`, 'error');
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
      <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        ref={inputRef}
        autoFocus={autoFocus}
        className="pl-9 pr-9"
        placeholder={placeholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {(busy || results.isFetching) && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" />}
      {open && term.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {!list.length ? (
            <div className="px-3 py-2.5 text-sm text-slate-500">{results.isFetching ? 'Searching…' : 'No matching products. Press Enter to look up the barcode.'}</div>
          ) : list.map((v, i) => {
            const label = variantLabel(v);
            return (
              <button
                key={v.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(v)}
                onMouseEnter={() => setHi(i)}
                className={cx('flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm', i === hi ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{v.product_name}{label && <span className="font-normal text-slate-500"> · {label}</span>}</span>
                  <span className="block truncate text-xs text-slate-500">{v.sku}{v.barcode ? ` · ${v.barcode}` : ''}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">{qty(v.stock_qty)} {v.unit} in stock</span>
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

export function badQty(shop, unit, value, { allowZero = false } = {}) {
  const n = Number(value);
  if (value === '' || Number.isNaN(n)) return 'Enter a quantity';
  if (allowZero ? n < 0 : n <= 0) return allowZero ? 'Cannot be negative' : 'Must be more than 0';
  if (!shop.isFractional(unit) && !Number.isInteger(n)) return `Whole numbers only (sold per ${shop.unitLabel(unit).toLowerCase()})`;
  return null;
}
