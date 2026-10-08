import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Banknote, ChevronRight, PauseCircle, Printer, ReceiptText, RotateCcw, Search, ShoppingCart, User, X,
} from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { date, dateTime, money, qty, round3, today, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import Receipt from '../../components/Receipt';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select,
  Table, Td, Textarea, Th, cx, useToast,
} from '../../components/ui';
import {
  ReceivePaymentModal, StatusBadges, isHeld, refundEstimate, rich, saleDue, saleNet, salePaid, useInvalidateSales,
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
  const t = useT();
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
    const id = setTimeout(() => { if ((f.q || '') !== search.trim()) setF({ q: search.trim() }); }, 300);
    return () => clearTimeout(id);
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
        title={t('Old bills')}
        subtitle={t('Every bill made at the counter. Open a bill to print it again, take money still owed, or return items.')}
        actions={can('sales.create') && <Button size="lg" icon={ShoppingCart} onClick={() => navigate('/pos')}>{t('New bill')}</Button>}
      />

      {held.data > 0 && f.status !== 'held' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <PauseCircle className="size-6 shrink-0 text-amber-600" />
          <span className="min-w-60 flex-1">
            <b>{held.data > 1 ? rich(t('{n} bills are saved for later.'), { n: <span className="num">{held.data}</span> }) : t('1 bill is saved for later.')}</b>{' '}
            {t('They are not sales yet — no stock or money has been taken. Finish them from Sell → Saved bills.')}
          </span>
          <Button variant="secondary" onClick={() => setF({ status: 'held' })}>{t('Show saved bills')}</Button>
          {can('sales.create') && <Button onClick={() => navigate('/pos')}>{t('Go to Sell')}</Button>}
        </div>
      )}

      <Card>
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <Input
                className="ps-10 pe-10"
                placeholder={t('Search bill number, customer name or phone…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setF({ q: search.trim() }); } }}
              />
              {search && <button type="button" onClick={() => setSearch('')} className="absolute end-1 top-1/2 -translate-y-1/2 rounded p-2 text-slate-400 hover:text-slate-600" aria-label={t('Clear')}><X className="size-5" /></button>}
            </div>
            <div className="w-full sm:w-44"><Select value={f.status || ''} onChange={(e) => setF({ status: e.target.value })} aria-label={t('Bill status')}>
              <option value="">{t('All bills')}</option>
              <option value="completed">{t('Completed')}</option>
              <option value="held">{t('Saved for later')}</option>
              <option value="returned">{t('Fully returned')}</option>
            </Select></div>
            <div className="w-full sm:w-44"><Select value={f.pay || ''} onChange={(e) => setF({ pay: e.target.value })} aria-label={t('Payment')}>
              <option value="">{t('Any payment')}</option>
              <option value="paid">{t('Paid')}</option>
              <option value="partial">{t('Part paid')}</option>
              <option value="pending">{t('Unpaid')}</option>
            </Select></div>
            {can('customers.view') && (
              <div className="w-full sm:w-56"><Select value={f.customer || ''} onChange={(e) => setF({ customer: e.target.value })} aria-label={t('Customer')}>
                <option value="">{t('All customers')}</option>
                {(customers.data || []).map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
              </Select></div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-base">
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {[['today', 'Today', 0], ['week', 'Last 7 days', 6], ['month', 'Last 30 days', 29]].map(([key, label, d]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setF({ from: d === 0 ? today() : daysAgo(d), to: today() })}
                  className={cx('h-11 border-e border-slate-300 px-4 last:border-e-0', range === key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
                >{t(label)}</button>
              ))}
            </div>
            <span className="ms-1 text-slate-500">{t('From')}</span>
            <div className="w-44"><Input type="date" value={f.from || ''} max={f.to || undefined} onChange={(e) => setF({ from: e.target.value })} aria-label={t('From date')} /></div>
            <span className="text-slate-500">{t('to')}</span>
            <div className="w-44"><Input type="date" value={f.to || ''} min={f.from || undefined} onChange={(e) => setF({ to: e.target.value })} aria-label={t('To date')} /></div>
            {filtered && <Button variant="ghost" icon={X} onClick={() => { setSearch(''); setSp({}, { replace: true }); }}>{t('Clear filters')}</Button>}
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState
            icon={ReceiptText}
            title={filtered ? t('No bills match these filters') : t('No bills yet')}
            action={!filtered && can('sales.create') && <Button size="lg" icon={ShoppingCart} onClick={() => navigate('/pos')}>{t('Sell / Make a bill')}</Button>}
          >
            {filtered ? t('Try more days, or clear the filters.') : t('Bills you make on the Sell screen will show here.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="text-start">{t('Bill #')}</Th><Th className="text-start">{t('Date')}</Th><Th className="text-start">{t('Customer')}</Th>
                <Th className="hidden text-start 2xl:table-cell">{t('Cashier')}</Th><Th className="hidden text-end 2xl:table-cell">{t('Items')}</Th>
                <Th className="text-end">{t('Total')}</Th><Th className="text-end">{t('Paid')}</Th><Th className="text-end">{t('Still owed')}</Th>
                <Th className="hidden text-start xl:table-cell">{t('Payment')}</Th><Th className="text-start">{t('Status')}</Th><Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const isH = isHeld(s);
                const due = saleDue(s);
                return (
                  <tr key={s.invoice_number} className={cx('cursor-pointer hover:bg-slate-50', isH && 'bg-amber-50/40')} onClick={() => navigate(`/sales/${s.invoice_number}`)}>
                    <Td className="whitespace-nowrap py-4 font-medium text-slate-900"><span className="num">{s.invoice_number}</span></Td>
                    <Td className="whitespace-nowrap text-slate-600"><span className="num">{dateTime(s.sale_date)}</span></Td>
                    <Td className="max-w-44 truncate">{s.customer || <span className="text-slate-400">{t('Walk-in')}</span>}</Td>
                    <Td className="hidden whitespace-nowrap text-slate-600 2xl:table-cell">{s.cashier}</Td>
                    <Td className="hidden text-end text-slate-600 2xl:table-cell"><span className="num">{s.items_count}</span></Td>
                    <Td className="whitespace-nowrap text-end font-medium">
                      <span className="num">{money(saleNet(s))}</span>
                      {Number(s.refunded_amount) > 0 && <div className="num text-xs font-normal text-slate-400 line-through">{money(s.grand_total)}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-end text-slate-600">{isH ? '—' : <span className="num">{money(salePaid(s))}</span>}</Td>
                    <Td className={cx('whitespace-nowrap text-end', due > 0 ? 'font-semibold text-red-600' : 'text-slate-400')}>{isH || !(due > 0) ? '—' : <span className="num">{money(due)}</span>}</Td>
                    <Td className="hidden whitespace-nowrap text-slate-600 xl:table-cell">{isH ? '—' : t(shop.paymentLabel(s.payment_method))}</Td>
                    <Td><StatusBadges sale={s} /></Td>
                    <Td className="text-end"><ChevronRight className="ms-auto size-5 text-slate-400 rtl:rotate-180" /></Td>
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
  const t = useT();
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

  const back = (
    <Button variant="ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/sales'))}>
      <ArrowLeft className="size-5 rtl:rotate-180" />{t('Back')}
    </Button>
  );
  if (q.isLoading) return <Page><Loading /></Page>;
  if (q.error) return <Page><div className="mb-4">{back}</div><ErrorBox error={q.error} /></Page>;

  const held = isHeld(sale);
  const due = saleDue(sale);
  const itemsById = Object.fromEntries((sale.items || []).map((i) => [i.id, i]));
  const canReturn = !held && can('sales.return') && (sale.items || []).some((i) => round3(i.quantity - (returned[i.id] || 0)) > 0);
  const unit = (code) => t(shop.unitLabel(code));

  return (
    <Page>
      <div className="mb-2 -ms-2">{back}</div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{rich(t('Bill {inv}'), { inv: <span className="num">{sale.invoice_number}</span> })} <StatusBadges sale={sale} /></span>}
        subtitle={<><span className="num">{dateTime(sale.sale_date)}</span> · {t('Cashier')}: {sale.cashier || '—'}</>}
      />

      {/* Main things to do with this bill — big and easy to find. */}
      {!held && (
        <div className="mb-5 flex flex-wrap gap-3">
          {due > 0 && (
            <Button size="lg" variant="success" icon={Banknote} onClick={() => setPaying(true)}>
              {t('Receive payment')} <span className="num">{money(due)}</span>
            </Button>
          )}
          {canReturn && <Button size="lg" variant="secondary" icon={RotateCcw} className="border-2 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setReturning(true)}>{t('Return items')}</Button>}
          <Button size="lg" variant="secondary" icon={Printer} onClick={() => setPrinting(true)}>{t('Print receipt')}</Button>
        </div>
      )}

      {held && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <PauseCircle className="size-6 shrink-0 text-amber-600" />
          <span className="min-w-60 flex-1">{rich(t('This bill is saved for later. No stock has been taken and no money recorded yet. To finish it, open Sell → Saved bills and choose {inv}.'), { inv: <b className="num">{sale.invoice_number}</b> })}</span>
          {can('sales.create') && <Button icon={ShoppingCart} onClick={() => navigate('/pos')}>{t('Go to Sell')}</Button>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title={t('Items')} subtitle={sale.items?.length === 1 ? t('1 item') : rich(t('{n} items'), { n: <span className="num">{sale.items?.length || 0}</span> })} />
            <Table>
              <thead><tr><Th className="text-start">{t('Item')}</Th><Th className="text-end">{t('Qty')}</Th><Th className="text-end">{t('Price')}</Th><Th className="text-end">{t('Discount')}</Th><Th className="text-end">{t('Total')}</Th></tr></thead>
              <tbody>
                {(sale.items || []).map((it) => {
                  const ret = returned[it.id] || 0;
                  return (
                    <tr key={it.id}>
                      <Td>
                        <div className="font-medium text-slate-900">{it.product_name || t('Deleted item')}</div>
                        <div className="text-xs text-slate-500">{[variantLabel(it), it.sku].filter(Boolean).join(' · ')}</div>
                        {ret > 0 && <Badge color="blue" className="mt-1">{rich(t('{n} {unit} returned'), { n: <span className="num">{qty(ret)}</span>, unit: unit(it.unit) })}</Badge>}
                      </Td>
                      <Td className="whitespace-nowrap text-end"><span className="num">{qty(it.quantity)}</span> <span className="text-xs text-slate-500">{unit(it.unit)}</span></Td>
                      <Td className="whitespace-nowrap text-end text-slate-600"><span className="num">{money(it.unit_price)}</span></Td>
                      <Td className="whitespace-nowrap text-end text-slate-600">{Number(it.discount_per_item) > 0 ? <span className="num">-{money(it.discount_per_item)}</span> : '—'}</Td>
                      <Td className="whitespace-nowrap text-end font-medium"><span className="num">{money(it.total_price)}</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          {(sale.returns || []).length > 0 && (
            <Card>
              <CardHeader title={t('Returns')} subtitle={t('Items the customer brought back from this bill')} />
              <ul className="divide-y divide-slate-100">
                {sale.returns.map((r) => (
                  <li key={r.id} className="px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-900"><span className="num">{date(r.return_date)}</span>{r.processor && <span className="font-normal text-slate-500"> · {t('by {name}', { name: r.processor })}</span>}</div>
                        {r.reason && <div className="mt-0.5 text-slate-600">{t('Reason: {reason}', { reason: r.reason })}</div>}
                      </div>
                      <div className="font-semibold text-slate-900">{t('Refund')} <span className="num">{money(r.total_refund)}</span></div>
                    </div>
                    <ul className="mt-2 space-y-1 text-slate-600">
                      {(r.items || []).map((ri) => {
                        const it = itemsById[ri.sale_item_id] || {};
                        return (
                          <li key={ri.id} className="flex justify-between gap-2">
                            <span>{it.product_name || t('Item')}{variantLabel(it) ? ` (${variantLabel(it)})` : ''} × <span className="num">{qty(ri.quantity_returned)}</span> {unit(it.unit)}</span>
                            <span className="num">{money(ri.refund_amount)}</span>
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
          <Card className="p-5 text-base">
            <div className="space-y-1.5">
              <Row label={t('Subtotal')} value={money(sale.subtotal)} />
              {Number(sale.discount_amount) > 0 && <Row label={t('Bill discount')} value={`-${money(sale.discount_amount)}`} />}
              {Number(sale.tax_amount) > 0 && <Row label={shop.taxLabel} value={money(sale.tax_amount)} />}
              <Row label={t('Bill total')} value={money(sale.grand_total)} strong />
              {Number(sale.refunded_amount) > 0 && (
                <>
                  <Row label={t('Returned')} value={`-${money(sale.refunded_amount)}`} />
                  <Row label={t('Total after returns')} value={money(saleNet(sale))} strong />
                </>
              )}
            </div>
            {!held && (
              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
                <Row label={t('Paid at the counter by')} value={t(shop.paymentLabel(sale.payment_method))} text />
                <Row label={t('Paid so far')} value={money(salePaid(sale))} />
                {Number(sale.change_amount) > 0 && <Row label={t('Change given back')} value={money(sale.change_amount)} />}
                <div className={cx('mt-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-lg font-semibold', due > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
                  <span>{due > 0 ? t('Still owed') : t('Fully paid')}</span><span className="num">{due > 0 ? money(due) : '✓'}</span>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 text-base">
            <div className="mb-2 text-sm font-semibold text-slate-500">{t('Customer')}</div>
            {sale.customer_id ? (
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><User className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{sale.customer}</div>
                  {can('customers.view') && <Link to={`/customers/${sale.customer_id}`} className="inline-block py-1 text-sm font-medium text-brand-600 hover:underline">{t('See customer & udhaar')}</Link>}
                </div>
              </div>
            ) : <div className="text-slate-500">{t('Walk-in customer')}</div>}
            {sale.notes && (
              <>
                <div className="mb-1 mt-4 text-sm font-semibold text-slate-500">{t('Note')}</div>
                <p className="whitespace-pre-line text-slate-700">{sale.notes}</p>
              </>
            )}
          </Card>
        </div>
      </div>

      <Modal open={printing} onClose={() => setPrinting(false)} size="sm" title={t('Print receipt')}
        footer={<><Button variant="secondary" size="lg" onClick={() => setPrinting(false)}>{t('Close')}</Button><Button size="lg" icon={Printer} onClick={() => window.print()}>{t('Print')}</Button></>}
      >
        <div className="rounded-lg bg-slate-100 py-4"><Receipt sale={sale} /></div>
      </Modal>
      {paying && <ReceivePaymentModal sale={sale} onClose={() => setPaying(false)} />}
      {returning && <ReturnModal sale={sale} returned={returned} onClose={() => setReturning(false)} />}
    </Page>
  );
}

function Row({ label, value, strong, text }) {
  return (
    <div className={cx('flex justify-between gap-3', strong ? 'font-semibold text-slate-900' : 'text-slate-600')}>
      <span>{label}</span><span className={text ? 'text-end' : 'num'}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------- returns

function ReturnModal({ sale, returned, onClose }) {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const invalidate = useInvalidateSales();
  const [qtys, setQtys] = useState({});
  const [picks, setPicks] = useState({}); // serial-tracked items: { itemId: [serials] }
  const [reason, setReason] = useState('');
  const unit = (code) => t(shop.unitLabel(code));

  const lines = (sale.items || []).map((it) => {
    const remaining = round3(Number(it.quantity) - (returned[it.id] || 0));
    const fractional = shop.isFractional(it.unit);
    const serialItem = (it.serials || []).length > 0;
    const raw = serialItem ? String((picks[it.id] || []).length || '') : qtys[it.id];
    const v = Number(raw || 0);
    let error = null;
    if (raw !== undefined && raw !== '') {
      if (v < 0) error = t('Cannot be less than 0');
      else if (round3(v) > remaining) error = t('Only {n} left to return', { n: qty(remaining) });
      else if (!fractional && !Number.isInteger(v)) error = t('Whole numbers only for this item');
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
      toast(t('Return saved — refund {amount}', { amount: money(res.data?.total_refund ?? refund) }));
      invalidate();
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('Return items — bill {inv}', { inv: sale.invoice_number })}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="danger" size="lg" icon={RotateCcw} loading={save.isPending} disabled={!chosen.length || hasError} onClick={() => save.mutate()}>{t('Confirm return')}</Button>
        </>
      )}
    >
      <p className="mb-3 text-base text-slate-600">{t('Write how many of each item the customer is bringing back. Returned items go back into stock.')}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-start text-sm">
          <thead><tr><Th className="text-start">{t('Item')}</Th><Th className="text-end">{t('Sold')}</Th><Th className="text-end">{t('Can return')}</Th><Th className="w-52 text-start">{t('How many back?')}</Th></tr></thead>
          <tbody>
            {lines.map(({ it, remaining, fractional, error, serialItem }) => (
              <tr key={it.id} className={remaining <= 0 ? 'opacity-50' : ''}>
                <Td>
                  <div className="text-base font-medium text-slate-900">{it.product_name}</div>
                  <div className="text-xs text-slate-500">
                    {variantLabel(it) && <>{variantLabel(it)} · </>}<span className="num">{money(it.unit_price)}</span> / {unit(it.unit)}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-end text-slate-600"><span className="num">{qty(it.quantity)}</span> {unit(it.unit)}</Td>
                <Td className="whitespace-nowrap text-end font-medium"><span className="num">{qty(remaining)}</span> {unit(it.unit)}</Td>
                <Td>
                  {remaining > 0 && serialItem ? (
                    <div className="space-y-1">
                      {it.serials.map((sn) => (
                        <label key={sn} className="flex items-center gap-2 py-1 text-sm">
                          <input type="checkbox" className="size-5 accent-brand-600" checked={(picks[it.id] || []).includes(sn)}
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
                          className={cx('text-end text-lg', error && 'border-red-400')}
                          value={qtys[it.id] ?? ''}
                          onChange={(e) => setQtys((m) => ({ ...m, [it.id]: e.target.value }))}
                          aria-label={t('How many {name} back?', { name: it.product_name })}
                        />
                        <Button variant="secondary" onClick={() => setQtys((m) => ({ ...m, [it.id]: String(remaining) }))}>{t('All')}</Button>
                      </div>
                      {error && <div className="mt-1 text-sm text-red-600">{error}</div>}
                    </div>
                  ) : <span className="text-sm text-slate-500">{t('Already returned')}</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field label={t('Why is it coming back? (optional)')} hint={t('e.g. damaged, expired, wrong item, customer changed mind')} className="mt-4">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-4 space-y-1 rounded-lg bg-slate-50 p-3 text-base">
        <div className="flex justify-between gap-3 font-semibold text-slate-900"><span>{t('Value of returned items')}</span><span className="num">{money(refund)}</span></div>
        {refund > 0 && offDue > 0 && <div className="flex justify-between gap-3 text-slate-600"><span>{t('Taken off what they still owe')}</span><span className="num">{money(offDue)}</span></div>}
        {refund > 0 && <div className="flex justify-between gap-3 text-lg font-semibold text-emerald-700"><span>{t('Give back to customer')}</span><span className="num">{money(cashBack)}</span></div>}
        {Number(sale.discount_amount) > 0 || Number(sale.tax_amount) > 0 ? <p className="mt-2 text-sm text-slate-500">{t("This includes the bill's discount/tax share.")}</p> : null}
      </div>
      <div className="mt-3"><ErrorBox error={save.error} /></div>
    </Modal>
  );
}
