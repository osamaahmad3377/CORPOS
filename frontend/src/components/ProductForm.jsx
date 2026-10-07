// Create-product modal. Used from Products and from the POS when an
// unknown barcode is scanned (initialBarcode pre-fills the barcode).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ScanBarcode, Trash2, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import { useShop } from '../lib/shop';
import { useBrands, useCategories } from '../lib/catalog';
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, cx, useToast } from './ui';

const emptyRow = (barcode = '') => ({ color: '', size: '', barcode, purchase_price: '', selling_price: '', stock_qty: '', low_stock_threshold: '', serials: '', batch_no: '', expiry_date: '' });
const serialList = (text) => text.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

// hideStock: opening stock is added by the caller (e.g. a purchase), so don't ask for it.
export default function ProductForm({ open, onClose, onSaved, initialBarcode = '', initialName = '', hideStock = false }) {
  const shop = useShop();
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useCategories();
  const brands = useBrands();

  const [form, setForm] = useState({});
  const [hasOptions, setHasOptions] = useState(false);
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
    setRows([emptyRow(initialBarcode)]);
    setQuick({ a: '', b: '' });
    setImage(null);
    setError(null);
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, initialBarcode, initialName, shop.defaultUnit]);

  const fractional = shop.isFractional(form.unit);
  const step = fractional ? '0.001' : '1';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRow = (i, k, v) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  // "Red, Blue" x "S, M, L" -> 6 rows sharing the first row's prices.
  const generate = () => {
    const a = quick.a.split(',').map((s) => s.trim()).filter(Boolean);
    const b = quick.b.split(',').map((s) => s.trim()).filter(Boolean);
    if (!a.length && !b.length) return;
    const base = rows[0] || emptyRow();
    const combos = [];
    for (const x of a.length ? a : ['']) for (const y of b.length ? b : ['']) combos.push({ ...emptyRow(), color: x, size: y, purchase_price: base.purchase_price, selling_price: base.selling_price, stock_qty: base.stock_qty });
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
      toast(`${product.name} added`);
      onSaved?.(product);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const noCategories = !categories.isLoading && !categories.data?.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add product"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="product-form" loading={saving}>Save product</Button>
        </>
      )}
    >
      <form id="product-form" onSubmit={submit} className="space-y-5">
        <ErrorBox error={error} />
        {noCategories && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Create a category first (Catalog → Categories &amp; brands).</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" required className="sm:col-span-2">
            <Input ref={nameRef} required maxLength={255} value={form.name || ''} onChange={set('name')} placeholder="e.g. Basmati Rice, Hammer 16oz, Samsung A15" />
          </Field>
          <Field label="Category" required>
            <Select required value={form.category_id || ''} onChange={set('category_id')}>
              <option value="">Choose…</option>
              {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
            </Select>
          </Field>
          <Field label="Brand">
            <Select value={form.brand_id || ''} onChange={set('brand_id')}>
              <option value="">No brand</option>
              {(brands.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Sold by" hint={fractional ? 'Decimal quantities allowed (e.g. 1.5)' : 'Whole quantities only'}>
            <Select value={form.unit || 'pcs'} onChange={set('unit')}>
              {units.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
            </Select>
          </Field>
          <Field label="Photo">
            <Input type="file" accept="image/png,image/jpeg,image/webp" className="pt-2" onChange={(e) => setImage(e.target.files?.[0] || null)} />
          </Field>
        </div>

        {(shop.features.serials || shop.features.expiry) && (
          <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
            {shop.features.serials && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={!!form.track_serial} onChange={(e) => setForm((f) => ({ ...f, track_serial: e.target.checked, unit: e.target.checked && shop.isFractional(f.unit) ? 'pcs' : f.unit }))} />
                <span><span className="font-medium text-slate-800">Track serial / IMEI numbers</span><span className="block text-xs text-slate-500">Each unit has its own number (mobiles, laptops, vehicles).</span></span>
              </label>
            )}
            {shop.features.expiry && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={!!form.track_expiry} onChange={(e) => setForm((f) => ({ ...f, track_expiry: e.target.checked }))} />
                <span><span className="font-medium text-slate-800">Track batch &amp; expiry date</span><span className="block text-xs text-slate-500">Sells the earliest-expiring stock first and warns before expiry.</span></span>
              </label>
            )}
            {form.track_serial && (
              <Field label="Warranty (months)" hint="Printed on the receipt with the serial number">
                <Input type="number" min="0" max="240" step="1" value={form.warranty_months} onChange={set('warranty_months')} placeholder="e.g. 12" />
              </Field>
            )}
          </div>
        )}

        <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {[[false, 'Single item'], [true, `Has options (${shop.option1} / ${shop.option2})`]].map(([v, label]) => (
            <button key={label} type="button" onClick={() => setHasOptions(v)} className={cx('flex-1 rounded-md px-3 py-2 transition', hasOptions === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>{label}</button>
          ))}
        </div>

        {!hasOptions ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Barcode" hint="Scan the barcode on the item, or leave empty to generate one." className="sm:col-span-2">
              <div className="relative">
                <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9 font-mono" value={rows[0].barcode} onChange={(e) => setRow(0, 'barcode', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="Scan or type barcode" />
              </div>
            </Field>
            <Field label="Cost price (Rs)"><Input type="number" min="0" step="0.01" value={rows[0].purchase_price} onChange={(e) => setRow(0, 'purchase_price', e.target.value)} /></Field>
            <Field label="Selling price (Rs)" required><Input type="number" min="0" step="0.01" required value={rows[0].selling_price} onChange={(e) => setRow(0, 'selling_price', e.target.value)} /></Field>
            {hideStock ? null : form.track_serial ? (
              <Field label={`Serial / IMEI numbers in stock (${serialList(rows[0].serials).length})`} hint="Scan or type one per line. Opening stock = number of serials." className="sm:col-span-2">
                <Textarea rows={3} className="font-mono" value={rows[0].serials} onChange={(e) => setRow(0, 'serials', e.target.value)} placeholder={'356789012345678\n356789012345679'} />
              </Field>
            ) : (
              <Field label={`Opening stock (${shop.unitLabel(form.unit)})`}><Input type="number" min="0" step={step} value={rows[0].stock_qty} onChange={(e) => setRow(0, 'stock_qty', e.target.value)} /></Field>
            )}
            {form.track_expiry && !hideStock && (
              <>
                <Field label="Batch no. (opening stock)"><Input value={rows[0].batch_no} onChange={(e) => setRow(0, 'batch_no', e.target.value)} /></Field>
                <Field label="Expiry date (opening stock)"><Input type="date" value={rows[0].expiry_date} onChange={(e) => setRow(0, 'expiry_date', e.target.value)} /></Field>
              </>
            )}
            <Field label="Low stock alert at"><Input type="number" min="0" step={step} placeholder="5" value={rows[0].low_stock_threshold} onChange={(e) => setRow(0, 'low_stock_threshold', e.target.value)} /></Field>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label={`${shop.option1} values`} hint="Comma separated"><Input value={quick.a} onChange={(e) => setQuick((q) => ({ ...q, a: e.target.value }))} placeholder="e.g. Red, Blue" /></Field>
              <Field label={`${shop.option2} values`} hint="Comma separated"><Input value={quick.b} onChange={(e) => setQuick((q) => ({ ...q, b: e.target.value }))} placeholder="e.g. S, M, L" /></Field>
              <Button variant="secondary" icon={Wand2} onClick={generate} className="mb-5">Make rows</Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>{[shop.option1, shop.option2, 'Barcode', 'Cost', 'Price *', 'Stock', ''].map((h, i) => <th key={i} className="px-2 py-2 text-left font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-1.5"><Input className="h-9" value={r.color} onChange={(e) => setRow(i, 'color', e.target.value)} /></td>
                      <td className="p-1.5"><Input className="h-9" value={r.size} onChange={(e) => setRow(i, 'size', e.target.value)} /></td>
                      <td className="p-1.5"><Input className="h-9 font-mono" placeholder="Auto" value={r.barcode} onChange={(e) => setRow(i, 'barcode', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} /></td>
                      <td className="p-1.5"><Input className="h-9 w-24" type="number" min="0" step="0.01" value={r.purchase_price} onChange={(e) => setRow(i, 'purchase_price', e.target.value)} /></td>
                      <td className="p-1.5"><Input className="h-9 w-24" type="number" min="0" step="0.01" required value={r.selling_price} onChange={(e) => setRow(i, 'selling_price', e.target.value)} /></td>
                      <td className="p-1.5"><Input className="h-9 w-20" type="number" min="0" step={step} disabled={form.track_serial} value={form.track_serial ? 0 : r.stock_qty} onChange={(e) => setRow(i, 'stock_qty', e.target.value)} /></td>
                      <td className="p-1.5 text-right">
                        <button type="button" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Remove row"><Trash2 className="size-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setRows((r) => [...r, { ...emptyRow(), purchase_price: r[r.length - 1]?.purchase_price || '', selling_price: r[r.length - 1]?.selling_price || '' }])}>Add row</Button>
            {(form.track_serial || form.track_expiry) && <p className="text-xs text-slate-500">With options, add stock{form.track_serial ? ' (and serial numbers)' : ''}{form.track_expiry ? ' with batch & expiry' : ''} through Purchases after saving.</p>}
          </div>
        )}

        <Field label="Description"><Textarea value={form.description || ''} onChange={set('description')} rows={2} /></Field>
      </form>
    </Modal>
  );
}
