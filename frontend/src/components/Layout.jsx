import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgePercent, BarChart3, Beef, Bell, Boxes, ChefHat, ClipboardList, FileText, FolderTree, UtensilsCrossed, Home, Languages, LayoutDashboard, LogOut, Menu, Package,
  Bike, CalendarClock, Check, ChevronDown, Moon, ReceiptText, UserRound, ScanBarcode, Settings, ShoppingCart, Sun, Truck, Users, UsersRound, Vault, Wallet, Warehouse, X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { LANGUAGES, fontVar } from '../lib/languages';
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
      { to: '/deliveries', label: 'Deliveries', icon: Bike, perm: 'sales.create', when: (shop) => shop.delivery },
      { to: '/reservations', label: 'Reservations', icon: CalendarClock, perm: 'sales.create' },
    ] },
    { title: 'Sales', items: [
      { to: '/sales', label: 'Old bills', icon: ReceiptText, perm: 'sales.create' },
      { to: '/customers', label: 'Customers & udhaar', icon: Users, perm: 'customers.view' },
      { to: '/waiters', label: 'Waiters', icon: UserRound, perm: 'users.manage' },
      { to: '/riders', label: 'Riders', icon: Bike, perm: 'users.manage', when: (shop) => shop.delivery },
      { to: '/cash', label: 'Cash drawer', icon: Vault, perm: 'cash.manage' },
    ] },
    { title: 'Menu', items: [
      { to: '/products', label: 'Menu items', icon: UtensilsCrossed, perm: 'products.view' },
      { to: '/categories', label: 'Menu categories', icon: FolderTree, perm: ['categories.manage', 'brands.manage'] },
      { to: '/offers', label: 'Deals & loyalty', icon: BadgePercent, perm: 'promotions.manage' },
    ] },
    { title: 'Supplies', items: [
      { to: '/kitchen-stock', label: 'Kitchen stock', icon: Beef, perm: 'inventory.view' },
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
    <nav className="sidebar-depth flex h-full flex-col overflow-y-auto text-[var(--sb-text)] [scrollbar-color:var(--sb-line)_transparent]">
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
          const items = section.items.filter((i) => (!i.perm || can(i.perm)) && (!i.when || i.when(shop)));
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
                      'nav-item group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                      isActive ? 'nav-active font-semibold text-[var(--sb-text)]' : 'text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="nav-glow absolute inset-y-2 start-0 w-1 rounded-full bg-[var(--sb-accent)]" />}
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
        Powered by <span className="font-semibold text-[var(--sb-muted)]">CorePOS</span>
        <span className="mt-0.5 block font-mono text-[10px] opacity-80" title={`Built ${__APP_BUILD__}`}>v{__APP_VERSION__} · {__APP_BUILD__}</span>
      </div>
    </nav>
  );
}

