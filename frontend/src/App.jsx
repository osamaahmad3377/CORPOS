import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './lib/auth';
import { ShopProvider } from './lib/shop';
import Layout, { Page } from './components/Layout';
import { EmptyState, Loading } from './components/ui';
import Login from './pages/Login';

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

// Permission-gated route (the backend enforces the same permissions).
function Guard({ perm, children }) {
  const { can } = useAuth();
  if (perm && !can(perm)) {
    return <Page><EmptyState icon={ShieldAlert} title="No access">Your role doesn&apos;t have permission to open this page. Ask the shop owner.</EmptyState></Page>;
  }
  return children;
}

const ROUTES = [
  { path: '/', element: <Dashboard /> },
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
];

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading label="Starting…" />;
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
