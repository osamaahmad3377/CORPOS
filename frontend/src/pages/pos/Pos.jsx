import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChefHat, ImageIcon, ListChecks, Minus, PauseCircle, PlayCircle, Plus, Printer, ScanBarcode, ShoppingCart, Trash2, UserPlus, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { primaryImage, useCategories } from '../../lib/catalog';
import { money, qty, round3, variantLabel } from '../../lib/format';
import ProductForm from '../../components/ProductForm';
import Receipt from '../../components/Receipt';
import KitchenSlip, { ORDER_TYPES, orderTypeLabel } from '../../components/KitchenSlip';
import { Badge, Button, ErrorBox, Field, Input, Loading, Modal, Select, cx, useToast } from '../../components/ui';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// Cart line from a variant (+ its product's unit).
function lineFrom(variant, product, shop) {
  const unit = variant.unit || product?.unit || 'pcs';
  return {
    variant_id: variant.id,
    name: variant.product_name || product?.name || 'Item',
    label: variantLabel(variant),
    unit,
    fractional: shop.isFractional(unit),
    price: Number(variant.selling_price),
    stock: Number(variant.stock_qty),
    qty: 1,
    discount: 0,
    // serial/IMEI items: one chosen serial per unit, qty follows the list
    serialTracked: !!(variant.track_serial ?? product?.track_serial),
    serials: [],
  };
}

