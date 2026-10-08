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
import { useT } from '../../lib/i18n';
import { money, num, qty, today, variantLabel } from '../../lib/format';
import { useCategories } from '../../lib/catalog';
import { Page } from '../../components/Layout';
import { Badge, Card, CardHeader, cx, EmptyState, Input, PageHeader, Select, StatCard } from '../../components/ui';
import {
  downloadCsv, FilterBox, monthStart, ReportFrame, ReportTable, Stats, thisMonth, useDates, ymd,
} from './reportKit';
import ProfitReport from '../expenses/ProfitReport';

const TABS = [
  { to: 'daily', label: 'Today' },
  { to: 'monthly', label: 'This month' },
  { to: 'products', label: 'Items sold' },
  { to: 'profit', label: 'Profit' },
  { to: 'inventory', label: 'Stock value' },
  { to: 'low-stock', label: 'Low stock' },
  { to: 'purchases', label: 'Stock bought' },
  { to: 'customers', label: 'Udhaar' },
];

const n = (v) => Number(v || 0);
const sum = (rows, f) => rows.reduce((a, r) => a + n(f(r)), 0);
const billsText = (t, c) => (c === 1 ? t('1 bill') : t('{n} bills', { n: c }));
const Num = ({ children }) => <span className="num">{children}</span>;

export default function Reports() {
  const t = useT();
  return (
    <Page>
      <PageHeader title={t('Reports')} subtitle={t('See how much you sold, what is in stock, and who owes you. You can print any report.')} />
      <div className="mb-5 -mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 print:hidden">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={`/reports/${tab.to}`}
            className={({ isActive }) => cx(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-base font-medium transition-colors',
              isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t(tab.label)}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to="daily" replace />} />
        <Route path="daily" element={<DailySales />} />
        <Route path="monthly" element={<MonthlySales />} />
        <Route path="products" element={<ProductSales />} />
        <Route path="profit" element={<ProfitReport />} />
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
  const t = useT();
  return (
    <>
      <FilterBox label={t('From')}><Input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} /></FilterBox>
      <FilterBox label={t('To')}><Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></FilterBox>
    </>
  );
}

// ---------------------------------------------------------------- daily

