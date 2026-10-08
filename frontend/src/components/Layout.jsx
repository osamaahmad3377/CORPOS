import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Boxes, ClipboardList, FolderTree, Home, Languages, LayoutDashboard, LogOut, Menu, Package, ReceiptText,
  ScanBarcode, Settings, ShoppingCart, Truck, UserCircle, Users, UsersRound, Warehouse, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { cx } from './ui';

// Menu. Labels are plain words a first-time shopkeeper understands.
export function navSections(shop) {
  const products = shop.businessType === 'restaurant' ? 'Menu items' : 'Items & stock';
  return [
    { title: null, items: [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/pos', label: 'Sell', icon: ShoppingCart, perm: 'sales.create' },
    ] },
    { title: 'Sales', items: [
      { to: '/sales', label: 'Old bills', icon: ReceiptText, perm: 'sales.create' },
      { to: '/customers', label: 'Customers & udhaar', icon: Users, perm: 'customers.view' },
    ] },
    { title: 'Items', items: [
      { to: '/products', label: products, icon: Package, perm: 'products.view' },
      { to: '/categories', label: 'Categories & brands', icon: FolderTree, perm: ['categories.manage', 'brands.manage'] },
      { to: '/barcodes', label: 'Print barcode stickers', icon: ScanBarcode, perm: 'barcodes.manage' },
    ] },
    { title: 'Stock', items: [
      { to: '/purchases', label: 'Buy stock (purchases)', icon: Boxes, perm: 'purchases.view' },
      { to: '/inventory', label: 'Stock count', icon: Warehouse, perm: 'inventory.view' },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers.manage' },
    ] },
    { title: 'Business', items: [
      { to: '/dashboard', label: 'Today\'s summary', icon: LayoutDashboard },
      { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
      { to: '/users', label: 'Staff', icon: UsersRound, perm: 'users.manage' },
      { to: '/activity', label: 'Activity log', icon: ClipboardList, perm: 'activity_logs.view' },
      { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
    ] },
  ];
}

function Sidebar({ onNavigate }) {
  const { can } = useAuth();
  const { t } = useLang();
  const shop = useShop();
  return (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-5">
      <div className="flex items-center gap-3 px-2">
        <div className="grid size-10 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">C</div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{shop.shopName}</div>
          <div className="text-xs text-slate-400">CorePOS</div>
        </div>
      </div>
      {navSections(shop).map((section) => {
        const items = section.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return null;
        return (
          <div key={section.title || 'main'}>
            {section.title && <div className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-slate-500">{t(section.title)}</div>}
            <div className="space-y-1">
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) => cx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                    isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icon className="size-5 shrink-0" />{t(label)}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function LanguageSwitch({ className }) {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}
      className={cx('flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-700 hover:bg-slate-50', className)}
      title="English / اردو"
    >
      <Languages className="size-5 text-brand-600" />
      {lang === 'ur' ? <span style={{ fontFamily: 'var(--font-sans)' }}>English</span> : <span style={{ fontFamily: 'var(--font-urdu)' }}>اردو</span>}
    </button>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 bg-slate-900 lg:block"><Sidebar /></aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-slate-900">
            <button type="button" className="absolute end-2 top-3 p-2 text-slate-400" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-6" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
          <button type="button" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-7" /></button>
          {pathname !== '/' && (
            <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-base font-semibold text-slate-700 hover:bg-slate-200">
              <Home className="size-5" />{t('Home')}
            </button>
          )}
          <div className="flex-1" />
          <LanguageSwitch />
          <button type="button" onClick={() => navigate('/profile')} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-start hover:bg-slate-100">
            <UserCircle className="size-8 text-slate-400" />
            <div className="hidden sm:block">
              <div className="text-sm font-semibold leading-tight text-slate-900">{user?.name}</div>
              <div className="text-xs leading-tight text-slate-500">{t(user?.role || '')}</div>
            </div>
          </button>
          <button type="button" onClick={logout} className="flex items-center gap-2 rounded-xl p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" title={t('Sign out')} aria-label={t('Sign out')}>
            <LogOut className="size-6 rtl:rotate-180" />
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Standard padded page wrapper.
export function Page({ children, className }) {
  return <div className={cx('mx-auto max-w-7xl p-4 sm:p-6', className)}>{children}</div>;
}
