import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Minus, Plus, Printer, ScanBarcode, Search, Trash2, Wand2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { money, qty, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Spinner, cx, useConfirm, useToast,
} from '../../components/ui';
import { BarcodeLabel, FORMATS, LABEL_SIZES, needsBarcode } from './labels';

const MAX_LABELS = 2000;

export default function BarcodeLabels() {
  const { can } = useAuth();
  const shop = useShop();
  const toast = useToast();
  const confirm = useConfirm();
  const s = shop.settings;

  const [items, setItems] = useState([]); // [{ v: variant, copies }]
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [scanning, setScanning] = useState(false);
  const [opts, setOpts] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [generating, setGenerating] = useState(null);
  const inputRef = useRef(null);

  // Defaults come from Settings → Barcode once settings have loaded.
  useEffect(() => {
    if (opts || shop.loading) return;
    setOpts({
      size: s.barcode?.default_label_size === 'large' ? 'large' : 'small',
      showShop: s.barcode?.show_shop_name !== '0',
      showPrice: true,
      format: s.barcode?.default_format === 'ean13' ? 'ean13' : 'code128',
      layout: 'sheet',
    });
  }, [opts, shop.loading, s]);

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const results = useQuery({
    queryKey: ['product-variants', 'search', term],
    queryFn: () => api.get('/product-variants/search', { q: term }),
    select: (r) => r?.data || [],
    enabled: term.length > 0,
    placeholderData: (p) => p,
  });

  const defaultCopies = (v) => {
    if (shop.isFractional(v.unit)) return 1;
    const n = Math.floor(Number(v.stock_qty || 0));
    return n > 0 ? n : 1;
  };

  const add = (v, { bump = false } = {}) => {
    setItems((list) => {
      const found = list.find((x) => x.v.id === v.id);
      if (found) return bump ? list.map((x) => (x.v.id === v.id ? { ...x, copies: x.copies + 1 } : x)) : list;
      return [...list, { v, copies: defaultCopies(v) }];
    });
    setSearch('');
    setTerm('');
    inputRef.current?.focus();
  };

  // Enter = scanner. Try an exact barcode first, then fall back to a single search match.
  const onEnter = async () => {
    const code = search.trim();
    if (!code) return;
    setScanning(true);
    try {
      const res = await api.get(`/barcodes/scan/${encodeURIComponent(code)}`);
      add({ ...res.variant, product_name: res.variant.product_name || res.product?.name }, { bump: true });
    } catch (err) {
      if (err.status !== 404) { toast(err.message, 'error'); setScanning(false); return; }
      try {
        const r = await api.get('/product-variants/search', { q: code });
        const rows = r?.data || [];
        if (rows.length === 1) add(rows[0], { bump: true });
        else if (!rows.length) toast(`Nothing found for “${code}”`, 'error');
        else setTerm(code);
      } catch (e2) {
        toast(e2.message, 'error');
      }
    } finally {
      setScanning(false);
    }
  };

  const setCopies = (id, n) => setItems((list) => list.map((x) => (x.v.id === id ? { ...x, copies: Math.max(0, Math.min(999, Math.floor(Number(n) || 0))) } : x)));
  const remove = (id) => setItems((list) => list.filter((x) => x.v.id !== id));

  const generate = async (v) => {
    setGenerating(v.id);
    try {
      const res = await api.post(`/product-variants/${v.id}/barcode/generate`);
      const nv = res.data || res;
      setItems((list) => list.map((x) => (x.v.id === v.id ? { ...x, v: { ...x.v, ...nv, product_name: x.v.product_name, unit: x.v.unit } } : x)));
      toast(`Barcode ${nv.barcode} created`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setGenerating(null);
    }
  };

  const clearAll = async () => {
    if (await confirm({ title: 'Clear the list?', message: 'All picked items will be removed from this sheet.', confirmLabel: 'Clear' })) setItems([]);
  };

  // Flatten to one entry per physical label; items without a barcode are skipped.
  const labels = useMemo(() => {
    const out = [];
    for (const { v, copies } of items) {
      if (needsBarcode(v.barcode)) continue;
      for (let i = 0; i < copies && out.length < MAX_LABELS; i++) out.push({ key: `${v.id}-${i}`, v });
    }
    return out;
  }, [items]);
  const totalRequested = items.filter((x) => !needsBarcode(x.v.barcode)).reduce((a, x) => a + x.copies, 0);
  const missing = items.filter((x) => needsBarcode(x.v.barcode));

  // Print: render a print-only copy at <body> level (no clipping by the
  // scrolling layout), print, then remove it.
  useEffect(() => {
    if (!printing || !opts) return undefined;
    const dim = LABEL_SIZES[opts.size];
    const style = document.createElement('style');
    style.textContent = opts.layout === 'roll'
      ? `@media print { @page { size: ${dim.w}mm ${dim.h}mm; margin: 0; } }`
      : '@media print { @page { size: A4; margin: 6mm; } }';
    document.head.appendChild(style);
    const t = setTimeout(() => {
      window.print();
      style.remove();
      setPrinting(false);
    }, 150);
    return () => { clearTimeout(t); style.remove(); };
  }, [printing, opts]);

  if (!opts) return <Page><Spinner /></Page>;
  const set = (k) => (e) => setOpts((o) => ({ ...o, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const labelProps = { size: opts.size, showShop: opts.showShop, shopName: shop.shopName, showPrice: opts.showPrice, format: opts.format };
  const showResults = term && search.trim() && (results.data || []).length > 0;

  return (
    <Page>
      <PageHeader
        title="Barcode labels"
        subtitle="Pick items, choose how many stickers you need, then print. Scan a barcode or search by name."
        actions={(
          <>
            {items.length > 0 && <Button variant="secondary" icon={Trash2} onClick={clearAll}>Clear list</Button>}
            <Button icon={Printer} disabled={!labels.length} onClick={() => setPrinting(true)}>Print {labels.length ? `${labels.length} label${labels.length === 1 ? '' : 's'}` : 'labels'}</Button>
          </>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  ref={inputRef}
                  autoFocus
                  className="pl-9 pr-9"
                  placeholder="Scan a barcode or type a product name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
                    if (e.key === 'Escape') setSearch('');
                  }}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {scanning || results.isFetching ? <Spinner className="size-4" /> : search && <button type="button" onClick={() => setSearch('')} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Clear"><X className="size-4" /></button>}
                </div>
              </div>
              {showResults && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                  {results.data.map((v) => {
                    const picked = items.some((x) => x.v.id === v.id);
                    return (
                      <button key={v.id} type="button" onClick={() => add(v)} disabled={picked} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 disabled:opacity-50">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">{v.product_name}{variantLabel(v) && <span className="font-normal text-slate-500"> · {variantLabel(v)}</span>}</div>
                          <div className="font-mono text-xs text-slate-500">{needsBarcode(v.barcode) ? 'No barcode yet' : v.barcode}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-slate-700">{money(v.selling_price)}</div>
                          <div className="text-xs text-slate-500">{picked ? 'Added' : `${qty(v.stock_qty)} ${v.unit} in stock`}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {term && search.trim() && !results.isFetching && results.data && !results.data.length && (
                <p className="mt-2 text-sm text-slate-500">No items match “{term}”.</p>
              )}
            </div>

            {!items.length ? (
              <EmptyState icon={ScanBarcode} title="No items picked yet">
                Scan an item&apos;s barcode or search above. Items sold by weight or length get 1 label; others get one label per item in stock — change it as you like.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5 font-semibold">Item</th>
                      <th className="px-4 py-2.5 font-semibold">Barcode</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                      <th className="px-4 py-2.5 text-right font-semibold">In stock</th>
                      <th className="px-4 py-2.5 text-center font-semibold">Labels</th>
                      <th className="px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(({ v, copies }) => {
                      const noCode = needsBarcode(v.barcode);
                      return (
                        <tr key={v.id} className="border-t border-slate-100">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-900">{v.product_name}</div>
                            {variantLabel(v) && <div className="text-xs text-slate-500">{variantLabel(v)}</div>}
                          </td>
                          <td className="px-4 py-2.5">
                            {noCode ? (
                              can('barcodes.manage') ? (
                                <Button size="sm" variant="secondary" icon={Wand2} loading={generating === v.id} onClick={() => generate(v)}>Generate barcode</Button>
                              ) : <Badge color="amber">No barcode</Badge>
                            ) : <span className="font-mono text-slate-700">{v.barcode}</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">{money(v.selling_price)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-600">{qty(v.stock_qty)} {v.unit}</td>
                          <td className="px-4 py-2.5">
                            <div className="mx-auto flex w-32 items-center gap-1">
                              <button type="button" className="rounded-md border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40" disabled={noCode || copies <= 0} onClick={() => setCopies(v.id, copies - 1)} aria-label="Fewer"><Minus className="size-3.5" /></button>
                              <Input className="h-8 text-center" type="number" min="0" step="1" disabled={noCode} value={copies} onChange={(e) => setCopies(v.id, e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
                              <button type="button" className="rounded-md border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40" disabled={noCode} onClick={() => setCopies(v.id, copies + 1)} aria-label="More"><Plus className="size-3.5" /></button>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <button type="button" onClick={() => remove(v.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 className="size-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {missing.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{missing.length === 1 ? '1 item has' : `${missing.length} items have`} no barcode yet and won&apos;t be printed. Use “Generate barcode” to create one.</span>
            </div>
          )}
          {totalRequested > MAX_LABELS && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Only the first {MAX_LABELS} labels are printed at a time. Print in smaller batches.</span>
            </div>
          )}

          {labels.length > 0 && (
            <Card>
              <CardHeader title="Preview" subtitle={`${labels.length} label${labels.length === 1 ? '' : 's'} · ${LABEL_SIZES[opts.size].label}`} />
              <div className="overflow-x-auto bg-slate-100 p-4">
                <LabelSheet labels={labels} labelProps={labelProps} preview />
              </div>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title="Label options" subtitle="Defaults come from Settings → Barcode." />
          <div className="space-y-4 p-5">
            <Field label="Label size">
              <Select value={opts.size} onChange={set('size')}>
                {Object.entries(LABEL_SIZES).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
              </Select>
            </Field>
            <Field label="Printer" hint={opts.layout === 'roll' ? 'For thermal label printers: one label per page, sized to the label.' : 'Labels are laid out in rows on A4 sticker sheets.'}>
              <Select value={opts.layout} onChange={set('layout')}>
                <option value="sheet">A4 sticker sheet</option>
                <option value="roll">Label printer (roll)</option>
              </Select>
            </Field>
            <Field label="Barcode type">
              <Select value={opts.format} onChange={set('format')}>
                {Object.entries(FORMATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-4 rounded border-slate-300 accent-brand-600" checked={opts.showShop} onChange={set('showShop')} /> Show shop name</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-4 rounded border-slate-300 accent-brand-600" checked={opts.showPrice} onChange={set('showPrice')} /> Show price</label>
            <div className="border-t border-slate-100 pt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Sample</div>
              <div className="flex justify-center rounded-lg bg-slate-100 p-4">
                <BarcodeLabel item={labels[0]?.v || SAMPLE} {...labelProps} className="shadow-sm ring-1 ring-slate-200" />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {printing && createPortal(
        <div className="print-area hidden print:block">
          <LabelSheet labels={labels} labelProps={labelProps} roll={opts.layout === 'roll'} />
        </div>,
        document.body,
      )}
    </Page>
  );
}

const SAMPLE = { id: 0, product_name: 'Sample product', color: null, size: null, barcode: '260100010001', selling_price: '250' };

function LabelSheet({ labels, labelProps, preview, roll }) {
  const dim = LABEL_SIZES[labelProps.size];
  if (roll) {
    return labels.map(({ key, v }) => (
      <BarcodeLabel key={key} item={v} {...labelProps} style={{ breakAfter: 'page', pageBreakAfter: 'always' }} />
    ));
  }
  return (
    <div className={cx('flex flex-wrap content-start bg-white', preview && 'mx-auto shadow-sm')} style={{ width: '198mm', gap: '2mm', padding: preview ? '4mm' : 0, boxSizing: 'content-box' }}>
      {labels.map(({ key, v }) => (
        <BarcodeLabel key={key} item={v} {...labelProps} className={preview ? 'outline outline-1 outline-dashed outline-slate-300' : ''} style={{ breakInside: 'avoid', width: `${dim.w}mm`, height: `${dim.h}mm` }} />
      ))}
    </div>
  );
}