// Shops: bell in the top bar with the number of items running low or
// finished, a short list, and a link to Stock count showing just those. Once
// a day the computer also shows a notification. (Restaurants have the
// kitchen-stock bell; they get this one only when tracked items run low.)
const NOTIFIED_KEY = 'corepos_stock_notified';
export function StockAlerts() {
  const shop = useShop();
  const { can } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const on = can('inventory.view');
  const q = useQuery({ queryKey: ['inventory', 'alerts'], queryFn: () => api.get('/inventory', { stock: 'low', per_page: 8 }), enabled: on, refetchInterval: 60_000, staleTime: 30_000 });
  const low = q.data?.summary?.low_stock || 0;
  const out = q.data?.summary?.out_of_stock || 0;
  const n = low + out;
  const rows = q.data?.data || [];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // one computer notification a day while something is low
  useEffect(() => {
    if (!n || typeof Notification === 'undefined') return;
    const day = new Date().toDateString();
    let last = null;
    try { last = localStorage.getItem(NOTIFIED_KEY); } catch { /* none */ }
    if (last === day) return;
    const show = () => {
      try {
        new Notification(shop.shopName || 'CorePOS', { body: t('{n} items are running low or finished — open Stock count to see them', { n }), tag: 'corepos-low-stock' });
        localStorage.setItem(NOTIFIED_KEY, day);
      } catch { /* not allowed */ }
    };
    if (Notification.permission === 'granted') show();
    else if (Notification.permission === 'default') Notification.requestPermission().then((p) => { if (p === 'granted') show(); }).catch(() => {});
  }, [n, shop.shopName, t]);

  if (!on || (shop.isRestaurant && !n)) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} title={n ? t('{n} items are running low or finished', { n }) : t('Stock is fine')} aria-label={t('Low stock alerts')}
        className="glass-btn relative grid size-10 place-items-center rounded-xl">
        <Bell className={cx('size-5', n && 'text-amber-600')} />
        {n > 0 && <span className={cx('num absolute -end-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold leading-5 text-white ring-2 ring-white', out ? 'bg-red-600' : 'bg-amber-500')}>{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div className="glass-strong absolute end-0 top-12 z-50 w-80 animate-pop-in overflow-hidden rounded-3xl p-2">
          <div className="px-3 pb-2 pt-1.5">
            <div className="text-[15px] font-semibold text-slate-900">{t('Low stock')}</div>
            <div className="text-xs text-slate-500">{n ? t('{low} running low · {out} finished', { low, out }) : t('Every item has enough stock.')}</div>
          </div>
          {rows.map((v) => {
            const qtyLeft = Number(v.stock_qty);
            return (
              <button key={v.id} type="button" onClick={() => { setOpen(false); navigate('/inventory?stock=low'); }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-start transition hover:bg-slate-500/10">
                <span className={cx('size-2.5 shrink-0 rounded-full', qtyLeft <= 0 ? 'bg-red-500' : 'bg-amber-500')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{v.product_name}{v.size || v.color ? ` · ${[v.color, v.size].filter(Boolean).join(' / ')}` : ''}</span>
                  <span className="block text-xs text-slate-500">{t('Alert at {n}', { n: Number(v.low_stock_threshold) })}</span>
                </span>
                <span className={cx('num shrink-0 text-sm font-bold', qtyLeft <= 0 ? 'text-red-600' : 'text-amber-600')}>{qtyLeft <= 0 ? t('Finished') : `${qtyLeft} ${t('left')}`}</span>
              </button>
            );
          })}
          {n > 0 && (
            <button type="button" onClick={() => { setOpen(false); navigate('/inventory?stock=low'); }} className="mt-1 w-full rounded-2xl px-3 py-2.5 text-center text-sm font-semibold text-brand-700 transition hover:bg-brand-50">
              {t('See all low stock')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Restaurants: bell in the top bar with the number of kitchen items that are
// low or finished; opens Kitchen stock filtered to those.
function KitchenAlerts() {
  const shop = useShop();
  const { can } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const on = shop.isRestaurant && can('inventory.view');
  const q = useQuery({ queryKey: ['ingredients', 'alerts'], queryFn: () => api.get('/ingredients/alerts'), enabled: on, refetchInterval: 60_000, staleTime: 30_000 });
  if (!on) return null;
  const n = q.data?.count || 0;
  return (
    <button type="button" onClick={() => navigate('/kitchen-stock?level=alert')} title={n ? t('{n} kitchen items need attention', { n }) : t('Kitchen stock is fine')} aria-label={t('Kitchen stock alerts')}
      className="glass-btn relative grid size-10 place-items-center rounded-xl text-slate-600">
      <Bell className={cx('size-5', n && 'text-amber-600')} />
      {n > 0 && <span className="num absolute -end-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-5 text-white ring-2 ring-white">{n > 99 ? '99+' : n}</span>}
    </button>
  );
}

export function LanguageSwitch({ className, up = false }) {
  const { lang, setLang, info } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="glass-btn flex h-10 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-slate-700"
        title="Language / زبان"
      >
        <Languages className="size-5 text-brand-700" />
        <span lang={lang} style={{ fontFamily: fontVar(info) }}>{info.native}</span>
        <ChevronDown className={cx('size-4 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" aria-label="Language" className={cx('glass-strong absolute end-0 z-50 w-60 animate-pop-in overflow-hidden rounded-2xl p-1.5', up ? 'bottom-12' : 'top-12')}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === lang}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition', l.code === lang ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-500/10')}
            >
              <span lang={l.code} dir={l.dir} className="min-w-0 flex-1 truncate text-[17px] font-semibold" style={{ fontFamily: fontVar(l), lineHeight: l.font === 'nastaliq' ? 1.9 : 1.5 }}>{l.native}</span>
              {l.code !== 'en' && <span dir="ltr" className="shrink-0 text-xs text-slate-500" style={{ fontFamily: 'var(--font-sans)' }}>{l.name}</span>}
              {l.code === lang && <Check className="size-4 shrink-0 text-brand-700" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ThemeSwitch({ className }) {
  const shop = useShop();
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={() => shop.setMode(shop.isDark ? 'light' : 'dark')}
      className={cx('glass-btn grid size-10 place-items-center rounded-xl text-slate-600', className)}
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
      <aside className="app-sidebar hidden w-64 shrink-0 border-e border-[var(--sb-line)] bg-[color-mix(in_srgb,var(--sb-bg)_90%,transparent)] backdrop-blur-2xl xl:block"><Sidebar /></aside>

      {open && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="app-drawer absolute inset-y-0 start-0 w-72 bg-[var(--sb-bg)] shadow-xl">
            <button type="button" className="absolute end-2 top-4 z-10 rounded-lg p-2 text-[var(--sb-muted)] hover:text-[var(--sb-text)]" onClick={() => setOpen(false)} aria-label={t('Close')}><X className="size-6" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-20 grid h-[72px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:px-5">
          {/* start: menu + home */}
          <div className="flex items-center gap-2">
            <button type="button" className="glass-btn grid size-10 place-items-center rounded-xl text-slate-600 xl:hidden" onClick={() => setOpen(true)} aria-label={t('Open menu')}><Menu className="size-6" /></button>
            {pathname !== '/' && (
              <button type="button" onClick={() => navigate('/')} className="glass-btn flex h-10 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-slate-700">
                <Home className="size-5" /><span className="hidden sm:inline">{t('Home')}</span>
              </button>
            )}
            <BusinessSwitcher />
          </div>

          {/* centre: the CorePOS logo (the shop's own logo is in the sidebar) */}
          <a href="https://nextcore.com.pk" target="_blank" rel="noreferrer" className="flex items-center text-slate-900" title="CorePOS by NextCore — nextcore.com.pk" dir="ltr">
            <NextcoreLogo className="h-7 sm:h-8" />
          </a>

          {/* end: language, theme, user */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
            <KitchenAlerts />
            <StockAlerts />
            <LanguageSwitch />
            <ThemeSwitch />
            <button type="button" onClick={() => navigate('/profile')} className="flex items-center gap-2 rounded-2xl px-1.5 py-1 text-start transition hover:bg-white/50">
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
