import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarRange, Package, ReceiptText, ShoppingCart, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { dateTime, money, qty, variantLabel } from '../lib/format';
import { Page } from '../components/Layout';
import { Badge, Button, Card, CardHeader, EmptyState, Loading, PageHeader, StatCard, Table, Td, Th } from '../components/ui';

// Last-30-days revenue as simple bars (no chart library needed).
function SalesChart({ data }) {
  const days = [];
  const byDate = Object.fromEntries((data || []).map((d) => [d.date, Number(d.total)]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ key, label: d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }), total: byDate[key] || 0 });
  }
  const max = Math.max(...days.map((d) => d.total), 1);
  if (!days.some((d) => d.total)) {
    return <EmptyState icon={CalendarRange} title="No sales in the last 30 days">Sales you make at the POS appear here.</EmptyState>;
  }
  return (
    <div className="px-5 pb-5 pt-6">
      <div className="flex h-48 items-end gap-1">
        {days.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t bg-brand-500/80 transition-colors group-hover:bg-brand-600" style={{ height: `${Math.max((d.total / max) * 100, d.total ? 2 : 0)}%` }} />
            <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
              {d.label}: {money(d.total)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>{days[0].label}</span><span>{days[14].label}</span><span>Today</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const shop = useShop();
  const stats = useQuery({ queryKey: ['dashboard', 'stats'], queryFn: () => api.get('/dashboard/stats') });
  const chart = useQuery({ queryKey: ['dashboard', 'chart'], queryFn: () => api.get('/dashboard/sales-chart') });
  const top = useQuery({ queryKey: ['dashboard', 'top'], queryFn: () => api.get('/dashboard/top-products') });
  const low = useQuery({ queryKey: ['dashboard', 'low'], queryFn: () => api.get('/dashboard/low-stock') });
  const recent = useQuery({ queryKey: ['dashboard', 'recent'], queryFn: () => api.get('/dashboard/recent-sales', { limit: 8 }) });
  const expiring = useQuery({ queryKey: ['dashboard', 'expiring'], queryFn: () => api.get('/reports/expiring', { days: 30 }), enabled: shop.features.expiry && can('reports.view') });

  const s = stats.data || {};
  const split = Object.entries(s.payment_split || {});
  const splitTotal = split.reduce((a, [, n]) => a + n, 0);

  return (
    <Page>
      <PageHeader
        title={`Assalam o Alaikum, ${user?.name?.split(' ')[0] || ''}`}
        subtitle={`Here's how ${shop.shopName} is doing today.`}
        actions={can('sales.create') && <Link to="/pos"><Button icon={ShoppingCart} size="lg">Open POS</Button></Link>}
      />

      {stats.isLoading ? <Loading /> : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={Banknote} label="Today's sales" value={money(s.today_revenue)} />
          <StatCard icon={ReceiptText} label="Today's bills" value={s.today_sales_count ?? 0} />
          <StatCard icon={CalendarRange} label="This month" value={money(s.month_revenue)} tone="green" />
          <StatCard icon={Package} label="Products" value={s.total_products ?? 0} />
          <StatCard icon={Users} label="Customers" value={s.total_customers ?? 0} />
          <StatCard icon={AlertTriangle} label="Low stock" value={s.low_stock_count ?? 0} tone={s.low_stock_count ? 'amber' : 'green'} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Sales trend" subtitle="Last 30 days, after returns" />
          {chart.isLoading ? <Loading /> : <SalesChart data={chart.data} />}
        </Card>
        <Card>
          <CardHeader title="Payment methods" subtitle="This month" />
          <div className="space-y-3 p-5">
            {!split.length && <p className="text-sm text-slate-500">No payments yet this month.</p>}
            {split.map(([method, count]) => (
              <div key={method}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-700">{shop.paymentLabel(method)}</span><span className="text-slate-500">{count} bills</span></div>
                <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${(count / splitTotal) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Best sellers" subtitle="This month" />
          <div className="divide-y divide-slate-100">
            {(top.data || []).slice(0, 6).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="grid size-6 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.name}</span>
                <span className="text-slate-500">{qty(p.quantity_sold)} sold</span>
              </div>
            ))}
            {!top.isLoading && !top.data?.length && <p className="px-5 py-6 text-sm text-slate-500">Nothing sold yet.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Low stock" action={can('inventory.view') && <Link to="/inventory" className="text-sm font-medium text-brand-600">View all</Link>} />
          <div className="divide-y divide-slate-100">
            {(low.data?.data || []).slice(0, 6).map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{v.product_name}</div>
                  {variantLabel(v) && <div className="text-xs text-slate-500">{variantLabel(v)}</div>}
                </div>
                <Badge color={Number(v.stock_qty) <= 0 ? 'red' : 'amber'}>{qty(v.stock_qty)} left</Badge>
              </div>
            ))}
            {!low.isLoading && !low.data?.data?.length && <p className="px-5 py-6 text-sm text-slate-500">All items are well stocked.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent bills" action={<Link to="/sales" className="text-sm font-medium text-brand-600">View all</Link>} />
          <Table>
            <tbody>
              {(recent.data?.data || []).map((sale) => (
                <tr key={sale.invoice_number}>
                  <Td>
                    <Link to={`/sales/${sale.invoice_number}`} className="font-medium text-slate-800 hover:text-brand-600">{sale.invoice_number}</Link>
                    <div className="text-xs text-slate-500">{dateTime(sale.sale_date)}</div>
                  </Td>
                  <Td className="text-right font-medium">{money(sale.grand_total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!recent.isLoading && !recent.data?.data?.length && <p className="px-5 py-6 text-sm text-slate-500">No bills yet.</p>}
        </Card>
        {shop.features.expiry && can('reports.view') && (
          <Card className="lg:col-span-3">
            <CardHeader title="Expiring soon" subtitle="Batches expiring in the next 30 days — sell or return these first" />
            {!expiring.data?.data?.length ? <p className="px-5 py-6 text-sm text-slate-500">{expiring.isLoading ? 'Loading…' : 'Nothing expires in the next 30 days.'}</p> : (
              <Table>
                <thead><tr><Th>Product</Th><Th>Batch</Th><Th>Expiry</Th><Th className="text-right">Qty</Th></tr></thead>
                <tbody>
                  {expiring.data.data.slice(0, 10).map((b) => (
                    <tr key={b.id}>
                      <Td className="font-medium">{b.product_name}{variantLabel(b.variant) && <span className="text-slate-500"> · {variantLabel(b.variant)}</span>}</Td>
                      <Td className="font-mono text-slate-600">{b.batch_no || '—'}</Td>
                      <Td><Badge color={b.days_left < 0 ? 'red' : b.days_left <= 7 ? 'amber' : 'gray'}>{b.days_left < 0 ? `Expired ${-b.days_left}d ago` : b.days_left === 0 ? 'Today' : `${b.days_left} days`}</Badge></Td>
                      <Td className="text-right">{qty(b.quantity)} {b.unit}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </Page>
  );
}
