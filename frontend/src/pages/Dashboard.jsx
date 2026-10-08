// Today's summary: how the shop is doing — sales, best items, low stock.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarRange, Package, ReceiptText, ShoppingCart, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useShop } from '../lib/shop';
import { useT } from '../lib/i18n';
import { dateTime, money, qty, variantLabel } from '../lib/format';
import { Page } from '../components/Layout';
import { Badge, Button, Card, CardHeader, EmptyState, Loading, PageHeader, StatCard, Table, Td, Th } from '../components/ui';

function SeeAll({ to }) {
  const t = useT();
  return <Link to={to} className="-my-1 rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">{t('See all')}</Link>;
}

// Last-30-days sales as simple bars (no chart library needed).
function SalesChart({ data }) {
  const t = useT();
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
    return <EmptyState icon={CalendarRange} title={t('No sales in the last 30 days')}>{t('Sales you make on the Sell screen show up here.')}</EmptyState>;
  }
  return (
    <div className="px-5 pb-5 pt-6">
      <div className="flex h-48 items-end gap-1">
        {days.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t bg-brand-500/80 transition-colors group-hover:bg-brand-600" style={{ height: `${Math.max((d.total / max) * 100, d.total ? 2 : 0)}%` }} />
            <div className="num pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
              {d.label}: {money(d.total)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span className="num">{days[0].label}</span><span className="num">{days[14].label}</span><span>{t('Today')}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const t = useT();
  const { can } = useAuth();
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
  const n = (v) => <span className="num">{v}</span>;

  return (
    <Page>
      <PageHeader
        title={t("Today's summary")}
        subtitle={t('How {shop} is doing: sales, best-selling items and stock that is running low.', { shop: shop.shopName })}
        actions={can('sales.create') && <Link to="/pos"><Button icon={ShoppingCart} size="lg">{t('Sell / Make a bill')}</Button></Link>}
      />

      {stats.isLoading ? <Loading /> : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={Banknote} label={t("Today's sale")} value={n(money(s.today_revenue))} tone="green" />
          <StatCard icon={ReceiptText} label={t('Bills today')} value={n(s.today_sales_count ?? 0)} />
          <StatCard icon={CalendarRange} label={t('Sale this month')} value={n(money(s.month_revenue))} tone="green" />
          <StatCard icon={Package} label={t('Items')} value={n(s.total_products ?? 0)} />
          <StatCard icon={Users} label={t('Customers')} value={n(s.total_customers ?? 0)} />
          <StatCard icon={AlertTriangle} label={t('Running low')} value={n(s.low_stock_count ?? 0)} tone={s.low_stock_count ? 'amber' : 'green'} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t('Sales in the last 30 days')} subtitle={t('Money from sales each day, after returns')} />
          {chart.isLoading ? <Loading /> : <SalesChart data={chart.data} />}
        </Card>
        <Card>
          <CardHeader title={t('How customers paid')} subtitle={t('This month')} />
          <div className="space-y-4 p-5">
            {!split.length && <p className="text-sm text-slate-500">{t('No payments yet this month.')}</p>}
            {split.map(([method, count]) => (
              <div key={method}>
                <div className="mb-1 flex justify-between gap-2 text-sm"><span className="font-medium text-slate-700">{t(shop.paymentLabel(method))}</span><span className="text-slate-500">{count === 1 ? t('1 bill') : t('{n} bills', { n: count })}</span></div>
                <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${(count / splitTotal) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('Best-selling items')} subtitle={t('This month')} />
          <div className="divide-y divide-slate-100">
            {(top.data || []).slice(0, 6).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.name}</span>
                <span className="shrink-0 text-slate-500">{t('{n} sold', { n: qty(p.quantity_sold) })}</span>
              </div>
            ))}
            {!top.isLoading && !top.data?.length && <p className="px-5 py-6 text-sm text-slate-500">{t('Nothing sold yet.')}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('Running low')} subtitle={t('Buy these again soon')} action={can('inventory.view') && <SeeAll to="/inventory" />} />
          <div className="divide-y divide-slate-100">
            {(low.data?.data || []).slice(0, 6).map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{v.product_name}</div>
                  {variantLabel(v) && <div className="text-xs text-slate-500">{variantLabel(v)}</div>}
                </div>
                <Badge color={Number(v.stock_qty) <= 0 ? 'red' : 'amber'}>{Number(v.stock_qty) <= 0 ? t('Finished') : t('{n} left', { n: qty(v.stock_qty) })}</Badge>
              </div>
            ))}
            {!low.isLoading && !low.data?.data?.length && <p className="px-5 py-6 text-sm text-slate-500">{t('All items have enough stock.')}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('Latest bills')} action={<SeeAll to="/sales" />} />
          <Table>
            <tbody>
              {(recent.data?.data || []).map((sale) => (
                <tr key={sale.invoice_number}>
                  <Td>
                    <Link to={`/sales/${sale.invoice_number}`} className="num font-medium text-slate-800 hover:text-brand-700">{sale.invoice_number}</Link>
                    <div className="num text-xs text-slate-500">{dateTime(sale.sale_date)}</div>
                  </Td>
                  <Td className="text-end font-medium"><span className="num">{money(sale.grand_total)}</span></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!recent.isLoading && !recent.data?.data?.length && <p className="px-5 py-6 text-sm text-slate-500">{t('No bills yet.')}</p>}
        </Card>
        {shop.features.expiry && can('reports.view') && (
          <Card className="lg:col-span-3">
            <CardHeader title={t('Expiring soon')} subtitle={t('Batches that expire in the next 30 days — sell or return these first')} />
            {!expiring.data?.data?.length ? <p className="px-5 py-6 text-sm text-slate-500">{expiring.isLoading ? t('Loading…') : t('Nothing expires in the next 30 days.')}</p> : (
              <Table>
                <thead><tr><Th className="text-start">{t('Item')}</Th><Th className="text-start">{t('Batch')}</Th><Th className="text-start">{t('Expiry')}</Th><Th className="text-end">{t('Quantity')}</Th></tr></thead>
                <tbody>
                  {expiring.data.data.slice(0, 10).map((b) => (
                    <tr key={b.id}>
                      <Td className="font-medium">{b.product_name}{variantLabel(b.variant) && <span className="text-slate-500"> · {variantLabel(b.variant)}</span>}</Td>
                      <Td className="font-mono text-slate-600">{b.batch_no || '—'}</Td>
                      <Td><Badge color={b.days_left < 0 ? 'red' : b.days_left <= 7 ? 'amber' : 'gray'}>{b.days_left < 0 ? t('Expired {n} days ago', { n: -b.days_left }) : b.days_left === 0 ? t('Today') : t('{n} days left', { n: b.days_left })}</Badge></Td>
                      <Td className="text-end"><span className="num">{qty(b.quantity)}</span> {t(shop.unitLabel(b.unit))}</Td>
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