function DailySales() {
  const t = useT();
  const shop = useShop();
  const d = useDates();
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
    { key: 'invoice_number', en: 'Bill', render: (s) => <Link to={`/sales/${s.invoice_number}`} className="font-medium text-slate-800 hover:text-brand-600">{s.invoice_number}</Link> },
    { key: 'sale_date', en: 'Time', render: (s) => <Num>{d.time(s.sale_date)}</Num>, csv: (s) => d.time(s.sale_date) },
    { key: 'customer', en: 'Customer', render: (s) => s.customer || <span className="text-slate-400">{t('Walk-in')}</span>, csv: (s) => s.customer || 'Walk-in' },
    { key: 'cashier', en: 'Cashier' },
    { key: 'payment_method', en: 'Paid by', render: (s) => t(shop.paymentLabel(s.payment_method)), csv: (s) => shop.paymentLabel(s.payment_method) },
    { key: 'grand_total', en: 'Bill total', align: 'end', render: (s) => money(s.grand_total), csv: (s) => n(s.grand_total) },
    { key: 'refunded_amount', en: 'Returned', align: 'end', render: (s) => (n(s.refunded_amount) ? <span className="text-red-600">−{money(s.refunded_amount)}</span> : '—'), csv: (s) => n(s.refunded_amount) },
    { key: 'net_revenue', en: 'Sale after returns', align: 'end', className: 'font-medium', render: (s) => money(s.net_revenue), csv: (s) => n(s.net_revenue) },
    { key: 'due_amount', en: 'Udhaar', align: 'end', raw: true, render: (s) => (n(s.due_amount) ? <Badge color="amber"><Num>{money(s.due_amount)}</Num></Badge> : <Badge color="green">{t('Paid')}</Badge>), csv: (s) => n(s.due_amount) },
  ];

  return (
    <ReportFrame
      title={t('Sales for {date}', { date: d.prettyDate(day) })}
      hint={t('All bills of one day. Pick another date to see an old day.')}
      period={d.prettyDate(day)}
      loading={q.isLoading}
      error={q.error}
      filters={<FilterBox label={t('Date')}><Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></FilterBox>}
      csv={() => downloadCsv(`daily-sales-${day}.csv`, columns, sales)}
    >
      <Stats>
        <StatCard icon={Banknote} label={t('Sale (after returns)')} value={<Num>{money(q.data?.total_revenue)}</Num>} />
        <StatCard icon={ReceiptText} label={t('Bills')} value={<Num>{q.data?.total_sales ?? 0}</Num>} />
        <StatCard icon={RotateCcw} label={t('Returns')} value={<Num>{money(refunded)}</Num>} tone={refunded ? 'red' : 'green'} />
        <StatCard icon={Wallet} label={t('Given on udhaar')} value={<Num>{money(due)}</Num>} tone={due ? 'amber' : 'green'} />
      </Stats>

      {!!sales.length && (
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title={t('How customers paid')} subtitle={t('After returns')} />
            <div className="space-y-4 p-5">
              {byMethod.map(([m, v]) => (
                <div key={m}>
                  <div className="mb-1 flex flex-wrap justify-between gap-x-3 text-sm">
                    <span className="font-medium text-slate-700">{t(shop.paymentLabel(m))} <span className="font-normal text-slate-400">· {billsText(t, v.count)}</span></span>
                    <Num><span className="text-slate-700">{money(v.total)}</span></Num>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${n(q.data?.total_revenue) ? (v.total / n(q.data.total_revenue)) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title={t('Day summary')} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-3">
              <Summary label={t('All bills added up')} value={money(gross)} />
              <Summary label={t('Discount given')} value={money(discount)} />
              {(shop.taxEnabled || tax > 0) && <Summary label={t('{tax} collected', { tax: shop.taxLabel })} value={money(tax)} />}
              <Summary label={t('Returned')} value={money(refunded)} />
              <Summary label={t('Sale (after returns)')} value={money(q.data?.total_revenue)} />
              <Summary label={t('Average bill')} value={money(sales.length ? n(q.data?.total_revenue) / sales.length : 0)} />
            </dl>
          </Card>
        </div>
      )}

      <ReportTable
        title={t('Bills')}
        columns={columns}
        rows={sales}
        rowKey="invoice_number"
        empty={t('No bills on this day.')}
        footer={sales.length ? { grand_total: money(gross), refunded_amount: refunded ? `−${money(refunded)}` : '—', net_revenue: money(q.data?.total_revenue), due_amount: <Num>{money(due)}</Num> } : null}
      />
    </ReportFrame>
  );
}

function Summary({ label, value }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900"><Num>{value}</Num></dd>
    </div>
  );
}

// ---------------------------------------------------------------- monthly

function MonthlySales() {
  const t = useT();
  const d = useDates();
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
  const max = Math.max(...days.map((x) => x.total), 1);

  const columns = [
    { key: 'date', en: 'Date', render: (r) => <Num>{d.prettyDate(r.date)}</Num>, csv: (r) => String(r.date).slice(0, 10) },
    { key: 'total_sales', en: 'Bills', align: 'end' },
    { key: 'avg', en: 'Average bill', align: 'end', render: (r) => money(n(r.total_revenue) / Math.max(n(r.total_sales), 1)), csv: (r) => (n(r.total_revenue) / Math.max(n(r.total_sales), 1)).toFixed(2) },
    { key: 'total_revenue', en: 'Sale (after returns)', align: 'end', className: 'font-medium', render: (r) => money(r.total_revenue), csv: (r) => n(r.total_revenue) },
  ];

  return (
    <ReportFrame
      title={t('Sales for {month}', { month: d.prettyMonth(month) })}
      hint={t('Sale of every day in one month. Pick another month to see an old month.')}
      period={d.prettyMonth(month)}
      loading={q.isLoading}
      error={q.error}
      filters={<FilterBox label={t('Month')}><Input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} /></FilterBox>}
      csv={() => downloadCsv(`monthly-sales-${month}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={Banknote} label={t('Sale (after returns)')} value={<Num>{money(total)}</Num>} />
        <StatCard icon={ReceiptText} label={t('Bills')} value={<Num>{bills}</Num>} />
        <StatCard icon={CalendarDays} label={t('Average sale per day')} value={<Num>{money(rows.length ? total / rows.length : 0)}</Num>} tone="green" />
        <StatCard icon={Trophy} label={t('Best day')} value={best ? <span className="block text-xl"><Num>{d.shortDate(best.date)}</Num> · <Num>{money(best.total_revenue)}</Num></span> : '—'} tone="amber" />
      </Stats>

      <Card className="mb-5">
        <CardHeader title={t('Sale of each day')} subtitle={d.prettyMonth(month)} />
        {!rows.length ? <EmptyState icon={CalendarRange} title={t('No sales this month')} /> : (
          <div className="px-5 pb-5 pt-10">
            <div className="flex h-48 items-end gap-1">
              {days.map((x) => (
                <div key={x.key} className="group relative flex h-full flex-1 items-end">
                  <div className="w-full rounded-t bg-brand-500/80 transition-colors group-hover:bg-brand-600 print:bg-slate-500" style={{ height: `${Math.max((x.total / max) * 100, x.total ? 2 : 0)}%` }} />
                  <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
                    <Num>{d.shortDate(x.key)}</Num>: <Num>{money(x.total)}</Num> · {billsText(t, x.bills)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1 text-xs text-slate-400">
              {days.map((x) => <span key={x.key} className="flex-1 text-center">{x.day === 1 || x.day % 5 === 0 ? x.day : ''}</span>)}
            </div>
          </div>
        )}
      </Card>

      <ReportTable
        title={t('Day by day')}
        columns={columns}
        rows={rows}
        rowKey="date"
        empty={t('No bills in this month.')}
        footer={rows.length ? { total_sales: bills, avg: money(bills ? total / bills : 0), total_revenue: money(total) } : null}
      />
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- products

function ProductSales() {
  const t = useT();
  const shop = useShop();
  const d = useDates();
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
  const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : 0);

  const columns = [
    { key: 'rank', en: '#', render: (_, i) => <span className="text-slate-400">{i + 1}</span>, csv: false },
    { key: 'name', en: 'Item', className: 'font-medium text-slate-800' },
    { key: 'quantity_sold', en: 'How many sold', align: 'end', raw: true, render: (r) => <span className="whitespace-nowrap"><Num>{qty(r.quantity_sold)}</Num> <span className="text-slate-400">{t(shop.unitLabel(r.unit))}</span></span>, csv: (r) => qty(r.quantity_sold) },
    { key: 'unit', en: 'Unit', csv: (r) => shop.unitLabel(r.unit), hidden: true },
    { key: 'avg', en: 'Average price', align: 'end', render: (r) => money(n(r.revenue) / Math.max(n(r.quantity_sold), 0.001)), csv: (r) => (n(r.revenue) / Math.max(n(r.quantity_sold), 0.001)).toFixed(2) },
    { key: 'revenue', en: 'Sale amount', align: 'end', className: 'font-medium', render: (r) => money(r.revenue), csv: (r) => n(r.revenue) },
    ...(hasProfit ? [
      { key: 'cost', en: 'Cost', align: 'end', render: (r) => money(r.cost), csv: (r) => n(r.cost) },
      { key: 'profit', en: 'Profit', align: 'end', className: 'font-medium', render: (r) => <span className={n(r.profit) < 0 ? 'text-red-600' : 'text-emerald-700'}>{money(r.profit)}</span>, csv: (r) => n(r.profit) },
      { key: 'margin', en: 'Profit %', align: 'end', render: (r) => <span className="text-slate-500">{pct(n(r.profit), n(r.revenue))}%</span>, csv: (r) => pct(n(r.profit), n(r.revenue)) },
    ] : []),
    { key: 'share', en: 'Share of sale', align: 'end', raw: true, render: (r) => (
      <div className="flex items-center justify-end gap-2">
        <div className="hidden h-1.5 w-20 rounded-full bg-slate-100 sm:block"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${pct(n(r.revenue), total)}%` }} /></div>
        <span className="num w-12 text-slate-500">{pct(n(r.revenue), total)}%</span>
      </div>
    ), csv: (r) => pct(n(r.revenue), total) },
  ];
  const shown = columns.filter((c) => !c.hidden);

  return (
    <ReportFrame
      title={t('Items sold')}
      hint={t('Which items sold the most, and how much you earned on each.')}
      period={`${d.rangeLabel(start, end)}${catName ? ` · ${catName}` : ''}`}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
          <FilterBox label={t('Category')} className="w-full sm:w-56">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('All categories')}</option>
              {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
            </Select>
          </FilterBox>
        </>
      )}
      csv={() => downloadCsv(`product-sales-${start || 'start'}-to-${end || 'today'}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={Banknote} label={t('Sale (after returns)')} value={<Num>{money(total)}</Num>} />
        <StatCard icon={Package} label={t('Different items sold')} value={<Num>{rows.length}</Num>} />
        <StatCard icon={Trophy} label={t('Best seller')} value={<span className="block truncate text-lg">{rows[0]?.name || '—'}</span>} tone="amber" />
        {hasProfit
          ? <StatCard icon={CircleDollarSign} label={t('Profit')} value={<Num>{money(totalProfit)}</Num>} tone={totalProfit < 0 ? 'red' : 'green'} />
          : <StatCard icon={CircleDollarSign} label={t('Best seller sale')} value={<Num>{money(rows[0]?.revenue)}</Num>} tone="green" />}
      </Stats>
      <ReportTable
        title={t('Items, most sold first')}
        columns={shown}
        rows={rows}
        empty={t('No items sold in these dates.')}
        footer={rows.length ? { revenue: money(total), ...(hasProfit ? { profit: money(totalProfit) } : {}) } : null}
      />
      <p className="mt-3 text-sm text-slate-500 print:hidden">{t('Returned items are already taken out. Profit = sale price minus the cost price of the item when it was sold (bill discounts are not counted).')}</p>
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- inventory

function InventoryReport() {
  const t = useT();
  const shop = useShop();
  const d = useDates();
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState('');
  const q = useQuery({ queryKey: ['reports', 'inventory'], queryFn: () => api.get('/reports/inventory') });
  const all = q.data?.variants || [];
  const showCost = q.data?.total_stock_value !== null && q.data?.total_stock_value !== undefined;

  const rows = all.filter((v) => {
    const s = search.trim().toLowerCase();
    if (s && ![v.product_name, v.sku, v.barcode, variantLabel(v)].some((x) => String(x || '').toLowerCase().includes(s))) return false;
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
  const optLabel = `${t(shop.option1)} / ${t(shop.option2)}`;

  const columns = [
    { key: 'product_name', en: 'Item', render: (v) => (
      <div>
        <div className="font-medium text-slate-800">{v.product_name}</div>
        {variantLabel(v) && <div className="text-xs text-slate-500">{variantLabel(v)}</div>}
      </div>
    ) },
    { key: 'variant', label: optLabel, csvLabel: `${shop.option1} / ${shop.option2}`, csv: (v) => variantLabel(v), hidden: true },
    { key: 'sku', en: 'SKU / Barcode', csvLabel: 'SKU', render: (v) => <div className="text-xs text-slate-500"><div><Num>{v.sku}</Num></div><div><Num>{v.barcode}</Num></div></div>, csv: (v) => v.sku },
    { key: 'barcode', en: 'Barcode', hidden: true },
    { key: 'stock_qty', en: 'In stock', align: 'end', raw: true, render: (v) => (
      <span className={cx(n(v.stock_qty) <= 0 ? 'text-red-600' : n(v.stock_qty) <= n(v.low_stock_threshold) ? 'text-amber-700' : 'text-slate-800', 'whitespace-nowrap font-medium')}>
        <Num>{qty(v.stock_qty)}</Num> <span className="font-normal text-slate-400">{t(shop.unitLabel(v.unit))}</span>
      </span>
    ), csv: (v) => qty(v.stock_qty) },
    { key: 'unit', en: 'Unit', csv: (v) => shop.unitLabel(v.unit), hidden: true },
    ...(showCost ? [{ key: 'purchase_price', en: 'Cost price', align: 'end', render: (v) => money(v.purchase_price), csv: (v) => n(v.purchase_price) }] : []),
    { key: 'selling_price', en: 'Sale price', align: 'end', render: (v) => money(v.selling_price), csv: (v) => n(v.selling_price) },
    ...(showCost ? [{ key: 'cost_value', en: 'Worth at cost price', align: 'end', render: (v) => money(pos(v) * n(v.purchase_price)), csv: (v) => (pos(v) * n(v.purchase_price)).toFixed(2) }] : []),
    { key: 'retail_value', en: 'Worth at sale price', align: 'end', className: 'font-medium', render: (v) => money(pos(v) * n(v.selling_price)), csv: (v) => (pos(v) * n(v.selling_price)).toFixed(2) },
  ];

  return (
    <ReportFrame
      title={t('Stock value')}
      hint={t('How much stock you have now, and what it is worth.')}
      period={t('On {date}', { date: d.prettyDate(today()) })}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <FilterBox label={t('Search')} className="w-full sm:w-64"><Input placeholder={t('Item name, SKU or barcode')} value={search} onChange={(e) => setSearch(e.target.value)} /></FilterBox>
          <FilterBox label={t('Show')} className="w-full sm:w-52">
            <Select value={stock} onChange={(e) => setStock(e.target.value)}>
              <option value="">{t('All items')}</option>
              <option value="in">{t('Items in stock')}</option>
              <option value="low">{t('Low or finished')}</option>
              <option value="out">{t('Finished (0 left)')}</option>
            </Select>
          </FilterBox>
        </>
      )}
      csv={() => downloadCsv(`inventory-${today()}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={Boxes} label={t('Items (each type counted)')} value={<Num>{q.data?.total_variants ?? 0}</Num>} />
        {showCost
          ? <StatCard icon={Wallet} label={t('Stock worth at cost price')} value={<Num>{money(q.data.total_stock_value)}</Num>} tone="green" />
          : <StatCard icon={PackageX} label={t('Finished (0 left)')} value={<Num>{outCount}</Num>} tone={outCount ? 'red' : 'green'} />}
        <StatCard icon={Banknote} label={t('Stock worth at sale price')} value={<Num>{money(retailAll)}</Num>} />
        {showCost
          ? <StatCard icon={CircleDollarSign} label={t('Profit if all stock sells')} value={<Num>{money(retailAll - n(q.data.total_stock_value))}</Num>} tone="amber" />
          : <StatCard icon={AlertTriangle} label={t('Low or finished')} value={<Num>{all.filter((v) => n(v.stock_qty) <= n(v.low_stock_threshold)).length}</Num>} tone="amber" />}
      </Stats>
      <ReportTable
        title={rows.length !== all.length ? t('Stock list ({n} of {total})', { n: rows.length, total: all.length }) : t('Stock list')}
        columns={columns.filter((c) => !c.hidden)}
        rows={rows}
        empty={all.length ? t('No items match. Try a different search.') : t('No items yet. Add items first.')}
        footer={rows.length ? { retail_value: money(retail), ...(showCost ? { cost_value: money(cost) } : {}) } : null}
      />
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- low stock

function LowStock() {
  const t = useT();
  const shop = useShop();
  const d = useDates();
  const q = useQuery({ queryKey: ['reports', 'low-stock'], queryFn: () => api.get('/reports/low-stock') });
  const rows = q.data?.data || [];
  const out = rows.filter((v) => n(v.stock_qty) <= 0).length;

  const columns = [
    { key: 'product_name', en: 'Item', className: 'font-medium text-slate-800' },
    { key: 'variant', label: `${t(shop.option1)} / ${t(shop.option2)}`, csvLabel: `${shop.option1} / ${shop.option2}`, render: (v) => variantLabel(v) || <span className="text-slate-400">—</span>, csv: (v) => variantLabel(v) },
    { key: 'sku', en: 'SKU', className: 'text-slate-500', render: (v) => <Num>{v.sku}</Num> },
    { key: 'stock_qty', en: 'In stock', align: 'end', raw: true, render: (v) => <span className="whitespace-nowrap font-medium"><Num>{qty(v.stock_qty)}</Num> <span className="font-normal text-slate-400">{t(shop.unitLabel(v.unit))}</span></span>, csv: (v) => qty(v.stock_qty) },
    { key: 'low_stock_threshold', en: 'Warn when below', align: 'end', render: (v) => qty(v.low_stock_threshold), csv: (v) => qty(v.low_stock_threshold) },
    { key: 'unit', en: 'Unit', csv: (v) => shop.unitLabel(v.unit), hidden: true },
    { key: 'status', en: 'Status', render: (v) => (n(v.stock_qty) <= 0 ? <Badge color="red">{t('Finished')}</Badge> : <Badge color="amber">{t('Low')}</Badge>), csv: (v) => (n(v.stock_qty) <= 0 ? 'Finished' : 'Low') },
  ];

  return (
    <ReportFrame
      title={t('Low stock')}
      hint={t('Items that are finished or running low. Buy these soon.')}
      period={t('On {date}', { date: d.prettyDate(today()) })}
      loading={q.isLoading}
      error={q.error}
      csv={() => downloadCsv(`low-stock-${today()}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={AlertTriangle} label={t('Need to buy')} value={<Num>{rows.length}</Num>} tone={rows.length ? 'amber' : 'green'} />
        <StatCard icon={PackageX} label={t('Finished (0 left)')} value={<Num>{out}</Num>} tone={out ? 'red' : 'green'} />
      </Stats>
      <ReportTable columns={columns.filter((c) => !c.hidden)} rows={rows} empty={t('Good news — no item is running low.')} />
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- purchases

function PurchasesReport() {
  const t = useT();
  const d = useDates();
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

  const STATUS = { paid: ['green', 'Paid'], partial: ['amber', 'Part paid'] };
  const status = (s) => STATUS[s] || ['red', 'Not paid'];
  const columns = [
    { key: 'po_number', en: 'Purchase #', className: 'font-medium text-slate-800', render: (p) => <Num>{p.po_number}</Num> },
    { key: 'purchase_date', en: 'Date', render: (p) => <Num>{d.prettyDate(p.purchase_date)}</Num>, csv: (p) => String(p.purchase_date || '').slice(0, 10) },
    { key: 'supplier', en: 'Supplier', render: (p) => p.supplier || '—' },
    { key: 'invoice_number', en: 'Supplier\'s bill #', render: (p) => (p.invoice_number ? <Num>{p.invoice_number}</Num> : <span className="text-slate-400">—</span>) },
    { key: 'grand_total', en: 'Total', align: 'end', className: 'font-medium', render: (p) => money(p.grand_total), csv: (p) => n(p.grand_total) },
    { key: 'paid_amount', en: 'Paid', align: 'end', render: (p) => money(p.paid_amount), csv: (p) => n(p.paid_amount) },
    { key: 'due_amount', en: 'Still owed', align: 'end', render: (p) => (n(p.due_amount) ? <span className="text-amber-700">{money(p.due_amount)}</span> : '—'), csv: (p) => n(p.due_amount) },
    { key: 'payment_status', en: 'Status', render: (p) => <Badge color={status(p.payment_status)[0]}>{t(status(p.payment_status)[1])}</Badge>, csv: (p) => status(p.payment_status)[1] },
  ];

  return (
    <ReportFrame
      title={t('Stock bought')}
      hint={t('Stock you bought from suppliers, and how much you still owe them.')}
      period={`${d.rangeLabel(start, end)}${supplierName ? ` · ${supplierName}` : ''}`}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
          {can('suppliers.manage') && (
            <FilterBox label={t('Supplier')} className="w-full sm:w-56">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">{t('All suppliers')}</option>
                {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FilterBox>
          )}
        </>
      )}
      csv={() => downloadCsv(`purchases-${start || 'start'}-to-${end || 'today'}.csv`, columns, rows)}
    >
      <Stats>
        <StatCard icon={ReceiptText} label={t('Purchases')} value={<Num>{q.data?.total_purchases ?? 0}</Num>} />
        <StatCard icon={Banknote} label={t('Total bought')} value={<Num>{money(q.data?.total_amount)}</Num>} />
        <StatCard icon={Wallet} label={t('Paid to suppliers')} value={<Num>{money(paid)}</Num>} tone="green" />
        <StatCard icon={AlertTriangle} label={t('Still owed')} value={<Num>{money(due)}</Num>} tone={due ? 'amber' : 'green'} />
      </Stats>
      <ReportTable
        columns={columns}
        rows={rows}
        rowKey="po_number"
        empty={t('No stock bought in these dates.')}
        footer={rows.length ? { grand_total: money(q.data?.total_amount), paid_amount: money(paid), due_amount: money(due) } : null}
      />
    </ReportFrame>
  );
}

// ---------------------------------------------------------------- customers / udhaar

function CustomersReport() {
  const t = useT();
  const d = useDates();
  const [search, setSearch] = useState('');
  const [onlyDue, setOnlyDue] = useState(true);
  const q = useQuery({ queryKey: ['reports', 'customers'], queryFn: () => api.get('/reports/customers') });
  const all = q.data || [];
  const hasDue = all.some((c) => c.due_amount !== undefined);
  const rows = all.filter((c) => {
    const s = search.trim().toLowerCase();
    if (s && ![c.name, c.phone].some((x) => String(x || '').toLowerCase().includes(s))) return false;
    if (hasDue && onlyDue && !(n(c.due_amount) > 0)) return false;
    return true;
  });
  const totalDue = sum(all, (c) => c.due_amount);
  const withDue = all.filter((c) => n(c.due_amount) > 0).length;

  const columns = [
    { key: 'name', en: 'Customer', className: 'font-medium text-slate-800' },
    { key: 'phone', en: 'Phone', render: (c) => (c.phone ? <Num>{c.phone}</Num> : <span className="text-slate-400">—</span>) },
    { key: 'sales_count', en: 'Bills', align: 'end' },
    { key: 'total_purchases', en: 'Total bought', align: 'end', render: (c) => money(c.total_purchases), csv: (c) => n(c.total_purchases) },
    ...(hasDue ? [{ key: 'due_amount', en: 'Udhaar (still owes)', align: 'end', render: (c) => (n(c.due_amount) > 0 ? <span className="font-medium text-amber-700">{money(c.due_amount)}</span> : <span className="text-slate-400">—</span>), csv: (c) => n(c.due_amount) }] : []),
  ];

  return (
    <ReportFrame
      title={t('Udhaar')}
      hint={t('Customers who owe you money, and how much each one has bought.')}
      period={`${t('On {date}', { date: d.prettyDate(today()) })}${hasDue && onlyDue ? ` · ${t('Only customers who owe money')}` : ''}`}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <FilterBox label={t('Search')} className="w-full sm:w-64"><Input placeholder={t('Name or phone')} value={search} onChange={(e) => setSearch(e.target.value)} /></FilterBox>
          {hasDue && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-slate-700">
              <input type="checkbox" className="size-5 rounded border-slate-300 text-brand-600" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
              {t('Only customers who owe money')}
            </label>
          )}
        </>
      )}
      csv={() => downloadCsv(`customers-${today()}.csv`, columns, rows)}
    >
      <Stats>
        {hasDue && <StatCard icon={Wallet} label={t('Total udhaar')} value={<Num>{money(totalDue)}</Num>} tone={totalDue ? 'amber' : 'green'} />}
        {hasDue && <StatCard icon={AlertTriangle} label={t('Customers who owe')} value={<Num>{num(withDue)}</Num>} tone={withDue ? 'red' : 'green'} />}
        <StatCard icon={Users} label={t('All customers')} value={<Num>{all.length}</Num>} />
        <StatCard icon={Banknote} label={t('Total bought')} value={<Num>{money(sum(all, (c) => c.total_purchases))}</Num>} />
      </Stats>
      <ReportTable
        columns={columns}
        rows={rows}
        empty={!all.length ? t('No customers yet.') : hasDue && onlyDue && !search ? t('Nobody owes you money right now.') : t('No customers match. Try a different search.')}
        footer={rows.length ? { total_purchases: money(sum(rows, (c) => c.total_purchases)), ...(hasDue ? { due_amount: money(sum(rows, (c) => c.due_amount)) } : {}) } : null}
      />
    </ReportFrame>
  );
}
