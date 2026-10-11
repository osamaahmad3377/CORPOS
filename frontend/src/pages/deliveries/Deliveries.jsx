// Delivery board: every delivery order from the kitchen to the customer's
// door. Waiting (cooking / ready) -> send with a rider -> delivered (cash
// received). A rider back from a trip is settled in one step.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bike, CheckCircle2, ChefHat, Clock, HandCoins, MapPin, PackageCheck, Phone, Plus, Printer, RotateCcw, Timer, Users, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { money } from '../../lib/format';
import { printNow } from '../../lib/printer';
import { Page } from '../../components/Layout';
import Receipt from '../../components/Receipt';
import { initials } from '../../components/WaiterPicker';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, StatCard, cx, useConfirm, useToast } from '../../components/ui';

const minsSince = (iso) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0);
const clock = (iso) => new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });
const due = (o) => Math.max(0, Number(o.grand_total) - Number(o.paid_amount || 0));
const KITCHEN = { new: ['Sent to kitchen', 'bg-slate-700 text-white'], preparing: ['Cooking', 'bg-amber-500 text-white'], ready: ['Ready', 'bg-emerald-600 text-white'], served: ['Ready', 'bg-emerald-600 text-white'] };

export default function Deliveries() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const board = useQuery({ queryKey: ['deliveries', 'board'], queryFn: () => api.get('/deliveries'), refetchInterval: 15_000 });
  const [sending, setSending] = useState(null); // order to give a rider
  const [delivering, setDelivering] = useState(null); // order being marked delivered
  const [settling, setSettling] = useState(null); // rider back from a trip
  const [slip, setSlip] = useState(null);
  const d = board.data;
  const active = d?.active?.data || d?.active || [];
  const done = d?.delivered?.data || d?.delivered || [];
  const riders = d?.riders || [];
  const waiting = active.filter((o) => o.delivery_status !== 'out');
  const out = active.filter((o) => o.delivery_status === 'out');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['deliveries'] }); qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['kitchen'] }); qc.invalidateQueries({ queryKey: ['riders'] }); qc.invalidateQueries({ queryKey: ['cash'] }); };

  const printSlip = async (o) => {
    try {
      const full = (await api.get(`/sales/${o.invoice_number}`)).data;
      setSlip(full);
      setTimeout(() => printNow('receipt'), 300);
    } catch (e) { toast(e.message, 'error'); }
  };
  const returned = async (o) => {
    if (!(await confirm({ title: t('Not delivered?'), message: t('{inv} comes back to "Waiting" so you can send it again (or open it to cancel).', { inv: o.invoice_number }), confirmLabel: t('Back to waiting') }))) return;
    try { await api.post(`/deliveries/${o.invoice_number}/returned`); toast(t('{inv} is back in waiting', { inv: o.invoice_number })); refresh(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Page className="max-w-none">
      <PageHeader
        title={t('Deliveries')}
        subtitle={t('From the kitchen to the customer’s door. Send each order with a rider, then mark it delivered when the cash comes back.')}
        actions={(
          <>
            <Link to="/riders"><Button variant="secondary" size="lg" icon={Users}>{t('Riders')}</Button></Link>
            <Button size="lg" icon={Plus} onClick={() => navigate('/pos?new=delivery')}>{t('New delivery')}</Button>
          </>
        )}
      />

      {board.isLoading ? <Loading /> : board.error ? <ErrorBox error={board.error} /> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={ChefHat} tone="amber" label={t('Waiting for a rider')} value={<span className="num">{d.stats.pending}</span>} />
            <StatCard icon={Bike} label={t('Out for delivery')} value={<span className="num">{d.stats.out}</span>} />
            <StatCard icon={PackageCheck} tone="green" label={t('Delivered today')} value={<span className="num">{d.stats.delivered_today}</span>} sub={d.stats.delivered_today ? `${money(d.stats.sales_today)}${d.stats.avg_minutes != null ? ` · ${t('avg {n} min', { n: d.stats.avg_minutes })}` : ''}` : null} />
            <StatCard icon={Wallet} tone="red" label={t('Cash with riders')} value={money(d.stats.cash_with_riders)} />
          </div>

          {/* riders: who is out, how much cash they carry, settle when back */}
          {riders.length === 0 ? (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
              <AlertTriangle className="size-5 shrink-0" />
              <span className="flex-1 text-sm font-medium">{t('No riders yet. Add your riders to send orders with them.')}</span>
              <Link to="/riders"><Button size="sm" icon={Plus}>{t('Add rider')}</Button></Link>
            </div>
          ) : (
            <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
              {riders.map((r) => (
                <div key={r.id} className={cx('glass-tile flex min-w-60 shrink-0 items-center gap-3 rounded-2xl p-3', r.out > 0 && 'ring-2 ring-brand-500/60')}>
                  <span className={cx('grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold', r.out > 0 ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-brand-ink' : 'bg-slate-500/10 text-slate-600')}>{initials(r.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.out > 0 ? <span className="font-semibold text-brand-700 dark:text-brand-300">{t('{n} out', { n: r.out })}{r.cash_to_collect > 0 ? ` · ${money(r.cash_to_collect)}` : ''}</span> : t('Free')}
                      {r.delivered_today > 0 && ` · ${t('{n} done today', { n: r.delivered_today })}`}
                    </div>
                  </div>
                  {r.out > 0 && <Button size="sm" variant="success" icon={HandCoins} onClick={() => setSettling(r)}>{t('Back')}</Button>}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <Column title={t('Waiting for a rider')} count={waiting.length} icon={ChefHat} tone="amber" empty={t('No orders waiting. New delivery orders show here while they cook.')}>
              {waiting.map((o) => (
                <OrderCard key={o.invoice_number} o={o} t={t}
                  actions={(
                    <>
                      <Button variant="secondary" icon={Printer} onClick={() => printSlip(o)}>{t('Slip')}</Button>
                      <Button className="flex-1" icon={Bike} disabled={!riders.length} onClick={() => setSending(o)}>{t('Send with rider')}</Button>
                    </>
                  )}
                />
              ))}
            </Column>
            <Column title={t('Out for delivery')} count={out.length} icon={Bike} tone="blue" empty={t('No rider is out right now.')}>
              {out.map((o) => (
                <OrderCard key={o.invoice_number} o={o} t={t}
                  actions={(
                    <>
                      <Button variant="ghost" icon={RotateCcw} onClick={() => returned(o)} title={t('Not delivered')}>{t('Not delivered')}</Button>
                      <Button variant="secondary" icon={Printer} onClick={() => printSlip(o)}>{t('Slip')}</Button>
                      <Button className="flex-1" variant="success" icon={CheckCircle2} onClick={() => setDelivering(o)}>{t('Delivered')}</Button>
                    </>
                  )}
                />
              ))}
            </Column>
          </div>

          <Card className="mt-6">
            <div className="flex items-center justify-between border-b border-slate-900/[0.06] px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><PackageCheck className="size-5 text-emerald-600" />{t('Delivered today')}</h2>
              {d.stats.fees_today > 0 && <span className="text-sm text-slate-500">{t('Delivery charges')}: <span className="num font-semibold text-slate-800">{money(d.stats.fees_today)}</span></span>}
            </div>
            {!done.length ? <p className="px-5 py-6 text-center text-sm text-slate-500">{t('Nothing delivered yet today.')}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-xs text-slate-500"><tr>{[t('Bill'), t('Time'), t('Customer'), t('Area'), t('Rider'), t('Took'), t('Total')].map((h, i) => <th key={i} className={cx('px-5 py-2 text-start font-semibold', i === 6 && 'text-end')}>{h}</th>)}</tr></thead>
                  <tbody>
                    {done.map((o) => (
                      <tr key={o.invoice_number} className="border-t border-slate-900/[0.05]">
                        <td className="num px-5 py-2.5 font-semibold text-slate-900">{o.invoice_number}</td>
                        <td className="num px-5 py-2.5 text-slate-600">{o.delivered_at ? clock(o.delivered_at) : '—'}</td>
                        <td className="px-5 py-2.5 text-slate-700">{o.delivery_name || '—'}</td>
                        <td className="px-5 py-2.5 text-slate-600">{o.delivery_area || '—'}</td>
                        <td className="px-5 py-2.5 text-slate-600">{o.rider || '—'}</td>
                        <td className="num px-5 py-2.5 text-slate-600">{o.delivered_at ? t('{n} min', { n: Math.max(0, Math.round((new Date(o.delivered_at) - new Date(o.created_at)) / 60000)) }) : '—'}</td>
                        <td className="num px-5 py-2.5 text-end font-semibold text-slate-900">{money(o.grand_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {sending && <SendModal order={sending} riders={riders} onClose={() => setSending(null)} onDone={(o, r) => { setSending(null); toast(t('{inv} sent with {name}', { inv: o.invoice_number, name: r.name })); refresh(); }} onPrint={printSlip} />}
      {delivering && <DeliveredModal order={delivering} onClose={() => setDelivering(null)} onDone={(o) => { setDelivering(null); toast(t('{inv} delivered', { inv: o.invoice_number })); refresh(); }} />}
      {settling && <SettleModal rider={settling} orders={out.filter((o) => o.rider_id === settling.id)} onClose={() => setSettling(null)} onDone={(r) => { setSettling(null); toast(t('{name} settled: {n} deliveries, {cash} cash', { name: settling.name, n: r.orders, cash: money(r.cash) })); refresh(); }} />}
      {slip && <div className="hidden print:block"><Receipt sale={slip} preBill={slip.status === 'held'} /></div>}
    </Page>
  );
}

function Column({ title, count, icon: Icon, tone, empty, children }) {
  const tones = { amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', blue: 'bg-brand-500/15 text-brand-700 dark:text-brand-300' };
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
        <span className={cx('grid size-8 place-items-center rounded-lg', tones[tone])}><Icon className="size-4" /></span>
        {title}
        <span className="num rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-semibold text-slate-600">{count}</span>
      </h2>
      <div className="space-y-3">
        {count === 0 ? <div className="glass-tile rounded-2xl px-4 py-8 text-center text-sm text-slate-500">{empty}</div> : children}
      </div>
    </section>
  );
}

function OrderCard({ o, t, actions }) {
  const isOut = o.delivery_status === 'out';
  const mins = minsSince(o.created_at);
  const late = mins >= 60 ? 'bg-red-100 text-red-700' : mins >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-slate-500/10 text-slate-700';
  const [kLabel, kTone] = KITCHEN[o.kitchen_status || 'new'] || KITCHEN.new;
  const paid = o.status === 'completed';
  return (
    <div className={cx('glass-tile rounded-2xl p-4', isOut && 'border-s-4 border-s-blue-500')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-slate-900">{o.delivery_name || t('Customer')}</span>
            {!isOut && <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', kTone)}>{t(kLabel)}</span>}
            {isOut && <span className="flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-brand-ink"><Bike className="size-3" />{o.rider}</span>}
          </div>
          <div className="num mt-0.5 text-sm text-slate-500">{o.invoice_number} · {Number(o.items_count) === 1 ? t('1 item') : t('{n} items', { n: o.items_count })}</div>
        </div>
        <span className={cx('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold', late)} title={t('Since the order was taken')}>
          <Clock className="size-4" /><span className="num">{t('{n} min', { n: mins })}</span>
        </span>
      </div>
      <div className="mt-3 space-y-1.5 text-sm text-slate-700">
        {o.delivery_phone && <a href={`tel:${o.delivery_phone}`} className="num flex items-center gap-2 hover:text-brand-700" dir="ltr"><Phone className="size-4 shrink-0 text-slate-400" />{o.delivery_phone}</a>}
        {(o.delivery_address || o.delivery_area) && (
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" /><span>{o.delivery_address}{o.delivery_area && <span className="ms-1 rounded-md bg-brand-500/10 px-1.5 py-0.5 text-xs font-semibold text-brand-800 dark:text-brand-300">{o.delivery_area}</span>}</span></div>
        )}
        {isOut && o.dispatched_at && <div className="flex items-center gap-2 text-slate-500"><Timer className="size-4 shrink-0 text-slate-400" />{t('Left at {time} · {n} min ago', { time: clock(o.dispatched_at), n: minsSince(o.dispatched_at) })}</div>}
        {o.notes && <div className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-900 dark:text-amber-200">{o.notes}</div>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-900/[0.06] pt-3">
        <div>
          <div className="num text-2xl font-bold leading-none text-slate-900">{money(o.grand_total)}</div>
          {Number(o.delivery_fee) > 0 && <div className="mt-1 text-xs text-slate-500">{t('incl. delivery {fee}', { fee: money(o.delivery_fee) })}</div>}
        </div>
        {paid ? <Badge color="green">{t('Paid')}</Badge> : <Badge color="amber">{t('Cash to collect')}</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

function SendModal({ order, riders, onClose, onDone, onPrint }) {
  const t = useT();
  const [pick, setPick] = useState(null);
  const [print, setPrint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const send = async () => {
    setBusy(true); setError(null);
    try {
      await api.post(`/deliveries/${order.invoice_number}/send`, { rider_id: pick.id });
      if (print) onPrint({ invoice_number: order.invoice_number });
      onDone(order, pick);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('Send {inv} with…', { inv: order.invoice_number })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button icon={Bike} loading={busy} disabled={!pick} onClick={send}>{pick ? t('Send with {name}', { name: pick.name.split(' ')[0] }) : t('Choose a rider')}</Button></>}>
      <ErrorBox error={error} />
      <div className="mb-3 rounded-xl bg-slate-500/[0.06] px-3 py-2 text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{order.delivery_name || t('Customer')}</span>{order.delivery_area ? ` · ${order.delivery_area}` : ''} · <span className="num font-semibold">{money(order.grand_total)}</span>
      </div>
      <div className="grid gap-2">
        {riders.map((r) => (
          <button key={r.id} type="button" onClick={() => setPick(r)} className={cx('flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-start transition', pick?.id === r.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300')}>
            <span className={cx('grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold', r.out > 0 ? 'bg-brand-600 text-brand-ink' : 'bg-slate-500/10 text-slate-700')}>{initials(r.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">{r.name}</span>
              <span className="block text-xs text-slate-500">{r.out > 0 ? t('Already has {n} orders out', { n: r.out }) : t('Free now')}</span>
            </span>
            {pick?.id === r.id && <CheckCircle2 className="size-5 text-brand-700" />}
          </button>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={print} onChange={(e) => setPrint(e.target.checked)} />{t('Print the delivery slip for the rider')}</label>
    </Modal>
  );
}

function DeliveredModal({ order, onClose, onDone }) {
  const t = useT();
  const shop = useShop();
  const paid = order.status === 'completed';
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState(String(due(order)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const change = Math.max(0, Number(received || 0) - due(order));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.post(`/deliveries/${order.invoice_number}/delivered`, paid ? {} : { payment_method: method, payment_received: Number(received || 0) });
      onDone(order);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('{inv} delivered', { inv: order.invoice_number })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button variant="success" icon={CheckCircle2} loading={busy} onClick={save}>{paid ? t('Mark delivered') : t('Delivered — payment received')}</Button></>}>
      <ErrorBox error={error} />
      <div className="mb-4 rounded-2xl bg-slate-500/[0.06] p-4 text-center">
        <div className="text-sm text-slate-500">{paid ? t('Already paid') : t('Collect from {name}', { name: order.rider || t('the rider') })}</div>
        <div className="num text-4xl font-bold text-slate-900">{money(paid ? order.grand_total : due(order))}</div>
      </div>
      {!paid && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(shop.meta.payment_methods || []).map((p) => (
              <button key={p.code} type="button" onClick={() => setMethod(p.code)} className={cx('rounded-xl border-2 px-2 py-2.5 text-sm font-semibold', method === p.code ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700')}>{t(p.label)}</button>
            ))}
          </div>
          <Field label={t('Money received')}><Input type="number" min="0" step="0.01" className="h-14 text-2xl" value={received} onChange={(e) => setReceived(e.target.value)} /></Field>
          {change > 0 && <p className="text-sm text-emerald-700">{t('Change: {amount}', { amount: money(change) })}</p>}
        </div>
      )}
    </Modal>
  );
}

function SettleModal({ rider, orders, onClose, onDone }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cash = orders.filter((o) => o.status !== 'completed').reduce((a, o) => a + due(o), 0);
  const settle = async () => {
    setBusy(true); setError(null);
    try { onDone(await api.post(`/riders/${rider.id}/settle`, { invoices: orders.map((o) => o.invoice_number) })); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('{name} is back', { name: rider.name })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button variant="success" icon={HandCoins} loading={busy} onClick={settle}>{t('Received {amount}', { amount: money(cash) })}</Button></>}>
      <ErrorBox error={error} />
      <p className="mb-3 text-sm text-slate-600">{t('All these orders are marked delivered. Unpaid ones are paid in cash.')}</p>
      <div className="divide-y divide-slate-900/[0.06] rounded-xl border border-slate-900/10">
        {orders.map((o) => (
          <div key={o.invoice_number} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0"><span className="num font-semibold text-slate-900">{o.invoice_number}</span> <span className="text-slate-500">· {o.delivery_name || t('Customer')}{o.delivery_area ? ` · ${o.delivery_area}` : ''}</span></span>
            <span className="num shrink-0 font-semibold">{o.status === 'completed' ? <span className="text-emerald-700">{t('Paid')}</span> : money(due(o))}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100">
        <span className="font-semibold">{t('Cash to take from {name}', { name: rider.name.split(' ')[0] })}</span>
        <span className="num text-2xl font-bold">{money(cash)}</span>
      </div>
    </Modal>
  );
}
