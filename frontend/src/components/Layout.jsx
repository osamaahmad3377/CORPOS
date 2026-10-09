import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgePercent, BarChart3, Boxes, ChefHat, ClipboardList, FileText, FolderTree, UtensilsCrossed, Home, Languages, LayoutDashboard, LogOut, Menu, Package,
  Moon, ReceiptText, ScanBarcode, Settings, ShoppingCart, Sun, Truck, Users, UsersRound, Vault, Wallet, Warehouse, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { cx } from './ui';
import { NextcoreLogo } from './Brand';
import BusinessSwitcher from './BusinessSwitcher';

// Menu. Labels are plain words a first-time shopkeeper understands.
export function navSections(shop) {
  if (shop.isRestaurant) return restaurantSections();
  const products = 'Items & stock';
  return [
    { title: null, items: [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/pos', label: 'Sell', icon: ShoppingCart, perm: 'sales.create' },
    ] },
    { title: 'Sales', items: [
      { to: '/sales', label: 'Old bills', icon: ReceiptText, perm: 'sales.create' },
      { to: '/customers', label: 'Customers & udhaar', icon: Users, perm: 'customers.view' },
      { to: '/quotations', label: 'Quotations', icon: FileText, perm: 'quotations.manage' },
      { to: '/cash', label: 'Cash drawer', icon: Vault, perm: 'cash.manage' },
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
      { to: '/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses.manage' },
      { to: '/offers', label: 'Offers & loyalty', icon: BadgePercent, perm: 'promotions.manage' },
      { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
      { to: '/users', label: 'Staff', icon: UsersRound, perm: 'users.manage' },
      { to: '/activity', label: 'Activity log', icon: ClipboardList, perm: 'activity_logs.view' },
      { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
    ] },
  ];
}

// Restaurant POS menu: orders & tables first, kitchen, menu; no retail-only pages.
function restaurantSections() {
  return [
    { title: null, items: [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/pos', label: 'Orders & tables', icon: ShoppingCart, perm: 'sales.create' },
      { to: '/kitchen', label: 'Kitchen screen', icon: ChefHat, perm: 'sales.create' },
    ] },
    { title: 'Sales', items: [
      { to: '/sales', label: 'Old bills', icon: ReceiptText, perm: 'sales.create' },
      { to: '/customers', label: 'Customers & udhaar', icon: Users, perm: 'customers.view' },
      { to: '/cash', label: 'Cash drawer', icon: Vault, perm: 'cash.manage' },
    ] },
    { title: 'Menu', items: [
      { to: '/products', label: 'Menu items', icon: UtensilsCrossed, perm: 'products.view' },
      { to: '/categories', label: 'Menu categories', icon: FolderTree, perm: ['categories.manage', 'brands.manage'] },
      { to: '/offers', label: 'Deals & loyalty', icon: BadgePercent, perm: 'promotions.manage' },
    ] },
    { title: 'Supplies', items: [
      { to: '/purchases', label: 'Buy supplies', icon: Boxes, perm: 'purchases.view' },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers.manage' },
      { to: '/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses.manage' },
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
  const [logoBroken, setLogoBroken] = useState(false);
  useEffect(() => setLogoBroken(false), [shop.logoUrl]);
  const hasLogo = shop.logoUrl && !logoBroken;
  return (
    // Colours come from the shop's sidebar setting (--sb-* variables), so
    // the menu looks the same in light and dark mode.
    <nav className="flex h-full flex-col overflow-y-auto text-[var(--sb-text)] [scrollbar-color:var(--sb-line)_transparent]">
      {/* Shop branding: the uploaded logo right on the sidebar colour, or the shop name */}
      <NavLink to="/" onClick={onNavigate} title={shop.shopName} className="mx-3 mt-3 block rounded-2xl transition hover:bg-[var(--sb-hover)]">
        {hasLogo ? (
          <span className="flex items-center justify-center px-3 py-3">
            <img src={shop.logoUrl} alt={shop.shopName} onError={() => setLogoBroken(true)} style={{ maxHeight: shop.sidebarLogoSize }} className="w-auto max-w-full object-contain" />
          </span>
        ) : (
          <span className="flex items-center gap-3 px-3 py-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
              {(shop.shopName || 'C').trim().charAt(0).toUpperCase()}
            </span>
            <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{shop.shopName}</span>
          </span>
        )}
      </NavLink>
      <div className="mx-5 mt-2 h-px bg-[var(--sb-line)]" />
      <div className="flex-1 space-y-6 px-3 py-5">
        {navSections(shop).map((section) => {
          const items = section.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={section.title || 'main'}>
              {section.title && <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sb-label)]">{t(section.title)}</div>}
              <div className="space-y-0.5">
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) => cx(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                      isActive ? 'bg-[var(--sb-active)] text-[var(--sb-text)]' : 'text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-[var(--sb-accent)]" />}
                        <Icon className={cx('size-5 shrink-0 transition-colors', isActive ? 'text-[var(--sb-accent)]' : 'text-[var(--sb-icon)] group-hover:text-[var(--sb-text)]')} />
                        {t(label)}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mx-3 mb-3 rounded-xl bg-[var(--sb-hover)] px-3 py-2.5 text-center text-[11px] text-[var(--sb-label)]" dir="ltr">
        CorePOS by <span className="font-semibold text-[var(--sb-muted)]">NextCore</span>
      </div>
    </nav>
  );
}

export function LanguageSwitch({ className }) {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}
      className={cx('flex h-10 items-center gap-2 rounded-xl border border-slate-900/10 bg-white/60 px-3 text-[15px] font-semibold text-slate-700 transition hover:bg-white/90', className)}
      title="English / اردو"
    >
      <Languages className="size-5 text-brand-700" />
      {lang === 'ur' ? <span style={{ fontFamily: 'var(--font-sans)' }}>English</span> : <span style={{ fontFamily: 'var(--font-urdu)' }}>اردو</span>}
    </button>
  );
}

export function ThemeSwitch({ className }) {
  const shop = useShop();
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={() => shop.setMode(shop.isDark ? 'light' : 'dark')}
      className={cx('grid size-10 place-items-center rounded-xl border border-slate-900/10 bg-white/60 text-slate-600 transition hover:bg-white/90', className)}
      title={shop.isDark ? t('Light mode') : t('Dark mode')}
      aria-label={shop.isDark ? t('Light mode') : t('Dark mode')}
    >
      {shop.isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
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
    <div className="app-canvas flex h-full">
      <aside className="hidden w-64 shrink-0 border-e border-[var(--sb-line)] bg-[color-mix(in_srgb,var(--sb-bg)_90%,transparent)] backdrop-blur-2xl xl:block"><Sidebar /></aside>

      {open && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-[var(--sb-bg)] shadow-xl">
            <button type="button" className="absolute end-2 top-4 z-10 rounded-lg p-2 text-[var(--sb-muted)] hover:text-[var(--sb-text)]" onClick={() => setOpen(false)} aria-label={t('Close')}><X className="size-6" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-20 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--glass-edge)] bg-[var(--glass-bg-strong)] px-3 shadow-[0_1px_0_var(--glass-ring),0_8px_24px_-18px_rgb(16_24_40/0.25)] backdrop-blur-2xl backdrop-saturate-150 sm:px-5">
          {/* start: menu + home */}
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 xl:hidden" onClick={() => setOpen(true)} aria-label={t('Open menu')}><Menu className="size-7" /></button>
            {pathname !== '/' && (
              <button type="button" onClick={() => navigate('/')} className="flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-[15px] font-semibold text-slate-700 hover:bg-slate-200">
                <Home className="size-5" /><span className="hidden sm:inline">{t('Home')}</span>
              </button>
            )}
            <BusinessSwitcher />
          </div>

          {/* centre: developer logo */}
          <a href="https://nextcore.com.pk" target="_blank" rel="noreferrer" className="flex items-center text-slate-900" title="NextCore — nextcore.com.pk" dir="ltr">
            <NextcoreLogo className="h-7 sm:h-8" />
          </a>

          {/* end: language, theme, user */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <LanguageSwitch className="hidden sm:flex" />
            <ThemeSwitch />
            <button type="button" onClick={() => navigate('/profile')} className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-start hover:bg-slate-100">
              <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-brand-ink ring-2 ring-white">{(user?.name || '?').charAt(0).toUpperCase()}</span>
              <span className="hidden xl:block">
                <span className="block text-sm font-semibold leading-tight text-slate-900">{user?.name}</span>
                <span className="block text-xs leading-tight text-slate-500">{t(user?.role || '')}</span>
              </span>
            </button>
            <button type="button" onClick={logout} className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600" title={t('Sign out')} aria-label={t('Sign out')}>
              <LogOut className="size-5 rtl:rotate-180" />
            </button>
          </div>
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
  return <div className={cx('mx-auto max-w-7xl p-4 sm:p-6 lg:p-8', className)}>{children}</div>;
}
