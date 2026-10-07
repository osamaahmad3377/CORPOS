import { useEffect, useMemo, useRef, useState } from 'react';
import { Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Boxes, Banknote, PackagePlus, Plus, Printer, ScanBarcode, Search, Trash2, Undo2,
} from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { date, dateTime, money, qty, round3, today, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import ProductForm from '../../components/ProductForm';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Td, Textarea, Th,
  cx, useToast,
} from '../../components/ui';
import { VariantFinder, badQty, unitStep } from '../inventory/VariantFinder';
import { PAY_STATUS, SupplierForm } from '../suppliers/Suppliers';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function StatusBadge({ status }) {
  const st = PAY_STATUS[status] || { label: status, color: 'gray' };
  return <Badge color={st.color}>{st.label}</Badge>;
}

function useSuppliers() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers'),
    select: (r) => r.data || [],
    enabled: can('suppliers.manage'),
    staleTime: 30_000,
  });
}

export default function Purchases() {
  return (
    <Routes>
      <Route index element={<PurchaseList />} />
      <Route path="new" element={<NewPurchase />} />
      <Route path=":po" element={<PurchaseDetail />} />
    </Routes>
  );
}

// ---------------------------------------------------------------- list

function PurchaseList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const suppliers = useSuppliers();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const supplierId = params.get('supplier_id') || '';

  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const q = { search: term, supplier_id: supplierId, payment_status: status, start_date: from, end_date: to, page, per_page: 25 };
  const list = useQuery({ queryKey: ['purchases', q], queryFn: () => api.get('/purchases', q), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const filtered = term || supplierId || status || from || to;

  return (
    <Page>
      <PageHeader
        title="Purchases"
        subtitle="Stock you bought from suppliers — what came in, what you paid and what you still owe."
        actions={can('purchases.manage') && <Button icon={Plus} onClick={() => navigate('/purchases/new')}>New purchase</Button>}
      />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Purchase no. or supplier bill no.…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTerm(search.trim()); } }} />
          </div>
          {can('suppliers.manage') && (
            <div className="w-full sm:w-52">
              <Select value={supplierId} onChange={(e) => { setParams(e.target.value ? { supplier_id: e.target.value } : {}); setPage(1); }}>
                <option value="">All suppliers</option>
                {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
          )}
          <div className="w-full sm:w-40">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">Any payment</option>
              <option value="pending">Unpaid</option>
              <option value="partial">Partly paid</option>
              <option value="paid">Paid</option>
            </Select>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input type="date" className="sm:w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
            <span className="text-sm text-slate-400">to</span>
            <Input type="date" className="sm:w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState
            icon={Boxes}
            title={filtered ? 'No purchases match' : 'No purchases yet'}
            action={!filtered && can('purchases.manage') && <Button icon={Plus} onClick={() => navigate('/purchases/new')}>Record your first purchase</Button>}
          >
            {filtered ? 'Try different filters or dates.' : 'When stock arrives from a supplier, record it here — stock goes up automatically.'}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Purchase</Th><Th>Date</Th><Th>Supplier</Th>
                <Th className="text-right">Total</Th><Th className="hidden text-right md:table-cell">Paid</Th><Th className="text-right">Due</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.po_number} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/purchases/${p.po_number}`)}>
                  <Td>
                    <div className="font-medium text-brand-700">{p.po_number}</div>
                    <div className="text-xs text-slate-500">{p.items_count} item{p.items_count === 1 ? '' : 's'}{p.invoice_number ? ` · Bill ${p.invoice_number}` : ''}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{date(p.purchase_date)}</Td>
                  <Td className="text-slate-700">{p.supplier || '—'}</Td>
                  <Td className="whitespace-nowrap text-right font-medium text-slate-900">{money(p.grand_total)}</Td>
                  <Td className="hidden whitespace-nowrap text-right text-slate-600 md:table-cell">{money(p.paid_amount)}</Td>
                  <Td className="whitespace-nowrap text-right">{Number(p.due_amount) > 0 ? <span className="font-medium text-red-600">{money(p.due_amount)}</span> : <span className="text-slate-400">—</span>}</Td>
                  <Td><StatusBadge status={p.payment_status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={meta} onPage={setPage} />
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------- new purchase

const lineFrom = (v, extra = {}) => ({
  variant_id: v.id,
  name: v.product_name || extra.name || 'Item',
  label: variantLabel(v),
  sku: v.sku,
  unit: v.unit || extra.unit || 'pcs',
  stock: Number(v.stock_qty || 0),
  qty: '1',
  cost: v.purchase_price !== undefined && v.purchase_price !== null ? String(Number(v.purchase_price)) : '',
  trackSerial: !!(v.track_serial ?? extra.track_serial),
  trackExpiry: !!(v.track_expiry ?? extra.track_expiry),
  serials: '',
  batch_no: '',
  expiry_date: '',
});
const serialList = (text) => String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

function NewPurchase() {
  const { can } = useAuth();
  const shop = useShop();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const suppliers = useSuppliers();
  const finder = useRef(null);
  const idem = useRef(crypto.randomUUID?.() || String(Date.now() + Math.random()));

  const [supplierId, setSupplierId] = useState(params.get('supplier_id') || '');
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [invoice, setInvoice] = useState('');
  const [lines, setLines] = useState([]);
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [unknown, setUnknown] = useState(null);
  const [addingProduct, setAddingProduct] = useState(null);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);
  const [tried, setTried] = useState(false);

  const addVariant = (v, extra) => {
    setUnknown(null);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variant_id === v.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(round3(Number(l.qty || 0) + 1)) } : l));
      return [...ls, lineFrom(v, extra)];
    });
    setFlash(v.id);
    setTimeout(() => setFlash((f) => (f === v.id ? null : f)), 900);
  };
  const setLine = (id, k, val) => setLines((ls) => ls.map((l) => (l.variant_id === id ? { ...l, [k]: val } : l)));
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.variant_id !== id));

  const lineQty = (l) => (l.trackSerial ? serialList(l.serials).length : Number(l.qty || 0));
  const subtotal = round2(lines.reduce((a, l) => a + lineQty(l) * Number(l.cost || 0), 0));
  const disc = Number(discount || 0);
  const grand = round2(subtotal - disc);
  const paidNum = Number(paid || 0);
  const due = round2(Math.max(grand - paidNum, 0));

  const lineErrors = Object.fromEntries(lines.map((l) => [l.variant_id, {
    qty: l.trackSerial ? (serialList(l.serials).length ? null : 'Scan the serial / IMEI of each unit') : badQty(shop, l.unit, l.qty),
    cost: l.cost === '' || Number(l.cost) < 0 || Number.isNaN(Number(l.cost)) ? 'Enter cost' : null,
  }]));
  const problems = [
    !supplierId && 'Choose a supplier',
    !lines.length && 'Add at least one item',
    lines.some((l) => lineErrors[l.variant_id].qty || lineErrors[l.variant_id].cost) && 'Fix the highlighted items',
    disc < 0 && 'Discount cannot be negative',
    grand < 0 && 'Discount is more than the total',
    paidNum < 0 && 'Paid amount cannot be negative',
    paidNum > grand + 0.001 && 'Paid amount is more than the total',
  ].filter(Boolean);

  const save = useMutation({
    mutationFn: () => api.post('/purchases', {
      supplier_id: Number(supplierId),
      invoice_number: invoice.trim() || null,
      purchase_date: purchaseDate,
      items: lines.map((l) => ({
        variant_id: l.variant_id,
        quantity: l.trackSerial ? serialList(l.serials).length : Number(l.qty),
        unit_price: Number(l.cost),
        ...(l.trackSerial ? { serials: serialList(l.serials) } : {}),
        ...(l.trackExpiry ? { batch_no: l.batch_no.trim() || null, expiry_date: l.expiry_date || null } : {}),
      })),
      discount: disc || 0,
      paid_amount: paidNum || 0,
      notes: notes.trim() || null,
      idempotency_key: idem.current,
    }),
    onSuccess: (res) => {
      for (const k of ['purchases', 'inventory', 'suppliers', 'products', 'product-variants']) qc.invalidateQueries({ queryKey: [k] });
      toast(`Purchase ${res.data.po_number} saved — stock updated`);
      navigate(`/purchases/${res.data.po_number}`, { replace: true });
    },
    onError: (err) => { setError(err); toast(err.message, 'error'); },
  });

  const submit = () => {
    setTried(true);
    setError(null);
    if (problems.length) { toast(problems[0], 'error'); return; }
    save.mutate();
  };

  const supplierList = (suppliers.data || []).filter((s) => s.is_active || String(s.id) === String(supplierId));
  const backToScanner = (e) => { if (e.key === 'Enter') { e.preventDefault(); finder.current?.focus(); } };

  if (!can('purchases.manage')) {
    return <Page><ErrorBox error={{ message: "You don't have permission to record purchases." }} /></Page>;
  }

  return (
    <Page>
      <button type="button" onClick={() => navigate('/purchases')} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" />All purchases
      </button>
      <PageHeader title="New purchase" subtitle="Scan or search the items that arrived. Stock goes up when you save." />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Supplier" required error={tried && !supplierId ? 'Choose a supplier' : null} className="sm:col-span-3">
                {can('suppliers.manage') ? (
                  <div className="flex gap-2">
                    <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={suppliers.isLoading}>
                      <option value="">{suppliers.isLoading ? 'Loading suppliers…' : 'Choose supplier…'}</option>
                      {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</option>)}
                    </Select>
                    <Button variant="secondary" icon={Plus} onClick={() => setAddingSupplier(true)} className="shrink-0">New</Button>
                  </div>
                ) : (
                  <ErrorBox error={{ message: 'You need supplier access to choose a supplier. Ask the shop owner.' }} />
                )}
              </Field>
              <Field label="Purchase date" required>
                <Input type="date" value={purchaseDate} max={today()} onChange={(e) => setPurchaseDate(e.target.value)} />
              </Field>
              <Field label="Supplier bill no." hint="Optional — the number on their invoice" className="sm:col-span-2">
                <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} maxLength={255} />
              </Field>
            </div>
            {error?.errors?.invoice_number && <p className="mt-2 text-xs text-red-600">{error.errors.invoice_number[0]}</p>}
          </Card>

          <Card>
            <div className="border-b border-slate-100 p-4">
              <VariantFinder ref={finder} autoFocus onPick={addVariant} onUnknown={setUnknown} placeholder="Scan barcode or search product to add…" />
              {unknown && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <div className="flex items-start gap-2 text-amber-900">
                    <ScanBarcode className="mt-0.5 size-4 shrink-0" />
                    <span><span className="font-medium">&ldquo;{unknown}&rdquo; isn&apos;t in your catalog.</span>{can('products.create') && ' Add it as a new product — leave its opening stock at 0, this purchase adds the stock.'}</span>
                  </div>
                  <div className="flex gap-2">
                    {can('products.create') && <Button size="sm" icon={PackagePlus} onClick={() => { setAddingProduct(unknown); }}>Add new product</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setUnknown(null)}>Dismiss</Button>
                  </div>
                </div>
              )}
            </div>

            {!lines.length ? (
              <EmptyState icon={ScanBarcode} title="No items yet">Scan each item&apos;s barcode, or type its name above and pick it from the list.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr><Th>Item</Th><Th className="w-40">Quantity</Th><Th className="w-36">Cost / unit</Th><Th className="text-right">Line total</Th><Th className="w-10" /></tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const errs = lineErrors[l.variant_id];
                    return (
                      <tr key={l.variant_id} className={cx('transition-colors', flash === l.variant_id && 'bg-brand-50')}>
                        <Td>
                          <div className="min-w-36 font-medium text-slate-900">{l.name}{l.label && <span className="font-normal text-slate-500"> · {l.label}</span>}</div>
                          <div className="text-xs text-slate-500">{l.sku} · in stock {qty(l.stock)} {l.unit}</div>
                          {l.trackSerial && (
                            <Textarea rows={2} className="mt-2 min-w-48 font-mono text-xs" placeholder="Scan each unit's serial / IMEI (one per line)" value={l.serials} onChange={(e) => setLine(l.variant_id, 'serials', e.target.value)} />
                          )}
                          {l.trackExpiry && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Input className="h-8 w-32 text-xs" placeholder="Batch no." value={l.batch_no} onChange={(e) => setLine(l.variant_id, 'batch_no', e.target.value)} />
                              <Input className="h-8 w-40 text-xs" type="date" title="Expiry date" value={l.expiry_date} onChange={(e) => setLine(l.variant_id, 'expiry_date', e.target.value)} />
                            </div>
                          )}
                        </Td>
                        <Td>
                          {l.trackSerial ? <div className="text-sm font-medium text-slate-700">{serialList(l.serials).length} {l.unit}</div> : (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number" inputMode="decimal" min="0" step={unitStep(shop, l.unit)} value={l.qty}
                              onChange={(e) => setLine(l.variant_id, 'qty', e.target.value)} onKeyDown={backToScanner}
                              className={cx('h-9 min-w-20 text-right', tried && errs.qty && 'border-red-400')} aria-label="Quantity"
                            />
                            <span className="w-10 shrink-0 text-xs text-slate-500">{l.unit}</span>
                          </div>
                          )}
                          {errs.qty && (tried || (l.qty !== '' && !l.trackSerial)) && <div className="mt-1 text-xs text-red-600">{errs.qty}</div>}
                        </Td>
                        <Td>
                          <Input
                            type="number" inputMode="decimal" min="0" step="0.01" value={l.cost} placeholder="0"
                            onChange={(e) => setLine(l.variant_id, 'cost', e.target.value)} onKeyDown={backToScanner}
                            className={cx('h-9 min-w-24 text-right', tried && errs.cost && 'border-red-400')} aria-label="Cost price"
                          />
                          {tried && errs.cost && <div className="mt-1 text-xs text-red-600">{errs.cost}</div>}
                        </Td>
                        <Td className="whitespace-nowrap text-right font-medium text-slate-900">{money(lineQty(l) * Number(l.cost || 0))}</Td>
                        <Td>
                          <button type="button" onClick={() => removeLine(l.variant_id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove item"><Trash2 className="size-4" /></button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card className="lg:sticky lg:top-4">
            <CardHeader title="Bill summary" subtitle={`${lines.length} item${lines.length === 1 ? '' : 's'}`} />
            <div className="space-y-4 px-5 py-4">
              <div className="flex justify-between text-sm"><span className="text-slate-600">Subtotal</span><span className="font-medium">{money(subtotal)}</span></div>
              <Field label="Discount from supplier (Rs)" error={grand < 0 ? 'More than the total' : null}>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </Field>
              <div className="flex justify-between border-t border-slate-100 pt-3 text-base"><span className="font-semibold text-slate-900">Total</span><span className="font-semibold text-slate-900">{money(grand)}</span></div>
              <Field label="Paid now (Rs)" error={paidNum > grand + 0.001 ? 'More than the total' : null}>
                <div className="flex gap-2">
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
                  <Button variant="secondary" onClick={() => setPaid(String(Math.max(grand, 0)))} className="shrink-0">Full</Button>
                </div>
              </Field>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                <span className="text-slate-600">Still owed to supplier</span>
                <span className={cx('font-semibold', due > 0 ? 'text-red-600' : 'text-emerald-600')}>{money(due)}</span>
              </div>
              <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery details, cheque no., etc." /></Field>
              {shop.taxEnabled && <p className="text-xs text-slate-500">Enter cost prices including any {shop.taxLabel.toLowerCase()} you paid on this bill.</p>}
              {tried && problems.length > 0 && <ErrorBox error={{ message: problems[0] }} />}
              <Button size="lg" className="w-full" loading={save.isPending} onClick={submit} disabled={!lines.length}>Save purchase</Button>
            </div>
          </Card>
        </div>
      </div>

      <ProductForm
        open={!!addingProduct}
        onClose={() => setAddingProduct(null)}
        initialBarcode={addingProduct || ''}
        hideStock
        onSaved={(product) => {
          const vs = product?.variants || [];
          const v = vs.find((x) => x.barcode === addingProduct) || vs[0];
          if (v) addVariant(v, { name: product.name, unit: product.unit, track_serial: product.track_serial, track_expiry: product.track_expiry });
          setTimeout(() => finder.current?.focus(), 100);
        }}
      />
      {addingSupplier && <SupplierForm onClose={() => setAddingSupplier(false)} onSaved={(s) => setSupplierId(String(s.id))} />}
    </Page>
  );
}

// ---------------------------------------------------------------- detail

function PurchaseDetail() {
  const { po } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const shop = useShop();
  const [paying, setPaying] = useState(false);
  const [returning, setReturning] = useState(false);
  const res = useQuery({ queryKey: ['purchases', 'one', po], queryFn: () => api.get(`/purchases/${po}`), select: (r) => r.data });
  const p = res.data;

  const returned = useMemo(() => {
    const m = {};
    for (const r of p?.returns || []) for (const it of r.items || []) m[it.purchase_item_id] = round3((m[it.purchase_item_id] || 0) + Number(it.quantity_returned));
    return m;
  }, [p]);

  if (res.isLoading) return <Page><Loading /></Page>;
  if (res.error) return <Page><ErrorBox error={res.error} /></Page>;

  const items = p.items || [];
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const canReturn = can('purchases.return') && items.some((i) => round3(Number(i.quantity) - (returned[i.id] || 0)) > 0);
  const due = Number(p.due_amount);
  const refunded = Number(p.refunded_amount || 0);

  return (
    <Page>
      <button type="button" onClick={() => navigate('/purchases')} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" />All purchases
      </button>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Purchase {p.po_number}<StatusBadge status={p.payment_status} /></span>}
        subtitle={<>{!p.supplier ? 'Supplier removed' : can('suppliers.manage') ? <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => navigate(`/suppliers/${p.supplier_id}`)}>{p.supplier}</button> : <span className="font-medium text-slate-700">{p.supplier}</span>} · {date(p.purchase_date)}{p.invoice_number && ` · Bill ${p.invoice_number}`}</>}
        actions={(
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
            {canReturn && <Button variant="secondary" icon={Undo2} onClick={() => setReturning(true)}>Return to supplier</Button>}
            {can('purchases.manage') && due > 0 && <Button icon={Banknote} onClick={() => setPaying(true)}>Record payment</Button>}
          </>
        )}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Items received" subtitle={`${items.length} item${items.length === 1 ? '' : 's'}`} />
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Returned</Th><Th className="text-right">Cost</Th><Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const label = variantLabel(i);
                  const ret = returned[i.id] || 0;
                  return (
                    <tr key={i.id}>
                      <Td>
                        <div className="min-w-36 font-medium text-slate-900">{i.product_name || 'Deleted item'}{label && <span className="font-normal text-slate-500"> · {label}</span>}</div>
                        {i.serials?.length > 0 && <div className="mt-0.5 font-mono text-xs text-slate-500">S/N: {i.serials.join(', ')}</div>}
                        {(i.batch_no || i.expiry_date) && <div className="mt-0.5 text-xs text-slate-500">Batch {i.batch_no || '—'}{i.expiry_date && ` · expires ${i.expiry_date}`}</div>}
                        <div className="text-xs text-slate-500">{i.sku}</div>
                      </Td>
                      <Td className="whitespace-nowrap text-right">{qty(i.quantity)} <span className="text-xs text-slate-500">{i.unit}</span></Td>
                      <Td className="whitespace-nowrap text-right">{ret > 0 ? <span className="text-amber-700">{qty(ret)} {i.unit}</span> : <span className="text-slate-300">—</span>}</Td>
                      <Td className="whitespace-nowrap text-right text-slate-600">{money(i.unit_price)}<span className="text-xs text-slate-400"> / {i.unit}</span></Td>
                      <Td className="whitespace-nowrap text-right font-medium">{money(i.total_price)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          {!!p.returns?.length && (
            <Card>
              <CardHeader title="Returns to supplier" />
              <div className="divide-y divide-slate-100">
                {p.returns.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{date(r.return_date)}{r.processor && <span className="font-normal text-slate-500"> · by {r.processor}</span>}</div>
                      <ul className="mt-1 text-slate-600">
                        {(r.items || []).map((it) => {
                          const pi = itemById[it.purchase_item_id];
                          return <li key={it.id}>{qty(it.quantity_returned)} {pi?.unit} × {pi?.product_name || 'item'}{pi && variantLabel(pi) ? ` · ${variantLabel(pi)}` : ''}</li>;
                        })}
                      </ul>
                      {r.reason && <div className="mt-1 text-slate-500">Reason: {r.reason}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">{money(r.total_refund)}</div>
                      <div className="text-xs text-slate-500">credited</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Payment" />
            <dl className="space-y-2.5 px-5 py-4 text-sm">
              <Row label="Subtotal" value={money(p.total_amount)} />
              {Number(p.discount) > 0 && <Row label="Discount" value={`− ${money(p.discount)}`} />}
              <Row label="Total" value={money(p.grand_total)} strong />
              <Row label={refunded > 0 ? 'Paid & credited' : 'Paid'} value={money(p.paid_amount)} />
              {refunded > 0 && <Row label={<span className="pl-3 text-xs">incl. credit from returns</span>} value={<span className="text-xs">{money(refunded)}</span>} />}
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="text-slate-600">Still owed</span>
                <span className={cx('text-base font-semibold', due > 0 ? 'text-red-600' : 'text-emerald-600')}>{money(due)}</span>
              </div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2.5 px-5 py-4 text-sm">
              <Row label="Recorded by" value={p.creator || '—'} />
              <Row label="Recorded on" value={dateTime(p.created_at)} />
              {p.notes && <div className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-slate-600">{p.notes}</div>}
            </dl>
          </Card>
        </div>
      </div>

      <PrintSheet p={p} shopName={shop.shopName} returned={returned} />
      {paying && <PaymentModal purchase={p} onClose={() => setPaying(false)} />}
      {returning && <ReturnModal purchase={p} returned={returned} onClose={() => setReturning(false)} />}
    </Page>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cx('text-right', strong ? 'font-semibold text-slate-900' : 'text-slate-800')}>{value}</dd>
    </div>
  );
}

function PrintSheet({ p, shopName, returned }) {
  return (
    <div className="print-area hidden w-full p-6 text-sm text-black print:block">
      <div className="mb-4 flex justify-between">
        <div><div className="text-lg font-bold">{shopName}</div><div>Purchase {p.po_number}</div></div>
        <div className="text-right"><div>{date(p.purchase_date)}</div><div>Supplier: {p.supplier}</div>{p.invoice_number && <div>Bill: {p.invoice_number}</div>}</div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-b border-black text-left"><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Returned</th><th className="text-right">Cost</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {(p.items || []).map((i) => (
            <tr key={i.id} className="border-b border-gray-300">
              <td className="py-1">{i.product_name}{variantLabel(i) ? ` · ${variantLabel(i)}` : ''}</td>
              <td className="text-right">{qty(i.quantity)} {i.unit}</td>
              <td className="text-right">{returned[i.id] ? qty(returned[i.id]) : ''}</td>
              <td className="text-right">{money(i.unit_price)}</td>
              <td className="text-right">{money(i.total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-3 w-64 space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(p.total_amount)}</span></div>
        {Number(p.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>− {money(p.discount)}</span></div>}
        <div className="flex justify-between font-bold"><span>Total</span><span>{money(p.grand_total)}</span></div>
        <div className="flex justify-between"><span>Paid + credits</span><span>{money(p.paid_amount)}</span></div>
        <div className="flex justify-between font-bold"><span>Due</span><span>{money(p.due_amount)}</span></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- payment

function PaymentModal({ purchase, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const due = Number(purchase.due_amount);
  const [amount, setAmount] = useState(String(due));
  const [error, setError] = useState(null);
  const n = Number(amount || 0);
  const bad = !(n > 0) ? 'Enter an amount' : n > due + 0.001 ? `Only ${money(due)} is due` : null;

  const save = useMutation({
    mutationFn: () => api.post(`/purchases/${purchase.po_number}/payments`, { amount: round2(n) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast(`Payment of ${money(n)} recorded`);
      onClose();
    },
    onError: setError,
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Record payment to supplier"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="pay-form" loading={save.isPending} disabled={!!bad}>Save payment</Button>
        </>
      )}
    >
      <form id="pay-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); if (!bad) save.mutate(); }}>
        <ErrorBox error={error} />
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">{purchase.supplier}</span><span className="text-slate-500">{purchase.po_number}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-600">Currently due</span><span className="font-semibold text-red-600">{money(due)}</span></div>
        </div>
        <Field label="Amount paid (Rs)" error={amount !== '' ? bad : null} required>
          <div className="flex gap-2">
            <Input autoFocus type="number" inputMode="decimal" min="0.01" step="0.01" max={due} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button variant="secondary" onClick={() => setAmount(String(due))} className="shrink-0">Full due</Button>
          </div>
        </Field>
        {!bad && n < due && <p className="text-sm text-slate-500">{money(due - n)} will still be owed after this payment.</p>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- return to supplier

function ReturnModal({ purchase, returned, onClose }) {
  const shop = useShop();
  const qc = useQueryClient();
  const toast = useToast();
  const [qtys, setQtys] = useState({});
  const [picks, setPicks] = useState({}); // serial items: { itemId: [serials] }
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(today());
  const pick = (id, sn, on) => {
    setPicks((m) => {
      const list = on ? [...(m[id] || []), sn] : (m[id] || []).filter((x) => x !== sn);
      setQtys((q) => ({ ...q, [id]: list.length ? String(list.length) : '' }));
      return { ...m, [id]: list };
    });
  };
  const [error, setError] = useState(null);

  const items = (purchase.items || []).map((i) => ({ ...i, remaining: round3(Number(i.quantity) - (returned[i.id] || 0)) })).filter((i) => i.remaining > 0);
  const ratio = Number(purchase.total_amount) > 0 ? Number(purchase.grand_total) / Number(purchase.total_amount) : 1;
  const chosen = items.filter((i) => qtys[i.id] !== undefined && qtys[i.id] !== '' && Number(qtys[i.id]) > 0);
  const errs = Object.fromEntries(items.map((i) => {
    const v = qtys[i.id];
    if (v === undefined || v === '' || Number(v) === 0) return [i.id, null];
    const b = badQty(shop, i.unit, v);
    return [i.id, b || (Number(v) > i.remaining + 0.0005 ? `Max ${qty(i.remaining)}` : null)];
  }));
  const hasErr = Object.values(errs).some(Boolean);
  const credit = round2(chosen.reduce((a, i) => a + (Number(i.total_price) / Number(i.quantity || 1)) * Number(qtys[i.id]) * ratio, 0));

  const save = useMutation({
    mutationFn: () => api.post(`/purchases/${purchase.po_number}/returns`, {
      return_date: returnDate,
      reason: reason.trim() || null,
      items: chosen.map((i) => ({ purchase_item_id: i.id, quantity_returned: Number(qtys[i.id]), ...(i.track_serial ? { serials: picks[i.id] || [] } : {}) })),
    }),
    onSuccess: (res) => {
      for (const k of ['purchases', 'inventory', 'suppliers', 'products', 'product-variants']) qc.invalidateQueries({ queryKey: [k] });
      toast(`Return saved — ${money(res.data.total_refund)} credited`);
      onClose();
    },
    onError: setError,
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Return to ${purchase.supplier || 'supplier'}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="return-form" loading={save.isPending} disabled={!chosen.length || hasErr}>Return {chosen.length ? `${chosen.length} item${chosen.length === 1 ? '' : 's'}` : 'items'}</Button>
        </>
      )}
    >
      <form id="return-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); if (chosen.length && !hasErr) save.mutate(); }}>
        <ErrorBox error={error} />
        <p className="text-sm text-slate-500">Enter how much of each item you are sending back. Stock goes down and the value is credited against this purchase.</p>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table>
            <thead><tr><Th>Item</Th><Th className="text-right">Can return</Th><Th className="w-48">Return qty</Th></tr></thead>
            <tbody>
              {items.map((i) => {
                const label = variantLabel(i);
                return (
                  <tr key={i.id}>
                    <Td>
                      <div className="font-medium text-slate-900">{i.product_name}{label && <span className="font-normal text-slate-500"> · {label}</span>}</div>
                      <div className="text-xs text-slate-500">{money(i.unit_price)} / {i.unit}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-right text-slate-600">{qty(i.remaining)} {i.unit}</Td>
                    <Td>
                      {i.track_serial ? (
                        <div className="space-y-1">
                          {(i.serials_in_stock || []).map((sn) => (
                            <label key={sn} className="flex items-center gap-2 text-xs">
                              <input type="checkbox" className="size-4 accent-brand-600" checked={(picks[i.id] || []).includes(sn)} onChange={(e) => pick(i.id, sn, e.target.checked)} />
                              <span className="font-mono">{sn}</span>
                            </label>
                          ))}
                          {!(i.serials_in_stock || []).length && <span className="text-xs text-slate-500">All units sold or returned</span>}
                        </div>
                      ) : (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number" inputMode="decimal" min="0" max={i.remaining} step={unitStep(shop, i.unit)} placeholder="0"
                          value={qtys[i.id] ?? ''} onChange={(e) => setQtys((q) => ({ ...q, [i.id]: e.target.value }))}
                          className={cx('h-9 min-w-20 text-right', errs[i.id] && 'border-red-400')} aria-label={`Return quantity for ${i.product_name}`}
                        />
                        <Button size="sm" variant="ghost" onClick={() => setQtys((q) => ({ ...q, [i.id]: String(i.remaining) }))}>All</Button>
                      </div>
                      )}
                      {errs[i.id] && <div className="mt-1 text-xs text-red-600">{errs[i.id]}</div>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Return date"><Input type="date" value={returnDate} max={today()} onChange={(e) => setReturnDate(e.target.value)} /></Field>
          <Field label="Reason" className="sm:col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged packing, wrong item, expired" /></Field>
        </div>
        {chosen.length > 0 && !hasErr && (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Estimated credit{Number(purchase.discount) > 0 ? ' (after bill discount)' : ''}</span>
            <span className="text-base font-semibold text-slate-900">{money(credit)}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
