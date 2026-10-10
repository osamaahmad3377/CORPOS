import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './lib/auth';
import { useT } from './lib/i18n';
import { ShopProvider } from './lib/shop';
import Layout, { Page } from './components/Layout';
import { EmptyState, Loading } from './components/ui';
import Login from './pages/Login';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pos = lazy(() => import('./pages/pos/Pos'));
const Products = lazy(() => import('./pages/products/Products'));
const Categories = lazy(() => import('./pages/products/Categories'));
const BarcodeLabels = lazy(() => import('./pages/barcodes/BarcodeLabels'));
const SalesHistory = lazy(() => import('./pages/sales/SalesHistory'));
const Customers = lazy(() => import('./pages/customers/Customers'));
const Inventory = lazy(() => import('./pages/inventory/Inventory'));
const Purchases = lazy(() => import('./pages/purchases/Purchases'));
const Suppliers = lazy(() => import('./pages/suppliers/Suppliers'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const Users = lazy(() => import('./pages/users/Users'));
const Settings = lazy(() => import('./pages/settings/Settings'));
const ActivityLog = lazy(() => import('./pages/activity/ActivityLog'));
const Profile = lazy(() => import('./pages/profile/Profile'));
const CashDrawer = lazy(() => import('./pages/cash/CashDrawer'));
const Expenses = lazy(() => import('./pages/expenses/Expenses'));
const Quotations = lazy(() => import('./pages/quotations/Quotations'));
const Offers = lazy(() => import('./pages/offers/Offers'));
const Kitchen = lazy(() => import('./pages/kitchen/Kitchen'));
const KitchenStock = lazy(() => import('./pages/kitchen/KitchenStock'));
const Waiters = lazy(() => import('./pages/waiters/Waiters'));

// Permission-gated route (the backend enforces the same permissions).
function Guard({ perm, children }) {
  const { can } = useAuth();
  const t = useT();
  if (perm && !can(perm)) {
    return <Page><EmptyState icon={ShieldAlert} title={t('No access')}>{t('Your role doesn\'t have permission to open this page. Ask the shop owner.')}</EmptyState></Page>;
  }
  return children;
}

const ROUTES = [
  { path: '/', element: <Home /> },
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/pos', element: <Pos />, perm: 'sales.create' },
  { path: '/sales/*', element: <SalesHistory />, perm: 'sales.create' },
  { path: '/customers/*', element: <Customers />, perm: 'customers.view' },
  { path: '/products/*', element: <Products />, perm: 'products.view' },
  { path: '/categories', element: <Categories />, perm: ['categories.manage', 'brands.manage'] },
  { path: '/barcodes', element: <BarcodeLabels />, perm: 'barcodes.manage' },
  { path: '/inventory/*', element: <Inventory />, perm: 'inventory.view' },
  { path: '/purchases/*', element: <Purchases />, perm: 'purchases.view' },
  { path: '/suppliers/*', element: <Suppliers />, perm: 'suppliers.manage' },
  { path: '/reports/*', element: <Reports />, perm: 'reports.view' },
  { path: '/users/*', element: <Users />, perm: 'users.manage' },
  { path: '/activity', element: <ActivityLog />, perm: 'activity_logs.view' },
  { path: '/settings/*', element: <Settings />, perm: 'settings.manage' },
  { path: '/profile', element: <Profile /> },
  { path: '/cash/*', element: <CashDrawer />, perm: 'cash.manage' },
  { path: '/expenses/*', element: <Expenses />, perm: 'expenses.manage' },
  { path: '/quotations/*', element: <Quotations />, perm: 'quotations.manage' },
  { path: '/offers/*', element: <Offers />, perm: 'promotions.manage' },
  { path: '/kitchen', element: <Kitchen />, perm: 'sales.create' },
  { path: '/kitchen-stock', element: <KitchenStock />, perm: 'inventory.view' },
  { path: '/waiters', element: <Waiters />, perm: 'sales.create' },
];

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <ShopProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            {ROUTES.map(({ path, element, perm }) => (
              <Route key={path} path={path} element={<Guard perm={perm}>{element}</Guard>} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ShopProvider>
  );
}
