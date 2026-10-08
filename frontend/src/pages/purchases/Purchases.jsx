import { useEffect, useMemo, useRef, useState } from 'react';
import { Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Boxes, Banknote, PackagePlus, Plus, Printer, ScanBarcode, Search, Trash2, Undo2,
} from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { date, dateTime, money, qty, round3, today, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import ProductForm from '../../components/ProductForm';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Td, Textarea, Th,
  cx, useToast,
} from '../../components/ui';
import { VariantFinder, badQty, unitStep, useUnitText } from '../inventory/VariantFinder';
import { PAY_STATUS, SupplierForm } from '../suppliers/Suppliers';
import { printNow } from '../../lib/printer';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function StatusBadge({ status }) {
  const t = useT();
  const st = PAY_STATUS[status] || { label: status, color: 'gray' };
  return <Badge color={st.color}>{t(st.label)}</Badge>;
}

function ItemCount({ n }) {
  const t = useT();
  return n === 1 ? t('1 item') : t('{n} items', { n });
}

function BackLink({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="mb-3 inline-flex items-center gap-1.5 py-1 text-base text-slate-500 hover:text-slate-700">
      <ArrowLeft className="size-5 rtl:rotate-180" />{children}
    </button>
  );
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
  const t = useT();
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
    const h = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(h);
  }, [search]);

  const q = { search: term, supplier_id: supplierId, payment_status: status, start_date: from, end_date: to, page, per_page: 25 };
  const list = useQuery({ queryKey: ['purchases', q], queryFn: () => api.get('/purchases', q), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const filtered = term || supplierId || status || from || to;

  return (
    <Page>
      <PageHeader
        title={t('Stock bought')}
        subtitle={t('Every time you buy stock from a supplier — what came in, what you paid and what you still owe.')}
        actions={can('purchases.manage') && <Button size="lg" icon={PackagePlus} onClick={() => navigate('/purchases/new')}>{t('Stock arrived')}</Button>}
      />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input className="ps-10" placeholder={t('Purchase no. or supplier\'s bill no.…')} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTerm(search.trim()); } }} />
          </div>
          {can('suppliers.manage') && (
            <div className="w-full sm:w-52">
              <Select value={supplierId} onChange={(e) => { setParams(e.target.value ? { supplier_id: e.target.value } : {}); setPage(1); }} aria-label={t('Supplier')}>
                <option value="">{t('All suppliers')}</option>
                {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
          )}
          <div className="w-full sm:w-44">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('Payment')}>
              <option value="">{t('Paid or not')}</option>
              <option value="pending">{t('Unpaid')}</option>
              <option value="partial">{t('Partly paid')}</option>
              <option value="paid">{t('Paid')}</option>
            </Select>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input type="date" className="sm:w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label={t('From date')} />
            <span className="text-sm text-slate-400">{t('to')}</span>
            <Input type="date" className="sm:w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label={t('To date')} />
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState
            icon={Boxes}
            title={filtered ? t('Nothing found') : t('No stock bought yet')}
            action={!filtered && can('purchases.manage') && <Button size="lg" icon={PackagePlus} onClick={() => navigate('/purchases/new')}>{t('Stock arrived')}</Button>}
          >
            {filtered ? t('Try other dates or filters.') : t('When stock arrives from a supplier, write it down here — your stock goes up by itself.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="text-start">{t('Purchase')}</Th><Th className="text-start">{t('Date')}</Th><Th className="text-start">{t('Supplier')}</Th>
                <Th className="text-end">{t('Total')}</Th><Th className="hidden text-end md:table-cell">{t('Paid')}</Th><Th className="text-end">{t('Still owed')}</Th><Th className="text-start">{t('Payment')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.po_number} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/purchases/${p.po_number}`)}>
                  <Td className="py-3.5">
                    <div className="num font-medium text-brand-700">{p.po_number}</div>
                    <div className="text-xs text-slate-500"><ItemCount n={p.items_count} />{p.invoice_number && <> · {t('Bill {no}', { no: p.invoice_number })}</>}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600"><span className="num">{date(p.purchase_date)}</span></Td>
                  <Td className="text-slate-700">{p.supplier || '—'}</Td>
                  <Td className="whitespace-nowrap text-end font-medium text-slate-900"><span className="num">{money(p.grand_total)}</span></Td>
                  <Td className="hidden whitespace-nowrap text-end text-slate-600 md:table-cell"><span className="num">{money(p.paid_amount)}</span></Td>
                  <Td className="whitespace-nowrap text-end">{Number(p.due_amount) > 0 ? <span className="num font-medium text-red-600">{money(p.due_amount)}</span> : <span className="text-slate-400">—</span>}</Td>
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

// ---------------------------------------------------------------- new purchase ("Stock arrived")

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

// One numbered step of the "stock arrived" story.
function Step({ n, title, hint, children, className }) {
  return (
    <Card className={className}>
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="num grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-brand-ink">{n}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {hint && <p className="text-sm text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function NewPurchase() {
  const { can } = useAuth();
  const shop = useShop();
  const t = useT();
  const unitText = useUnitText();
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
    qty: l.trackSerial ? (serialList(l.serials).length ? null : t('Scan the serial / IMEI of each piece')) : badQty(t, shop, l.unit, l.qty),
    cost: l.cost === '' || Number(l.cost) < 0 || Number.isNaN(Number(l.cost)) ? t('Write the price') : null,
  }]));
  const problems = [
    !supplierId && t('Step 1: choose who you bought from'),
    !lines.length && t('Step 2: add at least one item'),
    lines.some((l) => lineErrors[l.variant_id].qty || lineErrors[l.variant_id].cost) && t('Fix the items marked in red'),
    disc < 0 && t('Discount cannot be less than 0'),
    grand < 0 && t('Discount is more than the total'),
    paidNum < 0 && t('Paid amount cannot be less than 0'),
    paidNum > grand + 0.001 && t('Paid amount is more than the total'),
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
      toast(t('Saved as {no} — stock added', { no: res.data.po_number }));
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
    return <Page><ErrorBox error={{ message: t('You are not allowed to add stock you bought. Ask the shop owner.') }} /></Page>;
  }

  return (
    <Page>
      <BackLink onClick={() => navigate('/purchases')}>{t('All stock bought')}</BackLink>
      <PageHeader title={t('Stock arrived')} subtitle={t('Write down stock you bought in 3 easy steps. Your stock goes up when you save.')} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* 1. who */}
          <Step n="1" title={t('Who did you buy from?')} hint={t('Choose the supplier. Not in the list? Tap "New supplier".')}>
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label={t('Supplier')} required error={tried && !supplierId ? t('Choose a supplier') : null} className="sm:col-span-3">
                {can('suppliers.manage') ? (
                  <div className="flex gap-2">
                    <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={suppliers.isLoading} className="h-12 text-base">
                      <option value="">{suppliers.isLoading ? t('Loading…') : t('Choose supplier…')}</option>
                      {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</option>)}
                    </Select>
                    <Button variant="secondary" icon={Plus} onClick={() => setAddingSupplier(true)} className="h-12 shrink-0">{t('New supplier')}</Button>
                  </div>
                ) : (
                  <ErrorBox error={{ message: t('You are not allowed to choose a supplier. Ask the shop owner.') }} />
                )}
              </Field>
              <Field label={t('Date')} required>
                <Input type="date" value={purchaseDate} max={today()} onChange={(e) => setPurchaseDate(e.target.value)} />
              </Field>
              <Field label={t('Supplier\'s bill no. (optional)')} hint={t('The number printed on their bill')} className="sm:col-span-2">
                <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} maxLength={255} />
              </Field>
            </div>
            {error?.errors?.invoice_number && <p className="px-5 pb-4 text-sm text-red-600">{error.errors.invoice_number[0]}</p>}
          </Step>

          {/* 2. what */}
          <Step n="2" title={t('Scan the items')} hint={t('Scan each item\'s barcode, or type its name and pick it. Then write how many and the price.')}>
            <div className="border-b border-slate-100 p-4">
              <VariantFinder ref={finder} size="lg" autoFocus onPick={addVariant} onUnknown={setUnknown} placeholder={t('Scan barcode or type item name…')} />
              {unknown && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <div className="flex items-start gap-2 text-amber-900">
                    <ScanBarcode className="mt-0.5 size-5 shrink-0" />
                    <span>
                      <span className="font-medium">{t('"{code}" is not in your items.', { code: unknown })}</span>
                      {can('products.create') && <> {t('Add it as a new item. Leave its stock at 0 — this purchase adds the stock.')}</>}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {can('products.create') && <Button icon={PackagePlus} onClick={() => { setAddingProduct(unknown); }}>{t('Add this item')}</Button>}
                    <Button variant="ghost" onClick={() => setUnknown(null)}>{t('Close')}</Button>
                  </div>
                </div>
              )}
            </div>

            {!lines.length ? (
              <EmptyState icon={ScanBarcode} title={t('No items yet')}>{t('Scan the first item above.')}</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr><Th className="text-start">{t('Item')}</Th><Th className="text-start w-40">{t('How many?')}</Th><Th className="text-start w-36">{t('Price for each')}</Th><Th className="text-end">{t('Total')}</Th><Th className="w-12" /></tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const errs = lineErrors[l.variant_id];
                    const unit = unitText(l.unit);
                    return (
                      <tr key={l.variant_id} className={cx('align-top transition-colors', flash === l.variant_id && 'bg-brand-50')}>
                        <Td>
                          <div className="min-w-36 text-base font-medium text-slate-900">{l.name}{l.label && <span className="font-normal text-slate-500"> · {l.label}</span>}</div>
                          <div className="text-xs text-slate-500">{t('In stock now')}: <span className="num">{qty(l.stock)}</span> {unit}</div>
                          {l.trackSerial && (
                            <Field label={t('Serial / IMEI numbers ({n})', { n: serialList(l.serials).length })} className="mt-2">
                              <Textarea rows={2} dir="ltr" className="min-w-48 font-mono text-sm" placeholder={t('Scan each piece — one per line')} value={l.serials} onChange={(e) => setLine(l.variant_id, 'serials', e.target.value)} />
                            </Field>
                          )}
                          {l.trackExpiry && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Field label={t('Batch no.')}><Input className="w-32" value={l.batch_no} onChange={(e) => setLine(l.variant_id, 'batch_no', e.target.value)} /></Field>
                              <Field label={t('Expiry date')}><Input className="w-40" type="date" value={l.expiry_date} onChange={(e) => setLine(l.variant_id, 'expiry_date', e.target.value)} /></Field>
                            </div>
                          )}
                        </Td>
                        <Td>
                          {l.trackSerial ? <div className="pt-2 text-base font-medium text-slate-700"><span className="num">{serialList(l.serials).length}</span> {unit}</div> : (
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number" inputMode="decimal" min="0" step={unitStep(shop, l.unit)} value={l.qty}
                                onChange={(e) => setLine(l.variant_id, 'qty', e.target.value)} onKeyDown={backToScanner}
                                className={cx('min-w-20', tried && errs.qty && 'border-red-400')} aria-label={t('How many?')}
                              />
                              <span className="shrink-0 text-sm text-slate-500">{unit}</span>
                            </div>
                          )}
                          {errs.qty && (tried || (l.qty !== '' && !l.trackSerial)) && <div className="mt-1 text-xs text-red-600">{errs.qty}</div>}
                        </Td>
                        <Td>
                          <Input
                            type="number" inputMode="decimal" min="0" step="0.01" value={l.cost} placeholder="0"
                            onChange={(e) => setLine(l.variant_id, 'cost', e.target.value)} onKeyDown={backToScanner}
                            className={cx('min-w-24', tried && errs.cost && 'border-red-400')} aria-label={t('Price for each')}
                          />
                          {tried && errs.cost && <div className="mt-1 text-xs text-red-600">{errs.cost}</div>}
                        </Td>
                        <Td className="whitespace-nowrap pt-5 text-end font-medium text-slate-900"><span className="num">{money(lineQty(l) * Number(l.cost || 0))}</span></Td>
                        <Td>
                          <button type="button" onClick={() => removeLine(l.variant_id)} className="rounded-lg p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('Remove')} title={t('Remove')}><Trash2 className="size-5" /></button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Step>
        </div>

        {/* 3. money */}
        <div className="min-w-0">
          <Step n="3" title={t('How much did you pay?')} hint={<ItemCount n={lines.length} />} className="lg:sticky lg:top-4">
            <div className="space-y-4 px-5 py-4">
              <div className="flex justify-between text-base"><span className="text-slate-600">{t('Items total')}</span><span className="num font-medium">{money(subtotal)}</span></div>
              <Field label={t('Discount from supplier (Rs)')} error={grand < 0 ? t('More than the total') : null}>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </Field>
              <div className="flex justify-between border-t border-slate-100 pt-3 text-lg"><span className="font-semibold text-slate-900">{t('Bill total')}</span><span className="num font-bold text-slate-900">{money(grand)}</span></div>
              <Field label={t('Paid now (Rs)')} hint={t('Leave 0 if you will pay later.')} error={paidNum > grand + 0.001 ? t('More than the total') : null}>
                <div className="flex gap-2">
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" className="h-12 text-lg" />
                  <Button variant="secondary" onClick={() => setPaid(String(Math.max(grand, 0)))} className="h-12 shrink-0">{t('Paid in full')}</Button>
                </div>
              </Field>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-3 text-base">
                <span className="text-slate-600">{t('Still owed to supplier')}</span>
                <span className={cx('num font-bold', due > 0 ? 'text-red-600' : 'text-emerald-600')}>{money(due)}</span>
              </div>
              <Field label={t('Note (optional)')}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Delivery details, cheque no., etc.')} /></Field>
              {shop.taxEnabled && <p className="text-sm text-slate-500">{t('Write buying prices including any {tax} you paid on this bill.', { tax: shop.taxLabel })}</p>}
              {tried && problems.length > 0 && <ErrorBox error={{ message: problems[0] }} />}
              <Button size="lg" className="w-full" loading={save.isPending} onClick={submit} disabled={!lines.length}>{t('Save — add to stock')}</Button>
            </div>
          </Step>
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
  const t = useT();
  const unitText = useUnitText();
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
      <BackLink onClick={() => navigate('/purchases')}>{t('All stock bought')}</BackLink>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{t('Purchase {no}', { no: p.po_number })}<StatusBadge status={p.payment_status} /></span>}
        subtitle={(
          <>
            {!p.supplier ? t('Supplier removed') : can('suppliers.manage')
              ? <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => navigate(`/suppliers/${p.supplier_id}`)}>{p.supplier}</button>
              : <span className="font-medium text-slate-700">{p.supplier}</span>}
            {' · '}<span className="num">{date(p.purchase_date)}</span>
            {p.invoice_number && <> · {t('Bill {no}', { no: p.invoice_number })}</>}
          </>
        )}
        actions={(
          <>
            <Button variant="secondary" icon={Printer} onClick={() => printNow('document')}>{t('Print')}</Button>
            {canReturn && <Button variant="secondary" icon={Undo2} onClick={() => setReturning(true)}>{t('Return to supplier')}</Button>}
            {can('purchases.manage') && due > 0 && <Button size="lg" icon={Banknote} onClick={() => setPaying(true)}>{t('Pay supplier')}</Button>}
          </>
        )}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title={t('Items received')} subtitle={<ItemCount n={items.length} />} />
            <Table>
              <thead><tr><Th className="text-start">{t('Item')}</Th><Th className="text-end">{t('Qty')}</Th><Th className="text-end">{t('Returned')}</Th><Th className="text-end">{t('Price for each')}</Th><Th className="text-end">{t('Total')}</Th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const label = variantLabel(i);
                  const ret = returned[i.id] || 0;
                  const unit = unitText(i.unit);
                  return (
                    <tr key={i.id}>
                      <Td>
                        <div className="min-w-36 font-medium text-slate-900">{i.product_name || t('Deleted item')}{label && <span className="font-normal text-slate-500"> · {label}</span>}</div>
                        {i.serials?.length > 0 && <div className="mt-0.5 text-xs text-slate-500">IMEI / S/N: <span className="num font-mono">{i.serials.join(', ')}</span></div>}
                        {(i.batch_no || i.expiry_date) && (
                          <div className="mt-0.5 text-xs text-slate-500">
                            {t('Batch {no}', { no: i.batch_no || '—' })}{i.expiry_date && <> · {t('Expires')} <span className="num">{i.expiry_date}</span></>}
                          </div>
                        )}
                        <div className="text-xs text-slate-500"><span className="num">{i.sku}</span></div>
                      </Td>
                      <Td className="whitespace-nowrap text-end"><span className="num">{qty(i.quantity)}</span> <span className="text-xs text-slate-500">{unit}</span></Td>
                      <Td className="whitespace-nowrap text-end">{ret > 0 ? <span className="text-amber-700"><span className="num">{qty(ret)}</span> {unit}</span> : <span className="text-slate-300">—</span>}</Td>
                      <Td className="whitespace-nowrap text-end text-slate-600"><span className="num">{money(i.unit_price)}</span><span className="text-xs text-slate-400"> / {unit}</span></Td>
                      <Td className="whitespace-nowrap text-end font-medium"><span className="num">{money(i.total_price)}</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          {!!p.returns?.length && (
            <Card>
              <CardHeader title={t('Returned to supplier')} />
              <div className="divide-y divide-slate-100">
                {p.returns.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900"><span className="num">{date(r.return_date)}</span>{r.processor && <span className="font-normal text-slate-500"> · {t('by {name}', { name: r.processor })}</span>}</div>
                      <ul className="mt-1 text-slate-600">
                        {(r.items || []).map((it) => {
                          const pi = itemById[it.purchase_item_id];
                          return <li key={it.id}><span className="num">{qty(it.quantity_returned)}</span> {pi ? unitText(pi.unit) : ''} × {pi?.product_name || t('Item')}{pi && variantLabel(pi) ? ` · ${variantLabel(pi)}` : ''}</li>;
                        })}
                      </ul>
                      {r.reason && <div className="mt-1 text-slate-500">{t('Why')}: {r.reason}</div>}
                    </div>
                    <div className="text-end">
                      <div className="num font-semibold text-slate-900">{money(r.total_refund)}</div>
                      <div className="text-xs text-slate-500">{t('taken off the bill')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t('Payment')} />
            <dl className="space-y-2.5 px-5 py-4 text-sm">
              <Row label={t('Items total')} value={<span className="num">{money(p.total_amount)}</span>} />
              {Number(p.discount) > 0 && <Row label={t('Discount')} value={<span className="num">− {money(p.discount)}</span>} />}
              <Row label={t('Bill total')} value={<span className="num">{money(p.grand_total)}</span>} strong />
              <Row label={refunded > 0 ? t('Paid + returns') : t('Paid')} value={<span className="num">{money(p.paid_amount)}</span>} />
              {refunded > 0 && <Row label={<span className="ps-3 text-xs">{t('of which, returned stock')}</span>} value={<span className="num text-xs">{money(refunded)}</span>} />}
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="text-slate-600">{t('Still owed')}</span>
                <span className={cx('num text-base font-semibold', due > 0 ? 'text-red-600' : 'text-emerald-600')}>{money(due)}</span>
              </div>
            </dl>
          </Card>
          <Card>
            <CardHeader title={t('More details')} />
            <dl className="space-y-2.5 px-5 py-4 text-sm">
              <Row label={t('Written by')} value={p.creator || '—'} />
              <Row label={t('Written on')} value={<span className="num">{dateTime(p.created_at)}</span>} />
              {p.notes && <div dir="auto" className="text-start whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-slate-600">{p.notes}</div>}
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
      <dd className={cx('text-end', strong ? 'font-semibold text-slate-900' : 'text-slate-800')}>{value}</dd>
    </div>
  );
}

function PrintSheet({ p, shopName, returned }) {
  const t = useT();
  const unitText = useUnitText();
  return (
    <div className="print-area hidden w-full p-6 text-sm text-black print:block">
      <div className="mb-4 flex justify-between">
        <div><div className="text-lg font-bold">{shopName}</div><div>{t('Purchase {no}', { no: p.po_number })}</div></div>
        <div className="text-end">
          <div className="num">{date(p.purchase_date)}</div>
          <div>{t('Supplier')}: {p.supplier}</div>
          {p.invoice_number && <div>{t('Bill {no}', { no: p.invoice_number })}</div>}
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-b border-black text-start"><th className="py-1 text-start">{t('Item')}</th><th className="text-end">{t('Qty')}</th><th className="text-end">{t('Returned')}</th><th className="text-end">{t('Price for each')}</th><th className="text-end">{t('Total')}</th></tr></thead>
        <tbody>
          {(p.items || []).map((i) => (
            <tr key={i.id} className="border-b border-gray-300">
              <td className="py-1">{i.product_name}{variantLabel(i) ? ` · ${variantLabel(i)}` : ''}</td>
              <td className="text-end"><span className="num">{qty(i.quantity)}</span> {unitText(i.unit)}</td>
              <td className="text-end num">{returned[i.id] ? qty(returned[i.id]) : ''}</td>
              <td className="text-end num">{money(i.unit_price)}</td>
              <td className="text-end num">{money(i.total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ms-auto mt-3 w-64 space-y-1">
        <div className="flex justify-between"><span>{t('Items total')}</span><span className="num">{money(p.total_amount)}</span></div>
        {Number(p.discount) > 0 && <div className="flex justify-between"><span>{t('Discount')}</span><span className="num">− {money(p.discount)}</span></div>}
        <div className="flex justify-between font-bold"><span>{t('Bill total')}</span><span className="num">{money(p.grand_total)}</span></div>
        <div className="flex justify-between"><span>{t('Paid + returns')}</span><span className="num">{money(p.paid_amount)}</span></div>
        <div className="flex justify-between font-bold"><span>{t('Still owed')}</span><span className="num">{money(p.due_amount)}</span></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- payment

function PaymentModal({ purchase, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const due = Number(purchase.due_amount);
  const [amount, setAmount] = useState(String(due));
  const [error, setError] = useState(null);
  const n = Number(amount || 0);
  const bad = !(n > 0) ? t('Enter an amount') : n > due + 0.001 ? t('Only {amount} is owed', { amount: money(due) }) : null;

  const save = useMutation({
    mutationFn: () => api.post(`/purchases/${purchase.po_number}/payments`, { amount: round2(n) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast(t('Payment of {amount} saved', { amount: money(n) }));
      onClose();
    },
    onError: setError,
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('Pay supplier')}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="pay-form" loading={save.isPending} disabled={!!bad}>{t('Save payment')}</Button>
        </>
      )}
    >
      <form id="pay-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); if (!bad) save.mutate(); }}>
        <ErrorBox error={error} />
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between gap-2"><span className="text-slate-500">{purchase.supplier}</span><span className="num text-slate-500">{purchase.po_number}</span></div>
          <div className="mt-1 flex justify-between gap-2"><span className="text-slate-600">{t('Still owed')}</span><span className="num text-base font-semibold text-red-600">{money(due)}</span></div>
        </div>
        <Field label={t('How much are you paying now? (Rs)')} error={amount !== '' ? bad : null} required>
          <div className="flex gap-2">
            <Input autoFocus type="number" inputMode="decimal" min="0.01" step="0.01" max={due} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg" />
            <Button variant="secondary" onClick={() => setAmount(String(due))} className="h-12 shrink-0">{t('All of it')}</Button>
          </div>
        </Field>
        {!bad && n < due && <p className="text-sm text-slate-500">{t('{amount} will still be owed after this.', { amount: money(due - n) })}</p>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- return to supplier

function ReturnModal({ purchase, returned, onClose }) {
  const shop = useShop();
  const t = useT();
  const unitText = useUnitText();
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
    const b = badQty(t, shop, i.unit, v);
    return [i.id, b || (Number(v) > i.remaining + 0.0005 ? t('Only {n} can be returned', { n: qty(i.remaining) }) : null)];
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
      toast(t('Return saved — {amount} taken off the bill', { amount: money(res.data.total_refund) }));
      onClose();
    },
    onError: setError,
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={purchase.supplier ? t('Send stock back to {name}', { name: purchase.supplier }) : t('Return to supplier')}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="return-form" loading={save.isPending} disabled={!chosen.length || hasErr}>
            {chosen.length === 1 ? t('Return 1 item') : chosen.length ? t('Return {n} items', { n: chosen.length }) : t('Return to supplier')}
          </Button>
        </>
      )}
    >
      <form id="return-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); if (chosen.length && !hasErr) save.mutate(); }}>
        <ErrorBox error={error} />
        <p className="text-base text-slate-600">{t('Write how much of each item you are sending back. Your stock goes down and the amount is taken off this bill.')}</p>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table>
            <thead><tr><Th className="text-start">{t('Item')}</Th><Th className="text-end">{t('Can return')}</Th><Th className="text-start w-52">{t('How many to return')}</Th></tr></thead>
            <tbody>
              {items.map((i) => {
                const label = variantLabel(i);
                const unit = unitText(i.unit);
                return (
                  <tr key={i.id}>
                    <Td>
                      <div className="font-medium text-slate-900">{i.product_name}{label && <span className="font-normal text-slate-500"> · {label}</span>}</div>
                      <div className="text-xs text-slate-500"><span className="num">{money(i.unit_price)}</span> / {unit}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-end text-slate-600"><span className="num">{qty(i.remaining)}</span> {unit}</Td>
                    <Td>
                      {i.track_serial ? (
                        <div className="space-y-1">
                          {(i.serials_in_stock || []).map((sn) => (
                            <label key={sn} className="flex items-center gap-2 py-1 text-sm">
                              <input type="checkbox" className="size-5 accent-brand-600" checked={(picks[i.id] || []).includes(sn)} onChange={(e) => pick(i.id, sn, e.target.checked)} />
                              <span className="num font-mono">{sn}</span>
                            </label>
                          ))}
                          {!(i.serials_in_stock || []).length && <span className="text-xs text-slate-500">{t('All pieces already sold or returned')}</span>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" inputMode="decimal" min="0" max={i.remaining} step={unitStep(shop, i.unit)} placeholder="0"
                            value={qtys[i.id] ?? ''} onChange={(e) => setQtys((q) => ({ ...q, [i.id]: e.target.value }))}
                            className={cx('min-w-20', errs[i.id] && 'border-red-400')} aria-label={t('How many to return')}
                          />
                          <Button size="sm" variant="secondary" onClick={() => setQtys((q) => ({ ...q, [i.id]: String(i.remaining) }))}>{t('All')}</Button>
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
          <Field label={t('Return date')}><Input type="date" value={returnDate} max={today()} onChange={(e) => setReturnDate(e.target.value)} /></Field>
          <Field label={t('Why? (optional)')} className="sm:col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. Damaged packing, wrong item, expired')} /></Field>
        </div>
        {chosen.length > 0 && !hasErr && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">{Number(purchase.discount) > 0 ? t('Will be taken off the bill (after discount)') : t('Will be taken off the bill')}</span>
            <span className="num text-base font-semibold text-slate-900">{money(credit)}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
