// Create-product modal. Used from Products and from the POS / Purchases when an
// unknown barcode is scanned (initialBarcode pre-fills the barcode).
// The everyday fields come first in plain words; types (options), serial and
// expiry tracking live under "More options" so the form stays simple.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ImagePlus, Plus, ScanBarcode, Trash2, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import { useShop } from '../lib/shop';
import { useT } from '../lib/i18n';
import { useBrands, useCategories } from '../lib/catalog';
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, cx, useToast } from './ui';

const emptyRow = (barcode = '') => ({ color: '', size: '', barcode, purchase_price: '', selling_price: '', wholesale_price: '', stock_qty: '', low_stock_threshold: '', serials: '', batch_no: '', expiry_date: '' });
const serialList = (text) => text.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); }; // barcode scanners press Enter

function CheckRow({ checked, onChange, title, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm hover:bg-slate-50">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-600" checked={checked} onChange={onChange} />
      <span>
        <span className="block font-medium leading-relaxed text-slate-800">{title}</span>
        {hint && <span className="mt-1 block text-xs leading-relaxed text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

// hideStock: opening stock is added by the caller (e.g. a purchase), so don't ask for it.
// requireStock: opened from the Sell screen — the item goes straight into the
// bill, so it needs a stock count above 0.
export default function ProductForm({ open, onClose, onSaved, initialBarcode = '', initialName = '', hideStock = false, requireStock = false }) {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useCategories();
  const brands = useBrands();

  const [form, setForm] = useState({});
  const [hasOptions, setHasOptions] = useState(false);
  const [more, setMore] = useState(false);
  const [rows, setRows] = useState([emptyRow()]);
  const [quick, setQuick] = useState({ a: '', b: '' });
  const [image, setImage] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm({ name: initialName, category_id: '', brand_id: '', unit: shop.defaultUnit, description: '', track_serial: false, track_expiry: false, warranty_months: '' });
    setHasOptions(false);
    setMore(false);
    setRows([emptyRow(initialBarcode)]);
    setQuick({ a: '', b: '' });
    setImage(null);
    setError(null);
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, initialBarcode, initialName, shop.defaultUnit]);

  const fractional = shop.isFractional(form.unit);
  const step = fractional ? '0.001' : '1';
  const unitName = t(shop.unitLabel(form.unit));
  const opt1 = t(shop.option1);
  const opt2 = t(shop.option2);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRow = (i, k, v) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  // "Red, Blue" x "S, M, L" -> 6 rows sharing the first row's prices.
  const generate = () => {
    const a = quick.a.split(',').map((s) => s.trim()).filter(Boolean);
    const b = quick.b.split(',').map((s) => s.trim()).filter(Boolean);
    if (!a.length && !b.length) return;
    const base = rows[0] || emptyRow();
    const combos = [];
    for (const x of a.length ? a : ['']) for (const y of b.length ? b : ['']) combos.push({ ...emptyRow(), color: x, size: y, purchase_price: base.purchase_price, selling_price: base.selling_price, wholesale_price: base.wholesale_price, stock_qty: base.stock_qty });
    setRows(combos);
  };

  const units = useMemo(() => shop.meta.units || [], [shop.meta.units]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const variants = (hasOptions ? rows : rows.slice(0, 1)).map((r) => {
        const serials = form.track_serial && !hasOptions ? serialList(r.serials) : [];
        return {
          color: hasOptions ? r.color.trim() || null : null,
          size: hasOptions ? r.size.trim() || null : null,
          barcode: r.barcode.trim() || null,
          purchase_price: Number(r.purchase_price || 0),
          selling_price: Number(r.selling_price || 0),
          wholesale_price: r.wholesale_price === '' || r.wholesale_price == null ? null : Number(r.wholesale_price),
          // serial-tracked: one unit per serial; with options, stock comes later via Purchases
          stock_qty: form.track_serial ? serials.length : Number(r.stock_qty || 0),
          low_stock_threshold: r.low_stock_threshold === '' ? undefined : Number(r.low_stock_threshold),
          ...(serials.length ? { serials } : {}),
          ...(form.track_expiry && !hasOptions && (r.batch_no || r.expiry_date) ? { batch_no: r.batch_no || null, expiry_date: r.expiry_date || null } : {}),
        };
      });
      const res = await api.post('/products', {
        name: form.name.trim(),
        category_id: Number(form.category_id),
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        unit: form.unit,
        description: form.description || null,
        track_serial: !!form.track_serial,
        track_expiry: !!form.track_expiry,
        warranty_months: form.warranty_months === '' ? null : Number(form.warranty_months),
        variants,
      });
      let product = res.data;
      if (image) {
        const fd = new FormData();
        fd.append('image', image);
        product = (await api.upload(`/products/${product.id}/image`, fd)).data;
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      toast(t('{name} added', { name: product.name }));
      onSaved?.(product);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const noCategories = !categories.isLoading && !categories.data?.length;
  const showMore = more || hasOptions || form.track_serial || form.track_expiry;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('Add new item')}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="product-form" size="lg" loading={saving}>{t('Save item')}</Button>
        </>
      )}
    >
      <form id="product-form" onSubmit={submit} className="space-y-5">
        <ErrorBox error={error} />
        {noCategories && <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{t('First make a category (menu: Categories & brands), then add items.')}</div>}

        {/* ---- everyday fields ---- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Item name')} required className="sm:col-span-2">
            <Input ref={nameRef} required maxLength={255} className="h-12 text-base" value={form.name || ''} onChange={set('name')} placeholder={t('e.g. Basmati rice, Hammer, Samsung A15')} />
          </Field>

          {!hasOptions ? (
            <>
              <Field label={t('Selling price')} required hint={t('What the customer pays (Rs)')}>
                <Input type="number" min="0" step="0.01" required className="h-12 text-lg font-semibold" value={rows[0].selling_price} onChange={(e) => setRow(0, 'selling_price', e.target.value)} />
              </Field>
              <Field label={t('Buying price (cost)')} hint={t('What you paid (Rs) — used to work out profit')}>
                <Input type="number" min="0" step="0.01" className="h-12 text-lg" value={rows[0].purchase_price} onChange={(e) => setRow(0, 'purchase_price', e.target.value)} />
              </Field>
              {hideStock ? null : form.track_serial ? (
                <Field label={t('Serial / IMEI numbers in stock ({n})', { n: serialList(rows[0].serials).length })} hint={t('Scan or type one per line. Stock = how many numbers you enter.')} className="sm:col-span-2">
                  <Textarea rows={3} className="font-mono" dir="ltr" value={rows[0].serials} onChange={(e) => setRow(0, 'serials', e.target.value)} placeholder={'356789012345678\n356789012345679'} />
                </Field>
              ) : (
                <Field label={t('How many in stock now?')} required={requireStock} hint={requireStock ? t('Needed so it can be sold now. Count in {unit}.', { unit: unitName }) : t('Count in {unit}. Leave empty if none.', { unit: unitName })}>
                  <Input type="number" min={requireStock ? step : '0'} step={step} required={requireStock} className="h-12 text-lg" value={rows[0].stock_qty} onChange={(e) => setRow(0, 'stock_qty', e.target.value)} />
                </Field>
              )}
              <Field label={t('Barcode — scan it or leave empty')} hint={t('If you leave it empty, a barcode is made for you.')} className={hideStock || form.track_serial ? 'sm:col-span-2' : undefined}>
                <div className="relative">
                  <ScanBarcode className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                  <Input className="h-12 ps-10 font-mono" value={rows[0].barcode} onChange={(e) => setRow(0, 'barcode', e.target.value)} onKeyDown={noEnter} placeholder={t('Scan or type barcode')} />
                </div>
              </Field>
              {form.track_expiry && !hideStock && (
                <>
                  <Field label={t('Batch no. (for this stock)')}><Input value={rows[0].batch_no} onChange={(e) => setRow(0, 'batch_no', e.target.value)} /></Field>
                  <Field label={t('Expiry date (for this stock)')}><Input type="date" value={rows[0].expiry_date} onChange={(e) => setRow(0, 'expiry_date', e.target.value)} /></Field>
                </>
              )}
            </>
          ) : (
            <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800 sm:col-span-2">{t('This item comes in different types — set the price and stock of each type below.')}</p>
          )}

          <Field label={t('Category')} required>
            <Select required value={form.category_id || ''} onChange={set('category_id')}>
              <option value="">{t('Choose…')}</option>
              {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
            </Select>
          </Field>
          <Field label={t('Sold by')} hint={fractional ? t('You can sell part of it (e.g. 1.5)') : t('Sold in whole numbers only')}>
            <Select value={form.unit || 'pcs'} onChange={set('unit')}>
              {units.map((u) => <option key={u.code} value={u.code}>{t(u.label)}</option>)}
            </Select>
          </Field>
        </div>

        {/* ---- more options (secondary) ---- */}
        <div className="rounded-xl border border-slate-200">
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={showMore} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
            <span>
              <span className="block font-medium text-slate-800">{t('More options (if you need them)')}</span>
              <span className="block text-xs text-slate-500">{t('Brand, photo, wholesale price, low stock warning, different types, serial numbers')}</span>
            </span>
            <ChevronDown className={cx('size-5 shrink-0 text-slate-400 transition', showMore && 'rotate-180')} />
          </button>

          {showMore && (
            <div className="space-y-4 border-t border-slate-100 px-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('Brand')}>
                  <Select value={form.brand_id || ''} onChange={set('brand_id')}>
                    <option value="">{t('No brand')}</option>
                    {(brands.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label={t('Photo')}>
                  <span className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-700 hover:bg-slate-50">
                    <ImagePlus className="size-5 shrink-0 text-slate-400" />
                    <span className="truncate">{image ? image.name : t('Choose a photo')}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setImage(e.target.files?.[0] || null)} />
                  </span>
                </Field>
                {!hasOptions && (
                  <Field label={t('Wholesale price (optional)')} hint={t('Price for wholesale customers (Rs). Leave empty to use the selling price.')}>
                    <Input type="number" min="0" step="0.01" value={rows[0].wholesale_price} onChange={(e) => setRow(0, 'wholesale_price', e.target.value)} />
                  </Field>
                )}
                {!hasOptions && (
                  <Field label={t('Warn me when stock is below')} hint={t('Leave empty to use 5')}>
                    <Input type="number" min="0" step={step} placeholder="5" value={rows[0].low_stock_threshold} onChange={(e) => setRow(0, 'low_stock_threshold', e.target.value)} />
                  </Field>
                )}
                <Field label={t('Description')} className="sm:col-span-2"><Textarea value={form.description || ''} onChange={set('description')} rows={2} /></Field>
              </div>

              <div className="space-y-1 border-t border-slate-100 pt-3">
                <CheckRow
                  checked={hasOptions}
                  onChange={(e) => setHasOptions(e.target.checked)}
                  title={t('This item comes in different types ({a} / {b})', { a: opt1, b: opt2 })}
                  hint={t('Each type gets its own price, stock and barcode.')}
                />
                {shop.features.serials && (
                  <CheckRow
                    checked={!!form.track_serial}
                    onChange={(e) => { const on = e.target.checked; setForm((f) => ({ ...f, track_serial: on, unit: on && shop.isFractional(f.unit) ? 'pcs' : f.unit })); }}
                    title={t('Track serial / IMEI numbers')}
                    hint={t('Each piece has its own number (mobiles, laptops, bikes).')}
                  />
                )}
                {shop.features.expiry && (
                  <CheckRow
                    checked={!!form.track_expiry}
                    onChange={(e) => { const on = e.target.checked; setForm((f) => ({ ...f, track_expiry: on })); }}
                    title={t('Track batch & expiry date')}
                    hint={t('Sells the stock that expires first, and warns you before it expires.')}
                  />
                )}
                {form.track_serial && (
                  <div className="ps-10 sm:w-1/2">
                    <Field label={t('Warranty (months)')} hint={t('Printed on the receipt with the serial number')}>
                      <Input type="number" min="0" max="240" step="1" value={form.warranty_months} onChange={set('warranty_months')} placeholder="12" />
                    </Field>
                  </div>
                )}
              </div>

              {hasOptions && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <h4 className="font-semibold text-slate-800">{t('Types of this item')}</h4>
                  <div className="grid gap-3 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Field label={t('{name} — write them with commas', { name: opt1 })}><Input value={quick.a} onChange={(e) => setQuick((q) => ({ ...q, a: e.target.value }))} placeholder={t('e.g. Red, Blue')} /></Field>
                    <Field label={t('{name} — write them with commas', { name: opt2 })}><Input value={quick.b} onChange={(e) => setQuick((q) => ({ ...q, b: e.target.value }))} placeholder={t('e.g. Small, Large')} /></Field>
                    <Button variant="secondary" icon={Wand2} onClick={generate}>{t('Make rows')}</Button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>{[opt1, opt2, t('Barcode'), t('Buying price'), `${t('Selling price')} *`, t('Wholesale price'), t('Stock'), ''].map((h, i) => <th key={i} className="px-2 py-2 text-start font-semibold">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="p-1.5"><Input value={r.color} onChange={(e) => setRow(i, 'color', e.target.value)} /></td>
                            <td className="p-1.5"><Input value={r.size} onChange={(e) => setRow(i, 'size', e.target.value)} /></td>
                            <td className="p-1.5"><Input className="font-mono" placeholder={t('Auto')} value={r.barcode} onChange={(e) => setRow(i, 'barcode', e.target.value)} onKeyDown={noEnter} /></td>
                            <td className="p-1.5"><Input className="w-24" type="number" min="0" step="0.01" value={r.purchase_price} onChange={(e) => setRow(i, 'purchase_price', e.target.value)} /></td>
                            <td className="p-1.5"><Input className="w-24" type="number" min="0" step="0.01" required value={r.selling_price} onChange={(e) => setRow(i, 'selling_price', e.target.value)} /></td>
                            <td className="p-1.5"><Input className="w-24" type="number" min="0" step="0.01" placeholder="—" value={r.wholesale_price} onChange={(e) => setRow(i, 'wholesale_price', e.target.value)} /></td>
                            <td className="p-1.5"><Input className="w-20" type="number" min="0" step={step} disabled={form.track_serial} value={form.track_serial ? 0 : r.stock_qty} onChange={(e) => setRow(i, 'stock_qty', e.target.value)} /></td>
                            <td className="p-1.5 text-end">
                              <button type="button" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded-lg p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={t('Remove this type')} title={t('Remove this type')}><Trash2 className="size-5" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="secondary" icon={Plus} onClick={() => setRows((r) => [...r, { ...emptyRow(), purchase_price: r[r.length - 1]?.purchase_price || '', selling_price: r[r.length - 1]?.selling_price || '', wholesale_price: r[r.length - 1]?.wholesale_price || '' }])}>{t('Add another type')}</Button>
                  {form.track_serial
                    ? <p className="text-xs text-slate-500">{t('After saving, add the stock and serial numbers from "Buy stock (purchases)".')}</p>
                    : form.track_expiry && <p className="text-xs text-slate-500">{t('After saving, add stock with batch & expiry from "Buy stock (purchases)".')}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
