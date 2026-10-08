// Home: big picture buttons for the jobs a shopkeeper does every day.
// No charts, no jargon — one tap to start each task.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart3, Boxes, HandCoins, LayoutDashboard, Package, PackagePlus, ReceiptText, Settings, ShoppingCart, Warehouse,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { money } from '../lib/format';
import { Page } from '../components/Layout';
import { cx } from '../components/ui';

const TONES = {
  green: 'bg-emerald-600 text-white hover:bg-emerald-700',
  brand: 'bg-white text-slate-900 hover:border-brand-400 border-2 border-slate-200',
};
const ICON_BG = {
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  violet: 'bg-violet-100 text-violet-700',
  rose: 'bg-rose-100 text-rose-700',
  teal: 'bg-teal-100 text-teal-700',
  slate: 'bg-slate-100 text-slate-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  orange: 'bg-orange-100 text-orange-700',
};

function Tile({ to, icon: Icon, title, hint, color }) {
  return (
    <Link to={to} className={cx('group flex flex-col items-center justify-center gap-3 rounded-2xl p-5 text-center shadow-sm transition', TONES.brand)}>
      <span className={cx('grid size-16 place-items-center rounded-2xl transition group-hover:scale-105', ICON_BG[color])}><Icon className="size-9" strokeWidth={1.8} /></span>
      <span className="text-lg font-bold leading-tight">{title}</span>
      {hint && <span className="text-sm leading-snug text-slate-500">{hint}</span>}
    </Link>
  );
}

export default function Home() {
  const { user, can } = useAuth();
  const { t } = useLang();
  const shop = useShop();
  const stats = useQuery({ queryKey: ['dashboard', 'stats'], queryFn: () => api.get('/dashboard/stats') });
  const s = stats.data || {};
  const restaurant = shop.businessType === 'restaurant' || shop.features.restaurant;

  const tiles = [
    can('products.create') && { to: '/products?new=1', icon: PackagePlus, title: t('Add new item'), hint: t('Type it in or scan its barcode'), color: 'blue' },
    can('products.view') && { to: '/products', icon: Package, title: restaurant ? t('Menu items') : t('My items'), hint: t('See prices and stock'), color: 'indigo' },
    can('customers.view') && { to: '/customers', icon: HandCoins, title: t('Udhaar / Customers'), hint: t('Who owes you money'), color: 'amber' },
    can('purchases.manage') && { to: '/purchases/new', icon: Boxes, title: t('Stock arrived'), hint: t('Add stock you bought'), color: 'teal' },
    can('sales.create') && { to: '/sales', icon: ReceiptText, title: t('Old bills'), hint: t('Reprint, return, take payment'), color: 'violet' },
    can('inventory.view') && { to: '/inventory', icon: Warehouse, title: t('Stock count'), hint: t('How much is left'), color: 'orange' },
    { to: '/dashboard', icon: LayoutDashboard, title: t('Today\'s summary'), hint: t('Sales, best items, low stock'), color: 'rose' },
    can('reports.view') && { to: '/reports', icon: BarChart3, title: t('Reports'), hint: t('Daily, monthly, profit'), color: 'slate' },
    can('settings.manage') && { to: '/settings', icon: Settings, title: t('Settings'), hint: t('Shop name, receipt, tax'), color: 'slate' },
  ].filter(Boolean);

  return (
    <Page className="max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('Assalam o Alaikum, {name}', { name: user?.name?.split(' ')[0] || '' })}</h1>
          <p className="mt-1 text-base text-slate-500">{t('What do you want to do?')}</p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center shadow-sm">
            <div className="text-sm text-slate-500">{t('Today\'s sale')}</div>
            <div className="num text-2xl font-bold text-emerald-700">{money(s.today_revenue)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center shadow-sm">
            <div className="text-sm text-slate-500">{t('Bills today')}</div>
            <div className="num text-2xl font-bold text-slate-900">{s.today_sales_count ?? 0}</div>
          </div>
        </div>
      </div>

      {can('sales.create') && (
        <Link to="/pos" className={cx('mb-5 flex items-center justify-center gap-4 rounded-2xl px-6 py-7 shadow-md transition sm:py-9', TONES.green)}>
          <ShoppingCart className="size-12 rtl:-scale-x-100" strokeWidth={1.8} />
          <span className="text-start">
            <span className="block text-3xl font-bold sm:text-4xl">{t('Sell / Make a bill')}</span>
            <span className="mt-1 block text-base text-emerald-100 rtl:mt-4">{t('Scan items or tap them, then take payment')}</span>
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => <Tile key={tile.to} {...tile} />)}
      </div>

      {Number(s.low_stock_count) > 0 && can('inventory.view') && (
        <Link to="/inventory" className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 hover:bg-amber-100">
          <Warehouse className="size-7 shrink-0" />
          <span className="text-base font-semibold">{t('{n} items are running low — tap to see them', { n: s.low_stock_count })}</span>
        </Link>
      )}
    </Page>
  );
}
