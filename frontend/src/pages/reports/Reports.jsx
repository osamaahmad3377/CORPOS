import { useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, Boxes, CalendarDays, CalendarRange, CircleDollarSign, Package, PackageX,
  ReceiptText, RotateCcw, Trophy, Users, Wallet,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { money, num, qty, today, variantLabel } from '../../lib/format';
import { useCategories } from '../../lib/catalog';
import { Page } from '../../components/Layout';
import { Badge, Card, CardHeader, cx, EmptyState, Input, PageHeader, Select, StatCard } from '../../components/ui';
import {
  downloadCsv, FilterBox, monthStart, prettyDate, shortDate, prettyMonth, rangeLabel, ReportFrame, ReportTable, Stats, thisMonth, ymd,
} from './reportKit';

const TABS = [
  { to: 'daily', label: 'Daily sales' },
  { to: 'monthly', label: 'Monthly sales' },
  { to: 'products', label: 'Product sales' },
  { to: 'inventory', label: 'Inventory' },
  { to: 'low-stock', label: 'Low stock' },
  { to: 'purchases', label: 'Purchases' },
  { to: 'customers', label: 'Customers' },
];

const n = (v) => Number(v || 0);
const sum = (rows, f) => rows.reduce((a, r) => a + n(f(r)), 0);
const time = (v) => (v ? new Date(v).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' }) : '');

export default function Reports() {
  return (
    <Page>
      <PageHeader title="Reports" subtitle="Sales, stock, purchases and customer balances. Print or export any report." />
      <div className="mb-5 -mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 print:hidden">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={`/reports/${t.to}`}
            className={({ isActive }) => cx(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to="daily" replace />} />
        <Route path="daily" element={<DailySales />} />
        <Route path="monthly" element={<MonthlySales />} />
        <Route path="products" element={<ProductSales />} />
        <Route path="inventory" element={<InventoryReport />} />
        <Route path="low-stock" element={<LowStock />} />
        <Route path="purchases" element={<PurchasesReport />} />
        <Route path="customers" element={<CustomersReport />} />
        <Route path="*" element={<Navigate to="/reports/daily" replace />} />
      </Routes>
    </Page>
  );
}

function DateRange({ start, end, setStart, setEnd }) {
  return (
    <>
      <FilterBox label="From"><Input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} /></FilterBox>
      <FilterBox label="To"><Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></FilterBox>
    </>
  );
}

// ---------------------------------------------------------------- daily

function DailySales() {
  const shop = useShop();
  const [day, setDay] = useState(today());
  const q = useQuery({ queryKey: ['reports', 'daily', day], queryFn: () => api.get('/reports/daily-sales', { date: day }), enabled: !!day });
  const sales = q.data?.sales || [];

  const gross = sum(sales, (s) => s.grand_total);
  const refunded = sum(sales, (s) => s.refunded_amount);
  const due = sum(sales, (s) => s.due_amount);
  const discount = sum(sales, (s) => s.discount_amount);
  const tax = sum(sales, (s) => s.tax_amount);

  const byMethod = useMemo(() => {
    const m = {};
    for (const s of sales) {
      const k = s.payment_method || 'other';
      m[k] = m[k] || { count: 0, total: 0 };
      m[k].count += 1;
      m[k].total += n(s.net_revenue ?? s.grand_total);
    }
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }, [sales]);

  const columns = [
    { key: 'invoice_number', label: 'Bill', render: (s) => <Link to={`/sales/${s.invoice_number}`} className="font-medium text-slate-800 hover:text-brand-600">{s.invoice_number}</Link> },
    { key: 'sale_date', label: 'Time', render: (s) => time(s.sale_date), csv: (s) => time(s.sale_date) },
    { key: 'customer', label: 'Customer', render: (s) => s.customer || <span className="text-slate-400">Walk-in</span>, csv: (s) => s.customer || 'Walk-in' },
    { key: 'cashier', label: 'Cashier' },
    { key: 'payment_method', label: 'Payment', render: (s) => shop.paymentLabel(s.payment_method), csv: (s) => shop.paymentLabel(s.payment_method) },
    { key: 'grand_total', label: 'Bill total', align: 'right', render: (s) => money(s.grand_total), csv: (s) => n(s.grand_total) },
    { key: 'refunded_amount', label: 'Returned', align: 'right', render: (s) => (n(s.refunded_amount) ? <span className="text-red-600">−{money(s.refunded_amount)}</span> : '—'), csv: (s) => n(s.refunded_amount) },
    { key: 'net_revenue', label: 'Net', align: 'right', className: 'font-medium', render: (s) => money(s.net_revenue), csv: (s) => n(s.net_revenue) },
    { key: 'due_amount', label: 'Unpaid', align: 'right', render: (s) => (n(s.due_amount) ? <Badge color="amber">{money(s.due_amount)}</Badge> : <Badge color="green">Paid</Badge>), csv: (s) => n(s.due_amount) },
  ];

  return (
    <ReportFrame
      title="Daily sales report"
      period={prettyDate(day)}
      loading={q.isLoading}
      error={q.error}
      filters={<FilterBox label="Date"><Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></FilterBox>}
      csv={() => downloadCsv(`daily-sales-${day}.csv`, columns, sales)}
    >
      <Stats>
        <StatCard icon={Banknote} label="Net sales (after returns)" value={money(q.data?.total_revenue)} />
        <StatCard icon={ReceiptText} label="Bills" value={q.data?.total_sales ?? 0} />
        <StatCard icon={RotateCcw} label="Returns" value={money(refunded)} tone={refunded ? 'red' : 'green'} />
        <StatCard icon={Wallet} label="Unpaid (on credit)" value={money(due)} tone={due ? 'amber' : 'green'} />
      </Stats>

      {!!sales.length && (
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title="By payment method" subtitle="Net of returns" />
            <div className="space-y-3 p-5">
              {byMethod.map(([m, v]) => (
                <div key={m}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-700">{shop.paymentLabel(m)} <span className="font-normal text-slate-400">· {v.count} {v.count === 1 ? 'bill' : 'bills'}</span></span>
                    <span className="text-slate-700">{money(v.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${n(q.data?.total_revenue) ? (v.total / n(q.data.total_revenue)) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Day summary" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <Summary label="Bill totals" value={money(gross)} />
              <Summary label="Discounts given" value={money(discount)} />
              {(shop.taxEnabled || tax > 0) && <Summary label={`${shop.taxLabel} collected`} value={money(tax)} />}
              <Summary label="Returned" value={money(refunded)} />
              <Summary label="Net sales" value={money(q.data?.total_revenue)} />
              <Summary label="Average bill" value={money(sales.length ? n(q.data?.total_revenue) / sales.length : 0)} />
            </dl>
          </Card>
        </div>
      )}

      <ReportTable
        title="Bills"
        columns={columns}
        rows={sales}
        rowKey="invoice_number"
        empty="No completed bills on this day."
        footer={sales.length ? { grand_total: money(gross), refunded_amount: refunded ? `−${money(refunded)}` : '—', net_revenue: money(q.data?.total_revenue), due_amount: money(due) } : null}
      />
    </ReportFrame>
  );
}

function Summary({ label, value }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- monthly

function MonthlySales() {
  const [month, setMonth] = useState(thisMonth());
  const q = useQuery({ queryKey: ['reports', 'monthly', month], queryFn: () => api.get('/reports/monthly-sales', { month }), enabled: /^\d{4}-\d{2}$/.test(month) });
  const rows = q.data?.daily_breakdown || [];

  // One entry per calendar day so quiet days show as gaps.
  const days = useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return [];
    const [y, m] = month.split('-').map(Number);
    const byDate = Object.fromEntries(rows.map((r) => [String(r.date).slice(0, 10), r]));
    const count = new Date(y, m, 0).getDate();
    return Array.from({ length: count }, (_, i) => {
      const key = ymd(new Date(y, m - 1, i + 1));
      return { key, day: i + 1, total: n(byDate[key]?.total_revenue), bills: n(byDate[key]?.total_sales) };
    });
  }, [rows, month]);

  const total = n(q.data?.total_revenue);
  const bills = sum(rows, (r) => r.total_sales);
  const best = rows.reduce((b, r) => (n(r.total_revenue) > n(b?.total_revenue) ? r : b), null);
  const max = Math.max(...days.map((d) => d.total), 1);

  const columns = [
    { key: 'date', label: 'Date', render: (r) => prettyDate(r.date), csv: (r) => String(r.date).slice(0, 10) },
    { key: 'total_sales', label: 'Bills', align: 'right' },
    { key: 'avg', label: 'Average bill', align: 'right', render: (r) => money(n(r.total_revenue) / Math.max(n(r.total_sales), 1)), csv: (r) => (n(r.total_revenue) / Math.max(n(r.total_sales), 1)).toFixed(2) },
    { key: 'total_revenue', label: 'Net sales', align: 'right', className: 'font-medium', render: (r) => money(r.total_revenue), csv: (r) => n(r.total_revenue) },
  ];

  return (
    <ReportFrame
      title="Monthly sales report"
      period={prettyMonth(month)}
      loading={q.isLoading}
      error={q.error}
      filters={<FilterBox label="Month"><Input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} /></FilterBox>}
      csv={() => downloadCsv(`monthly-sales-${month}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={Banknote} label="Net sales (after returns)" value={money(total)} />
        <StatCard icon={ReceiptText} label="Bills" value={bills} />
        <StatCard icon={CalendarDays} label="Average per trading day" value={money(rows.length ? total / rows.length : 0)} tone="green" />
        <StatCard icon={Trophy} label="Best day" value={best ? `${shortDate(best.date)} · ${money(best.total_revenue)}` : '—'} tone="amber" />
      </Stats>

      <Card className="mb-5">
        <CardHeader title="Daily net sales" subtitle={prettyMonth(month)} />
        {!rows.length ? <EmptyState icon={CalendarRange} title="No sales this month" /> : (
          <div className="px-5 pb-5 pt-8">
            <div className="flex h-48 items-end gap-1">
              {days.map((d) => (
                <div key={d.key} className="group relative flex h-full flex-1 items-end">
                  <div className="w-full rounded-t bg-brand-500/80 transition-colors group-hover:bg-brand-600 print:bg-slate-500" style={{ height: `${Math.max((d.total / max) * 100, d.total ? 2 : 0)}%` }} />
                  <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
                    {shortDate(d.key)}: {money(d.total)} · {d.bills} {d.bills === 1 ? 'bill' : 'bills'}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1 text-[10px] text-slate-400">
              {days.map((d) => <span key={d.key} className="flex-1 text-center">{d.day === 1 || d.day % 5 === 0 ? d.day : ''}</span>)}
            </div>
          </div>
        )}
      </Card>

      <ReportTable
        title="Day by day"
        columns={columns}
        rows={rows}
        rowKey="date"
        empty="No completed bills in this month."
        footer={rows.length ? { total_sales: bills, avg: money(bills ? total / bills : 0), total_revenue: money(total) } : null}
      />
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- products

function ProductSales() {
  const shop = useShop();
  const cats = useCategories();
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [categoryId, setCategoryId] = useState('');
  const q = useQuery({
    queryKey: ['reports', 'products', start, end, categoryId],
    queryFn: () => api.get('/reports/product-sales', { start, end, category_id: categoryId }),
  });
  const rows = (q.data || []).filter((r) => n(r.quantity_sold) > 0 || n(r.revenue) !== 0);
  const total = sum(rows, (r) => r.revenue);
  const hasProfit = rows.some((r) => r.profit !== undefined);
  const totalProfit = sum(rows, (r) => r.profit || 0);
  const catName = (cats.data || []).find((c) => String(c.id) === categoryId)?.path;

  const columns = [
    { key: 'rank', label: '#', render: (_, i) => <span className="text-slate-400">{i + 1}</span>, csv: false },
    { key: 'name', label: 'Product', className: 'font-medium text-slate-800' },
    { key: 'quantity_sold', label: 'Qty sold', align: 'right', render: (r) => <>{qty(r.quantity_sold)} <span className="text-slate-400">{shop.unitLabel(r.unit)}</span></>, csv: (r) => qty(r.quantity_sold) },
    { key: 'unit', label: 'Unit', csv: (r) => shop.unitLabel(r.unit), render: null, hidden: true },
    { key: 'avg', label: 'Avg price', align: 'right', render: (r) => money(n(r.revenue) / Math.max(n(r.quantity_sold), 0.001)), csv: (r) => (n(r.revenue) / Math.max(n(r.quantity_sold), 0.001)).toFixed(2) },
    { key: 'revenue', label: 'Revenue', align: 'right', className: 'font-medium', render: (r) => money(r.revenue), csv: (r) => n(r.revenue) },
    ...(hasProfit ? [
      { key: 'cost', label: 'Cost', align: 'right', render: (r) => money(r.cost), csv: (r) => n(r.cost) },
      { key: 'profit', label: 'Profit', align: 'right', className: 'font-medium', render: (r) => <span className={n(r.profit) < 0 ? 'text-red-600' : 'text-emerald-700'}>{money(r.profit)}</span>, csv: (r) => n(r.profit) },
      { key: 'margin', label: 'Margin', align: 'right', render: (r) => <span className="text-slate-500">{n(r.revenue) ? ((n(r.profit) / n(r.revenue)) * 100).toFixed(1) : 0}%</span>, csv: (r) => (n(r.revenue) ? ((n(r.profit) / n(r.revenue)) * 100).toFixed(1) : 0) },
    ] : []),
    { key: 'share', label: 'Share', align: 'right', render: (r) => (
      <div className="flex items-center justify-end gap-2">
        <div className="hidden h-1.5 w-20 rounded-full bg-slate-100 sm:block"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${total ? (n(r.revenue) / total) * 100 : 0}%` }} /></div>
        <span className="w-12 text-slate-500">{total ? ((n(r.revenue) / total) * 100).toFixed(1) : 0}%</span>
      </div>
    ), csv: (r) => (total ? ((n(r.revenue) / total) * 100).toFixed(1) : 0) },
  ];
  const shown = columns.filter((c) => !c.hidden);

  return (
    <ReportFrame
      title="Product sales report"
      period={`${rangeLabel(start, end)}${catName ? ` · ${catName}` : ''}`}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
          <FilterBox label="Category" className="w-full sm:w-56">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
            </Select>
          </FilterBox>
        </>
      )}
      csv={() => downloadCsv(`product-sales-${start || 'start'}-to-${end || 'today'}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={Banknote} label="Revenue (after returns)" value={money(total)} />
        <StatCard icon={Package} label="Products sold" value={rows.length} />
        <StatCard icon={Trophy} label="Top seller" value={<span className="block truncate text-lg">{rows[0]?.name || '—'}</span>} tone="amber" />
        {hasProfit
          ? <StatCard icon={CircleDollarSign} label="Profit (munafa)" value={money(totalProfit)} tone={totalProfit < 0 ? 'red' : 'green'} />
          : <StatCard icon={CircleDollarSign} label="Top seller revenue" value={money(rows[0]?.revenue)} tone="green" />}
      </Stats>
      <ReportTable
        title="Products by revenue"
        columns={shown}
        rows={rows}
        empty="No products sold in this period."
        footer={rows.length ? { revenue: money(total), ...(hasProfit ? { profit: money(totalProfit) } : {}) } : null}
      />
      <p className="mt-3 text-xs text-slate-500 print:hidden">Quantities and revenue are net of returns. Profit uses each item&apos;s cost price at the time it was sold, before bill-level discounts.</p>
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- inventory

function InventoryReport() {
  const shop = useShop();
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState('');
  const q = useQuery({ queryKey: ['reports', 'inventory'], queryFn: () => api.get('/reports/inventory') });
  const all = q.data?.variants || [];
  const showCost = q.data?.total_stock_value !== null && q.data?.total_stock_value !== undefined;

  const rows = all.filter((v) => {
    const t = search.trim().toLowerCase();
    if (t && ![v.product_name, v.sku, v.barcode, variantLabel(v)].some((x) => String(x || '').toLowerCase().includes(t))) return false;
    if (stock === 'in' && n(v.stock_qty) <= 0) return false;
    if (stock === 'out' && n(v.stock_qty) > 0) return false;
    if (stock === 'low' && !(n(v.stock_qty) <= n(v.low_stock_threshold))) return false;
    return true;
  });

  const pos = (v) => Math.max(n(v.stock_qty), 0);
  const retailAll = sum(all, (v) => pos(v) * n(v.selling_price));
  const retail = sum(rows, (v) => pos(v) * n(v.selling_price));
  const cost = sum(rows, (v) => pos(v) * n(v.purchase_price));
  const outCount = all.filter((v) => n(v.stock_qty) <= 0).length;

  const columns = [
    { key: 'product_name', label: 'Product', render: (v) => (
      <div>
        <div className="font-medium text-slate-800">{v.product_name}</div>
        {variantLabel(v) && <div className="text-xs text-slate-500">{variantLabel(v)}</div>}
      </div>
    ) },
    { key: 'variant', label: `${shop.option1} / ${shop.option2}`, csv: (v) => variantLabel(v), hidden: true },
    { key: 'sku', label: 'SKU / Barcode', csvLabel: 'SKU', render: (v) => <div className="text-xs text-slate-500"><div>{v.sku}</div><div>{v.barcode}</div></div>, csv: (v) => v.sku },
    { key: 'barcode', label: 'Barcode', hidden: true },
    { key: 'stock_qty', label: 'In stock', align: 'right', render: (v) => (
      <span className={cx(n(v.stock_qty) <= 0 ? 'text-red-600' : n(v.stock_qty) <= n(v.low_stock_threshold) ? 'text-amber-700' : 'text-slate-800', 'font-medium')}>
        {qty(v.stock_qty)} <span className="font-normal text-slate-400">{shop.unitLabel(v.unit)}</span>
      </span>
    ), csv: (v) => qty(v.stock_qty) },
    { key: 'unit', label: 'Unit', csv: (v) => shop.unitLabel(v.unit), hidden: true },
    ...(showCost ? [{ key: 'purchase_price', label: 'Cost', align: 'right', render: (v) => money(v.purchase_price), csv: (v) => n(v.purchase_price) }] : []),
    { key: 'selling_price', label: 'Price', align: 'right', render: (v) => money(v.selling_price), csv: (v) => n(v.selling_price) },
    ...(showCost ? [{ key: 'cost_value', label: 'Value at cost', align: 'right', render: (v) => money(pos(v) * n(v.purchase_price)), csv: (v) => (pos(v) * n(v.purchase_price)).toFixed(2) }] : []),
    { key: 'retail_value', label: 'Value at price', align: 'right', className: 'font-medium', render: (v) => money(pos(v) * n(v.selling_price)), csv: (v) => (pos(v) * n(v.selling_price)).toFixed(2) },
  ];

  return (
    <ReportFrame
      title="Inventory valuation"
      period={`As of ${prettyDate(today())}`}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <FilterBox label="Search" className="w-full sm:w-64"><Input placeholder="Name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} /></FilterBox>
          <FilterBox label="Stock">
            <Select value={stock} onChange={(e) => setStock(e.target.value)}>
              <option value="">All items</option>
              <option value="in">In stock</option>
              <option value="low">Low or out</option>
              <option value="out">Out of stock</option>
            </Select>
          </FilterBox>
        </>
      )}
      csv={() => downloadCsv(`inventory-${today()}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={Boxes} label="Items (incl. variants)" value={q.data?.total_variants ?? 0} />
        {showCost
          ? <StatCard icon={Wallet} label="Stock value at cost" value={money(q.data.total_stock_value)} tone="green" />
          : <StatCard icon={PackageX} label="Out of stock" value={outCount} tone={outCount ? 'red' : 'green'} />}
        <StatCard icon={Banknote} label="Stock value at selling price" value={money(retailAll)} />
        {showCost
          ? <StatCard icon={CircleDollarSign} label="Expected margin on stock" value={money(retailAll - n(q.data.total_stock_value))} tone="amber" />
          : <StatCard icon={AlertTriangle} label="Low or out of stock" value={all.filter((v) => n(v.stock_qty) <= n(v.low_stock_threshold)).length} tone="amber" />}
      </Stats>
      <ReportTable
        title={`Stock list${rows.length !== all.length ? ` (${rows.length} of ${all.length})` : ''}`}
        columns={columns.filter((c) => !c.hidden)}
        rows={rows}
        empty={all.length ? 'No items match these filters.' : 'No products yet.'}
        footer={rows.length ? { retail_value: money(retail), ...(showCost ? { cost_value: money(cost) } : {}) } : null}
      />
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- low stock

function LowStock() {
  const shop = useShop();
  const q = useQuery({ queryKey: ['reports', 'low-stock'], queryFn: () => api.get('/reports/low-stock') });
  const rows = q.data?.data || [];
  const out = rows.filter((v) => n(v.stock_qty) <= 0).length;

  const columns = [
    { key: 'product_name', label: 'Product', className: 'font-medium text-slate-800' },
    { key: 'variant', label: `${shop.option1} / ${shop.option2}`, render: (v) => variantLabel(v) || <span className="text-slate-400">—</span>, csv: (v) => variantLabel(v) },
    { key: 'sku', label: 'SKU', className: 'text-slate-500' },
    { key: 'stock_qty', label: 'In stock', align: 'right', render: (v) => <span className="font-medium">{qty(v.stock_qty)} <span className="font-normal text-slate-400">{shop.unitLabel(v.unit)}</span></span>, csv: (v) => qty(v.stock_qty) },
    { key: 'low_stock_threshold', label: 'Alert at', align: 'right', render: (v) => qty(v.low_stock_threshold), csv: (v) => qty(v.low_stock_threshold) },
    { key: 'unit', label: 'Unit', csv: (v) => shop.unitLabel(v.unit), hidden: true },
    { key: 'status', label: 'Status', render: (v) => (n(v.stock_qty) <= 0 ? <Badge color="red">Out of stock</Badge> : <Badge color="amber">Low</Badge>), csv: (v) => (n(v.stock_qty) <= 0 ? 'Out of stock' : 'Low') },
  ];

  return (
    <ReportFrame
      title="Low stock report"
      period={`As of ${prettyDate(today())}`}
      loading={q.isLoading}
      error={q.error}
      filters={<p className="text-sm text-slate-500">Items at or below their low-stock alert level.</p>}
      csv={() => downloadCsv(`low-stock-${today()}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={AlertTriangle} label="Need restocking" value={rows.length} tone={rows.length ? 'amber' : 'green'} />
        <StatCard icon={PackageX} label="Out of stock" value={out} tone={out ? 'red' : 'green'} />
      </Stats>
      <ReportTable columns={columns.filter((c) => !c.hidden)} rows={rows} empty="All items are well stocked." />
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- purchases

function PurchasesReport() {
  const { can } = useAuth();
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [supplierId, setSupplierId] = useState('');
  const suppliers = useQuery({
    queryKey: ['suppliers', 'all'],
    queryFn: () => api.get('/suppliers', { per_page: 200 }),
    enabled: can('suppliers.manage'),
    select: (res) => res?.data || [],
    staleTime: 60_000,
  });
  const q = useQuery({
    queryKey: ['reports', 'purchases', start, end, supplierId],
    queryFn: () => api.get('/reports/purchases', { start, end, supplier_id: supplierId }),
  });
  const rows = q.data?.purchases || [];
  const paid = sum(rows, (p) => p.paid_amount);
  const due = sum(rows, (p) => p.due_amount);
  const supplierName = (suppliers.data || []).find((s) => String(s.id) === supplierId)?.name;

  const statusBadge = (s) => ({ paid: <Badge color="green">Paid</Badge>, partial: <Badge color="amber">Part paid</Badge> }[s] || <Badge color="red">Unpaid</Badge>);
  const columns = [
    { key: 'po_number', label: 'Purchase #', className: 'font-medium text-slate-800' },
    { key: 'purchase_date', label: 'Date', render: (p) => prettyDate(p.purchase_date), csv: (p) => String(p.purchase_date || '').slice(0, 10) },
    { key: 'supplier', label: 'Supplier', render: (p) => p.supplier || '—' },
    { key: 'invoice_number', label: 'Supplier bill #', render: (p) => p.invoice_number || <span className="text-slate-400">—</span> },
    { key: 'grand_total', label: 'Total', align: 'right', className: 'font-medium', render: (p) => money(p.grand_total), csv: (p) => n(p.grand_total) },
    { key: 'paid_amount', label: 'Paid', align: 'right', render: (p) => money(p.paid_amount), csv: (p) => n(p.paid_amount) },
    { key: 'due_amount', label: 'Due', align: 'right', render: (p) => (n(p.due_amount) ? <span className="text-amber-700">{money(p.due_amount)}</span> : '—'), csv: (p) => n(p.due_amount) },
    { key: 'payment_status', label: 'Status', render: (p) => statusBadge(p.payment_status) },
  ];

  return (
    <ReportFrame
      title="Purchases report"
      period={`${rangeLabel(start, end)}${supplierName ? ` · ${supplierName}` : ''}`}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
          {can('suppliers.manage') && (
            <FilterBox label="Supplier" className="w-full sm:w-56">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">All suppliers</option>
                {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FilterBox>
          )}
        </>
      )}
      csv={() => downloadCsv(`purchases-${start || 'start'}-to-${end || 'today'}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={ReceiptText} label="Purchases" value={q.data?.total_purchases ?? 0} />
        <StatCard icon={Banknote} label="Total bought" value={money(q.data?.total_amount)} />
        <StatCard icon={Wallet} label="Paid to suppliers" value={money(paid)} tone="green" />
        <StatCard icon={AlertTriangle} label="Still owed" value={money(due)} tone={due ? 'amber' : 'green'} />
      </Stats>
      <ReportTable
        columns={columns}
        rows={rows}
        rowKey="po_number"
        empty="No purchases in this period."
        footer={rows.length ? { grand_total: money(q.data?.total_amount), paid_amount: money(paid), due_amount: money(due) } : null}
      />
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- customers

function CustomersReport() {
  const [search, setSearch] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const q = useQuery({ queryKey: ['reports', 'customers'], queryFn: () => api.get('/reports/customers') });
  const all = q.data || [];
  const hasDue = all.some((c) => c.due_amount !== undefined);
  const rows = all.filter((c) => {
    const t = search.trim().toLowerCase();
    if (t && ![c.name, c.phone].some((x) => String(x || '').toLowerCase().includes(t))) return false;
    if (onlyDue && !(n(c.due_amount) > 0)) return false;
    return true;
  });
  const totalDue = sum(all, (c) => c.due_amount);
  const withDue = all.filter((c) => n(c.due_amount) > 0).length;

  const columns = [
    { key: 'name', label: 'Customer', className: 'font-medium text-slate-800' },
    { key: 'phone', label: 'Phone', render: (c) => c.phone || <span className="text-slate-400">—</span> },
    { key: 'sales_count', label: 'Bills', align: 'right' },
    { key: 'total_purchases', label: 'Total bought', align: 'right', render: (c) => money(c.total_purchases), csv: (c) => n(c.total_purchases) },
    ...(hasDue ? [{ key: 'due_amount', label: 'Balance due', align: 'right', render: (c) => (n(c.due_amount) > 0 ? <span className="font-medium text-amber-700">{money(c.due_amount)}</span> : <span className="text-slate-400">—</span>), csv: (c) => n(c.due_amount) }] : []),
  ];

  return (
    <ReportFrame
      title="Customers report"
      period={`As of ${prettyDate(today())}${onlyDue ? ' · with balance due' : ''}`}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <FilterBox label="Search" className="w-full sm:w-64"><Input placeholder="Name or phone" value={search} onChange={(e) => setSearch(e.target.value)} /></FilterBox>
          {hasDue && (
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 rounded border-slate-300 text-brand-600" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
              Only customers who owe money
            </label>
          )}
        </>
      )}
      csv={() => downloadCsv(`customers-${today()}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={Users} label="Customers" value={all.length} />
        <StatCard icon={Banknote} label="Total bought" value={money(sum(all, (c) => c.total_purchases))} />
        {hasDue && <StatCard icon={Wallet} label="Total balance due" value={money(totalDue)} tone={totalDue ? 'amber' : 'green'} />}
        {hasDue && <StatCard icon={AlertTriangle} label="Customers who owe" value={num(withDue)} tone={withDue ? 'red' : 'green'} />}
      </Stats>
      <ReportTable
        columns={columns}
        rows={rows}
        empty={all.length ? 'No customers match these filters.' : 'No customers yet.'}
        footer={rows.length ? { total_purchases: money(sum(rows, (c) => c.total_purchases)), ...(hasDue ? { due_amount: money(sum(rows, (c) => c.due_amount)) } : {}) } : null}
      />
    </ReportFrame>
  );
}
