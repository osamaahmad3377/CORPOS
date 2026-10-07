import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3, Boxes, ClipboardList, FolderTree, LayoutDashboard, LogOut, Menu, Package, ReceiptText,
  ScanBarcode, Settings, ShoppingCart, Truck, UserCircle, Users, UsersRound, Warehouse, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { cx } from './ui';

export function navSections(shop) {
  const products = shop.businessType === 'restaurant' ? 'Menu items' : 'Products';
  return [
    { title: null, items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/pos', label: 'POS / Billing', icon: ShoppingCart, perm: 'sales.create' },
    ] },
    { title: 'Sales', items: [
      { to: '/sales', label: 'Sales history', icon: ReceiptText, perm: 'sales.create' },
      { to: '/customers', label: 'Customers', icon: Users, perm: 'customers.view' },
    ] },
    { title: 'Catalog', items: [
      { to: '/products', label: products, icon: Package, perm: 'products.view' },
      { to: '/categories', label: 'Categories & brands', icon: FolderTree, perm: ['categories.manage', 'brands.manage'] },
      { to: '/barcodes', label: 'Barcode labels', icon: ScanBarcode, perm: 'barcodes.manage' },
    ] },
    { title: 'Stock', items: [
      { to: '/inventory', label: 'Inventory', icon: Warehouse, perm: 'inventory.view' },
      { to: '/purchases', label: 'Purchases', icon: Boxes, perm: 'purchases.view' },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers.manage' },
    ] },
    { title: 'Business', items: [
      { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
      { to: '/users', label: 'Users', icon: UsersRound, perm: 'users.manage' },
      { to: '/activity', label: 'Activity log', icon: ClipboardList, perm: 'activity_logs.view' },
      { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
    ] },
  ];
}

function Sidebar({ onNavigate }) {
  const { can } = useAuth();
  const shop = useShop();
  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <div className="flex items-center gap-3 px-2">
        <div className="grid size-9 place-items-center rounded-lg bg-brand-600 font-bold text-white">C</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{shop.shopName}</div>
          <div className="text-xs text-slate-400">CorePOS</div>
        </div>
      </div>
      {navSections(shop).map((section) => {
        const items = section.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return null;
        return (
          <div key={section.title || 'main'}>
            {section.title && <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-slate-500">{section.title}</div>}
            <div className="space-y-0.5">
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) => cx(
                    'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon className="size-4.5 shrink-0" />{label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 bg-slate-900 lg:block"><Sidebar /></aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900">
            <button type="button" className="absolute right-2 top-3 p-2 text-slate-400" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => navigate('/profile')} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100">
              <UserCircle className="size-7 text-slate-400" />
              <div className="hidden sm:block">
                <div className="text-sm font-medium leading-tight text-slate-900">{user?.name}</div>
                <div className="text-xs leading-tight text-slate-500">{user?.role}</div>
              </div>
            </button>
            <button type="button" onClick={logout} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Sign out" aria-label="Sign out"><LogOut className="size-5" /></button>
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
  return <div className={cx('mx-auto max-w-7xl p-4 sm:p-6', className)}>{children}</div>;
}