export default function Pos() {
  const shop = useShop();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const scanRef = useRef(null);

  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [discount, setDiscount] = useState({ value: '', mode: 'amount' });
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [picking, setPicking] = useState(null); // product with several variants
  const [unknown, setUnknown] = useState(null); // scanned code not in catalog
  const [adding, setAdding] = useState(null); // ProductForm initial barcode
  const [paying, setPaying] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [serialPick, setSerialPick] = useState(null); // { variant, product, preselect }
  const [order, setOrder] = useState({ type: 'dine_in', table: '', note: '' }); // restaurant mode
  const [kot, setKot] = useState(null); // kitchen slip to print
  const restaurant = shop.features.restaurant;

  const focusScan = useCallback(() => setTimeout(() => scanRef.current?.focus(), 30), []);

  // ------------------------------------------------------------ catalog
  const categories = useCategories();
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  const productParams = { search: debounced, category_id: categoryId, is_active: 1, per_page: 60 };
  const products = useQuery({ queryKey: ['products', 'pos', productParams], queryFn: () => api.get('/products', productParams), placeholderData: (p) => p });

  // ------------------------------------------------------------ cart ops
  const addLine = useCallback((line) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.variant_id === line.variant_id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: round3(l.qty + 1) } : l));
      return [...c, line];
    });
  }, []);

  const addVariant = useCallback((variant, product, serial) => {
    const line = lineFrom(variant, product, shop);
    if (line.serialTracked) {
      const existing = cart.find((l) => l.variant_id === variant.id);
      setSerialPick({ line: existing || line, preselect: [...(existing?.serials || []), ...(serial ? [serial] : [])] });
      return;
    }
    const inCart = cart.find((l) => l.variant_id === variant.id)?.qty || 0;
    if (line.stock - inCart <= 0) {
      toast(`${line.name}: only ${qty(line.stock)} in stock`, 'error');
      return;
    }
    addLine(line);
  }, [addLine, cart, shop, toast]);

  const addProduct = (p) => {
    const variants = (p.variants || []).filter((v) => v.is_active !== false);
    if (variants.length === 1) addVariant(variants[0], p);
    else if (variants.length > 1) setPicking(p);
    focusScan();
  };

  const setQty = (id, value) => setCart((c) => c.map((l) => (l.variant_id === id ? { ...l, qty: value } : l)));
  const bump = (id, d) => setCart((c) => c.map((l) => (l.variant_id === id && !l.serialTracked ? { ...l, qty: Math.max(l.fractional ? 0.001 : 1, round3(Number(l.qty || 0) + d)) } : l)));
  const setSerials = (line, serials) => setCart((c) => {
    if (!serials.length) return c.filter((l) => l.variant_id !== line.variant_id);
    const next = { ...line, serials, qty: serials.length };
    return c.some((l) => l.variant_id === line.variant_id) ? c.map((l) => (l.variant_id === line.variant_id ? next : l)) : [...c, next];
  });
  const removeLine = (id) => setCart((c) => c.filter((l) => l.variant_id !== id));

  const clearSale = () => {
    setCart([]);
    setCustomer(null);
    setDiscount({ value: '', mode: 'amount' });
    setOrder((o) => ({ type: o.type, table: '', note: '' }));
    focusScan();
  };

  // ------------------------------------------------------------ scanning
  const onScan = async (e) => {
    e.preventDefault();
    const code = query.trim();
    if (!code) return;
    setBusy(true);
    try {
      const res = await api.get(`/barcodes/scan/${encodeURIComponent(code)}`);
      addVariant(res.variant, res.product);
      setQuery('');
    } catch (err) {
      if (err.status !== 404) { toast(err.message, 'error'); return; }
      // A serial / IMEI number of one specific unit?
      if (shop.features.serials) {
        const unit = await api.get(`/serials/${encodeURIComponent(code)}`).catch(() => null);
        if (unit) {
          if (unit.status === 'in_stock') addVariant(unit.variant, null, unit.serial);
          else toast(`${unit.serial} is ${unit.status.replace(/_/g, ' ')}${unit.invoice_number ? ` (bill ${unit.invoice_number})` : ''}`, 'error');
          setQuery('');
          return;
        }
      }
      // Not a barcode — maybe a name/SKU with exactly one match.
      const found = await api.get('/product-variants/search', { q: code }).catch(() => ({ data: [] }));
      if (found.data?.length === 1) {
        addVariant(found.data[0]);
        setQuery('');
      } else if (!found.data?.length) {
        setUnknown(code);
      }
      // several matches: they're visible in the grid below
    } finally {
      setBusy(false);
      focusScan();
    }
  };

  // ------------------------------------------------------------ totals
  const totals = useMemo(() => {
    const subtotal = cart.reduce((a, l) => a + l.price * Number(l.qty || 0) - Number(l.discount || 0), 0);
    const dv = Number(discount.value || 0);
    const saleDiscount = Math.min(Math.max(discount.mode === 'percent' ? (subtotal * dv) / 100 : dv, 0), subtotal);
    const tax = shop.taxEnabled ? Math.round((subtotal - saleDiscount) * shop.taxPercent) / 100 : 0;
    const round2 = (n) => Math.round(n * 100) / 100;
    return { subtotal: round2(subtotal), discount: round2(saleDiscount), tax: round2(tax), total: round2(subtotal - saleDiscount + tax), items: cart.length };
  }, [cart, discount, shop.taxEnabled, shop.taxPercent]);

  const cartError = cart.find((l) => !(Number(l.qty) > 0) || (!l.fractional && !Number.isInteger(Number(l.qty))) || (l.serialTracked && l.serials.length !== Number(l.qty)));

  // ------------------------------------------------------------ checkout
  const payload = (extra) => ({
    customer_id: customer?.id || null,
    items: cart.map((l) => ({ variant_id: l.variant_id, quantity: Number(l.qty), unit_price: l.price, discount_per_item: Number(l.discount || 0), ...(l.serialTracked ? { serials: l.serials } : {}) })),
    discount_amount: totals.discount,
    tax_amount: totals.tax,
    ...(restaurant ? { order_type: order.type, table_no: order.table.trim() || null, notes: order.note.trim() || null } : {}),
    ...extra,
  });

  const hold = async () => {
    if (!cart.length) return;
    setBusy(true);
    try {
      const res = await api.post('/sales', payload({ status: 'held', payment_method: 'cash', payment_received: 0, idempotency_key: uid() }));
      if (restaurant) {
        setKot({ ...res.data, items: res.data.items?.length ? res.data.items : cart.map((l) => ({ product_name: l.name, color: null, size: l.label, quantity: l.qty })) });
        toast(`Order ${res.data.invoice_number} sent to kitchen`);
      } else {
        toast(`Bill held as ${res.data.invoice_number}`);
      }
      qc.invalidateQueries({ queryKey: ['sales'] });
      clearSale();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const editHeld = async (sale) => {
    try {
      await api.del(`/sales/${sale.invoice_number}`);
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    setCart(sale.items.map((it) => ({
      variant_id: it.variant_id, name: it.product_name, label: variantLabel(it), unit: it.unit || 'pcs', fractional: shop.isFractional(it.unit),
      price: Number(it.unit_price), stock: Infinity, qty: Number(it.quantity), discount: Number(it.discount_per_item || 0),
      serialTracked: !!it.serials?.length, serials: it.serials || [],
    })));
    setOrder({ type: sale.order_type || 'dine_in', table: sale.table_no || '', note: sale.notes || '' });
    setCustomer(sale.customer_id ? { id: sale.customer_id, name: sale.customer, phone: '' } : null);
    setResuming(false);
    qc.invalidateQueries({ queryKey: ['sales'] });
    toast(`Order ${sale.invoice_number} reopened — add items, then send to kitchen or take payment`, 'info');
  };

  const completed = async (sale) => {
    setPaying(false);
    setResuming(false);
    const full = sale.items?.length && sale.items[0].product_name ? sale : (await api.get(`/sales/${sale.invoice_number}`)).data;
    setReceipt(full);
    clearSale();
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
  };

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); focusScan(); }
      if (e.key === 'F4') { e.preventDefault(); hold(); }
      if (e.key === 'F8') { e.preventDefault(); if (cart.length && !cartError) setPaying(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => { focusScan(); }, [focusScan]);

  const cats = (categories.data || []).filter((c) => c.products_count > 0);
  const grid = products.data?.data || [];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* ------------------------------------------------ left: catalog */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-slate-200 bg-white p-4">
          <form onSubmit={onScan} className="relative">
            <ScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-brand-600" />
            <Input
              ref={scanRef}
              className="h-12 pl-11 pr-24 text-base"
              placeholder="Scan barcode or type product name…  (F2)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {query && <button type="button" onClick={() => { setQuery(''); focusScan(); }} className="rounded p-1.5 text-slate-400 hover:text-slate-600" aria-label="Clear"><X className="size-4" /></button>}
              <Button type="submit" size="sm" loading={busy}>Add</Button>
            </div>
          </form>
          {cats.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {[{ id: '', path: 'All' }, ...cats].map((c) => (
                <button key={c.id || 'all'} type="button" onClick={() => setCategoryId(String(c.id))} className={cx('whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition', String(categoryId) === String(c.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
                  {c.path}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {products.isLoading ? <Loading /> : !grid.length ? (
            <div className="py-16 text-center text-sm text-slate-500">
              {debounced ? <>No products match &ldquo;{debounced}&rdquo;. Press Enter to look it up as a barcode.</> : 'No products yet. Add products from the Products page, or scan a barcode to add one.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {grid.map((p) => {
                const img = primaryImage(p);
                const stock = (p.variants || []).reduce((a, v) => a + Number(v.stock_qty), 0);
                const prices = (p.variants || []).map((v) => Number(v.selling_price));
                return (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} disabled={stock <= 0} className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-brand-400 hover:shadow disabled:opacity-50">
                    <div className="grid aspect-[4/3] place-items-center bg-slate-100">
                      {img ? <img src={img} alt="" className="size-full object-cover" /> : <ImageIcon className="size-6 text-slate-300" />}
                    </div>
                    <div className="flex flex-1 flex-col p-2.5">
                      <div className="line-clamp-2 text-sm font-medium text-slate-900">{p.name}</div>
                      <div className="mt-auto flex items-end justify-between pt-1">
                        <span className="text-sm font-semibold text-brand-700">{money(Math.min(...prices))}{prices.length > 1 && Math.max(...prices) !== Math.min(...prices) ? '+' : ''}</span>
                        <span className={cx('text-xs', stock <= 0 ? 'text-red-600' : 'text-slate-500')}>{stock <= 0 ? 'Out' : `${qty(stock)} ${p.unit}`}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------ right: bill */}
      <aside className="flex min-h-0 w-full flex-col border-l border-slate-200 bg-white lg:w-[420px]">
        <div className="space-y-2 border-b border-slate-200 p-3">
          {restaurant && (
            <div className="flex gap-2">
              <div className="flex flex-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
                {ORDER_TYPES.map((t) => (
                  <button key={t.code} type="button" onClick={() => setOrder((o) => ({ ...o, type: t.code }))} className={cx('flex-1 whitespace-nowrap rounded-md px-1.5 py-1.5 transition', order.type === t.code ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>{t.label}</button>
                ))}
              </div>
              {order.type === 'dine_in' && <Input className="h-10 w-20" placeholder="Table" value={order.table} onChange={(e) => setOrder((o) => ({ ...o, table: e.target.value }))} />}
            </div>
          )}
          <CustomerPicker value={customer} onChange={setCustomer} canCreate={can('customers.create')} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!cart.length ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400">
              <ShoppingCart className="mb-2 size-10" />
              <p className="font-medium text-slate-500">Cart is empty</p>
              <p className="text-sm">Scan a barcode or tap a product</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cart.map((l) => {
                const bad = !(Number(l.qty) > 0) || (!l.fractional && !Number.isInteger(Number(l.qty)));
                const over = Number(l.qty) > l.stock;
                return (
                  <li key={l.variant_id} className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900">{l.name}</div>
                        <div className="text-xs text-slate-500">{[l.label, `${money(l.price)} / ${shop.unitLabel(l.unit).toLowerCase()}`].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="text-right font-semibold text-slate-900">{money(l.price * Number(l.qty || 0) - Number(l.discount || 0))}</div>
                      <button type="button" onClick={() => removeLine(l.variant_id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 className="size-4" /></button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {l.serialTracked ? (
                        <Button size="sm" variant="secondary" icon={ListChecks} onClick={() => setSerialPick({ line: l, preselect: l.serials })}>{l.serials.length} serial{l.serials.length === 1 ? '' : 's'}</Button>
                      ) : (
                      <div className="flex items-center rounded-lg border border-slate-300">
                        <button type="button" onClick={() => bump(l.variant_id, -1)} className="px-2 py-1.5 text-slate-500 hover:text-slate-800" aria-label="Less"><Minus className="size-3.5" /></button>
                        <input
                          className={cx('w-16 border-x border-slate-300 py-1 text-center text-sm outline-none', bad && 'bg-red-50 text-red-700')}
                          type="number" min="0" step={l.fractional ? '0.001' : '1'} value={l.qty}
                          onChange={(e) => setQty(l.variant_id, e.target.value)}
                        />
                        <button type="button" onClick={() => bump(l.variant_id, 1)} className="px-2 py-1.5 text-slate-500 hover:text-slate-800" aria-label="More"><Plus className="size-3.5" /></button>
                      </div>
                      )}
                      <span className="text-xs text-slate-500">{l.unit}</span>
                      <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                        Disc
                        <input className="w-16 rounded-md border border-slate-300 px-1.5 py-1 text-right text-sm" type="number" min="0" step="0.01" value={l.discount || ''} placeholder="0" onChange={(e) => setCart((c) => c.map((x) => (x.variant_id === l.variant_id ? { ...x, discount: e.target.value } : x)))} />
                      </div>
                    </div>
                    {l.serialTracked && l.serials.length > 0 && <p className="mt-1 truncate font-mono text-xs text-slate-500">{l.serials.join(', ')}</p>}
                    {over && <p className="mt-1 text-xs text-red-600">Only {qty(l.stock)} in stock</p>}
                    {bad && <p className="mt-1 text-xs text-red-600">{l.fractional ? 'Enter a quantity above 0' : 'Whole numbers only for this item'}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-200 p-4 text-sm">
          <div className="flex justify-between text-slate-600"><span>Subtotal ({totals.items} items)</span><span>{money(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-2 text-slate-600">
            <span>Discount</span>
            <div className="flex items-center gap-1">
              <input className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right" type="number" min="0" step="0.01" placeholder="0" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} />
              <select className="rounded-md border border-slate-300 px-1 py-1" value={discount.mode} onChange={(e) => setDiscount((d) => ({ ...d, mode: e.target.value }))}>
                <option value="amount">Rs</option><option value="percent">%</option>
              </select>
              <span className="w-20 text-right">-{money(totals.discount)}</span>
            </div>
          </div>
          {shop.taxEnabled && <div className="flex justify-between text-slate-600"><span>{shop.taxLabel} ({shop.taxPercent}%)</span><span>{money(totals.tax)}</span></div>}
          <div className="flex justify-between pt-1 text-xl font-bold text-slate-900"><span>Total</span><span>{money(totals.total)}</span></div>
          {restaurant && <Input className="h-9" placeholder="Kitchen note (e.g. less spicy)" value={order.note} onChange={(e) => setOrder((o) => ({ ...o, note: e.target.value }))} />}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {restaurant
              ? <Button variant="secondary" icon={ChefHat} disabled={!cart.length || busy || !!cartError} onClick={hold}>Kitchen</Button>
              : <Button variant="secondary" icon={PauseCircle} disabled={!cart.length || busy} onClick={hold}>Hold</Button>}
            <Button variant="secondary" icon={PlayCircle} onClick={() => setResuming(true)}>{restaurant ? 'Orders' : 'Resume'}</Button>
            <Button variant="ghost" icon={X} disabled={!cart.length} onClick={clearSale}>Clear</Button>
          </div>
          <Button size="lg" variant="success" className="w-full text-lg" disabled={!cart.length || !!cartError} onClick={() => setPaying(true)}>
            Pay {money(totals.total)} <span className="text-sm font-normal opacity-80">F8</span>
          </Button>
        </div>
      </aside>

      {/* ------------------------------------------------ modals */}
      {picking && (
        <Modal open onClose={() => { setPicking(null); focusScan(); }} title={picking.name}>
          <div className="grid gap-2 sm:grid-cols-2">
            {picking.variants.filter((v) => v.is_active !== false).map((v) => (
              <button key={v.id} type="button" disabled={Number(v.stock_qty) <= 0} onClick={() => { addVariant(v, picking); setPicking(null); focusScan(); }} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-brand-400 disabled:opacity-50">
                <div>
                  <div className="font-medium">{variantLabel(v) || 'Standard'}</div>
                  <div className="text-xs text-slate-500">{qty(v.stock_qty)} in stock</div>
                </div>
                <span className="font-semibold text-brand-700">{money(v.selling_price)}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      <Modal open={!!unknown} onClose={() => { setUnknown(null); focusScan(); }} size="sm" title="Barcode not found"
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setUnknown(null); focusScan(); }}>Cancel</Button>
            {can('products.create') && <Button icon={Plus} onClick={() => { setAdding(unknown); setUnknown(null); }}>Add as new product</Button>}
          </>
        )}
      >
        <p className="text-sm text-slate-600">No product has the barcode <span className="font-mono font-semibold text-slate-900">{unknown}</span>.</p>
        {can('products.create') ? <p className="mt-2 text-sm text-slate-600">Add it now — it will go straight into this bill.</p> : <p className="mt-2 text-sm text-slate-600">Ask a manager to add this product.</p>}
      </Modal>

      <ProductForm
        open={!!adding}
        initialBarcode={adding || ''}
        onClose={() => { setAdding(null); setQuery(''); focusScan(); }}
        onSaved={(p) => { if (p.variants?.[0] && Number(p.variants[0].stock_qty) > 0) addVariant(p.variants[0], p); else toast('Product added — add stock through Purchases or Inventory to sell it.', 'info'); }}
      />

      {paying && <PayModal totals={totals} customer={customer} onClose={() => { setPaying(false); focusScan(); }} payload={payload} onDone={completed} />}
      {resuming && <ResumeModal restaurant={restaurant} onClose={() => { setResuming(false); focusScan(); }} onDone={completed} onEdit={editHeld} />}
      {serialPick && <SerialPicker line={serialPick.line} preselect={serialPick.preselect} onClose={() => { setSerialPick(null); focusScan(); }} onDone={(list) => { setSerials(serialPick.line, list); setSerialPick(null); focusScan(); }} />}
      <Modal open={!!kot} onClose={() => { setKot(null); focusScan(); }} size="sm" title="Kitchen order"
        footer={<><Button variant="secondary" onClick={() => { setKot(null); focusScan(); }}>Close</Button><Button icon={Printer} onClick={() => window.print()}>Print slip</Button></>}
      >
        {kot && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><KitchenSlip order={kot} /></div>}
      </Modal>

      <Modal open={!!receipt} onClose={() => { setReceipt(null); focusScan(); }} size="sm" title={`Sale complete — ${receipt?.invoice_number || ''}`}
        footer={<><Button variant="secondary" onClick={() => { setReceipt(null); focusScan(); }}>New sale</Button><Button icon={Printer} onClick={() => window.print()}>Print receipt</Button></>}
      >
        {receipt && (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {Number(receipt.change_amount) > 0 && <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-center text-emerald-800">Change to return: <span className="text-xl font-bold">{money(receipt.change_amount)}</span></div>}
            <Receipt sale={receipt} />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- customer

function CustomerPicker({ value, onChange, canCreate }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api.get('/customers'), enabled: open, select: (r) => r.data || [] });
  const list = (customers.data || []).filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())).slice(0, 30);

  return (
    <>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(true)} className="flex h-10 flex-1 items-center justify-between rounded-lg border border-slate-300 px-3 text-left text-sm hover:bg-slate-50">
          <span className={value ? 'font-medium text-slate-900' : 'text-slate-500'}>{value ? `${value.name} · ${value.phone}` : 'Walk-in customer'}</span>
          {value && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(null); }} className="text-slate-400 hover:text-slate-600"><X className="size-4" /></span>}
        </button>
        {canCreate && <Button variant="secondary" icon={UserPlus} onClick={() => setCreating(true)} aria-label="New customer" />}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Choose customer">
        <Input autoFocus placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {customers.isLoading && <Loading />}
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => { onChange(c); setOpen(false); }} className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50">
              <div><div className="font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.phone}</div></div>
              {Number(c.total_due || 0) > 0 && <Badge color="amber">Due {money(c.total_due)}</Badge>}
            </button>
          ))}
          {!customers.isLoading && !list.length && <p className="py-6 text-center text-sm text-slate-500">No customers found.</p>}
        </div>
      </Modal>

      {creating && <NewCustomer onClose={() => setCreating(false)} onCreated={(c) => { onChange(c); setCreating(false); }} />}
    </>
  );
}

function NewCustomer({ onClose, onCreated }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', phone: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/customers', f);
      qc.invalidateQueries({ queryKey: ['customers'] });
      onCreated(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="New customer" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="new-customer" loading={busy}>Save</Button></>}>
      <form id="new-customer" onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label="Name" required><Input autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone" required><Input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03xx-xxxxxxx" /></Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- payment

function PayModal({ totals, customer, payload, onClose, onDone }) {
  const shop = useShop();
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState(String(totals.total));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(uid()); // same key on retry -> never a double sale
  const amount = Number(received || 0);
  const change = Math.max(0, amount - totals.total);
  const due = Math.max(0, totals.total - amount);
  const quick = [...new Set([totals.total, ...[100, 500, 1000, 5000].map((n) => Math.ceil(totals.total / n) * n)])].filter((n) => n >= totals.total).slice(0, 4);

  const submit = async (e) => {
    e.preventDefault();
    if (due > 0 && !customer) { setError(new Error('Choose a customer to give credit (udhaar) for the unpaid amount.')); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/sales', payload({ status: 'completed', payment_method: method, payment_received: amount, notes: notes || null, idempotency_key: key.current }));
      onDone(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Take payment" footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button type="submit" form="pay-form" variant="success" size="lg" loading={busy}>Complete sale</Button></>}>
      <form id="pay-form" onSubmit={submit} className="space-y-5">
        <ErrorBox error={error} />
        <div className="rounded-xl bg-slate-900 p-4 text-center text-white">
          <div className="text-sm text-slate-300">Amount to pay</div>
          <div className="text-3xl font-bold">{money(totals.total)}</div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Payment method</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(shop.meta.payment_methods || []).map((p) => (
              <button key={p.code} type="button" onClick={() => setMethod(p.code)} className={cx('rounded-lg border px-2 py-2.5 text-sm font-medium transition', method === p.code ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>{p.label}</button>
            ))}
          </div>
        </div>
        <Field label="Amount received">
          <Input autoFocus type="number" min="0" step="0.01" className="h-12 text-lg" value={received} onChange={(e) => setReceived(e.target.value)} onFocus={(e) => e.target.select()} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {quick.map((n) => <Button key={n} size="sm" variant="secondary" onClick={() => setReceived(String(n))}>{money(n)}</Button>)}
        </div>
        {change > 0 && <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800">Change to return: <span className="font-bold">{money(change)}</span></div>}
        {due > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {money(due)} will be recorded as credit (udhaar){customer ? ` for ${customer.name}` : ' — choose a customer first'}.
          </div>
        )}
        <Field label="Note (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- held bills

function ResumeModal({ restaurant, onClose, onDone, onEdit }) {
  const shop = useShop();
  const held = useQuery({ queryKey: ['sales', 'held'], queryFn: () => api.get('/sales', { status: 'held', per_page: 50 }), select: (r) => r.data || [] });
  const [selected, setSelected] = useState(null);
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = async (inv) => {
    setError(null);
    const res = await api.get(`/sales/${inv}`);
    setSelected(res.data);
    setReceived(String(res.data.grand_total));
  };

  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/sales/${selected.invoice_number}/resume`, { payment_method: method, payment_received: Number(received || 0) });
      onDone({ invoice_number: selected.invoice_number });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={selected ? `${restaurant ? 'Order' : 'Held bill'} ${selected.invoice_number}` : restaurant ? 'Open orders' : 'Held bills'}
      footer={selected && <><Button variant="secondary" onClick={() => setSelected(null)}>Back</Button><Button variant="secondary" onClick={() => onEdit(selected)}>{restaurant ? 'Add items' : 'Edit bill'}</Button><Button variant="success" loading={busy} onClick={complete}>Complete sale</Button></>}
    >
      {!selected ? (
        held.isLoading ? <Loading /> : !held.data?.length ? <p className="py-8 text-center text-sm text-slate-500">No held bills.</p> : (
          <div className="divide-y divide-slate-100">
            {held.data.map((s) => (
              <button key={s.invoice_number} type="button" onClick={() => open(s.invoice_number)} className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-slate-50">
                <div>
                  <div className="font-medium">{s.table_no ? `Table ${s.table_no}` : s.invoice_number}{s.order_type && <span className="ml-2 text-xs font-normal text-slate-500">{orderTypeLabel(s.order_type)}</span>}</div>
                  <div className="text-xs text-slate-500">{s.table_no ? `${s.invoice_number} · ` : ''}{s.customer || 'Walk-in'} · {s.items_count} items</div>
                </div>
                <span className="font-semibold">{money(s.grand_total)}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <ErrorBox error={error} />
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {selected.items.map((it) => (
              <div key={it.id} className="flex justify-between px-3 py-2 text-sm"><span>{it.product_name} {variantLabel(it) && `(${variantLabel(it)})`} × {qty(it.quantity)}</span><span>{money(it.total_price)}</span></div>
            ))}
            <div className="flex justify-between px-3 py-2 font-semibold"><span>Total</span><span>{money(selected.grand_total)}</span></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {(shop.meta.payment_methods || []).map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Amount received"><Input type="number" min="0" step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} /></Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- serials

// Choose which serial/IMEI numbers are being sold for a serial-tracked item.
function SerialPicker({ line, preselect, onClose, onDone }) {
  const [picked, setPicked] = useState(() => new Set(preselect));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const list = useQuery({ queryKey: ['serials', line.variant_id, 'in_stock'], queryFn: () => api.get(`/product-variants/${line.variant_id}/serials`, { status: 'in_stock' }), select: (r) => r.data || [] });
  const available = list.data || [];

  const toggle = (serial) => setPicked((p) => { const n = new Set(p); if (n.has(serial)) n.delete(serial); else n.add(serial); return n; });
  const scan = (e) => {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    if (!available.some((x) => x.serial === c)) setError(`${c} is not in stock for this item`);
    else { setPicked((p) => new Set(p).add(c)); setError(''); }
    setCode('');
  };

  return (
    <Modal open onClose={onClose} title={`${line.name} — choose serial / IMEI`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!picked.size} onClick={() => onDone([...picked])}>Add {picked.size} to bill</Button></>}
    >
      <form onSubmit={scan} className="mb-3">
        <Input autoFocus className="font-mono" placeholder="Scan IMEI / serial…" value={code} onChange={(e) => setCode(e.target.value)} />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </form>
      {list.isLoading ? <Loading /> : !available.length ? <p className="py-6 text-center text-sm text-slate-500">No serials in stock for this item. Add stock with serials through Purchases.</p> : (
        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {available.map((x) => (
            <label key={x.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" className="size-4 accent-brand-600" checked={picked.has(x.serial)} onChange={() => toggle(x.serial)} />
              <span className="font-mono">{x.serial}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
