// Home: big picture buttons for the jobs a shopkeeper does every day.
// No charts, no jargon — one tap to start each task.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BadgePercent, Beef, CheckCircle2, Coins, BarChart3, Boxes, ChefHat, FileText, UtensilsCrossed, HandCoins, LayoutDashboard, Package, PackagePlus, ReceiptText, Settings, ShoppingCart, TrendingUp, Trophy, Vault, Wallet, Warehouse,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { money } from '../lib/format';
import { Page } from '../components/Layout';
import { Card, cx } from '../components/ui';
import { BarList, DonutChart, HourBars, Sparkline, TrendChart, otherColor, shortMoney, shortPercent, slotColor } from '../components/charts';

// Icon chips: a soft tint with a hairline ring, one colour per kind of job.
const ICON_BG = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-600/10',
  amber: 'bg-amber-50 text-amber-600 ring-amber-600/10',
  violet: 'bg-violet-50 text-violet-600 ring-violet-600/10',
  rose: 'bg-rose-50 text-rose-600 ring-rose-600/10',
  teal: 'bg-teal-50 text-teal-600 ring-teal-600/10',
  slate: 'bg-slate-100 text-slate-600 ring-slate-600/10',
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-600/10',
  orange: 'bg-orange-50 text-orange-600 ring-orange-600/10',
};

function Tile({ to, icon: Icon, title, hint, color }) {
  return (
    <Link
      to={to}
      className="glass glass-lift group flex flex-col items-center justify-center gap-3 rounded-2xl p-5 text-center sm:p-6"
    >
      <span className={cx('grid size-16 place-items-center rounded-2xl ring-1 ring-inset transition duration-200 group-hover:scale-105', ICON_BG[color])}><Icon className="size-8" strokeWidth={1.75} /></span>
      <span className="text-[17px] font-semibold leading-tight tracking-tight text-slate-900">{title}</span>
      {hint && <span className="text-sm leading-snug text-slate-500">{hint}</span>}
    </Link>
  );
}

