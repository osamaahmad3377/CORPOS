import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useScanner from '../../lib/useScanner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Package, Pencil, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { primaryImage, useBrands, useCategories } from '../../lib/catalog';
import { money, qty, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import ProductForm from '../../components/ProductForm';
import RecipeEditor from '../../components/RecipeEditor';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Td, Textarea, Th,
  useConfirm, useToast,
  Switch, cx,
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

const SERIAL_STATUS = { in_stock: 'In stock', sold: 'Sold', returned_to_supplier: 'Returned to supplier', damaged: 'Damaged' };

export default function Products() {
  const t = useT();
  const { can } = useAuth();
  const shop = useShop();
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const [adding, setAdding] = useState(searchParams.get('new') ? { barcode: '', name: '' } : null); // { barcode, name } when open
  useEffect(() => { if (searchParams.get('new')) setSearchParams({}, { replace: true }); }, [searchParams, setSearchParams]);
  const [openId, setOpenId] = useState(null);

  // Debounce typing; Enter (what barcode scanners send) searches immediately.
  useEffect(() => {
    const timer = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Scanning a barcode anywhere on this page searches for it (and offers
  // "Add it as a new product" when nothing has that barcode).
  useScanner((code) => { setSearch(code); setTerm(code); setPage(1); }, { enabled: !adding && !openId });

  const params = { search: term, category_id: categoryId, is_active: active, page, per_page: 25 };
  const list = useQuery({ queryKey: ['products', params], queryFn: () => api.get('/products', params), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const restaurant = shop.isRestaurant;
  // Restaurant menu: no stock — each dish is just available (on) or not (off).
  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }) => api.put(`/products/${id}`, { is_active }),
    onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: ['products'] }); toast(v.is_active ? t('{name} is on the menu') : t('{name} is off the menu'), 'success'); },
    onError: (e) => toast(e.message, 'error'),
  });
  const looksLikeBarcode = /^[0-9A-Za-z-]{6,}$/.test(term) && !/\s/.test(term);
  const label = shop.businessType === 'restaurant' ? t('Menu items') : t('My items');

  return (
    <Page>
      <PageHeader
        title={label}
        subtitle={shop.isRestaurant ? t('Your dishes and prices. Switch a dish off when it is not available — it can be ordered any number of times while it is on.') : t('Everything you sell, with price and stock. Scan a barcode in the search box to find an item, or add a new one.')}
        actions={can('products.create') && <Button icon={Plus} size="lg" onClick={() => setAdding({ barcode: '', name: '' })}>{t('Add new item')}</Button>}
      />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-12 ps-10 pe-10 text-base"
              placeholder={t('Search by name, or scan a barcode…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setTerm(search.trim()); setPage(1); } }}
            />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t('Clear')} title={t('Clear')}><X className="size-5" /></button>}
          </div>
          <div className="w-full sm:w-56"><Select className="h-12" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">{t('All categories')}</option>
            {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
          </Select></div>
          <div className="w-full sm:w-52"><Select className="h-12" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
            <option value="">{t('All items')}</option>
            <option value="1">{restaurant ? t('Available only') : t('Shown items only')}</option>
            <option value="0">{restaurant ? t('Unavailable only') : t('Hidden items only')}</option>
          </Select></div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          term && looksLikeBarcode && can('products.create') ? (
            <EmptyState icon={ScanBarcode} title={t('No item has the barcode {code}', { code: term })} action={<Button icon={Plus} size="lg" onClick={() => setAdding({ barcode: term, name: '' })}>{t('Add it as a new item')}</Button>}>
              {t("This barcode isn't in your items yet.")}
            </EmptyState>
          ) : (
            <EmptyState icon={Package} title={term || categoryId ? t('No matching items') : t('No items yet')} action={!term && can('products.create') && <Button icon={Plus} size="lg" onClick={() => setAdding({ barcode: '', name: '' })}>{t('Add your first item')}</Button>}>
              {term || categoryId ? t('Try a different search or category.') : t('Add items by typing their name or scanning their barcode.')}
            </EmptyState>
          )
        ) : (
          <Table>
            <thead>
              <tr><Th className="w-14" /><Th className="text-start">{t('Item')}</Th><Th className="text-start">{t('Category')}</Th><Th className="text-start">{t('Price')}</Th><Th className="text-end">{restaurant ? t('Available') : t('In stock')}</Th><Th /></tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const img = primaryImage(p);
                const stock = totalStock(p.variants);
                const low = (p.variants || []).some((v) => v.is_low_stock);
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-slate-50 [&>td]:py-3.5" onClick={() => setOpenId(p.id)}>
                    <Td>
                      <div className="grid size-10 place-items-center overflow-hidden rounded-lg bg-slate-100">
                        {img ? <img src={img} alt="" className="size-full object-cover" /> : <ImageIcon className="size-4 text-slate-400" />}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        {p.variants?.length > 1 ? t('{n} types', { n: p.variants.length }) : <span className="num font-mono">{p.variants?.[0]?.barcode}</span>}
                        {p.brand && ` · ${p.brand}`}
                        {!p.is_active && <Badge className="ms-2">{restaurant ? t('Unavailable') : t('Hidden')}</Badge>}
                      </div>
                    </Td>
                    <Td className="text-slate-600">{p.category}</Td>
                    <Td className="whitespace-nowrap"><span className="num font-medium">{priceRange(p.variants)}</span> <span className="text-xs text-slate-400">/ {t(shop.unitLabel(p.unit)).toLowerCase()}</span></Td>
                    <Td className="text-end">
                      {restaurant ? (
                        <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className={cx('text-sm font-medium', p.is_active ? 'text-emerald-700' : 'text-slate-400')}>{p.is_active ? t('On') : t('Off')}</span>
                          <Switch checked={!!p.is_active} disabled={!can('products.edit') || toggleActive.isPending} label={t('Available on the menu')} onChange={(v) => toggleActive.mutate({ id: p.id, is_active: v })} />
                        </span>
                      ) : p.track_stock === false ? (
                        <span className="text-sm text-slate-400">{t('Not counted')}</span>
                      ) : (
                        <Badge color={stock <= 0 ? 'red' : low ? 'amber' : 'green'} className="text-sm">{stock <= 0 ? t('Finished') : <><span className="num">{qty(stock)}</span>&nbsp;{t(shop.unitLabel(p.unit))}</>}</Badge>
                      )}
                    </Td>
                    <Td className="text-end"><span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand-700"><Pencil className="size-4" />{t('Open')}</span></Td>
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
  const t = useT();
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
  // stock is shown only for items that count it (never on a restaurant menu)
  const counted = !shop.isRestaurant && p?.track_stock !== false;

  useEffect(() => {
    if (p) setInfo({ name: p.name, category_id: p.category_id, brand_id: p.brand_id || '', unit: p.unit, description: p.description || '', is_active: p.is_active, track_serial: !!p.track_serial, track_expiry: !!p.track_expiry, warranty_months: p.warranty_months ?? '', track_stock: p.track_stock !== false });
  }, [p]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const save = useMutation({
    mutationFn: () => api.put(`/products/${id}`, { ...info, category_id: Number(info.category_id), brand_id: info.brand_id ? Number(info.brand_id) : null, warranty_months: info.warranty_months === '' ? null : Number(info.warranty_months) }),
    onSuccess: () => { refresh(); toast(t('Item saved')); },
    onError: setError,
  });

  const remove = async () => {
    if (!(await confirm({ title: t('Delete this item?'), message: t("{name} will be removed from your items. An item that still has stock can't be deleted.", { name: p.name }), danger: true, confirmLabel: t('Delete') }))) return;
    try {
      await api.del(`/products/${id}`);
      refresh();
      toast(t('Item deleted'));
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
      toast(t('Photo changed'));
    } catch (err) {
      setError(err);
    }
  };

  const set = (k) => (e) => setInfo((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open onClose={onClose} size="xl" title={p ? p.name : t('Item')}>
      {!p || !info ? <Loading /> : (
        <div className="space-y-6">
          <ErrorBox error={error} />
          <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
            <div>
              <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-slate-100">
                {primaryImage(p) ? <img src={primaryImage(p)} alt="" className="size-full object-cover" /> : <ImageIcon className="size-8 text-slate-300" />}
              </div>
              {canEdit && (
                <label className="mt-2 block cursor-pointer rounded-lg border border-slate-300 px-3 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-slate-50">
                  {t('Change photo')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} />
                </label>
              )}
            </div>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
              <Field label={t('Item name')} className="sm:col-span-2"><Input disabled={!canEdit} required value={info.name} onChange={set('name')} /></Field>
              <Field label={t('Category')}>
                <Select disabled={!canEdit} value={info.category_id} onChange={set('category_id')}>
                  {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
                </Select>
              </Field>
              <Field label={t('Brand')}>
                <Select disabled={!canEdit} value={info.brand_id} onChange={set('brand_id')}>
                  <option value="">{t('No brand')}</option>
                  {(brands.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label={t('Sold by')}>
                <Select disabled={!canEdit} value={info.unit} onChange={set('unit')}>
                  {(shop.meta.units || []).map((u) => <option key={u.code} value={u.code}>{t(u.label)}</option>)}
                </Select>
              </Field>
              {shop.isRestaurant ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/10 px-4 py-3 sm:col-span-2">
                  <span>
                    <span className="block font-semibold text-slate-900">{t('Available on the menu')}</span>
                    <span className="block text-sm text-slate-500">{info.is_active ? t('Shown on the order screen — can be ordered any number of times.') : t('Hidden from the order screen (e.g. finished for today).')}</span>
                  </span>
                  <Switch checked={!!info.is_active} disabled={!canEdit} label={t('Available on the menu')} onChange={(v) => setInfo((f) => ({ ...f, is_active: v }))} />
                </div>
              ) : (
                <>
                  <Field label={t('Show on the Sell screen?')}>
                    <Select disabled={!canEdit} value={info.is_active ? '1' : '0'} onChange={(e) => setInfo((f) => ({ ...f, is_active: e.target.value === '1' }))}>
                      <option value="1">{t('Yes — shown, can be sold')}</option>
                      <option value="0">{t('No — hidden')}</option>
                    </Select>
                  </Field>
                  <label className="flex items-center gap-3 py-1 text-sm sm:col-span-2"><input type="checkbox" className="size-5 accent-brand-600" disabled={!canEdit} checked={info.track_stock} onChange={(e) => setInfo((f) => ({ ...f, track_stock: e.target.checked }))} />{t('Count stock for this item')}</label>
                </>
              )}
              {(shop.features.serials || p.track_serial) && (
                <label className="flex items-center gap-3 py-1 text-sm"><input type="checkbox" className="size-5 accent-brand-600" disabled={!canEdit} checked={info.track_serial} onChange={(e) => setInfo((f) => ({ ...f, track_serial: e.target.checked }))} />{t('Track serial / IMEI numbers')}</label>
              )}
              {(shop.features.expiry || p.track_expiry) && (
                <label className="flex items-center gap-3 py-1 text-sm"><input type="checkbox" className="size-5 accent-brand-600" disabled={!canEdit} checked={info.track_expiry} onChange={(e) => setInfo((f) => ({ ...f, track_expiry: e.target.checked }))} />{t('Track batch & expiry date')}</label>
              )}
              {info.track_serial && <Field label={t('Warranty (months)')}><Input type="number" min="0" max="240" disabled={!canEdit} value={info.warranty_months} onChange={set('warranty_months')} /></Field>}
              <Field label={t('Description')} className="sm:col-span-2"><Textarea disabled={!canEdit} rows={2} value={info.description} onChange={set('description')} /></Field>
              {canEdit && (
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="submit" size="lg" loading={save.isPending}>{t('Save changes')}</Button>
                  {can('products.delete') && <Button variant="ghost" size="lg" icon={Trash2} className="text-red-600 hover:bg-red-50" onClick={remove}>{t('Delete item')}</Button>}
                </div>
              )}
            </form>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">{t('Prices, barcodes & types')}</h3>
                <p className="text-xs text-slate-500">{t('Change a price here, then press Save on that row.')}</p>
              </div>
              {canEdit && <Button variant="secondary" icon={Plus} onClick={() => setAddingVariant(true)}>{t('Add a type')}</Button>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className={cx('w-full text-sm', counted ? 'min-w-[920px]' : 'min-w-[640px]')}>
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>{[t(shop.option1), t(shop.option2), t('Barcode'), t('Buying price'), t('Selling price'), ...(shop.isRestaurant ? [] : [t('Wholesale price')]), ...(counted ? [t('Warn when below'), t('Stock')] : []), ''].map((h, i) => <th key={i} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {p.variants.map((v) => <VariantRow key={v.id} v={v} unit={p.unit} counted={counted} wholesale={!shop.isRestaurant} canEdit={canEdit} canDelete={can('products.delete')} canBarcode={can('barcodes.manage')} onChanged={refresh} onTracking={p.track_serial || p.track_expiry ? () => setTracking(v) : null} trackingLabel={p.track_serial ? t('Serial numbers') : t('Batches')} />)}
                </tbody>
              </table>
            </div>
            {counted && <p className="mt-2 text-xs text-slate-500">{t('To change stock, use "Buy stock (purchases)" or "Stock count" — that way every change is written down.')}</p>}
            {shop.isRestaurant && can('inventory.view') && <div className="mt-5"><RecipeEditor variants={p.variants} canEdit={canEdit} /></div>}
          </div>
        </div>
      )}
      {addingVariant && p && <AddVariantModal counted={counted} product={p} onClose={() => setAddingVariant(false)} onSaved={refresh} />}
      {tracking && p && <TrackingModal product={p} variant={tracking} onClose={() => setTracking(null)} />}
    </Modal>
  );
}

function VariantRow({ v, unit, counted = true, wholesale = true, canEdit, canDelete, canBarcode, onChanged, onTracking, trackingLabel }) {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const confirm = useConfirm();
  const [row, setRow] = useState({ color: v.color || '', size: v.size || '', purchase_price: v.purchase_price ?? '', selling_price: v.selling_price, wholesale_price: v.wholesale_price ?? '', low_stock_threshold: v.low_stock_threshold });
  const [barcode, setBarcode] = useState(v.barcode);
  const [busy, setBusy] = useState(false);
  const dirty = row.color !== (v.color || '') || row.size !== (v.size || '') || String(row.selling_price) !== String(v.selling_price) || String(row.wholesale_price) !== String(v.wholesale_price ?? '')
    || (v.purchase_price !== undefined && String(row.purchase_price) !== String(v.purchase_price)) || String(row.low_stock_threshold) !== String(v.low_stock_threshold);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg); onChanged(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const save = () => run(() => api.put(`/product-variants/${v.id}`, {
    color: row.color.trim() || null,
    size: row.size.trim() || null,
    selling_price: Number(row.selling_price),
    wholesale_price: row.wholesale_price === '' || row.wholesale_price == null ? null : Number(row.wholesale_price),
    low_stock_threshold: Number(row.low_stock_threshold || 0),
    ...(v.purchase_price !== undefined ? { purchase_price: Number(row.purchase_price || 0) } : {}),
  }), t('Saved'));

  const saveBarcode = () => {
    if (!barcode.trim() || barcode === v.barcode) return;
    run(() => api.post(`/product-variants/${v.id}/barcode/assign`, { barcode_number: barcode.trim() }), t('Barcode changed')).catch(() => setBarcode(v.barcode));
  };

  const remove = async () => {
    if (!(await confirm({ title: t('Delete this type?'), message: t("A type that still has stock can't be deleted."), danger: true, confirmLabel: t('Delete') }))) return;
    run(() => api.del(`/product-variants/${v.id}`), t('Type deleted'));
  };

  const cell = 'h-10';
  return (
    <tr className="border-t border-slate-100">
      <td className="p-1.5"><Input className={cell} disabled={!canEdit} value={row.color} placeholder="—" onChange={(e) => setRow({ ...row, color: e.target.value })} /></td>
      <td className="p-1.5"><Input className={cell} disabled={!canEdit} value={row.size} placeholder="—" onChange={(e) => setRow({ ...row, size: e.target.value })} /></td>
      <td className="p-1.5">
        <Input className={`${cell} w-40 font-mono`} dir="ltr" disabled={!canBarcode} value={barcode} onChange={(e) => setBarcode(e.target.value)} onBlur={saveBarcode} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveBarcode(); } }} title={t('Scan a new barcode here to replace it')} />
      </td>
      <td className="p-1.5">{v.purchase_price !== undefined ? <Input className={`${cell} w-24`} type="number" min="0" step="0.01" disabled={!canEdit} value={row.purchase_price} onChange={(e) => setRow({ ...row, purchase_price: e.target.value })} /> : <span className="text-slate-400">—</span>}</td>
      <td className="p-1.5"><Input className={`${cell} w-24`} type="number" min="0" step="0.01" disabled={!canEdit} value={row.selling_price} onChange={(e) => setRow({ ...row, selling_price: e.target.value })} /></td>
      {wholesale && <td className="p-1.5"><Input className={`${cell} w-24`} type="number" min="0" step="0.01" disabled={!canEdit} placeholder="—" title={t('Wholesale price (optional)')} value={row.wholesale_price} onChange={(e) => setRow({ ...row, wholesale_price: e.target.value })} /></td>}
      {counted && <td className="p-1.5"><Input className={`${cell} w-20`} type="number" min="0" step="any" disabled={!canEdit} value={row.low_stock_threshold} onChange={(e) => setRow({ ...row, low_stock_threshold: e.target.value })} /></td>}
      {counted && <td className="whitespace-nowrap px-3"><Badge color={Number(v.stock_qty) <= 0 ? 'red' : v.is_low_stock ? 'amber' : 'green'}><span className="num">{qty(v.stock_qty)}</span>&nbsp;{t(shop.unitLabel(unit))}</Badge></td>}
      <td className="whitespace-nowrap p-1.5 text-end">
        {onTracking && !dirty && <Button size="sm" variant="ghost" onClick={onTracking}>{trackingLabel}</Button>}
        {canEdit && dirty && <Button loading={busy} onClick={save}>{t('Save')}</Button>}
        {canDelete && !dirty && <button type="button" onClick={remove} className="rounded-lg p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('Delete this type')} title={t('Delete this type')}><Trash2 className="size-5" /></button>}
      </td>
    </tr>
  );
}

function AddVariantModal({ product, counted = true, onClose, onSaved }) {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const [row, setRow] = useState({ color: '', size: '', barcode: '', purchase_price: '', selling_price: product.variants[0]?.selling_price || '', wholesale_price: product.variants[0]?.wholesale_price || '', stock_qty: '' });
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
        wholesale_price: row.wholesale_price === '' || row.wholesale_price == null ? null : Number(row.wholesale_price),
      }] });
      toast(t('Type added'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('Add a type to {name}', { name: product.name })} footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" size="lg" form="variant-form" loading={busy}>{t('Add type')}</Button></>}>
      <form id="variant-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorBox error={error} /></div>
        <Field label={t(shop.option1)}><Input value={row.color} onChange={set('color')} /></Field>
        <Field label={t(shop.option2)}><Input value={row.size} onChange={set('size')} /></Field>
        <Field label={t('Barcode — scan it or leave empty')} hint={t('If you leave it empty, a barcode is made for you.')} className="sm:col-span-2"><Input className="font-mono" dir="ltr" value={row.barcode} onChange={set('barcode')} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} /></Field>
        <Field label={t('Buying price (cost)')}><Input type="number" min="0" step="0.01" value={row.purchase_price} onChange={set('purchase_price')} /></Field>
        <Field label={t('Selling price')} required><Input type="number" min="0" step="0.01" required value={row.selling_price} onChange={set('selling_price')} /></Field>
        {!shop.isRestaurant && <Field label={t('Wholesale price (optional)')} hint={t('Leave empty to use the selling price.')}><Input type="number" min="0" step="0.01" value={row.wholesale_price} onChange={set('wholesale_price')} /></Field>}
        {counted && <Field label={t('How many in stock now?')} hint={t('Count in {unit}. Leave empty if none.', { unit: t(shop.unitLabel(product.unit)) })}><Input type="number" min="0" step={step} value={row.stock_qty} onChange={set('stock_qty')} /></Field>}
      </form>
    </Modal>
  );
}


// Serial numbers (in stock / sold) or batches with expiry for one variant.
function TrackingModal({ product, variant, onClose }) {
  const t = useT();
  const shop = useShop();
  const serials = useQuery({ queryKey: ['serials', variant.id], queryFn: () => api.get(`/product-variants/${variant.id}/serials`), enabled: !!product.track_serial, select: (r) => r.data });
  const batches = useQuery({ queryKey: ['batches', variant.id], queryFn: () => api.get(`/product-variants/${variant.id}/batches`), enabled: !!product.track_expiry, select: (r) => r.data });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Modal open onClose={onClose} title={`${product.name}${variantLabel(variant) ? ` — ${variantLabel(variant)}` : ''}`}>
      {product.track_serial && (
        <div className="mb-5">
          <h4 className="mb-2 text-sm font-semibold text-slate-800">{t('Serial / IMEI numbers')}</h4>
          {serials.isLoading ? <Loading /> : !serials.data?.length ? <p className="text-sm text-slate-500">{t('No serial numbers yet. They are added when you add the item or buy stock.')}</p> : (
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {serials.data.map((x) => (
                <div key={x.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span className="num font-mono">{x.serial}</span>
                  <Badge color={x.status === 'in_stock' ? 'green' : x.status === 'sold' ? 'blue' : 'gray'}>{t(SERIAL_STATUS[x.status] || x.status.replace(/_/g, ' '))}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {product.track_expiry && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">{t('Batches in stock')}</h4>
          {batches.isLoading ? <Loading /> : !batches.data?.length ? <p className="text-sm text-slate-500">{t('No batches in stock. A batch is made when you buy stock and enter a batch / expiry date.')}</p> : (
            <Table>
              <thead><tr><Th className="text-start">{t('Batch')}</Th><Th className="text-start">{t('Expiry')}</Th><Th className="text-end">{t('Left')}</Th></tr></thead>
              <tbody>
                {batches.data.map((b) => (
                  <tr key={b.id}>
                    <Td className="font-mono">{b.batch_no || '—'}</Td>
                    <Td>{b.expiry_date ? <Badge color={b.expiry_date < today ? 'red' : 'gray'}><span className="num">{b.expiry_date}</span></Badge> : '—'}</Td>
                    <Td className="text-end"><span className="num">{qty(b.quantity)}</span> {t(shop.unitLabel(product.unit))}</Td>
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
