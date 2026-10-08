// Home: big picture buttons for the jobs a shopkeeper does every day.
// No charts, no jargon — one tap to start each task.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BadgePercent, BarChart3, Boxes, ChefHat, FileText, UtensilsCrossed, HandCoins, LayoutDashboard, Package, PackagePlus, ReceiptText, Settings, ShoppingCart, TrendingUp, Vault, Wallet, Warehouse,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { money } from '../lib/format';
import { Page } from '../components/Layout';
import { cx } from '../components/ui';

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
      className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-5 text-center shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift active:translate-y-0 sm:p-6"
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
          <Link to="/pos" className="group relative isolate flex items-center gap-5 overflow-hidden rounded-3xl bg-brand-600 px-6 py-7 text-brand-ink shadow-[0_18px_40px_-18px_var(--color-brand-700)] transition duration-200 hover:brightness-[0.97] sm:px-8 sm:py-9">
            {/* soft light and depth on the brand colour */}
            <span aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_0%_0%,rgb(255_255_255/0.28),transparent_55%),radial-gradient(90%_120%_at_100%_100%,rgb(0_0_0/0.18),transparent_60%)]" />
            <span aria-hidden className="absolute -end-10 -top-16 -z-10 size-56 rounded-full border-[28px] border-white/15" />
            <span aria-hidden className="absolute -bottom-20 end-24 -z-10 size-40 rounded-full bg-[rgb(255_255_255/0.10)]" />
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[rgb(255_255_255/0.20)] ring-1 ring-inset ring-white/30 backdrop-blur sm:size-20">
              <ShoppingCart className="size-9 rtl:-scale-x-100 sm:size-10" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1 text-start">
              <span className="block text-[28px] font-bold leading-tight tracking-tight sm:text-4xl">{restaurant ? t('Take order / Tables') : t('Sell / Make a bill')}</span>
              <span className="mt-1.5 block text-base opacity-80 rtl:mt-4">{restaurant ? t('Pick a table, add dishes, send to kitchen, take payment') : t('Scan items or tap them, then take payment')}</span>
            </span>
            <span className="hidden size-12 shrink-0 place-items-center rounded-full bg-[rgb(255_255_255/0.20)] ring-1 ring-inset ring-white/30 transition duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 sm:grid">
              <ArrowRight className="size-6 rtl:rotate-180" />
            </span>
          </Link>
        )}
        <div className={cx('grid gap-4', can('sales.create') ? 'grid-cols-2 lg:grid-cols-1' : 'grid-cols-2 sm:max-w-xl')}>
          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-500">{t('Today\'s sale')}</span>
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/10"><TrendingUp className="size-5" /></span>
            </div>
            <div className="num mt-2 text-[26px] font-bold tracking-tight text-slate-900">{money(s.today_revenue)}</div>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-500">{t('Bills today')}</span>
              <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-600/10"><ReceiptText className="size-5" /></span>
            </div>
            <div className="num mt-2 text-[26px] font-bold tracking-tight text-slate-900">{s.today_sales_count ?? 0}</div>
          </div>
        </div>
      </div>

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
