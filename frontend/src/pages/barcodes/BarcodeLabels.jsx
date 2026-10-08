import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Minus, Plus, Printer, ScanBarcode, Search, Trash2, Wand2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
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
  const t = useT();
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
    const h = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(h);
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
        else if (!rows.length) toast(t('Nothing found for “{code}”', { code }), 'error');
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
      toast(t('Barcode {code} made', { code: nv.barcode }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setGenerating(null);
    }
  };

  const clearAll = async () => {
    if (await confirm({ title: t('Clear the list?'), message: t('All items you picked will be taken off this list. Nothing is deleted from your stock.'), confirmLabel: t('Yes, clear it'), danger: true })) setItems([]);
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
    const h = setTimeout(() => {
      window.print();
      style.remove();
      setPrinting(false);
    }, 150);
    return () => { clearTimeout(h); style.remove(); };
  }, [printing, opts]);

  if (!opts) return <Page><Spinner /></Page>;
  const set = (k) => (e) => setOpts((o) => ({ ...o, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const labelProps = { size: opts.size, showShop: opts.showShop, shopName: shop.shopName, showPrice: opts.showPrice, format: opts.format };
  const showResults = term && search.trim() && (results.data || []).length > 0;

  return (
    <Page>
      <PageHeader
        title={t('Print barcode stickers')}
        subtitle={t('Scan or search an item, choose how many stickers you need, then press Print.')}
        actions={(
          <>
            {items.length > 0 && <Button variant="secondary" size="lg" icon={Trash2} onClick={clearAll}>{t('Clear list')}</Button>}
            <Button size="lg" icon={Printer} disabled={!labels.length} onClick={() => setPrinting(true)}>
              {labels.length ? (labels.length === 1 ? t('Print 1 sticker') : t('Print {n} stickers', { n: labels.length })) : t('Print stickers')}
            </Button>
          </>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                <Input
                  ref={inputRef}
                  autoFocus
                  className="h-12 ps-10 pe-10 text-base"
                  placeholder={t('Scan barcode or type item name…')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
                    if (e.key === 'Escape') setSearch('');
                  }}
                />
                <div className="absolute end-2 top-1/2 -translate-y-1/2">
                  {scanning || results.isFetching ? <Spinner className="size-5" /> : search && <button type="button" onClick={() => setSearch('')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t('Clear')}><X className="size-5" /></button>}
                </div>
              </div>
              {showResults && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                  {results.data.map((v) => {
                    const picked = items.some((x) => x.v.id === v.id);
                    return (
                      <button key={v.id} type="button" onClick={() => add(v)} disabled={picked} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-start text-[15px] last:border-0 hover:bg-slate-50 disabled:opacity-50">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">{v.product_name}{variantLabel(v) && <span className="font-normal text-slate-500"> · {variantLabel(v)}</span>}</div>
                          <div className="text-sm text-slate-500">{needsBarcode(v.barcode) ? t('No barcode yet') : <span className="num font-mono">{v.barcode}</span>}</div>
                        </div>
                        <div className="shrink-0 text-end">
                          <div className="num text-slate-700">{money(v.selling_price)}</div>
                          <div className="text-sm text-slate-500">{picked ? t('Added') : t('{n} in stock', { n: `${qty(v.stock_qty)} ${t(shop.unitLabel(v.unit))}` })}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {term && search.trim() && !results.isFetching && results.data && !results.data.length && (
                <p className="mt-2 text-sm text-slate-500">{t('No items match “{q}”. Check the spelling or scan the barcode.', { q: term })}</p>
              )}
            </div>

            {!items.length ? (
              <EmptyState icon={ScanBarcode} title={t('No items picked yet')}>
                {t('Scan an item’s barcode or search for it above. You get one sticker for each piece in stock (one for items sold by weight or length) — you can change the number.')}
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-start text-[15px]">
                  <thead>
                    <tr className="bg-slate-50 text-sm text-slate-500">
                      <th className="px-4 py-3 text-start font-semibold">{t('Item')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('Barcode')}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t('Price')}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t('In stock')}</th>
                      <th className="px-4 py-3 text-center font-semibold">{t('Stickers')}</th>
                      <th className="px-2 py-3"><span className="sr-only">{t('Remove')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(({ v, copies }) => {
                      const noCode = needsBarcode(v.barcode);
                      return (
                        <tr key={v.id} className="border-t border-slate-100">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{v.product_name}</div>
                            {variantLabel(v) && <div className="text-sm text-slate-500">{variantLabel(v)}</div>}
                          </td>
                          <td className="px-4 py-3">
                            {noCode ? (
                              can('barcodes.manage') ? (
                                <Button size="sm" variant="secondary" icon={Wand2} loading={generating === v.id} onClick={() => generate(v)}>{t('Make a barcode')}</Button>
                              ) : <Badge color="amber">{t('No barcode')}</Badge>
                            ) : <span className="num font-mono text-slate-700">{v.barcode}</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-end"><span className="num">{money(v.selling_price)}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-end text-slate-600"><span className="num">{qty(v.stock_qty)}</span> {t(shop.unitLabel(v.unit))}</td>
                          <td className="px-4 py-3">
                            <div className="mx-auto flex w-40 items-center gap-1.5" dir="ltr">
                              <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={noCode || copies <= 0} onClick={() => setCopies(v.id, copies - 1)} aria-label={t('One less')}><Minus className="size-5" /></button>
                              <Input className="text-center" type="number" min="0" step="1" disabled={noCode} value={copies} onChange={(e) => setCopies(v.id, e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
                              <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={noCode} onClick={() => setCopies(v.id, copies + 1)} aria-label={t('One more')}><Plus className="size-5" /></button>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-end">
                            <button type="button" onClick={() => remove(v.id)} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-5" />{t('Remove')}</button>
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
              <span>{missing.length === 1 ? t('1 item has no barcode yet, so it will not print. Press “Make a barcode” to give it one.') : t('{n} items have no barcode yet, so they will not print. Press “Make a barcode” to give them one.', { n: missing.length })}</span>
            </div>
          )}
          {totalRequested > MAX_LABELS && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{t('Only the first {n} stickers print at one time. Print the rest after that.', { n: MAX_LABELS })}</span>
            </div>
          )}

          {labels.length > 0 && (
            <Card>
              <CardHeader title={t('Preview')} subtitle={labels.length === 1 ? t('1 sticker · {size}', { size: t(LABEL_SIZES[opts.size].label) }) : t('{n} stickers · {size}', { n: labels.length, size: t(LABEL_SIZES[opts.size].label) })} />
              <div className="overflow-x-auto bg-slate-100 p-4">
                <LabelSheet labels={labels} labelProps={labelProps} preview />
              </div>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title={t('Sticker options')} subtitle={t('Starting choices come from Settings → Barcode stickers.')} />
          <div className="space-y-4 p-5">
            <Field label={t('Sticker size')}>
              <Select value={opts.size} onChange={set('size')}>
                {Object.entries(LABEL_SIZES).map(([k, d]) => <option key={k} value={k}>{t(d.label)}</option>)}
              </Select>
            </Field>
            <Field label={t('Printer')} hint={opts.layout === 'roll' ? t('For sticker printers with a roll: one sticker per page, sized to the sticker.') : t('Stickers are printed in rows on A4 sticker sheets.')}>
              <Select value={opts.layout} onChange={set('layout')}>
                <option value="sheet">{t('A4 sticker sheet')}</option>
                <option value="roll">{t('Sticker printer (roll)')}</option>
              </Select>
            </Field>
            <Field label={t('Barcode type')} hint={t('If unsure, keep CODE128.')}>
              <Select value={opts.format} onChange={set('format')}>
                {Object.entries(FORMATS).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
              </Select>
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-slate-700"><input type="checkbox" className="size-5 shrink-0 rounded border-slate-300 accent-brand-600" checked={opts.showShop} onChange={set('showShop')} /> {t('Show shop name')}</label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-slate-700"><input type="checkbox" className="size-5 shrink-0 rounded border-slate-300 accent-brand-600" checked={opts.showPrice} onChange={set('showPrice')} /> {t('Show price')}</label>
            <div className="border-t border-slate-100 pt-4">
              <div className="mb-2 text-sm font-medium text-slate-500">{t('Sample')}</div>
              <div className="flex justify-center rounded-lg bg-slate-100 p-4">
                <BarcodeLabel item={labels[0]?.v || { ...SAMPLE, product_name: t('Sample item') }} {...labelProps} className="shadow-sm ring-1 ring-slate-200" />
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

const SAMPLE = { id: 0, product_name: 'Sample item', color: null, size: null, barcode: '260100010001', selling_price: '250' };

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
