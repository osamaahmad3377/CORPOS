// Home dashboard: today's numbers at a glance, sales analytics for the last
// 7 or 30 days, recent bills, quick actions — and for restaurants live tables,
// kitchen queue, top waiters and kitchen stock; for shops low stock.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BadgePercent, BarChart3, Beef, Boxes, CheckCircle2, ChefHat, Clock, Coins, FileText, HandCoins,
  LayoutGrid, Package, PackagePlus, Plus, ReceiptText, Settings, ShoppingCart, Sparkles, TrendingUp, Trophy, UserRound, UtensilsCrossed, Vault, Wallet, Warehouse,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { money, qty } from '../lib/format';
import { Page } from '../components/Layout';
import { Badge, Card, cx } from '../components/ui';
import { BarList, DonutChart, HourBars, Sparkline, TrendChart, otherColor, shortMoney, shortPercent, slotColor } from '../components/charts';
import { initials } from '../components/WaiterPicker';

const PAY_SLOT = { cash: 0, card: 1, jazzcash: 2, easypaisa: 3, bank_transfer: 4 };

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning, {name}';
  if (h < 17) return 'Good afternoon, {name}';
  return 'Good evening, {name}';
}

function Delta({ value, suffix }) {
  if (value == null) return suffix ? <span className="text-xs text-slate-400">{suffix}</span> : null;
  const up = value >= 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <span className={cx('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset', up ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' : 'bg-red-50 text-red-600 ring-red-600/15')}>
        {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}<span className="num">{shortPercent(value)}</span>
      </span>
      {suffix && <span className="text-slate-500">{suffix}</span>}
    </span>
  );
}

// Today strip: the first tile is the hero (brand gradient), the rest are glass.
function TodayTile({ hero, icon: Icon, label, value, foot, tone, to }) {
  const Comp = to ? Link : 'div';
  return (
    <Comp to={to} className={cx(
      'relative isolate overflow-hidden rounded-[22px] p-5 transition',
      hero ? 'btn-jewel text-brand-ink' : 'glass',
      to && !hero && 'glass-lift',
    )}>
      {hero && <span aria-hidden className="absolute -end-10 -top-12 -z-10 size-40 rounded-full border-[18px] border-[rgb(255_255_255/0.16)]" />}
      <div className="flex items-start justify-between gap-2">
        <span className={cx('text-sm font-medium', hero ? 'opacity-85' : 'text-slate-500')}>{label}</span>
        <span className={cx('grid size-10 place-items-center rounded-xl', hero ? 'bg-[rgb(255_255_255/0.2)] ring-1 ring-inset ring-[rgb(255_255_255/0.3)]' : cx('ring-1 ring-inset', tone))}><Icon className="size-5" /></span>
      </div>
      <div className={cx('num mt-3 text-[30px] font-extrabold leading-none tracking-tight', !hero && 'text-slate-900')}>{value}</div>
      {foot && <div className={cx('mt-2 text-xs', hero ? 'opacity-85' : 'text-slate-500')}>{foot}</div>}
    </Comp>
  );
}

function Panel({ title, subtitle, action, className, children, bodyClass = 'p-5 pt-4' }) {
  return (
    <Card className={cx('flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold tracking-tight text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={cx('min-h-0 flex-1', bodyClass)}>{children}</div>
    </Card>
  );
}

const ViewAll = ({ to, label }) => (
  <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">{label}<ArrowRight className="size-3.5 rtl:rotate-180" /></Link>
);

export default function Home() {
  const { user, can } = useAuth();
  const { t, lang } = useLang();
  const shop = useShop();
  const navigate = useNavigate();
  const restaurant = shop.isRestaurant;
  const dark = shop.isDark;
  const locale = lang === 'ur' ? 'ur-PK' : 'en-GB';
  const [days, setDays] = useState(() => { try { return Number(localStorage.getItem('corepos_home_days')) === 30 ? 30 : 7; } catch { return 7; } });
  const pickDays = (d) => { setDays(d); try { localStorage.setItem('corepos_home_days', String(d)); } catch { /* ignore */ } };

  const stats = useQuery({ queryKey: ['dashboard', 'stats'], queryFn: () => api.get('/dashboard/stats'), refetchInterval: 60_000 });
  const ins = useQuery({ queryKey: ['dashboard', 'insights', days], queryFn: () => api.get('/dashboard/insights', { days }), staleTime: 60_000 });
  const recent = useQuery({ queryKey: ['dashboard', 'recent', 6], queryFn: () => api.get('/dashboard/recent-sales', { limit: 6 }), refetchInterval: 60_000 });
  const held = useQuery({ queryKey: ['sales', 'held', 'home'], queryFn: () => api.get('/sales', { status: 'held', per_page: 100 }), select: (r) => (Array.isArray(r) ? r : r?.data || []), enabled: restaurant && can('sales.create'), refetchInterval: 30_000 });
  const kitchen = useQuery({ queryKey: ['kitchen', 'orders', 'home'], queryFn: () => api.get('/kitchen/orders'), select: (r) => (Array.isArray(r) ? r : r?.data || []), enabled: restaurant && can('sales.create'), refetchInterval: 30_000 });
  const waiters = useQuery({ queryKey: ['waiters', 'page', 'today'], queryFn: () => api.get('/waiters'), enabled: restaurant && can('sales.create') });
  const low = useQuery({ queryKey: ['dashboard', 'low'], queryFn: () => api.get('/dashboard/low-stock'), enabled: !restaurant && can('inventory.view') });

  const s = stats.data || {};
  const d = ins.data;
  const empty = t('No sales in these days yet');
  const today = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const firstName = user?.name?.split(' ')[0] || '';

  // ----- restaurant live numbers
  const openOrders = held.data || [];
  const totalTables = shop.tableAreas.reduce((n, a) => n + a.tables.length, 0);
  const busyTables = new Set(openOrders.filter((o) => o.order_type === 'dine_in' && o.table_no).map((o) => o.table_no.toLowerCase())).size;
  const kOrders = kitchen.data || [];
  const cooking = kOrders.filter((o) => (o.kitchen_status || 'new') !== 'ready' && o.kitchen_status !== 'served').length;

  // ----- chart data
  const trend = (d?.trend || []).map((x) => {
    const dt = new Date(`${x.date}T00:00:00`);
    return {
      key: x.date, value: x.total, compare: x.previous,
      label: dt.toLocaleDateString(locale, days === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }),
      long: dt.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
      sub: t('{n} bills', { n: x.bills }),
    };
  });
  const tr = d?.trend || [];
  const series = { total: tr.map((x) => x.total), bills: tr.map((x) => x.bills), avg: tr.map((x) => (x.bills ? x.total / x.bills : 0)), profit: tr.map((x) => x.profit || 0) };
  const payments = [];
  let otherPay = 0;
  for (const p of d?.payments || []) {
    if (p.method in PAY_SLOT) payments.push({ key: p.method, label: t(p.label), value: p.amount, color: slotColor(PAY_SLOT[p.method], dark) });
    else otherPay += p.amount;
  }
  if (otherPay > 0) payments.push({ key: 'other', label: t('Other'), value: otherPay, color: otherColor(dark) });
  const cats = d?.categories || [];
  const catTotal = cats.reduce((a, c) => a + c.amount, 0);
  const vs = t('vs the {n} days before', { n: days });

  const actions = (restaurant ? [
    can('sales.create') && { to: '/pos', icon: LayoutGrid, label: t('Tables'), tone: 'bg-brand-50 text-brand-700' },
    can('sales.create') && { to: '/kitchen', icon: ChefHat, label: t('Kitchen screen'), tone: 'bg-orange-50 text-orange-600' },
    can('products.create') && { to: '/products?new=1', icon: PackagePlus, label: t('Add a dish'), tone: 'bg-blue-50 text-blue-600' },
    can('inventory.view') && { to: '/kitchen-stock', icon: Beef, label: t('Kitchen stock'), tone: 'bg-rose-50 text-rose-600' },
    can('users.manage') && { to: '/waiters', icon: UserRound, label: t('Waiters'), tone: 'bg-violet-50 text-violet-600' },
    can('sales.create') && { to: '/sales', icon: ReceiptText, label: t('Old bills'), tone: 'bg-indigo-50 text-indigo-600' },
    can('cash.manage') && { to: '/cash', icon: Vault, label: t('Cash drawer'), tone: 'bg-teal-50 text-teal-600' },
    can('expenses.manage') && { to: '/expenses', icon: Wallet, label: t('Expenses'), tone: 'bg-amber-50 text-amber-600' },
    can('reports.view') && { to: '/reports', icon: BarChart3, label: t('Reports'), tone: 'bg-slate-500/10 text-slate-600' },
  ] : [
    can('products.create') && { to: '/products?new=1', icon: PackagePlus, label: t('Add new item'), tone: 'bg-blue-50 text-blue-600' },
    can('purchases.manage') && { to: '/purchases/new', icon: Boxes, label: t('Stock arrived'), tone: 'bg-teal-50 text-teal-600' },
    can('customers.view') && { to: '/customers', icon: HandCoins, label: t('Udhaar / Customers'), tone: 'bg-amber-50 text-amber-600' },
    can('sales.create') && { to: '/sales', icon: ReceiptText, label: t('Old bills'), tone: 'bg-indigo-50 text-indigo-600' },
    can('inventory.view') && { to: '/inventory', icon: Warehouse, label: t('Stock count'), tone: 'bg-orange-50 text-orange-600' },
    can('quotations.manage') && { to: '/quotations', icon: FileText, label: t('Quotations'), tone: 'bg-sky-50 text-sky-600' },
    can('promotions.manage') && { to: '/offers', icon: BadgePercent, label: t('Offers & loyalty'), tone: 'bg-violet-50 text-violet-600' },
    can('cash.manage') && { to: '/cash', icon: Vault, label: t('Cash drawer'), tone: 'bg-emerald-50 text-emerald-600' },
    can('reports.view') && { to: '/reports', icon: BarChart3, label: t('Reports'), tone: 'bg-slate-500/10 text-slate-600' },
  ]).filter(Boolean);
  if (can('settings.manage')) actions.push({ to: '/settings', icon: Settings, label: t('Settings'), tone: 'bg-slate-500/10 text-slate-600' });

  const time = (v) => new Date(v).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  return (
    <Page className="max-w-[1440px]">
      {/* ------------------------------------------------ header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700"><Sparkles className="size-4" />{today}</p>
          <h1 className="mt-1 text-[30px] font-extrabold leading-tight tracking-[-0.025em] text-slate-900 sm:text-[34px]">{t(greetingKey(), { name: firstName })}</h1>
          <p className="mt-1 text-[15px] text-slate-500">{restaurant ? t('Here is how your restaurant is doing today.') : t('Here is how your shop is doing today.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('products.create') && <Link to="/products?new=1" className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-900/10 bg-white/70 px-4 font-semibold text-slate-700 shadow-xs transition hover:bg-white"><Plus className="size-5" />{restaurant ? t('Add a dish') : t('Add new item')}</Link>}
          {can('sales.create') && (
            <button type="button" onClick={() => navigate('/pos')} className="btn-jewel inline-flex h-12 items-center gap-2 rounded-xl px-5 font-semibold text-brand-ink">
              <ShoppingCart className="size-5 rtl:-scale-x-100" />{restaurant ? t('New order') : t('New sale')}
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ today */}
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <TodayTile hero icon={TrendingUp} label={t('Today\'s sale')} value={money(s.today_revenue)} foot={t('{n} bills today', { n: s.today_sales_count ?? 0 })} to={can('sales.create') ? '/sales' : undefined} />
        {restaurant ? (
          <>
            <TodayTile icon={LayoutGrid} tone="bg-blue-50 text-blue-600 ring-blue-600/10" label={t('Tables busy')} value={<>{busyTables}<span className="text-lg font-bold text-slate-400"> / {totalTables}</span></>} foot={t('{n} open orders', { n: openOrders.length })} to="/pos" />
            <TodayTile icon={ChefHat} tone="bg-orange-50 text-orange-600 ring-orange-600/10" label={t('In the kitchen')} value={cooking} foot={t('Orders being cooked')} to="/kitchen" />
          </>
        ) : (
          <>
            <TodayTile icon={ReceiptText} tone="bg-blue-50 text-blue-600 ring-blue-600/10" label={t('Bills today')} value={s.today_sales_count ?? 0} foot={s.today_sales_count ? t('Average {amount}', { amount: money((s.today_revenue || 0) / (s.today_sales_count || 1)) }) : t('No bills yet today')} />
            <TodayTile icon={Package} tone="bg-violet-50 text-violet-600 ring-violet-600/10" label={t('Items')} value={s.total_products ?? '—'} foot={t('{n} customers', { n: s.total_customers ?? 0 })} to={can('products.view') ? '/products' : undefined} />
          </>
        )}
        <TodayTile icon={Coins} tone="bg-amber-50 text-amber-600 ring-amber-600/10" label={t('This month')} value={s.month_revenue != null ? money(s.month_revenue) : '—'} foot={s.low_stock_count ? t('{n} items running low', { n: s.low_stock_count }) : t('Sales this month')} to={can('reports.view') ? '/reports' : undefined} />
      </div>

      {/* ------------------------------------------------ analytics */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('Business overview')}</h2>
        <div className="glass flex rounded-xl p-1 text-sm font-semibold" role="radiogroup" aria-label={t('Period')}>
          {[7, 30].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => pickDays(n)} className={cx('rounded-lg px-3.5 py-1.5 transition', days === n ? 'bg-brand-600 text-brand-ink shadow-xs' : 'text-slate-500 hover:text-slate-800')}>
              {t('Last {n} days', { n })}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-8" title={t('Sales trend')} subtitle={t('Money taken each day')}
          action={<div className="text-end"><div className="num text-xl font-extrabold tracking-tight text-slate-900">{money(d?.total ?? 0)}</div><Delta value={d?.change_percent} suffix={vs} /></div>}>
          <TrendChart data={trend} height={290} format={money} formatTick={shortMoney} formatDate={(x) => x.long} emptyText={empty} ariaLabel={t('Sales trend')} labels={{ current: t('Last {n} days', { n: days }), previous: t('The {n} days before', { n: days }), previousShort: t('before') }} />
        </Panel>

        <Panel className="lg:col-span-4" title={t('Summary')} subtitle={t('Last {n} days', { n: days })} bodyClass="p-3 pt-2">
          {[
            { label: t('Sales'), value: money(d?.total ?? 0), delta: d?.change_percent, spark: series.total, color: 'var(--color-brand-600)', icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-600' },
            { label: t('Bills'), value: d?.bills ?? 0, delta: d?.bills_change_percent, spark: series.bills, color: slotColor(0, dark), icon: ReceiptText, tone: 'bg-blue-50 text-blue-600' },
            { label: t('Average bill'), value: money(d?.average_bill ?? 0), spark: series.avg, color: slotColor(3, dark), icon: Coins, tone: 'bg-amber-50 text-amber-600' },
            ...(d?.profit != null ? [{ label: t('Profit'), value: money(d.profit), spark: series.profit, color: dark ? '#9085e9' : '#4a3aa7', icon: Trophy, tone: 'bg-violet-50 text-violet-600' }] : []),
          ].map((k) => (
            <div key={k.label} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-slate-500/[0.05]">
              <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', k.tone)}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-slate-500">{k.label}</div>
                <div className="num text-lg font-extrabold leading-tight tracking-tight text-slate-900">{k.value}</div>
                {k.delta != null && <Delta value={k.delta} />}
              </div>
              <div className="w-24 shrink-0"><Sparkline values={k.spark} color={k.color} height={36} /></div>
            </div>
          ))}
        </Panel>

        <Panel className="lg:col-span-4" title={t('How customers paid')} subtitle={t('Share of sales by payment method')}>
          <DonutChart items={payments} format={money} totalLabel={t('Total')} emptyText={empty} size={150} stacked />
        </Panel>
        <Panel className="lg:col-span-4" title={t('Best sellers')} subtitle={t('Top 5 items by sales')}>
          <BarList items={(d?.top_products || []).map((p) => ({ key: p.name, label: p.name, value: p.amount, sub: `×${Number(p.qty)}` }))} format={money} emptyText={empty} />
        </Panel>
        <Panel className="lg:col-span-4" title={t('Busy hours')} subtitle={t('Bills by time of day')}>
          <HourBars hours={d?.hours || []} format={money} billsLabel={t('bills')} emptyText={empty} peakText={(tm, n) => t('Busiest time: {time} ({n} bills)', { time: tm, n })} />
        </Panel>

        {/* ------------------------------------------------ operations */}
        <Panel className="lg:col-span-8" title={t('Recent bills')} subtitle={t('The latest sales')} action={can('sales.create') && <ViewAll to="/sales" label={t('See all')} />} bodyClass="px-2 pb-3 pt-2">
          {!(recent.data?.data || []).length ? <p className="px-3 py-8 text-center text-sm text-slate-400">{t('No bills yet.')}</p> : (
            <div className="divide-y divide-slate-900/[0.05]">
              {(recent.data?.data || []).map((sale) => (
                <Link key={sale.id} to="/sales" className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-500/[0.05]">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-500/10 text-slate-600"><ReceiptText className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900"><span className="num">{sale.invoice_number}</span> <span className="font-normal text-slate-500">· {sale.customer || t('Walk-in')}</span></div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500"><Clock className="size-3.5" /><span className="num">{time(sale.created_at)}</span> · {t(shop.paymentLabel(sale.payment_method))}</div>
                  </div>
                  {sale.status === 'held' ? <Badge color="amber">{t('Not paid yet')}</Badge> : sale.status === 'returned' ? <Badge color="red">{t('Returned')}</Badge> : null}
                  <span className="num shrink-0 text-base font-bold text-slate-900">{money(sale.grand_total)}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-4" title={t('Quick actions')} subtitle={t('Jump straight to a job')} bodyClass="p-4 pt-3">
          <div className="grid grid-cols-3 gap-2">
            {actions.slice(0, 9).map((a) => (
              <Link key={a.to} to={a.to} className="group flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center transition hover:bg-slate-500/[0.06]">
                <span className={cx('grid size-12 place-items-center rounded-2xl transition group-hover:scale-105', a.tone)}><a.icon className="size-6" strokeWidth={1.8} /></span>
                <span className="line-clamp-2 text-xs font-semibold leading-tight text-slate-700">{a.label}</span>
              </Link>
            ))}
          </div>
        </Panel>

        {restaurant ? (
          <>
            {can('inventory.view') && <KitchenStockCard className="lg:col-span-8" />}
            <Panel className={can('inventory.view') ? 'lg:col-span-4' : 'lg:col-span-12'} title={t('Top waiters')} subtitle={t('Today')} action={can('users.manage') && <ViewAll to="/waiters" label={t('See all')} />}>
              {(() => {
                const list = [...(waiters.data?.data || [])].filter((w) => w.is_active).sort((a, b) => b.sales - a.sales).slice(0, 5);
                const max = Math.max(1, ...list.map((w) => w.sales));
                if (!list.length) return <p className="py-6 text-center text-sm text-slate-400">{t('No waiters yet')}</p>;
                return (
                  <div className="space-y-3">
                    {list.map((w, i) => (
                      <div key={w.id} className="flex items-center gap-3">
                        <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-brand-ink">
                          {initials(w.name)}
                          {i === 0 && w.sales > 0 && <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-amber-400 text-[10px] text-white ring-2 ring-white"><Trophy className="size-3" /></span>}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-semibold text-slate-900">{w.name}</span><span className="num shrink-0 font-bold text-slate-900">{money(w.sales)}</span></div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-500/15" dir="ltr"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(w.sales / max) * 100}%` }} /></div>
                          <div className="mt-0.5 text-xs text-slate-500">{t('{n} orders', { n: w.orders })}{w.open_orders ? ` · ${t('{n} open orders', { n: w.open_orders })}` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Panel>
          </>
        ) : (
          <>
            <Panel className="lg:col-span-6" title={t('Sales by category')} subtitle={t('Where your money comes from')}>
              <BarList items={cats.slice(0, 6).map((c) => ({ key: c.name, label: c.name, value: c.amount, sub: catTotal ? `${Math.round((c.amount / catTotal) * 100)}%` : '' }))} format={money} emptyText={empty} />
            </Panel>
            {can('inventory.view') && (
              <Panel className="lg:col-span-6" title={t('Running low')} subtitle={t('Items to buy soon')} action={<ViewAll to="/inventory" label={t('See all')} />} bodyClass="px-2 pb-3 pt-2">
                {!(low.data?.data || []).length ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-emerald-700"><CheckCircle2 className="size-5" />{t('All items have enough stock.')}</div>
                ) : (
                  <div className="divide-y divide-slate-900/[0.05]">
                    {(low.data?.data || []).slice(0, 6).map((v) => (
                      <div key={v.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                        <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', Number(v.stock_qty) <= 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}><AlertTriangle className="size-4" /></span>
                        <div className="min-w-0 flex-1"><div className="truncate font-medium text-slate-900">{v.product_name}</div><div className="text-xs text-slate-500">{t('Warn when below')}: <span className="num">{qty(v.low_stock_threshold)}</span></div></div>
                        <span className={cx('num shrink-0 font-bold', Number(v.stock_qty) <= 0 ? 'text-red-600' : 'text-amber-700')}>{Number(v.stock_qty) <= 0 ? t('Finished') : qty(v.stock_qty)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- kitchen stock

// Restaurants: progress of every kitchen item (most urgent first) with a
// summary — what's fine, running low and finished — and the stock value.
function KitchenStockCard({ className }) {
  const { t } = useLang();
  const q = useQuery({ queryKey: ['ingredients', 'home'], queryFn: () => api.get('/ingredients'), refetchInterval: 60_000 });
  const units = { kg: 'Kg', g: 'Gram', litre: 'Litre', ml: 'ml', piece: 'Piece', dozen: 'Dozen', packet: 'Packet' };
  if (q.isLoading) return null;
  const sum = q.data?.summary || {};
  const fmt = (v, u) => `${Math.round(Number(v) * 1000) / 1000} ${t(units[u] || u)}`;
  const urgency = (i) => (i.stock_qty <= 0 ? -1 : i.alert_qty > 0 ? i.stock_qty / i.alert_qty : 99);
  const all = (q.data?.data || []).filter((i) => i.is_active).sort((x, y) => urgency(x) - urgency(y));
  const shown = all.slice(0, 8);
  const alerts = (sum.low || 0) + (sum.out || 0);
  const ok = Math.max(0, (sum.items || 0) - alerts);

  return (
    <Card className={cx('p-5', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cx('grid size-10 place-items-center rounded-xl ring-1 ring-inset', alerts ? 'bg-amber-50 text-amber-600 ring-amber-600/15' : 'bg-emerald-50 text-emerald-600 ring-emerald-600/15')}>
            {alerts ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
          </span>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">{t('Kitchen stock')}</h3>
            <p className="text-xs text-slate-500">{!all.length ? t('No kitchen items yet') : alerts ? t('Low or finished: {n} — buy soon', { n: alerts }) : t('Everything is above its alert level')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-600/15"><span className="num">{ok}</span> {t('OK')}</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 ring-1 ring-inset ring-amber-600/15"><span className="num">{sum.low || 0}</span> {t('Running low')}</span>
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-600 ring-1 ring-inset ring-red-600/15"><span className="num">{sum.out || 0}</span> {t('Finished')}</span>
          <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-slate-600">{t('Value')} <span className="num">{money(sum.stock_value || 0)}</span></span>
        </div>
      </div>

      {!all.length ? (
        <Link to="/kitchen-stock" className="block rounded-xl bg-slate-500/[0.05] px-4 py-6 text-center text-sm text-slate-600 hover:bg-slate-500/[0.09]">
          {t('Add chicken, flour, buns, oil… with how much you have now. Then add a recipe to each dish.')}
        </Link>
      ) : (
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {shown.map((i) => {
            const ref = Math.max(i.alert_qty * 3, i.alert_qty + 1, 1);
            const pct = Math.max(0, Math.min(100, (i.stock_qty / ref) * 100));
            const tone = i.level === 'out' ? 'bg-red-500' : i.level === 'low' ? 'bg-amber-500' : 'bg-emerald-500';
            const text = i.level === 'out' ? 'text-red-600' : i.level === 'low' ? 'text-amber-700' : 'text-slate-900';
            return (
              <Link key={i.id} to="/kitchen-stock" className="group block">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-slate-800 group-hover:text-brand-700">{i.name}</span>
                  <span className={cx('num shrink-0 font-bold', text)}>{i.level === 'out' ? t('Finished') : fmt(i.stock_qty, i.unit)}</span>
                </div>
                <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-slate-500/15" dir="ltr">
                  <div className={cx('h-full rounded-full transition-[width] duration-500', tone)} style={{ width: `${pct}%` }} />
                  {/* alert level marker */}
                  <span className="absolute inset-y-0 w-0.5 bg-slate-500/50" style={{ left: `${Math.min(100, (i.alert_qty / ref) * 100)}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-500">{t('Alert at {n}', { n: fmt(i.alert_qty, i.unit) })}</div>
              </Link>
            );
          })}
        </div>
      )}
      {all.length > shown.length && (
        <div className="mt-4 text-end"><Link to="/kitchen-stock" className="text-sm font-semibold text-brand-700 hover:underline">{t('See all {n} kitchen items', { n: all.length })}</Link></div>
      )}
      {all.length > 0 && all.length <= shown.length && (
        <div className="mt-4 text-end"><Link to="/kitchen-stock" className="text-sm font-semibold text-brand-700 hover:underline">{t('Open Kitchen stock')}</Link></div>
      )}
    </Card>
  );
}