export default function Home() {
  const { user, can } = useAuth();
  const { t, lang } = useLang();
  const shop = useShop();
  const stats = useQuery({ queryKey: ['dashboard', 'stats'], queryFn: () => api.get('/dashboard/stats') });
  const s = stats.data || {};
  const restaurant = shop.isRestaurant;

  const tiles = restaurant ? [
    { to: '/kitchen', icon: ChefHat, title: t('Kitchen screen'), hint: t('Orders the kitchen has to cook'), color: 'orange' },
    can('inventory.view') && { to: '/kitchen-stock', icon: Beef, title: t('Kitchen stock'), hint: t('Chicken, flour, buns… and alerts'), color: 'rose' },
    can('products.create') && { to: '/products?new=1', icon: PackagePlus, title: t('Add a dish'), hint: t('New item on the menu'), color: 'blue' },
    can('products.view') && { to: '/products', icon: UtensilsCrossed, title: t('Menu items'), hint: t('Prices and dishes'), color: 'indigo' },
    can('sales.create') && { to: '/sales', icon: ReceiptText, title: t('Old bills'), hint: t('Reprint, return, take payment'), color: 'violet' },
    can('cash.manage') && { to: '/cash', icon: Vault, title: t('Cash drawer'), hint: t('Open the day, close and count cash'), color: 'teal' },
    can('expenses.manage') && { to: '/expenses', icon: Wallet, title: t('Expenses'), hint: t('Rent, bills, salaries'), color: 'rose' },
    can('promotions.manage') && { to: '/offers', icon: BadgePercent, title: t('Deals & loyalty'), hint: t('Discounts and customer points'), color: 'amber' },
    { to: '/dashboard', icon: LayoutDashboard, title: t('Today\'s summary'), hint: t('Sales, best items'), color: 'rose' },
    can('reports.view') && { to: '/reports', icon: BarChart3, title: t('Reports'), hint: t('Daily, monthly, profit'), color: 'slate' },
    can('settings.manage') && { to: '/settings', icon: Settings, title: t('Settings'), hint: t('Tables, receipt, printers'), color: 'slate' },
  ].filter(Boolean) : [
    can('products.create') && { to: '/products?new=1', icon: PackagePlus, title: t('Add new item'), hint: t('Type it in or scan its barcode'), color: 'blue' },
    can('products.view') && { to: '/products', icon: Package, title: restaurant ? t('Menu items') : t('My items'), hint: t('See prices and stock'), color: 'indigo' },
    can('customers.view') && { to: '/customers', icon: HandCoins, title: t('Udhaar / Customers'), hint: t('Who owes you money'), color: 'amber' },
    can('purchases.manage') && { to: '/purchases/new', icon: Boxes, title: t('Stock arrived'), hint: t('Add stock you bought'), color: 'teal' },
    can('sales.create') && { to: '/sales', icon: ReceiptText, title: t('Old bills'), hint: t('Reprint, return, take payment'), color: 'violet' },
    can('inventory.view') && { to: '/inventory', icon: Warehouse, title: t('Stock count'), hint: t('How much is left'), color: 'orange' },
    can('cash.manage') && { to: '/cash', icon: Vault, title: t('Cash drawer'), hint: t('Open the day, close and count cash'), color: 'teal' },
    can('expenses.manage') && { to: '/expenses', icon: Wallet, title: t('Expenses'), hint: t('Rent, bills, salaries'), color: 'rose' },
    can('quotations.manage') && { to: '/quotations', icon: FileText, title: t('Quotations'), hint: t('Price quote for a customer'), color: 'blue' },
    can('promotions.manage') && { to: '/offers', icon: BadgePercent, title: t('Offers & loyalty'), hint: t('Discounts and customer points'), color: 'violet' },
    { to: '/dashboard', icon: LayoutDashboard, title: t('Today\'s summary'), hint: t('Sales, best items, low stock'), color: 'rose' },
    can('reports.view') && { to: '/reports', icon: BarChart3, title: t('Reports'), hint: t('Daily, monthly, profit'), color: 'slate' },
    can('settings.manage') && { to: '/settings', icon: Settings, title: t('Settings'), hint: t('Shop name, receipt, tax'), color: 'slate' },
  ].filter(Boolean);

  const today = new Date().toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Page className="max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-semibold text-brand-700">{today}</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[32px]">{t('Assalam o Alaikum, {name}', { name: user?.name?.split(' ')[0] || '' })}</h1>
        <p className="mt-1 text-base text-slate-500">{t('What do you want to do?')}</p>
      </div>

      <div className={cx('mb-6 grid gap-4', can('sales.create') && 'lg:grid-cols-[1fr_17rem]')}>
        {can('sales.create') && (
          <Link to="/pos" className="glass glass-lift group relative isolate flex items-center gap-5 overflow-hidden rounded-[28px] px-6 py-7 sm:px-8 sm:py-8">
            {/* soft brand tint inside the glass */}
            <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(115deg,color-mix(in_srgb,var(--color-brand-600)_18%,transparent),transparent_58%)]" />
            <span aria-hidden className="absolute -end-20 -top-28 -z-10 size-80 rounded-full bg-brand-600 opacity-[0.14] blur-3xl" />
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_14px_28px_-12px_var(--color-brand-700)] sm:size-[72px]">
              <ShoppingCart className="size-8 rtl:-scale-x-100 sm:size-9" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1 text-start">
              <span className="block text-[26px] font-bold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[32px]">{restaurant ? t('Take order / Tables') : t('Sell / Make a bill')}</span>
              <span className="mt-1.5 block text-base text-slate-500 rtl:mt-4">{restaurant ? t('Pick a table, add dishes, send to kitchen, take payment') : t('Scan items or tap them, then take payment')}</span>
            </span>
            <span className="hidden h-12 shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-5 font-semibold text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_22px_-10px_var(--color-brand-700)] transition group-hover:brightness-[0.96] md:flex">
              {t('Start')}<ArrowRight className="size-5 transition group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </span>
          </Link>
        )}
        <div className={cx('grid gap-4', can('sales.create') ? 'grid-cols-2 lg:grid-cols-1' : 'grid-cols-2 sm:max-w-xl')}>
          <div className="glass rounded-[24px] p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-500">{t('Today\'s sale')}</span>
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/10"><TrendingUp className="size-5" /></span>
            </div>
            <div className="num mt-2 text-[26px] font-bold tracking-tight text-slate-900">{money(s.today_revenue)}</div>
          </div>
          <div className="glass rounded-[24px] p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-500">{t('Bills today')}</span>
              <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-600/10"><ReceiptText className="size-5" /></span>
            </div>
            <div className="num mt-2 text-[26px] font-bold tracking-tight text-slate-900">{s.today_sales_count ?? 0}</div>
          </div>
        </div>
      </div>

      {restaurant && can('inventory.view') && <KitchenStockCard />}

      <Overview />

      <h2 className="mb-3 mt-8 text-[17px] font-semibold tracking-tight text-slate-900">{t('Shortcuts')}</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => <Tile key={tile.to} {...tile} />)}
      </div>

      {Number(s.low_stock_count) > 0 && can('inventory.view') && (
        <Link to="/inventory" className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-card transition hover:bg-amber-100">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><Warehouse className="size-6" /></span>
          <span className="text-base font-semibold">{t('{n} items are running low — tap to see them', { n: s.low_stock_count })}</span>
        </Link>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- overview

// Fixed colour per payment method (colour follows the method, not its rank).
const PAY_SLOT = { cash: 0, card: 1, jazzcash: 2, easypaisa: 3, bank_transfer: 4 };

function ChangePill({ value, suffix }) {
  if (value == null) return <span className="text-xs text-slate-400">{suffix}</span>;
  const up = value >= 0;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={cx('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset', up ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' : 'bg-red-50 text-red-600 ring-red-600/15')}>
        {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}<span className="num">{shortPercent(value)}</span>
      </span>
      <span className="text-slate-500">{suffix}</span>
    </span>
  );
}

function Kpi({ label, value, icon: Icon, tone, foot, spark, sparkColor }) {
  return (
    <div className="glass flex flex-col overflow-hidden rounded-[22px] p-4 pb-0 sm:p-5 sm:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={cx('grid size-9 place-items-center rounded-xl ring-1 ring-inset', tone)}><Icon className="size-[18px]" /></span>
      </div>
      <div className="num mt-1.5 text-[26px] font-bold tracking-tight text-slate-900">{value}</div>
      <div className="mt-1 min-h-5">{foot}</div>
      <div className="-mx-4 mt-3 sm:-mx-5">{spark && <Sparkline values={spark} color={sparkColor} height={46} />}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, className, children }) {
  return (
    <Card className={cx('p-5', className)}>
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function Overview() {
  const { t, lang } = useLang();
  const shop = useShop();
  const [days, setDays] = useState(() => { try { return Number(localStorage.getItem('corepos_home_days')) === 30 ? 30 : 7; } catch { return 7; } });
  const pick = (d) => { setDays(d); try { localStorage.setItem('corepos_home_days', String(d)); } catch { /* ignore */ } };
  const q = useQuery({ queryKey: ['dashboard', 'insights', days], queryFn: () => api.get('/dashboard/insights', { days }), staleTime: 60_000 });
  const d = q.data;
  const dark = shop.isDark;
  const locale = lang === 'ur' ? 'ur-PK' : 'en-GB';
  const empty = t('No sales in these days yet');

  const trend = (d?.trend || []).map((x) => {
    const dt = new Date(`${x.date}T00:00:00`);
    return {
      key: x.date,
      value: x.total,
      compare: x.previous,
      label: dt.toLocaleDateString(locale, days === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }),
      long: dt.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
      sub: t('{n} bills', { n: x.bills }),
    };
  });

  // payments: fixed colours; anything beyond the five slots folds into "Other"
  const payments = [];
  let otherPay = 0;
  for (const p of d?.payments || []) {
    if (p.method in PAY_SLOT) payments.push({ key: p.method, label: t(p.label), value: p.amount, color: slotColor(PAY_SLOT[p.method], dark) });
    else otherPay += p.amount;
  }
  if (otherPay > 0) payments.push({ key: 'other', label: t('Other'), value: otherPay, color: otherColor(dark) });

  const cats = d?.categories || [];
  const categories = cats.slice(0, 4).map((c, i) => ({ key: c.name, label: c.name, value: c.amount, color: slotColor(i, dark) }));
  const restCats = cats.slice(4).reduce((a, c) => a + c.amount, 0);
  const catTotal = cats.reduce((a, c) => a + c.amount, 0);
  if (restCats > 0) categories.push({ key: '__other', label: t('Other'), value: restCats, color: otherColor(dark) });

  const vs = t('vs the {n} days before', { n: days });
  const tr = d?.trend || [];
  const series = {
    total: tr.map((x) => x.total),
    bills: tr.map((x) => x.bills),
    avg: tr.map((x) => (x.bills ? x.total / x.bills : 0)),
    profit: tr.map((x) => x.profit || 0),
  };

  return (
    <section className="mb-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">{t('Business overview')}</h2>
          <p className="text-sm text-slate-500">{t('How your sales are going')}</p>
        </div>
        <div className="glass flex rounded-xl p-1 text-sm font-semibold" role="radiogroup" aria-label={t('Period')}>
          {[7, 30].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => pick(n)} className={cx('rounded-lg px-3.5 py-1.5 transition', days === n ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800')}>
              {t('Last {n} days', { n })}
            </button>
          ))}
        </div>
      </div>

      <div className={cx('mb-4 grid grid-cols-2 gap-4', d?.profit != null ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <Kpi label={t('Sales')} value={money(d?.total ?? 0)} icon={TrendingUp} tone="bg-emerald-50 text-emerald-600 ring-emerald-600/10" foot={<ChangePill value={d?.change_percent} suffix={vs} />} spark={series.total} sparkColor="var(--color-brand-600)" />
        <Kpi label={t('Bills')} value={<span className="num">{d?.bills ?? 0}</span>} icon={ReceiptText} tone="bg-blue-50 text-blue-600 ring-blue-600/10" foot={<ChangePill value={d?.bills_change_percent} suffix={vs} />} spark={series.bills} sparkColor={slotColor(0, dark)} />
        <Kpi label={t('Average bill')} value={money(d?.average_bill ?? 0)} icon={Coins} tone="bg-amber-50 text-amber-600 ring-amber-600/10" foot={<span className="text-xs text-slate-400">{t('Money per bill')}</span>} spark={series.avg} sparkColor={slotColor(3, dark)} />
        {d?.profit != null && <Kpi label={t('Profit')} value={money(d.profit)} icon={Trophy} tone="bg-violet-50 text-violet-600 ring-violet-600/10" foot={<span className="text-xs text-slate-400">{t('Sales minus the cost of the items')}</span>} spark={series.profit} sparkColor={dark ? '#9085e9' : '#4a3aa7'} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title={t('Sales trend')} subtitle={t('Money taken each day')} className="lg:col-span-2">
          <TrendChart data={trend} height={300} format={money} formatTick={shortMoney} formatDate={(x) => x.long} emptyText={empty} ariaLabel={t('Sales trend')} labels={{ current: t('Last {n} days', { n: days }), previous: t('The {n} days before', { n: days }), previousShort: t('before') }} />
        </ChartCard>
        <ChartCard title={t('How customers paid')} subtitle={t('Share of sales by payment method')}>
          <DonutChart items={payments} format={money} totalLabel={t('Total')} emptyText={empty} size={168} stacked />
        </ChartCard>
        <ChartCard title={t('Best sellers')} subtitle={t('Top 5 items by sales')}>
          <BarList items={(d?.top_products || []).map((p) => ({ key: p.name, label: p.name, value: p.amount, sub: `×${Number(p.qty)}` }))} format={money} emptyText={empty} />
        </ChartCard>
        <ChartCard title={t('Busy hours')} subtitle={t('Bills by time of day')}>
          <HourBars hours={d?.hours || []} format={money} billsLabel={t('bills')} emptyText={empty} peakText={(time, n) => t('Busiest time: {time} ({n} bills)', { time, n })} />
        </ChartCard>
        <ChartCard title={shop.isRestaurant ? t('Sales by menu category') : t('Sales by category')} subtitle={t('Where your money comes from')}>
          <BarList items={categories.map((c) => ({ key: c.key, label: c.label, value: c.value, sub: catTotal ? `${Math.round((c.value / catTotal) * 100)}%` : '' }))} format={money} emptyText={empty} />
        </ChartCard>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- kitchen stock

// Restaurants: progress of every kitchen item (most urgent first) with a
// summary — what's fine, running low and finished — and the stock value.
function KitchenStockCard() {
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
    <Card className="mb-6 p-5">
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
