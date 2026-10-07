import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Banknote, ChevronRight, PauseCircle, Printer, ReceiptText, RotateCcw, Search, ShoppingCart, User, X,
} from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { date, dateTime, money, qty, round3, today, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import Receipt from '../../components/Receipt';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select,
  Table, Td, Textarea, Th, cx, useToast,
} from '../../components/ui';
import {
  ReceivePaymentModal, StatusBadges, isHeld, refundEstimate, saleDue, saleNet, salePaid, useInvalidateSales,
} from './salesShared';

export default function SalesHistory() {
  return (
    <Routes>
      <Route index element={<SalesList />} />
      <Route path=":invoice" element={<SaleDetail />} />
    </Routes>
  );
}

// ---------------------------------------------------------------- list

function daysAgo(d) {
  const x = new Date();
  x.setDate(x.getDate() - d);
  const p = (v) => String(v).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

function SalesList() {
  const shop = useShop();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const f = Object.fromEntries(sp.entries());
  const setF = (patch) => setSp((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    return next;
  }, { replace: true });

  const [search, setSearch] = useState(f.q || '');
  useEffect(() => {
    const t = setTimeout(() => { if ((f.q || '') !== search.trim()) setF({ q: search.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const customers = useQuery({
    queryKey: ['customers'], queryFn: () => api.get('/customers'), select: (r) => r.data || [], enabled: can('customers.view'), staleTime: 60_000,
  });

  const params = {
    search: f.q, start_date: f.from, end_date: f.to, status: f.status, payment_status: f.pay, customer_id: f.customer,
    page: f.page || 1, per_page: 25,
  };
  const list = useQuery({ queryKey: ['sales', 'list', params], queryFn: () => api.get('/sales', params), placeholderData: (p) => p });
  const held = useQuery({ queryKey: ['sales', 'held-count'], queryFn: () => api.get('/sales', { status: 'held', per_page: 1 }), select: (r) => r.meta?.total || 0 });
  const { rows, meta } = paged(list.data);
  const filtered = !!(f.q || f.from || f.to || f.status || f.pay || f.customer);
  const range = f.from && f.from === f.to && f.from === today() ? 'today' : f.from === daysAgo(6) && f.to === today() ? 'week' : f.from === daysAgo(29) && f.to === today() ? 'month' : '';

  return (
    <Page>
      <PageHeader
        title="Sales history"
        subtitle="Every bill rung up at the counter. Open a bill to reprint it, take a pending payment or process a return."
        actions={can('sales.create') && <Button icon={ShoppingCart} onClick={() => navigate('/pos')}>New sale</Button>}
      />

      {held.data > 0 && f.status !== 'held' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <PauseCircle className="size-5 shrink-0 text-amber-600" />
          <span className="flex-1"><b>{held.data} bill{held.data > 1 ? 's are' : ' is'} on hold.</b> Held bills are not sales yet — no stock or payment has been taken. Complete them from <b>POS → Resume</b>.</span>
          <Button size="sm" variant="secondary" onClick={() => setF({ status: 'held' })}>Show held bills</Button>
          <Button size="sm" onClick={() => navigate('/pos')}>Go to POS</Button>
        </div>
      )}

      <Card>
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 pr-9"
                placeholder="Search bill number, customer name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setF({ q: search.trim() }); } }}
              />
              {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Clear"><X className="size-4" /></button>}
            </div>
            <div className="w-full sm:w-40"><Select value={f.status || ''} onChange={(e) => setF({ status: e.target.value })} aria-label="Bill status">
              <option value="">All bills</option>
              <option value="completed">Completed</option>
              <option value="held">On hold</option>
              <option value="returned">Fully returned</option>
            </Select></div>
            <div className="w-full sm:w-40"><Select value={f.pay || ''} onChange={(e) => setF({ pay: e.target.value })} aria-label="Payment">
              <option value="">Any payment</option>
              <option value="paid">Paid</option>
              <option value="partial">Part paid</option>
              <option value="pending">Unpaid</option>
            </Select></div>
            {can('customers.view') && (
              <div className="w-full sm:w-52"><Select value={f.customer || ''} onChange={(e) => setF({ customer: e.target.value })} aria-label="Customer">
                <option value="">All customers</option>
                {(customers.data || []).map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
              </Select></div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {[['today', 'Today', 0], ['week', 'Last 7 days', 6], ['month', 'Last 30 days', 29]].map(([key, label, d]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setF({ from: d === 0 ? today() : daysAgo(d), to: today() })}
                  className={cx('border-r border-slate-300 px-3 py-2 last:border-r-0', range === key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
                >{label}</button>
              ))}
            </div>
            <span className="ml-1 text-slate-500">From</span>
            <div className="w-40"><Input type="date" value={f.from || ''} max={f.to || undefined} onChange={(e) => setF({ from: e.target.value })} aria-label="From date" /></div>
            <span className="text-slate-500">to</span>
            <div className="w-40"><Input type="date" value={f.to || ''} min={f.from || undefined} onChange={(e) => setF({ to: e.target.value })} aria-label="To date" /></div>
            {filtered && <Button size="sm" variant="ghost" icon={X} onClick={() => { setSearch(''); setSp({}, { replace: true }); }}>Clear filters</Button>}
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState icon={ReceiptText} title={filtered ? 'No bills match these filters' : 'No sales yet'} action={!filtered && can('sales.create') && <Button icon={ShoppingCart} onClick={() => navigate('/pos')}>Open POS</Button>}>
            {filtered ? 'Try a wider date range or clear the filters.' : 'Bills you ring up at the POS will appear here.'}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Bill #</Th><Th>Date</Th><Th>Customer</Th><Th className="hidden xl:table-cell">Cashier</Th><Th className="text-right">Items</Th>
                <Th className="text-right">Total</Th><Th className="text-right">Paid</Th><Th className="text-right">Due</Th><Th>Payment</Th><Th>Status</Th><Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const held = isHeld(s);
                const due = saleDue(s);
                return (
                  <tr key={s.invoice_number} className={cx('cursor-pointer hover:bg-slate-50', held && 'bg-amber-50/40')} onClick={() => navigate(`/sales/${s.invoice_number}`)}>
                    <Td className="whitespace-nowrap font-medium text-slate-900">{s.invoice_number}</Td>
                    <Td className="whitespace-nowrap text-slate-600">{dateTime(s.sale_date)}</Td>
                    <Td className="max-w-44 truncate">{s.customer || <span className="text-slate-400">Walk-in</span>}</Td>
                    <Td className="hidden whitespace-nowrap text-slate-600 xl:table-cell">{s.cashier}</Td>
                    <Td className="text-right text-slate-600">{s.items_count}</Td>
                    <Td className="whitespace-nowrap text-right font-medium">
                      {money(saleNet(s))}
                      {Number(s.refunded_amount) > 0 && <div className="text-xs font-normal text-slate-400 line-through">{money(s.grand_total)}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-right text-slate-600">{held ? '—' : money(salePaid(s))}</Td>
                    <Td className={cx('whitespace-nowrap text-right', due > 0 ? 'font-semibold text-red-600' : 'text-slate-400')}>{held ? '—' : due > 0 ? money(due) : '—'}</Td>
                    <Td className="whitespace-nowrap text-slate-600">{held ? '—' : shop.paymentLabel(s.payment_method)}</Td>
                    <Td><StatusBadges sale={s} /></Td>
                    <Td className="text-right"><ChevronRight className="ml-auto size-4 text-slate-400" /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination meta={meta} onPage={(p) => setF({ page: String(p) })} />
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------- detail

function returnedBySaleItem(sale) {
  const map = {};
  for (const r of sale.returns || []) {
    for (const it of r.items || []) map[it.sale_item_id] = round3((map[it.sale_item_id] || 0) + Number(it.quantity_returned));
  }
  return map;
}

function SaleDetail() {
  const { invoice } = useParams();
  const navigate = useNavigate();
  const shop = useShop();
  const { can } = useAuth();
  const [printing, setPrinting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [returning, setReturning] = useState(false);

  const q = useQuery({ queryKey: ['sales', 'detail', invoice], queryFn: () => api.get(`/sales/${invoice}`), select: (r) => r.data });
  const sale = q.data;
  const returned = useMemo(() => (sale ? returnedBySaleItem(sale) : {}), [sale]);

  const back = <Button variant="ghost" icon={ArrowLeft} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/sales'))}>Back</Button>;
  if (q.isLoading) return <Page><Loading /></Page>;
  if (q.error) return <Page><div className="mb-4">{back}</div><ErrorBox error={q.error} /></Page>;

  const held = isHeld(sale);
  const due = saleDue(sale);
  const itemsById = Object.fromEntries((sale.items || []).map((i) => [i.id, i]));
  const canReturn = !held && can('sales.return') && (sale.items || []).some((i) => round3(i.quantity - (returned[i.id] || 0)) > 0);

  return (
    <Page>
      <div className="mb-2 -ml-2">{back}</div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Bill {sale.invoice_number} <StatusBadges sale={sale} /></span>}
        subtitle={`${dateTime(sale.sale_date)} · Cashier: ${sale.cashier || '—'}`}
        actions={(
          <>
            {!held && <Button variant="secondary" icon={Printer} onClick={() => setPrinting(true)}>Print receipt</Button>}
            {canReturn && <Button variant="secondary" icon={RotateCcw} onClick={() => setReturning(true)}>Return items</Button>}
            {!held && due > 0 && <Button variant="success" icon={Banknote} onClick={() => setPaying(true)}>Receive payment</Button>}
          </>
        )}
      />

      {held && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <PauseCircle className="size-5 shrink-0 text-amber-600" />
          <span className="flex-1">This bill is <b>on hold</b>. No stock has been taken and no payment recorded yet. To finish it, open <b>POS → Resume</b> and select {sale.invoice_number}.</span>
          {can('sales.create') && <Button size="sm" icon={ShoppingCart} onClick={() => navigate('/pos')}>Go to POS</Button>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Items" subtitle={`${sale.items?.length || 0} line${sale.items?.length === 1 ? '' : 's'}`} />
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Price</Th><Th className="text-right">Discount</Th><Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {(sale.items || []).map((it) => {
                  const ret = returned[it.id] || 0;
                  return (
                    <tr key={it.id}>
                      <Td>
                        <div className="font-medium text-slate-900">{it.product_name || 'Deleted item'}</div>
                        <div className="text-xs text-slate-500">{[variantLabel(it), it.sku].filter(Boolean).join(' · ')}</div>
                        {ret > 0 && <Badge color="blue" className="mt-1">{qty(ret)} {shop.unitLabel(it.unit).toLowerCase()} returned</Badge>}
                      </Td>
                      <Td className="whitespace-nowrap text-right">{qty(it.quantity)} <span className="text-xs text-slate-500">{it.unit}</span></Td>
                      <Td className="whitespace-nowrap text-right text-slate-600">{money(it.unit_price)}</Td>
                      <Td className="whitespace-nowrap text-right text-slate-600">{Number(it.discount_per_item) > 0 ? `-${money(it.discount_per_item)}` : '—'}</Td>
                      <Td className="whitespace-nowrap text-right font-medium">{money(it.total_price)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          {(sale.returns || []).length > 0 && (
            <Card>
              <CardHeader title="Returns" subtitle="Items brought back against this bill" />
              <ul className="divide-y divide-slate-100">
                {sale.returns.map((r) => (
                  <li key={r.id} className="px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-900">{date(r.return_date)}{r.processor && <span className="font-normal text-slate-500"> · by {r.processor}</span>}</div>
                        {r.reason && <div className="mt-0.5 text-slate-600">Reason: {r.reason}</div>}
                      </div>
                      <div className="font-semibold text-slate-900">Refund {money(r.total_refund)}</div>
                    </div>
                    <ul className="mt-2 space-y-1 text-slate-600">
                      {(r.items || []).map((ri) => {
                        const it = itemsById[ri.sale_item_id] || {};
                        return (
                          <li key={ri.id} className="flex justify-between gap-2">
                            <span>{it.product_name || 'Item'}{variantLabel(it) ? ` (${variantLabel(it)})` : ''} × {qty(ri.quantity_returned)} {it.unit}</span>
                            <span>{money(ri.refund_amount)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5 text-sm">
            <div className="space-y-1.5">
              <Row label="Subtotal" value={money(sale.subtotal)} />
              {Number(sale.discount_amount) > 0 && <Row label="Bill discount" value={`-${money(sale.discount_amount)}`} />}
              {Number(sale.tax_amount) > 0 && <Row label={shop.taxLabel} value={money(sale.tax_amount)} />}
              <Row label="Bill total" value={money(sale.grand_total)} strong />
              {Number(sale.refunded_amount) > 0 && (
                <>
                  <Row label="Returned" value={`-${money(sale.refunded_amount)}`} />
                  <Row label="Total after returns" value={money(saleNet(sale))} strong />
                </>
              )}
            </div>
            {!held && (
              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
                <Row label="Paid at checkout by" value={shop.paymentLabel(sale.payment_method)} />
                <Row label="Paid so far" value={money(salePaid(sale))} />
                {Number(sale.change_amount) > 0 && <Row label="Change given" value={money(sale.change_amount)} />}
                <div className={cx('mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-base font-semibold', due > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
                  <span>{due > 0 ? 'Balance due' : 'Fully paid'}</span><span>{due > 0 ? money(due) : '✓'}</span>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 text-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</div>
            {sale.customer_id ? (
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-brand-50 text-brand-600"><User className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{sale.customer}</div>
                  {can('customers.view') && <Link to={`/customers/${sale.customer_id}`} className="text-xs text-brand-600 hover:underline">View customer &amp; dues</Link>}
                </div>
              </div>
            ) : <div className="text-slate-500">Walk-in customer</div>}
            {sale.notes && (
              <>
                <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Note</div>
                <p className="whitespace-pre-line text-slate-700">{sale.notes}</p>
              </>
            )}
          </Card>
        </div>
      </div>

      <Modal open={printing} onClose={() => setPrinting(false)} size="sm" title="Print receipt"
        footer={<><Button variant="secondary" onClick={() => setPrinting(false)}>Close</Button><Button icon={Printer} onClick={() => window.print()}>Print</Button></>}
      >
        <div className="rounded-lg bg-slate-100 py-4"><Receipt sale={sale} /></div>
      </Modal>
      {paying && <ReceivePaymentModal sale={sale} onClose={() => setPaying(false)} />}
      {returning && <ReturnModal sale={sale} returned={returned} onClose={() => setReturning(false)} />}
    </Page>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={cx('flex justify-between gap-3', strong ? 'font-semibold text-slate-900' : 'text-slate-600')}>
      <span>{label}</span><span className="whitespace-nowrap">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------- returns

function ReturnModal({ sale, returned, onClose }) {
  const shop = useShop();
  const toast = useToast();
  const invalidate = useInvalidateSales();
  const [qtys, setQtys] = useState({});
  const [picks, setPicks] = useState({}); // serial-tracked items: { itemId: [serials] }
  const [reason, setReason] = useState('');

  const lines = (sale.items || []).map((it) => {
    const remaining = round3(Number(it.quantity) - (returned[it.id] || 0));
    const fractional = shop.isFractional(it.unit);
    const serialItem = (it.serials || []).length > 0;
    const raw = serialItem ? String((picks[it.id] || []).length || '') : qtys[it.id];
    const v = Number(raw || 0);
    let error = null;
    if (raw !== undefined && raw !== '') {
      if (v < 0) error = 'Cannot be negative';
      else if (round3(v) > remaining) error = `Only ${qty(remaining)} left to return`;
      else if (!fractional && !Number.isInteger(v)) error = 'Whole numbers only';
    }
    return { it, remaining, fractional, v, error, serialItem };
  });
  const chosen = lines.filter((l) => l.v > 0 && !l.error);
  const hasError = lines.some((l) => l.error);
  const refund = refundEstimate(sale, Object.fromEntries(chosen.map((l) => [l.it.id, l.v])));
  const due = saleDue(sale);
  const offDue = Math.min(due, refund);
  const cashBack = Math.max(0, Math.round((refund - offDue) * 100) / 100);

  const save = useMutation({
    mutationFn: () => api.post(`/sales/${sale.invoice_number}/returns`, {
      reason: reason.trim() || null,
      items: chosen.map((l) => ({ sale_item_id: l.it.id, quantity_returned: round3(l.v), ...(l.serialItem ? { serials: picks[l.it.id] } : {}) })),
    }),
    onSuccess: (res) => {
      toast(`Return saved — refund ${money(res.data?.total_refund ?? refund)}`);
      invalidate();
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Return items — ${sale.invoice_number}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={RotateCcw} loading={save.isPending} disabled={!chosen.length || hasError} onClick={() => save.mutate()}>Confirm return</Button>
        </>
      )}
    >
      <p className="mb-3 text-sm text-slate-600">Enter how much of each item the customer is bringing back. Returned items go back into stock.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr><Th>Item</Th><Th className="text-right">Sold</Th><Th className="text-right">Can return</Th><Th className="w-48">Return qty</Th></tr></thead>
          <tbody>
            {lines.map(({ it, remaining, fractional, error, serialItem }) => (
              <tr key={it.id} className={remaining <= 0 ? 'opacity-50' : ''}>
                <Td>
                  <div className="font-medium text-slate-900">{it.product_name}</div>
                  <div className="text-xs text-slate-500">{[variantLabel(it), money(it.unit_price) + ' / ' + shop.unitLabel(it.unit).toLowerCase()].filter(Boolean).join(' · ')}</div>
                </Td>
                <Td className="whitespace-nowrap text-right text-slate-600">{qty(it.quantity)} {it.unit}</Td>
                <Td className="whitespace-nowrap text-right">{qty(remaining)} {it.unit}</Td>
                <Td>
                  {remaining > 0 && serialItem ? (
                    <div className="space-y-1">
                      {it.serials.map((sn) => (
                        <label key={sn} className="flex items-center gap-2 text-xs">
                          <input type="checkbox" className="size-4 accent-brand-600" checked={(picks[it.id] || []).includes(sn)}
                            onChange={(e) => setPicks((m) => ({ ...m, [it.id]: e.target.checked ? [...(m[it.id] || []), sn] : (m[it.id] || []).filter((x) => x !== sn) }))} />
                          <span className="font-mono">{sn}</span>
                        </label>
                      ))}
                    </div>
                  ) : remaining > 0 ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min="0" max={remaining} step={fractional ? '0.001' : '1'} placeholder="0"
                          className={cx('h-9 text-right', error && 'border-red-400')}
                          value={qtys[it.id] ?? ''}
                          onChange={(e) => setQtys((m) => ({ ...m, [it.id]: e.target.value }))}
                          aria-label={`Return quantity for ${it.product_name}`}
                        />
                        <Button size="sm" variant="ghost" onClick={() => setQtys((m) => ({ ...m, [it.id]: String(remaining) }))}>All</Button>
                      </div>
                      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
                    </div>
                  ) : <span className="text-xs text-slate-500">Already returned</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field label="Reason" hint="Optional — e.g. damaged, expired, wrong item, customer changed mind" className="mt-4">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between font-semibold text-slate-900"><span>Refund value</span><span>{money(refund)}</span></div>
        {refund > 0 && offDue > 0 && <div className="mt-1 flex justify-between text-slate-600"><span>Taken off the balance due</span><span>{money(offDue)}</span></div>}
        {refund > 0 && <div className="mt-1 flex justify-between text-slate-600"><span>Give back to customer</span><span className="font-medium text-slate-900">{money(cashBack)}</span></div>}
        {Number(sale.discount_amount) > 0 || Number(sale.tax_amount) > 0 ? <p className="mt-2 text-xs text-slate-500">Refund includes this bill&apos;s discount/tax share.</p> : null}
      </div>
      <div className="mt-3"><ErrorBox error={save.error} /></div>
    </Modal>
  );
}
