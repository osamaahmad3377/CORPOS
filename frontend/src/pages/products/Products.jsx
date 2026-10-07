import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Package, Pencil, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { primaryImage, useBrands, useCategories } from '../../lib/catalog';
import { money, qty, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import ProductForm from '../../components/ProductForm';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Td, Textarea, Th,
  useConfirm, useToast,
} from '../../components/ui';

function priceRange(variants) {
  const prices = (variants || []).map((v) => Number(v.selling_price));
  if (!prices.length) return '—';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}

function totalStock(variants) {
  return (variants || []).reduce((a, v) => a + Number(v.stock_qty || 0), 0);
}

export default function Products() {
  const { can } = useAuth();
  const shop = useShop();
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(null); // { barcode, name } when open
  const [openId, setOpenId] = useState(null);

  // Debounce typing; Enter (what barcode scanners send) searches immediately.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = { search: term, category_id: categoryId, is_active: active, page, per_page: 25 };
  const list = useQuery({ queryKey: ['products', params], queryFn: () => api.get('/products', params), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const looksLikeBarcode = /^[0-9A-Za-z-]{6,}$/.test(term) && !/\s/.test(term);
  const label = shop.businessType === 'restaurant' ? 'Menu items' : 'Products';

  return (
    <Page>
      <PageHeader
        title={label}
        subtitle="Everything you sell. Scan a barcode in the search box to find an item — or add it if it's new."
        actions={can('products.create') && <Button icon={Plus} onClick={() => setAdding({ barcode: '', name: '' })}>Add product</Button>}
      />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9 pr-9"
              placeholder="Search name, SKU or scan barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setTerm(search.trim()); setPage(1); } }}
            />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Clear"><X className="size-4" /></button>}
          </div>
          <div className="w-full sm:w-56"><Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
          </Select></div>
          <div className="w-full sm:w-44"><Select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
            <option value="">Active &amp; hidden</option>
            <option value="1">Active only</option>
            <option value="0">Hidden only</option>
          </Select></div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          term && looksLikeBarcode && can('products.create') ? (
            <EmptyState icon={ScanBarcode} title={`No product with barcode ${term}`} action={<Button icon={Plus} onClick={() => setAdding({ barcode: term, name: '' })}>Add it as a new product</Button>}>
              This barcode isn&apos;t in your catalog yet.
            </EmptyState>
          ) : (
            <EmptyState icon={Package} title={term || categoryId ? 'No matching products' : 'No products yet'} action={!term && can('products.create') && <Button icon={Plus} onClick={() => setAdding({ barcode: '', name: '' })}>Add your first product</Button>}>
              {term || categoryId ? 'Try a different search or category.' : 'Add products by typing them in or scanning their barcodes.'}
            </EmptyState>
          )
        ) : (
          <Table>
            <thead>
              <tr><Th className="w-14" /><Th>Product</Th><Th>Category</Th><Th>Price</Th><Th className="text-right">In stock</Th><Th /></tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const img = primaryImage(p);
                const stock = totalStock(p.variants);
                const low = (p.variants || []).some((v) => v.is_low_stock);
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(p.id)}>
                    <Td>
                      <div className="grid size-10 place-items-center overflow-hidden rounded-lg bg-slate-100">
                        {img ? <img src={img} alt="" className="size-full object-cover" /> : <ImageIcon className="size-4 text-slate-400" />}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        {p.variants?.length > 1 ? `${p.variants.length} variants` : p.variants?.[0]?.barcode}
                        {p.brand && ` · ${p.brand}`}
                        {!p.is_active && <Badge className="ml-2">Hidden</Badge>}
                      </div>
                    </Td>
                    <Td className="text-slate-600">{p.category}</Td>
                    <Td className="whitespace-nowrap">{priceRange(p.variants)} <span className="text-xs text-slate-400">/ {shop.unitLabel(p.unit).toLowerCase()}</span></Td>
                    <Td className="text-right"><Badge color={stock <= 0 ? 'red' : low ? 'amber' : 'green'}>{qty(stock)} {p.unit}</Badge></Td>
                    <Td className="text-right"><Pencil className="ml-auto size-4 text-slate-400" /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination meta={meta} onPage={setPage} />
      </Card>

      <ProductForm open={!!adding} onClose={() => setAdding(null)} initialBarcode={adding?.barcode} initialName={adding?.name} onSaved={(p) => { setSearch(''); setOpenId(p.id); }} />
      {openId && <ProductDetail id={openId} onClose={() => setOpenId(null)} />}
    </Page>
  );
}

// ---------------------------------------------------------------- detail / edit

function ProductDetail({ id, onClose }) {
  const { can } = useAuth();
  const shop = useShop();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const categories = useCategories();
  const brands = useBrands();
  const product = useQuery({ queryKey: ['products', 'one', id], queryFn: () => api.get(`/products/${id}`), select: (r) => r.data });
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [addingVariant, setAddingVariant] = useState(false);
  const [tracking, setTracking] = useState(null);
  const p = product.data;
  const canEdit = can('products.edit');

  useEffect(() => {
    if (p) setInfo({ name: p.name, category_id: p.category_id, brand_id: p.brand_id || '', unit: p.unit, description: p.description || '', is_active: p.is_active, track_serial: !!p.track_serial, track_expiry: !!p.track_expiry, warranty_months: p.warranty_months ?? '' });
  }, [p]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const save = useMutation({
    mutationFn: () => api.put(`/products/${id}`, { ...info, category_id: Number(info.category_id), brand_id: info.brand_id ? Number(info.brand_id) : null, warranty_months: info.warranty_months === '' ? null : Number(info.warranty_months) }),
    onSuccess: () => { refresh(); toast('Product saved'); },
    onError: setError,
  });

  const remove = async () => {
    if (!(await confirm({ title: 'Delete product?', message: `${p.name} will be removed from your catalog. Products with stock can't be deleted.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.del(`/products/${id}`);
      refresh();
      toast('Product deleted');
      onClose();
    } catch (err) {
      setError(err);
    }
  };

  const uploadImage = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      await api.upload(`/products/${id}/image`, fd);
      refresh();
      toast('Photo updated');
    } catch (err) {
      setError(err);
    }
  };

  const set = (k) => (e) => setInfo((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open onClose={onClose} size="xl" title={p ? p.name : 'Product'}>
      {!p || !info ? <Loading /> : (
        <div className="space-y-6">
          <ErrorBox error={error} />
          <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
            <div>
              <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-slate-100">
                {primaryImage(p) ? <img src={primaryImage(p)} alt="" className="size-full object-cover" /> : <ImageIcon className="size-8 text-slate-300" />}
              </div>
              {canEdit && (
                <label className="mt-2 block cursor-pointer text-center text-sm font-medium text-brand-600">
                  Change photo
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} />
                </label>
              )}
            </div>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
              <Field label="Name" className="sm:col-span-2"><Input disabled={!canEdit} required value={info.name} onChange={set('name')} /></Field>
              <Field label="Category">
                <Select disabled={!canEdit} value={info.category_id} onChange={set('category_id')}>
                  {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
                </Select>
              </Field>
              <Field label="Brand">
                <Select disabled={!canEdit} value={info.brand_id} onChange={set('brand_id')}>
                  <option value="">No brand</option>
                  {(brands.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Sold by">
                <Select disabled={!canEdit} value={info.unit} onChange={set('unit')}>
                  {(shop.meta.units || []).map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select disabled={!canEdit} value={info.is_active ? '1' : '0'} onChange={(e) => setInfo((f) => ({ ...f, is_active: e.target.value === '1' }))}>
                  <option value="1">Active — shown at POS</option>
                  <option value="0">Hidden</option>
                </Select>
              </Field>
              {(shop.features.serials || p.track_serial) && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" disabled={!canEdit} checked={info.track_serial} onChange={(e) => setInfo((f) => ({ ...f, track_serial: e.target.checked }))} />Track serial / IMEI numbers</label>
              )}
              {(shop.features.expiry || p.track_expiry) && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" disabled={!canEdit} checked={info.track_expiry} onChange={(e) => setInfo((f) => ({ ...f, track_expiry: e.target.checked }))} />Track batch &amp; expiry</label>
              )}
              {info.track_serial && <Field label="Warranty (months)"><Input type="number" min="0" max="240" disabled={!canEdit} value={info.warranty_months} onChange={set('warranty_months')} /></Field>}
              <Field label="Description" className="sm:col-span-2"><Textarea disabled={!canEdit} rows={2} value={info.description} onChange={set('description')} /></Field>
              {canEdit && (
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" loading={save.isPending}>Save changes</Button>
                  {can('products.delete') && <Button variant="ghost" icon={Trash2} className="text-red-600 hover:bg-red-50" onClick={remove}>Delete product</Button>}
                </div>
              )}
            </form>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Variants, prices &amp; barcodes</h3>
              {canEdit && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAddingVariant(true)}>Add variant</Button>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>{[shop.option1, shop.option2, 'Barcode', 'Cost', 'Price', 'Alert at', 'Stock', ''].map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {p.variants.map((v) => <VariantRow key={v.id} v={v} unit={p.unit} canEdit={canEdit} canDelete={can('products.delete')} canBarcode={can('barcodes.manage')} onChanged={refresh} onTracking={p.track_serial || p.track_expiry ? () => setTracking(v) : null} trackingLabel={p.track_serial ? 'Serials' : 'Batches'} />)}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Stock is changed through Purchases or Inventory → Adjust, so every change is recorded.</p>
          </div>
        </div>
      )}
      {addingVariant && p && <AddVariantModal product={p} onClose={() => setAddingVariant(false)} onSaved={refresh} />}
      {tracking && p && <TrackingModal product={p} variant={tracking} onClose={() => setTracking(null)} />}
    </Modal>
  );
}

function VariantRow({ v, unit, canEdit, canDelete, canBarcode, onChanged, onTracking, trackingLabel }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [row, setRow] = useState({ color: v.color || '', size: v.size || '', purchase_price: v.purchase_price ?? '', selling_price: v.selling_price, low_stock_threshold: v.low_stock_threshold });
  const [barcode, setBarcode] = useState(v.barcode);
  const [busy, setBusy] = useState(false);
  const dirty = row.color !== (v.color || '') || row.size !== (v.size || '') || String(row.selling_price) !== String(v.selling_price)
    || (v.purchase_price !== undefined && String(row.purchase_price) !== String(v.purchase_price)) || String(row.low_stock_threshold) !== String(v.low_stock_threshold);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg); onChanged(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const save = () => run(() => api.put(`/product-variants/${v.id}`, {
    color: row.color.trim() || null,
    size: row.size.trim() || null,
    selling_price: Number(row.selling_price),
    low_stock_threshold: Number(row.low_stock_threshold || 0),
    ...(v.purchase_price !== undefined ? { purchase_price: Number(row.purchase_price || 0) } : {}),
  }), 'Variant saved');

  const saveBarcode = () => {
    if (!barcode.trim() || barcode === v.barcode) return;
    run(() => api.post(`/product-variants/${v.id}/barcode/assign`, { barcode_number: barcode.trim() }), 'Barcode updated').catch(() => setBarcode(v.barcode));
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Delete variant?', message: 'Variants with stock can\'t be deleted.', danger: true, confirmLabel: 'Delete' }))) return;
    run(() => api.del(`/product-variants/${v.id}`), 'Variant deleted');
  };

  const cell = 'h-9';
  return (
    <tr className="border-t border-slate-100">
      <td className="p-1.5"><Input className={cell} disabled={!canEdit} value={row.color} placeholder="—" onChange={(e) => setRow({ ...row, color: e.target.value })} /></td>
      <td className="p-1.5"><Input className={cell} disabled={!canEdit} value={row.size} placeholder="—" onChange={(e) => setRow({ ...row, size: e.target.value })} /></td>
      <td className="p-1.5">
        <Input className={`${cell} w-40 font-mono`} disabled={!canBarcode} value={barcode} onChange={(e) => setBarcode(e.target.value)} onBlur={saveBarcode} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveBarcode(); } }} title="Scan a new barcode here to replace it" />
      </td>
      <td className="p-1.5">{v.purchase_price !== undefined ? <Input className={`${cell} w-24`} type="number" min="0" step="0.01" disabled={!canEdit} value={row.purchase_price} onChange={(e) => setRow({ ...row, purchase_price: e.target.value })} /> : <span className="text-slate-400">—</span>}</td>
      <td className="p-1.5"><Input className={`${cell} w-24`} type="number" min="0" step="0.01" disabled={!canEdit} value={row.selling_price} onChange={(e) => setRow({ ...row, selling_price: e.target.value })} /></td>
      <td className="p-1.5"><Input className={`${cell} w-20`} type="number" min="0" step="any" disabled={!canEdit} value={row.low_stock_threshold} onChange={(e) => setRow({ ...row, low_stock_threshold: e.target.value })} /></td>
      <td className="whitespace-nowrap px-3"><Badge color={Number(v.stock_qty) <= 0 ? 'red' : v.is_low_stock ? 'amber' : 'green'}>{qty(v.stock_qty)} {unit}</Badge></td>
      <td className="whitespace-nowrap p-1.5 text-right">
        {onTracking && !dirty && <Button size="sm" variant="ghost" onClick={onTracking}>{trackingLabel}</Button>}
        {canEdit && dirty && <Button size="sm" loading={busy} onClick={save}>Save</Button>}
        {canDelete && !dirty && <button type="button" onClick={remove} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete variant"><Trash2 className="size-4" /></button>}
      </td>
    </tr>
  );
}

function AddVariantModal({ product, onClose, onSaved }) {
  const shop = useShop();
  const toast = useToast();
  const [row, setRow] = useState({ color: '', size: '', barcode: '', purchase_price: '', selling_price: product.variants[0]?.selling_price || '', stock_qty: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const step = shop.isFractional(product.unit) ? '0.001' : '1';
  const set = (k) => (e) => setRow((r) => ({ ...r, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/products/${product.id}/variants`, { variants: [{
        color: row.color.trim() || null, size: row.size.trim() || null, barcode: row.barcode.trim() || null,
        purchase_price: Number(row.purchase_price || 0), selling_price: Number(row.selling_price || 0), stock_qty: Number(row.stock_qty || 0),
      }] });
      toast('Variant added');
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Add variant to ${product.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="variant-form" loading={busy}>Add variant</Button></>}>
      <form id="variant-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorBox error={error} /></div>
        <Field label={shop.option1}><Input value={row.color} onChange={set('color')} /></Field>
        <Field label={shop.option2}><Input value={row.size} onChange={set('size')} /></Field>
        <Field label="Barcode" hint="Scan, or leave empty to generate" className="sm:col-span-2"><Input className="font-mono" value={row.barcode} onChange={set('barcode')} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} /></Field>
        <Field label="Cost price"><Input type="number" min="0" step="0.01" value={row.purchase_price} onChange={set('purchase_price')} /></Field>
        <Field label="Selling price" required><Input type="number" min="0" step="0.01" required value={row.selling_price} onChange={set('selling_price')} /></Field>
        <Field label={`Opening stock (${shop.unitLabel(product.unit)})`}><Input type="number" min="0" step={step} value={row.stock_qty} onChange={set('stock_qty')} /></Field>
      </form>
    </Modal>
  );
}


// Serial numbers (in stock / sold) or batches with expiry for one variant.
function TrackingModal({ product, variant, onClose }) {
  const serials = useQuery({ queryKey: ['serials', variant.id], queryFn: () => api.get(`/product-variants/${variant.id}/serials`), enabled: !!product.track_serial, select: (r) => r.data });
  const batches = useQuery({ queryKey: ['batches', variant.id], queryFn: () => api.get(`/product-variants/${variant.id}/batches`), enabled: !!product.track_expiry, select: (r) => r.data });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Modal open onClose={onClose} title={`${product.name}${variantLabel(variant) ? ` — ${variantLabel(variant)}` : ''}`}>
      {product.track_serial && (
        <div className="mb-5">
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Serial / IMEI numbers</h4>
          {serials.isLoading ? <Loading /> : !serials.data?.length ? <p className="text-sm text-slate-500">No serials recorded yet. They are added with opening stock or Purchases.</p> : (
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {serials.data.map((x) => (
                <div key={x.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-mono">{x.serial}</span>
                  <Badge color={x.status === 'in_stock' ? 'green' : x.status === 'sold' ? 'blue' : 'gray'}>{x.status.replace(/_/g, ' ')}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {product.track_expiry && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Batches in stock</h4>
          {batches.isLoading ? <Loading /> : !batches.data?.length ? <p className="text-sm text-slate-500">No batches in stock. Batches are created when you record a purchase with batch / expiry.</p> : (
            <Table>
              <thead><tr><Th>Batch</Th><Th>Expiry</Th><Th className="text-right">Qty left</Th></tr></thead>
              <tbody>
                {batches.data.map((b) => (
                  <tr key={b.id}>
                    <Td className="font-mono">{b.batch_no || '—'}</Td>
                    <Td>{b.expiry_date ? <Badge color={b.expiry_date < today ? 'red' : 'gray'}>{b.expiry_date}</Badge> : '—'}</Td>
                    <Td className="text-right">{qty(b.quantity)} {product.unit}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </Modal>
  );
}
