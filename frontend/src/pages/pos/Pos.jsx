import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Banknote, ChefHat, CreditCard, FileText, Gift, Grid3x3, ImageIcon, ListChecks, MessageCircle, Minus, PauseCircle, PlayCircle, Plus,
  Printer, ScanBarcode, ShoppingCart, Smartphone, Tag, Trash2, UserPlus, Vault, X,
} from 'lucide-react';
import { buildReceiptText, openWhatsApp } from '../../lib/whatsapp';
import useScanner from '../../lib/useScanner';
import { printNow, printerPrefs } from '../../lib/printer';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { primaryImage, useCategories } from '../../lib/catalog';
import { money, qty, round3, variantLabel } from '../../lib/format';
import ProductForm from '../../components/ProductForm';
import Receipt from '../../components/Receipt';
import Keypad from '../../components/Keypad';
import KitchenSlip, { ORDER_TYPES } from '../../components/KitchenSlip';
import { Badge, Button, ErrorBox, Field, Input, Loading, Modal, cx, useToast } from '../../components/ui';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const PAY_ICONS = { cash: Banknote, card: CreditCard, jazzcash: Smartphone, easypaisa: Smartphone };

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
  const t = useT();
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
  const [serialPick, setSerialPick] = useState(null); // { line, preselect }
  const [qtyEdit, setQtyEdit] = useState(null); // cart line being edited on the keypad
  const [order, setOrder] = useState({ type: 'dine_in', table: '', note: '' }); // restaurant mode
  const [kot, setKot] = useState(null); // kitchen slip to print
  const [priceLevel, setPriceLevel] = useState(null); // null = follow the customer
  const [pointsToUse, setPointsToUse] = useState('');
  const [quoteId, setQuoteId] = useState(null);
  const [receiptPhone, setReceiptPhone] = useState('');
  const restaurant = shop.features.restaurant;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const level = priceLevel || customer?.price_level || 'retail';

  // Cash drawer: gentle reminder when the day hasn't been opened.
  const cash = useQuery({ queryKey: ['cash', 'current'], queryFn: () => api.get('/cash/current'), staleTime: 30_000 });
  const drawerClosed = cash.data && cash.data.data === null && cash.data.can_manage;

  const focusScan = useCallback(() => setTimeout(() => scanRef.current?.focus(), 30), []);

  // ------------------------------------------------------------ catalog
  const categories = useCategories();
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const h = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(h); }, [query]);
  const productParams = { search: debounced, category_id: categoryId, is_active: 1, per_page: 60 };
  const products = useQuery({ queryKey: ['products', 'pos', productParams], queryFn: () => api.get('/products', productParams), placeholderData: (p) => p });

  // ------------------------------------------------------------ cart ops
  const addLine = useCallback((line) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.variant_id === line.variant_id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: round3(Number(l.qty) + 1) } : l));
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
    const inCart = Number(cart.find((l) => l.variant_id === variant.id)?.qty || 0);
    if (line.stock - inCart <= 0) {
      toast(t('{name}: only {n} left in stock', { name: line.name, n: qty(line.stock) }), 'error');
      return;
    }
    addLine(line);
  }, [addLine, cart, shop, toast, t]);

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
    setPriceLevel(null);
    setPointsToUse('');
    setQuoteId(null);
    setDiscount({ value: '', mode: 'amount' });
    setOrder((o) => ({ type: o.type, table: '', note: '' }));
    focusScan();
  };

  // ------------------------------------------------------------ scanning
  const onScan = (e) => {
    e.preventDefault();
    scanCode(query.trim());
  };

  // Looks a code up: barcode → serial/IMEI → name/SKU → "add new item".
  const scanCode = async (code) => {
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
          else toast(t('{serial} is already sold or not in stock', { serial: unit.serial }) + (unit.invoice_number ? ` (${unit.invoice_number})` : ''), 'error');
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

  // ------------------------------------------------------------ server preview
  // Offers, wholesale prices and loyalty points are worked out by the server;
  // ask it for the exact bill whenever the cart changes (debounced).
  const previewBody = useMemo(() => ({
    customer_id: customer?.id || null,
    items: cart.filter((l) => Number(l.qty) > 0).map((l) => ({ variant_id: l.variant_id, quantity: Number(l.qty), discount_per_item: Number(l.discount || 0) })),
    price_level: level,
    points_redeemed: Number(pointsToUse || 0) || undefined,
  }), [cart, customer?.id, level, pointsToUse]);
  const [previewKey, setPreviewKey] = useState(null);
  useEffect(() => { const h = setTimeout(() => setPreviewKey(JSON.stringify(previewBody)), 250); return () => clearTimeout(h); }, [previewBody]);
  const previewEnabled = !!previewKey && cart.length > 0 && !cart.some((l) => !(Number(l.qty) > 0));
  const preview = useQuery({
    queryKey: ['sales', 'preview', previewKey, discount.value, discount.mode],
    queryFn: () => {
      const body = JSON.parse(previewKey);
      return api.post('/sales/preview', { ...body, discount_amount: 0 }).then((base) => {
        // the cashier's bill discount is applied on the server-priced subtotal
        const sub = base.data.subtotal;
        const dv = Number(discount.value || 0);
        const d = Math.min(Math.max(discount.mode === 'percent' ? (sub * dv) / 100 : dv, 0), sub);
        return d > 0 ? api.post('/sales/preview', { ...body, discount_amount: Math.round(d * 100) / 100 }) : base;
      });
    },
    enabled: previewEnabled,
    placeholderData: (p) => p,
    retry: false,
  });
  const pv = previewEnabled && preview.data?.data ? preview.data.data : null;
  const pvLine = useMemo(() => Object.fromEntries((pv?.items || []).map((it) => [it.variant_id, it])), [pv]);

  // ------------------------------------------------------------ totals
  const totals = useMemo(() => {
    if (pv) {
      return {
        subtotal: pv.subtotal,
        discount: Math.round((pv.discount_amount + pv.points_discount) * 100) / 100,
        cashierDiscount: pv.discount_amount,
        tax: pv.tax_amount,
        total: pv.grand_total,
        items: cart.length,
        promo: pv.promo_discount,
        pointsEarned: pv.points_earned,
        pointsDiscount: pv.points_discount,
      };
    }
    const subtotal = cart.reduce((a, l) => a + l.price * Number(l.qty || 0) - Number(l.discount || 0), 0);
    const dv = Number(discount.value || 0);
    const saleDiscount = Math.min(Math.max(discount.mode === 'percent' ? (subtotal * dv) / 100 : dv, 0), subtotal);
    const tax = shop.taxEnabled ? Math.round((subtotal - saleDiscount) * shop.taxPercent) / 100 : 0;
    const round2 = (n) => Math.round(n * 100) / 100;
    return { subtotal: round2(subtotal), discount: round2(saleDiscount), cashierDiscount: round2(saleDiscount), tax: round2(tax), total: round2(subtotal - saleDiscount + tax), items: cart.length };
  }, [cart, discount, shop.taxEnabled, shop.taxPercent, pv]);

  const lineProblem = (l) => {
    if (!(Number(l.qty) > 0)) return t('Enter a quantity above 0');
    if (!l.fractional && !Number.isInteger(Number(l.qty))) return t('Whole numbers only for this item');
    if (l.serialTracked && l.serials.length !== Number(l.qty)) return t('Choose the serial numbers');
    return null;
  };
  const cartError = cart.find(lineProblem);

  // ------------------------------------------------------------ checkout
  const payload = (extra) => ({
    customer_id: customer?.id || null,
    items: cart.map((l) => ({ variant_id: l.variant_id, quantity: Number(l.qty), unit_price: l.price, discount_per_item: Number(l.discount || 0), ...(l.serialTracked ? { serials: l.serials } : {}) })),
    discount_amount: totals.cashierDiscount,
    tax_amount: totals.tax,
    price_level: level,
    ...(Number(pointsToUse) > 0 ? { points_redeemed: Number(pointsToUse) } : {}),
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
        toast(t('Order {inv} sent to kitchen', { inv: res.data.invoice_number }));
        if (printerPrefs().kitchen?.auto ?? printerPrefs().receipt?.auto) setTimeout(() => printNow('kitchen'), 350);
      } else {
        toast(t('Bill saved for later as {inv}', { inv: res.data.invoice_number }));
      }
      qc.invalidateQueries({ queryKey: ['sales'] });
      clearSale();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // reopen a held order into the cart (restaurant: add more items)
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
    toast(t('Bill {inv} opened again — add items, then take payment', { inv: sale.invoice_number }), 'info');
  };

  // Turn a quotation into a sale: /pos?quote=<id>
  useEffect(() => {
    const id = searchParams.get('quote');
    if (!id) return;
    setSearchParams({}, { replace: true });
    api.get(`/quotations/${id}`).then((res) => {
      const q = res.data;
      if (q.status === 'converted') { toast(t('This quotation is already a sale.'), 'error'); return; }
      const lines = q.items.filter((it) => it.is_available !== false).map((it) => ({
        variant_id: it.variant_id, name: it.product_name, label: variantLabel(it), unit: it.unit || 'pcs', fractional: shop.isFractional(it.unit),
        price: Number(it.current_price ?? it.unit_price), stock: Number(it.stock_qty ?? Infinity), qty: Number(it.quantity), discount: Number(it.discount_per_item || 0),
        serialTracked: !!it.track_serial, serials: [],
      }));
      setCart(lines);
      setDiscount({ value: Number(q.discount_amount) > 0 ? String(Number(q.discount_amount)) : '', mode: 'amount' });
      setCustomer(q.customer_id ? { id: q.customer_id, name: q.customer_name, phone: q.customer_phone || '' } : null);
      setQuoteId(q.id);
      if (q.items.some((it) => it.current_price && Number(it.current_price) !== Number(it.unit_price))) toast(t('Some prices changed since the quotation — today\'s prices are used.'), 'info');
      else toast(t('Quotation {n} loaded — take payment to finish', { n: q.quote_number }), 'info');
    }).catch((err) => toast(err.message, 'error'));
  }, [searchParams, setSearchParams, shop, t, toast]);

  const saveQuote = async () => {
    if (!cart.length) return;
    setBusy(true);
    try {
      const res = await api.post('/quotations', {
        customer_id: customer?.id || null,
        items: cart.map((l) => ({ variant_id: l.variant_id, quantity: Number(l.qty), discount_per_item: Number(l.discount || 0) })),
        discount_amount: totals.cashierDiscount || 0,
      });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast(t('Saved as quotation {n}', { n: res.data.quote_number }));
      clearSale();
      navigate(`/quotations/${res.data.id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const completed = async (sale) => {
    setPaying(false);
    setResuming(false);
    setReceiptPhone(customer?.phone || '');
    if (quoteId) {
      api.post(`/quotations/${quoteId}/mark-converted`, { invoice_number: sale.invoice_number }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['quotations'] });
    }
    qc.invalidateQueries({ queryKey: ['cash'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    const full = sale.items?.length && sale.items[0].product_name ? sale : (await api.get(`/sales/${sale.invoice_number}`)).data;
    setReceipt(full);
    if (printerPrefs().receipt?.auto) setTimeout(() => printNow('receipt'), 350);
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

  // A scan anywhere on the screen (cursor not in a box) still adds the item.
  useScanner((code) => { setQuery(''); scanCode(code); });

  const cats = (categories.data || []).filter((c) => c.products_count > 0);
  const grid = products.data?.data || [];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* ------------------------------------------------ items */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-slate-200 bg-white p-4">
          <form onSubmit={onScan} className="relative">
            <ScanBarcode className="pointer-events-none absolute start-4 top-1/2 size-6 -translate-y-1/2 text-brand-600" />
            <Input
              ref={scanRef}
              className="h-14 ps-13 pe-28 text-lg"
              placeholder={t('Scan barcode or type item name…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {query && <button type="button" onClick={() => { setQuery(''); focusScan(); }} className="rounded-lg p-2 text-slate-400 hover:text-slate-600" aria-label="Clear"><X className="size-5" /></button>}
              <Button type="submit" loading={busy}>{t('Add')}</Button>
            </div>
          </form>
          {cats.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {[{ id: '', path: t('All items') }, ...cats].map((c) => (
                <button key={c.id || 'all'} type="button" onClick={() => setCategoryId(String(c.id))} className={cx('whitespace-nowrap rounded-full border-2 px-4 py-1.5 text-base font-medium transition', String(categoryId) === String(c.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')}>
                  {c.path}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {products.isLoading ? <Loading /> : !grid.length ? (
            <div className="py-16 text-center text-base text-slate-500">
              {debounced ? t('Nothing found for "{q}". Press Enter to search it as a barcode.', { q: debounced }) : t('No items yet. Add items first, or scan a barcode to add one.')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {grid.map((p) => {
                const img = primaryImage(p);
                const stock = (p.variants || []).reduce((a, v) => a + Number(v.stock_qty), 0);
                const prices = (p.variants || []).map((v) => Number(v.selling_price));
                return (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} disabled={stock <= 0} className="group flex flex-col overflow-hidden rounded-2xl border-2 border-slate-200 bg-white text-start shadow-sm transition hover:border-brand-400 active:scale-[0.98] disabled:opacity-50">
                    <div className="grid aspect-[4/3] place-items-center bg-slate-100">
                      {img ? <img src={img} alt="" className="size-full object-cover" /> : <ImageIcon className="size-8 text-slate-300" />}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <div className="line-clamp-2 text-base font-semibold leading-snug text-slate-900">{p.name}</div>
                      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-2 pt-1">
                        <span className="num text-lg font-bold text-brand-700">{money(Math.min(...prices))}{prices.length > 1 && Math.max(...prices) !== Math.min(...prices) ? '+' : ''}</span>
                        <span className={cx('text-sm', stock <= 0 ? 'font-semibold text-red-600' : 'text-slate-500')}>{stock <= 0 ? t('Finished') : <span className="num">{qty(stock)} {p.unit}</span>}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------ bill */}
      <aside className="flex min-h-0 w-full flex-col border-s border-slate-200 bg-white lg:w-[440px]">
        <div className="space-y-2 border-b border-slate-200 p-3">
          {drawerClosed && (
            <Link to="/cash" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100">
              <Vault className="size-5 shrink-0" />{t('Cash drawer is not opened today — tap to open the day')}
            </Link>
          )}
          {restaurant && (
            <div className="flex gap-2">
              <div className="flex flex-1 rounded-xl bg-slate-100 p-1 text-base font-medium">
                {ORDER_TYPES.map((o) => (
                  <button key={o.code} type="button" onClick={() => setOrder((x) => ({ ...x, type: o.code }))} className={cx('flex-1 whitespace-nowrap rounded-lg px-1.5 py-2 transition', order.type === o.code ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>{t(o.label)}</button>
                ))}
              </div>
              {order.type === 'dine_in' && <Input className="h-12 w-24 text-center" placeholder={t('Table')} value={order.table} onChange={(e) => setOrder((o) => ({ ...o, table: e.target.value }))} />}
            </div>
          )}
          <CustomerPicker value={customer} onChange={(c) => { setCustomer(c); setPointsToUse(''); setPriceLevel(null); }} canCreate={can('customers.create')} />
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              {[['retail', 'Retail price'], ['wholesale', 'Wholesale price']].map(([code, label]) => (
                <button key={code} type="button" onClick={() => setPriceLevel(code)} className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 transition', level === code ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>{t(label)}</button>
              ))}
            </div>
            {quoteId && <Badge color="blue"><FileText className="me-1 size-3.5" />{t('From quotation')}</Badge>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!cart.length ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400">
              <ShoppingCart className="mb-3 size-14 rtl:-scale-x-100" strokeWidth={1.5} />
              <p className="text-lg font-semibold text-slate-500">{t('Bill is empty')}</p>
              <p className="text-base">{t('Scan a barcode or tap an item')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cart.map((l) => {
                const problem = lineProblem(l);
                const over = Number(l.qty) > l.stock;
                return (
                  <li key={l.variant_id} className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-slate-900">{l.name}</div>
                        <div className="text-sm text-slate-500">{l.label && `${l.label} · `}<span className="num">{money(pvLine[l.variant_id]?.unit_price ?? l.price)}</span> / {t(shop.unitLabel(l.unit))}</div>
                        {pvLine[l.variant_id]?.promo_discount > 0 && (
                          <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            <Tag className="size-3.5" />{pvLine[l.variant_id].promotion_name} <span className="num">−{money(pvLine[l.variant_id].promo_discount)}</span>
                          </div>
                        )}
                      </div>
                      <div className="num text-lg font-bold text-slate-900">{money(pvLine[l.variant_id]?.total_price ?? (l.price * Number(l.qty || 0) - Number(l.discount || 0)))}</div>
                      <button type="button" onClick={() => removeLine(l.variant_id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('Remove')}><Trash2 className="size-5" /></button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {l.serialTracked ? (
                        <Button variant="secondary" icon={ListChecks} onClick={() => setSerialPick({ line: l, preselect: l.serials })}>{t('{n} serial numbers', { n: l.serials.length })}</Button>
                      ) : (
                        <>
                        <div className="flex items-center overflow-hidden rounded-xl border-2 border-slate-200" dir="ltr">
                          <button type="button" onClick={() => bump(l.variant_id, -1)} className="grid size-11 place-items-center text-slate-600 hover:bg-slate-100 active:bg-slate-200" aria-label="Less"><Minus className="size-5" /></button>
                          {/* type any quantity (12, 1.5 kg…); Enter goes back to the scanner */}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l.qty}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setQty(l.variant_id, e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusScan(); } }}
                            className={cx('num h-11 w-20 border-x-2 border-slate-200 bg-transparent px-1 text-center text-lg font-bold outline-none focus:bg-brand-50', problem && 'bg-red-50 text-red-700')}
                            aria-label={t('Quantity')}
                          />
                          <button type="button" onClick={() => bump(l.variant_id, 1)} className="grid size-11 place-items-center text-slate-600 hover:bg-slate-100 active:bg-slate-200" aria-label="More"><Plus className="size-5" /></button>
                        </div>
                        <button type="button" onClick={() => setQtyEdit(l)} className="grid size-11 place-items-center rounded-xl border-2 border-slate-200 text-slate-500 hover:bg-slate-100" title={t('Number pad')} aria-label={t('Number pad')}><Grid3x3 className="size-5" /></button>
                        </>
                      )}
                      <span className="text-sm text-slate-500">{t(shop.unitLabel(l.unit))}</span>
                      <div className="ms-auto flex items-center gap-1 text-sm text-slate-500">
                        {t('Discount')}
                        <input className="num h-10 w-20 rounded-lg border border-slate-300 px-2 text-end text-base" type="number" min="0" step="0.01" value={l.discount || ''} placeholder="0" onChange={(e) => setCart((c) => c.map((x) => (x.variant_id === l.variant_id ? { ...x, discount: e.target.value } : x)))} />
                      </div>
                    </div>
                    {l.serialTracked && l.serials.length > 0 && <p className="mt-1 truncate font-mono text-xs text-slate-500">{l.serials.join(', ')}</p>}
                    {over && <p className="mt-1 text-sm text-red-600">{t('Only {n} left in stock', { n: qty(l.stock) })}</p>}
                    {problem && <p className="mt-1 text-sm text-red-600">{problem}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-200 p-4 text-base">
          <div className="flex justify-between text-slate-600"><span>{t('Subtotal ({n} items)', { n: totals.items })}</span><span className="num">{money(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-2 text-slate-600">
            <span>{t('Discount')}</span>
            <div className="flex items-center gap-1">
              <input className="num h-10 w-20 rounded-lg border border-slate-300 px-2 text-end" type="number" min="0" step="0.01" placeholder="0" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} />
              <select className="h-10 rounded-lg border border-slate-300 px-1" value={discount.mode} onChange={(e) => setDiscount((d) => ({ ...d, mode: e.target.value }))}>
                <option value="amount">Rs</option><option value="percent">%</option>
              </select>
              <span className="num w-24 text-end">-{money(totals.cashierDiscount)}</span>
            </div>
          </div>
          {totals.promo > 0 && <div className="flex justify-between text-emerald-700"><span className="flex items-center gap-1"><Tag className="size-4" />{t('Offers applied')}</span><span className="num">−{money(totals.promo)}</span></div>}
          {pv?.loyalty?.enabled && customer && (
            <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-semibold"><Gift className="size-4" />{t('{n} points available', { n: pv.loyalty.customer_points })}</span>
                {pv.loyalty.max_redeemable > 0 ? (
                  <div className="flex items-center gap-1">
                    <input className="num h-9 w-20 rounded-lg border border-violet-200 bg-white px-2 text-end" type="number" min="0" max={pv.loyalty.max_redeemable} step="1" placeholder="0" value={pointsToUse} onChange={(e) => setPointsToUse(e.target.value)} />
                    <button type="button" className="rounded-lg px-2 py-1 font-semibold hover:bg-violet-100" onClick={() => setPointsToUse(String(pv.loyalty.max_redeemable))}>{t('Use all')}</button>
                  </div>
                ) : <span className="text-xs">{t('Minimum {n} points to use', { n: pv.loyalty.min_redeem })}</span>}
              </div>
              {totals.pointsDiscount > 0 && <div className="mt-1 flex justify-between"><span>{t('Points discount')}</span><span className="num">−{money(totals.pointsDiscount)}</span></div>}
              {totals.pointsEarned > 0 && <div className="mt-1 text-xs">{t('Customer will earn {n} points on this bill', { n: totals.pointsEarned })}</div>}
            </div>
          )}
          {shop.taxEnabled && <div className="flex justify-between text-slate-600"><span>{shop.taxLabel} ({shop.taxPercent}%)</span><span className="num">{money(totals.tax)}</span></div>}
          <div className="flex items-center justify-between pt-1"><span className="text-xl font-bold text-slate-900">{t('Total')}</span><span className="num text-3xl font-bold text-slate-900">{money(totals.total)}</span></div>
          {restaurant && <Input placeholder={t('Kitchen note (e.g. less spicy)')} value={order.note} onChange={(e) => setOrder((o) => ({ ...o, note: e.target.value }))} />}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {restaurant
              ? <Button variant="secondary" icon={ChefHat} disabled={!cart.length || busy || !!cartError} onClick={hold}>{t('Kitchen')}</Button>
              : <Button variant="secondary" icon={PauseCircle} disabled={!cart.length || busy} onClick={hold}>{t('Save for later')}</Button>}
            <Button variant="secondary" icon={PlayCircle} onClick={() => setResuming(true)}>{restaurant ? t('Open orders') : t('Saved bills')}</Button>
            <Button variant="ghost" icon={X} disabled={!cart.length} onClick={clearSale}>{t('Clear')}</Button>
          </div>
          <Button size="xl" variant="success" className="w-full" disabled={!cart.length || !!cartError || (previewEnabled && preview.isFetching && !pv)} onClick={() => setPaying(true)}>
            {t('Take payment')} <span className="num">{money(totals.total)}</span>
          </Button>
          {preview.error && <p className="text-sm text-red-600">{t(preview.error.message)}</p>}
          {can('quotations.manage') && cart.length > 0 && !restaurant && (
            <button type="button" onClick={saveQuote} disabled={busy} className="flex w-full items-center justify-center gap-2 py-1 text-sm font-semibold text-slate-500 hover:text-brand-600">
              <FileText className="size-4" />{t('Save as quotation instead')}
            </button>
          )}
        </div>
      </aside>

      {/* ------------------------------------------------ dialogs */}
      {picking && (
        <Modal open onClose={() => { setPicking(null); focusScan(); }} title={picking.name}>
          <p className="mb-3 text-base text-slate-600">{t('Which one?')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {picking.variants.filter((v) => v.is_active !== false).map((v) => (
              <button key={v.id} type="button" disabled={Number(v.stock_qty) <= 0} onClick={() => { addVariant(v, picking); setPicking(null); focusScan(); }} className="flex items-center justify-between rounded-xl border-2 border-slate-200 p-4 text-start hover:border-brand-400 disabled:opacity-50">
                <div>
                  <div className="text-lg font-semibold">{variantLabel(v) || t('Standard')}</div>
                  <div className="text-sm text-slate-500">{t('{n} in stock', { n: qty(v.stock_qty) })}</div>
                </div>
                <span className="num text-lg font-bold text-brand-700">{money(v.selling_price)}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {qtyEdit && (
        <QtyPad
          line={qtyEdit}
          onClose={() => { setQtyEdit(null); focusScan(); }}
          onDone={(v) => { setQty(qtyEdit.variant_id, v); setQtyEdit(null); focusScan(); }}
        />
      )}

      <Modal open={!!unknown} onClose={() => { setUnknown(null); focusScan(); }} size="sm" title={t('Item not found')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setUnknown(null); focusScan(); }}>{t('Cancel')}</Button>
            {can('products.create') && <Button icon={Plus} onClick={() => { setAdding(unknown); setUnknown(null); }}>{t('Add this item')}</Button>}
          </>
        )}
      >
        <p className="text-base text-slate-600">{t('No item has the barcode')} <span className="font-mono font-semibold text-slate-900">{unknown}</span></p>
        <p className="mt-2 text-base text-slate-600">{can('products.create') ? t('Add it now — it will go straight into this bill.') : t('Ask the owner to add this item.')}</p>
      </Modal>

      <ProductForm
        open={!!adding}
        requireStock
        initialBarcode={adding || ''}
        onClose={() => { setAdding(null); setQuery(''); focusScan(); }}
        onSaved={(p) => { if (p.variants?.[0] && Number(p.variants[0].stock_qty) > 0) addVariant(p.variants[0], p); else toast(t('Item added. Add its stock to sell it.'), 'info'); }}
      />

      {paying && <PayModal totals={totals} customer={customer} onClose={() => { setPaying(false); focusScan(); }} payload={payload} onDone={completed} />}
      {resuming && <ResumeModal restaurant={restaurant} onClose={() => { setResuming(false); focusScan(); }} onDone={completed} onEdit={editHeld} />}
      {serialPick && <SerialPicker line={serialPick.line} preselect={serialPick.preselect} onClose={() => { setSerialPick(null); focusScan(); }} onDone={(list) => { setSerials(serialPick.line, list); setSerialPick(null); focusScan(); }} />}
      <Modal open={!!kot} onClose={() => { setKot(null); focusScan(); }} size="sm" title={t('Kitchen order')}
        footer={<><Button variant="secondary" onClick={() => { setKot(null); focusScan(); }}>{t('Close')}</Button><Button icon={Printer} onClick={() => printNow('kitchen')}>{t('Print slip')}</Button></>}
      >
        {kot && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><KitchenSlip order={kot} /></div>}
      </Modal>

      <Modal open={!!receipt} onClose={() => { setReceipt(null); focusScan(); }} size="sm" title={t('Sale complete')}
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => { setReceipt(null); focusScan(); }}>{t('New bill')}</Button>
            <Button variant="secondary" size="lg" icon={MessageCircle} className="text-emerald-700" onClick={() => openWhatsApp(receiptPhone, buildReceiptText(receipt, shop, t))}>{t('WhatsApp')}</Button>
            <Button icon={Printer} size="lg" autoFocus onClick={() => printNow('receipt')}>{t('Print receipt')}</Button>
          </>
        )}
      >
        {receipt && (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {Number(receipt.change_amount) > 0 && (
              <div className="mb-3 rounded-xl bg-emerald-50 p-4 text-center text-emerald-800">
                <div className="text-base">{t('Give back to customer')}</div>
                <div className="num text-4xl font-bold">{money(receipt.change_amount)}</div>
              </div>
            )}
            <Receipt sale={receipt} />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- quantity keypad

function QtyPad({ line, onClose, onDone }) {
  const t = useT();
  const shop = useShop();
  const [v, setV] = useState(String(line.qty ?? ''));
  const ok = Number(v) > 0 && (line.fractional || Number.isInteger(Number(v)));
  return (
    <Modal open onClose={onClose} size="sm" title={line.name}>
      <div className="mb-3 text-center text-base text-slate-500">{t('How many?')} ({t(shop.unitLabel(line.unit))})</div>
      <div className="num mb-4 rounded-xl border-2 border-brand-500 bg-brand-50 py-3 text-center text-4xl font-bold text-slate-900">{v || '0'}</div>
      {!ok && v !== '' && <p className="mb-2 text-center text-sm text-red-600">{line.fractional ? t('Enter a quantity above 0') : t('Whole numbers only for this item')}</p>}
      <Keypad value={v} onChange={setV} allowDecimal={line.fractional} onEnter={() => ok && onDone(round3(Number(v)))} enterLabel={t('Done')} />
    </Modal>
  );
}

// ---------------------------------------------------------------- customer

function CustomerPicker({ value, onChange, canCreate }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api.get('/customers'), enabled: open, select: (r) => r.data || [] });
  const list = (customers.data || []).filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())).slice(0, 30);

  return (
    <>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(true)} className="flex h-12 flex-1 items-center justify-between rounded-xl border-2 border-slate-200 px-3 text-start text-base hover:bg-slate-50">
          <span className={value ? 'font-semibold text-slate-900' : 'text-slate-500'}>{value ? `${value.name}${value.phone ? ` · ${value.phone}` : ''}` : t('Walk-in customer (tap to choose)')}</span>
          {value && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(null); }} className="text-slate-400 hover:text-slate-600"><X className="size-5" /></span>}
        </button>
        {canCreate && <Button variant="secondary" className="h-12" icon={UserPlus} onClick={() => setCreating(true)} aria-label={t('New customer')} />}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t('Choose customer')}>
        <Input autoFocus placeholder={t('Search name or phone…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {customers.isLoading && <Loading />}
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => { onChange(c); setOpen(false); }} className="flex w-full items-center justify-between px-2 py-3 text-start hover:bg-slate-50">
              <div><div className="text-base font-semibold text-slate-900">{c.name}</div><div className="num text-sm text-slate-500">{c.phone}</div></div>
              {Number(c.total_due || 0) > 0 && <Badge color="amber">{t('Owes')} <span className="num ms-1">{money(c.total_due)}</span></Badge>}
            </button>
          ))}
          {!customers.isLoading && !list.length && <p className="py-6 text-center text-base text-slate-500">{t('No customers found.')}</p>}
        </div>
      </Modal>

      {creating && <NewCustomer onClose={() => setCreating(false)} onCreated={(c) => { onChange(c); setCreating(false); }} />}
    </>
  );
}

function NewCustomer({ onClose, onCreated }) {
  const t = useT();
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
    <Modal open onClose={onClose} size="sm" title={t('New customer')} footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" form="new-customer" loading={busy}>{t('Save')}</Button></>}>
      <form id="new-customer" onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <Field label={t('Name')} required><Input autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('Phone')} required><Input required className="num" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03xx-xxxxxxx" /></Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- payment

function PayModal({ totals, customer, payload, onClose, onDone }) {
  const shop = useShop();
  const t = useT();
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState(String(totals.total));
  const [touched, setTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(uid()); // same key on retry -> never a double sale
  const amount = Number(received || 0);
  const change = Math.max(0, Math.round((amount - totals.total) * 100) / 100);
  const due = Math.max(0, Math.round((totals.total - amount) * 100) / 100);
  const notesQuick = [...new Set([totals.total, ...[100, 500, 1000, 5000].map((n) => Math.ceil(totals.total / n) * n)])].filter((n) => n >= totals.total).slice(0, 4);

  // The keypad replaces the pre-filled total on the first press.
  const type = (v) => { setReceived(touched ? v : v.replace(String(totals.total), '')); setTouched(true); };

  const submit = async () => {
    if (due > 0 && !customer) { setError(new Error(t('Choose a customer to give udhaar (credit) for the unpaid amount.'))); return; }
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
    <Modal open onClose={onClose} size="lg" title={t('Take payment')}
      footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('Back')}</Button><Button variant="success" size="lg" loading={busy} onClick={submit}>{t('Finish sale')}</Button></>}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <ErrorBox error={error} />
          <div className="rounded-2xl bg-slate-900 p-4 text-center text-white">
            <div className="text-base text-slate-300">{t('Customer has to pay')}</div>
            <div className="num text-4xl font-bold">{money(totals.total)}</div>
          </div>
          <div>
            <div className="mb-2 text-base font-semibold text-slate-700">{t('How is the customer paying?')}</div>
            <div className="grid grid-cols-2 gap-2">
              {(shop.meta.payment_methods || []).map((p) => {
                const Icon = PAY_ICONS[p.code] || Banknote;
                return (
                  <button key={p.code} type="button" onClick={() => setMethod(p.code)} className={cx('flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-base font-semibold transition', method === p.code ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
                    <Icon className="size-5 shrink-0" />{t(p.label)}
                  </button>
                );
              })}
            </div>
          </div>
          {change > 0 && (
            <div className="rounded-2xl bg-emerald-50 p-4 text-center text-emerald-800">
              <div className="text-base">{t('Give back to customer')}</div>
              <div className="num text-4xl font-bold">{money(change)}</div>
            </div>
          )}
          {due > 0 && (
            <div className="rounded-2xl bg-amber-50 p-4 text-base text-amber-900">
              <span className="num font-bold">{money(due)}</span> {customer ? t('will be added to {name}\'s udhaar', { name: customer.name }) : t('is unpaid — choose a customer first to give udhaar')}
            </div>
          )}
          <Field label={t('Note (optional)')}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-2 text-base font-semibold text-slate-700">{t('Money received')}</div>
          <input
            className="num mb-3 h-16 w-full rounded-xl border-2 border-brand-500 bg-brand-50 px-4 text-end text-3xl font-bold text-slate-900 outline-none"
            type="number" min="0" step="0.01" value={received}
            onChange={(e) => { setReceived(e.target.value); setTouched(true); }} onFocus={(e) => e.target.select()}
          />
          <div className="mb-3 flex flex-wrap gap-2">
            {notesQuick.map((n) => <Button key={n} variant="secondary" className="num" onClick={() => { setReceived(String(n)); setTouched(true); }}>{money(n)}</Button>)}
          </div>
          <Keypad value={received} onChange={type} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- held bills

function ResumeModal({ restaurant, onClose, onDone, onEdit }) {
  const shop = useShop();
  const t = useT();
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

  const orderLabel = (code) => t(ORDER_TYPES.find((o) => o.code === code)?.label || '');

  return (
    <Modal open onClose={onClose} size="lg" title={selected ? selected.invoice_number : restaurant ? t('Open orders') : t('Saved bills')}
      footer={selected && <><Button variant="secondary" onClick={() => setSelected(null)}>{t('Back')}</Button><Button variant="secondary" onClick={() => onEdit(selected)}>{t('Add more items')}</Button><Button variant="success" loading={busy} onClick={complete}>{t('Finish sale')}</Button></>}
    >
      {!selected ? (
        held.isLoading ? <Loading /> : !held.data?.length ? <p className="py-8 text-center text-base text-slate-500">{restaurant ? t('No open orders.') : t('No saved bills.')}</p> : (
          <div className="divide-y divide-slate-100">
            {held.data.map((s) => (
              <button key={s.invoice_number} type="button" onClick={() => open(s.invoice_number)} className="flex w-full items-center justify-between px-2 py-3 text-start hover:bg-slate-50">
                <div>
                  <div className="text-base font-semibold">{s.table_no ? t('Table {n}', { n: s.table_no }) : s.invoice_number}{s.order_type && <span className="ms-2 text-sm font-normal text-slate-500">{orderLabel(s.order_type)}</span>}</div>
                  <div className="text-sm text-slate-500">{s.customer || t('Walk-in')} · {t('{n} items', { n: s.items_count })}</div>
                </div>
                <span className="num text-lg font-bold">{money(s.grand_total)}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <ErrorBox error={error} />
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {selected.items.map((it) => (
              <div key={it.id} className="flex justify-between px-3 py-2 text-base"><span>{it.product_name} {variantLabel(it) && `(${variantLabel(it)})`} × <span className="num">{qty(it.quantity)}</span></span><span className="num">{money(it.total_price)}</span></div>
            ))}
            <div className="flex justify-between px-3 py-2 text-lg font-bold"><span>{t('Total')}</span><span className="num">{money(selected.grand_total)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(shop.meta.payment_methods || []).map((p) => (
              <button key={p.code} type="button" onClick={() => setMethod(p.code)} className={cx('rounded-xl border-2 px-2 py-2.5 text-base font-semibold', method === p.code ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700')}>{t(p.label)}</button>
            ))}
          </div>
          <Field label={t('Money received')}><Input type="number" min="0" step="0.01" className="h-14 text-2xl" value={received} onChange={(e) => setReceived(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- serials

// Choose which serial/IMEI numbers are being sold for a serial-tracked item.
function SerialPicker({ line, preselect, onClose, onDone }) {
  const t = useT();
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
    if (!available.some((x) => x.serial === c)) setError(t('{serial} is not in stock for this item', { serial: c }));
    else { setPicked((p) => new Set(p).add(c)); setError(''); }
    setCode('');
  };

  return (
    <Modal open onClose={onClose} title={`${line.name} — ${t('choose serial / IMEI')}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button disabled={!picked.size} onClick={() => onDone([...picked])}>{t('Add {n} to bill', { n: picked.size })}</Button></>}
    >
      <form onSubmit={scan} className="mb-3">
        <Input autoFocus className="font-mono" placeholder={t('Scan IMEI / serial…')} value={code} onChange={(e) => setCode(e.target.value)} />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </form>
      {list.isLoading ? <Loading /> : !available.length ? <p className="py-6 text-center text-base text-slate-500">{t('No serial numbers in stock for this item.')}</p> : (
        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {available.map((x) => (
            <label key={x.id} className="flex cursor-pointer items-center gap-3 px-3 py-3 text-base hover:bg-slate-50">
              <input type="checkbox" className="size-5 accent-brand-600" checked={picked.has(x.serial)} onChange={() => toggle(x.serial)} />
              <span className="font-mono">{x.serial}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
