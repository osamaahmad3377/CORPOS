// Reports → Profit: Sales − cost of goods = gross profit − expenses = net profit,
// as a vertical "waterfall" with a plain-words line under each step.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote, CircleDollarSign, Lock, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { money } from '../../lib/format';
import { Card, CardHeader, cx, Input, StatCard } from '../../components/ui';
import { downloadCsv, FilterBox, ReportFrame, Stats, useDates } from '../reports/reportKit';
import { CategoryBars, PeriodPicker, periodRange } from './kit';

const n = (v) => Number(v || 0);
const Num = ({ children }) => <span className="num">{children}</span>;

export default function ProfitReport() {
  const t = useT();
  const shop = useShop();
  const { can } = useAuth();
  const d = useDates();
  const [period, setPeriod] = useState('month');
  const [range, setRange] = useState(() => periodRange('month'));
  const pick = (id) => { setPeriod(id); if (id !== 'custom') setRange(periodRange(id)); };

  const q = useQuery({
    queryKey: ['reports', 'profit', range.start, range.end],
    queryFn: () => api.get('/reports/profit', { start: range.start, end: range.end }),
    enabled: !!range.start && !!range.end,
  });
  const r = q.data || {};
  const seeCost = !!r.can_see_cost;
  const cats = r.expenses_by_category || [];
  const net = n(r.net_profit);
  const loss = seeCost && net < 0;
  const taxLabel = shop.taxLabel;

  // Steps of the waterfall. `from`/`to` are where the bar starts and ends on the money line.
  const steps = seeCost ? [
    { key: 'sales', sign: '', label: t('Sale (after returns)'), en: 'Sale (after returns)', value: n(r.revenue), from: 0, to: n(r.revenue), tone: 'brand',
      hint: n(r.tax) > 0
        ? t('Money from all bills in these dates, minus money given back for returns. {tax} is taken out — it is the government\'s money.', { tax: t(taxLabel) })
        : t('Money from all bills in these dates, minus money given back for returns.') },
    { key: 'cogs', sign: '−', label: t('Cost of goods sold'), en: 'Cost of goods sold', value: n(r.cost_of_goods), from: n(r.revenue) - n(r.cost_of_goods), to: n(r.revenue), tone: 'minus',
      hint: t('What you paid your suppliers for the items you sold.') },
    { key: 'gross', sign: '=', label: t('Gross profit'), en: 'Gross profit', value: n(r.gross_profit), from: 0, to: n(r.gross_profit), tone: 'sub', pct: r.gross_margin_percent,
      hint: t('What you earned on the items, before shop expenses.') },
    { key: 'exp', sign: '−', label: t('Expenses'), en: 'Expenses', value: n(r.expenses_total), from: n(r.gross_profit) - n(r.expenses_total), to: n(r.gross_profit), tone: 'minus',
      hint: t('Rent, bills, salaries and other shop costs in these dates.') },
    { key: 'net', sign: '=', label: loss ? t('Net loss') : t('Net profit'), en: 'Net profit', value: net, from: 0, to: net, tone: loss ? 'loss' : 'net', pct: r.net_margin_percent, big: true,
      hint: loss ? t('Your expenses were more than what you earned on items. This is money you lost.') : t('What is really left for you after everything. This is your real profit.') },
  ] : [
    { key: 'sales', sign: '', label: t('Sale (after returns)'), en: 'Sale (after returns)', value: n(r.revenue), from: 0, to: n(r.revenue), tone: 'brand',
      hint: t('Money from all bills in these dates, minus money given back for returns.') },
    { key: 'exp', sign: '', label: t('Expenses'), en: 'Expenses', value: n(r.expenses_total), from: 0, to: n(r.expenses_total), tone: 'minus',
      hint: t('Rent, bills, salaries and other shop costs in these dates.') },
  ];

  const lo = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)));
  const hi = Math.max(1, ...steps.map((s) => Math.max(s.from, s.to)));
  const pos = (v) => ((v - lo) / (hi - lo)) * 100;

  const csvRows = [
    ...steps.map((s) => ({ line: s.key === 'net' && loss ? 'Net loss' : s.en, amount: s.key === 'cogs' || s.key === 'exp' ? -s.value : s.value })),
    { line: '', amount: '' },
    { line: 'Bills', amount: n(r.bills) },
    { line: 'All bills added up', amount: n(r.gross_sales) },
    { line: 'Returned', amount: n(r.returns) },
    { line: 'Discount given', amount: n(r.discounts) },
    ...(n(r.tax) ? [{ line: `${taxLabel} collected`, amount: n(r.tax) }] : []),
    ...(cats.length ? [{ line: '', amount: '' }, ...cats.map((c) => ({ line: `Expense: ${c.category}`, amount: n(c.total) }))] : []),
  ];

  return (
    <ReportFrame
      title={t('Profit & expenses')}
      hint={t('Your real profit: what you sold, minus what the items cost you, minus shop expenses.')}
      period={d.rangeLabel(range.start, range.end)}
      loading={q.isLoading}
      error={q.error}
      filters={(
        <>
          <PeriodPicker value={period} onChange={pick} />
          {period === 'custom' && (
            <>
              <FilterBox label={t('From')}><Input type="date" value={range.start} max={range.end || undefined} onChange={(e) => setRange((x) => ({ ...x, start: e.target.value }))} /></FilterBox>
              <FilterBox label={t('To')}><Input type="date" value={range.end} min={range.start || undefined} onChange={(e) => setRange((x) => ({ ...x, end: e.target.value }))} /></FilterBox>
            </>
          )}
        </>
      )}
      csv={() => downloadCsv(`profit-${range.start}-to-${range.end}.csv`, [{ key: 'line', en: 'Line' }, { key: 'amount', en: 'Amount (Rs)' }], csvRows)}
    >
      <Stats>
        <StatCard icon={Banknote} label={t('Sale (after returns)')} value={<Num>{money(r.revenue)}</Num>} />
        {seeCost && <StatCard icon={CircleDollarSign} label={t('Gross profit')} value={<Num>{money(r.gross_profit)}</Num>} tone={n(r.gross_profit) < 0 ? 'red' : 'green'} />}
        <StatCard icon={Wallet} label={t('Expenses')} value={<Num>{money(r.expenses_total)}</Num>} tone="amber" />
        {seeCost && <StatCard icon={loss ? TrendingDown : TrendingUp} label={loss ? t('Net loss') : t('Net profit')} value={<Num>{money(Math.abs(net))}</Num>} tone={loss ? 'red' : 'green'} />}
      </Stats>

      {seeCost && n(r.lines_without_cost) > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <span>{t('{n} sold items have no cost price, so their cost is counted as Rs 0. Profit may look higher than it really is. Add the cost price to those items.', { n: r.lines_without_cost })}</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t('How your profit is worked out')} subtitle={<span className="num">{d.rangeLabel(range.start, range.end)}</span>} />
          <ol className="divide-y divide-slate-100">
            {steps.map((s) => (
              <li key={s.key} className={cx('px-5 py-4', s.tone === 'sub' && 'bg-slate-50/70', s.big && (s.tone === 'loss' ? 'bg-red-50/70' : 'bg-emerald-50/70'))}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cx('num w-5 text-center text-xl font-bold', s.tone === 'minus' ? 'text-red-500' : 'text-slate-400')}>{s.sign}</span>
                    <span className={cx('font-semibold text-slate-900', s.big ? 'text-xl' : 'text-lg')}>{s.label}</span>
                  </div>
                  <div className="ms-auto flex items-baseline gap-2 whitespace-nowrap">
                    {s.pct !== null && s.pct !== undefined && <span className="text-sm text-slate-500">{t('Share of sale')} <span className="num">{s.tone === 'loss' ? Math.abs(s.pct) : s.pct}%</span></span>}
                    <span className={cx('num font-bold',
                      s.big ? 'text-2xl' : 'text-xl',
                      s.tone === 'minus' ? 'text-red-600' : s.tone === 'loss' ? 'text-red-700' : s.tone === 'net' ? 'text-emerald-700' : s.tone === 'sub' ? 'text-emerald-700' : 'text-slate-900')}
                    >
                      {s.tone === 'minus' && s.sign ? `−${money(s.value)}` : s.tone === 'loss' ? money(Math.abs(s.value)) : money(s.value)}
                    </span>
                  </div>
                </div>
                <p className="ms-7 mt-1 text-sm text-slate-500">{s.hint}</p>
                <div className="relative ms-7 mt-3 h-3 rounded-full bg-slate-100" aria-hidden="true">
                  {lo < 0 && <div className="absolute -top-1 h-5 w-0.5 bg-slate-400" style={{ insetInlineStart: `${pos(0)}%` }} />}
                  <div
                    className={cx('absolute top-0 h-3 rounded-full print:bg-slate-500',
                      s.tone === 'brand' && 'bg-brand-500',
                      s.tone === 'minus' && 'bg-red-400',
                      s.tone === 'sub' && 'bg-emerald-400',
                      s.tone === 'net' && 'bg-emerald-600',
                      s.tone === 'loss' && 'bg-red-600')}
                    style={{ insetInlineStart: `${pos(Math.min(s.from, s.to))}%`, width: `${Math.max(pos(Math.max(s.from, s.to)) - pos(Math.min(s.from, s.to)), s.value ? 0.8 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
          {!seeCost && (
            <div className="flex items-start gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
              <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <span>{t('Cost and profit are only shown to staff who are allowed to see cost prices.')}</span>
            </div>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title={t('Expenses by kind')}
              subtitle={<Num>{money(r.expenses_total)}</Num>}
              action={can('expenses.manage') && <Link to="/expenses" className="whitespace-nowrap text-sm font-medium text-brand-700 hover:underline print:hidden">{t('Open expenses')}</Link>}
            />
            <div className="p-4">
              {cats.length
                ? <CategoryBars rows={cats} total={n(r.expenses_total)} />
                : <p className="py-6 text-center text-sm text-slate-500">{t('No expenses in these dates.')}{can('expenses.manage') && <> <Link to="/expenses" className="font-medium text-brand-700 hover:underline print:hidden">{t('Add expense')}</Link></>}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('Sales details')} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm">
              <Detail label={t('Bills')} value={n(r.bills)} />
              <Detail label={t('All bills added up')} value={money(r.gross_sales)} />
              <Detail label={t('Returned')} value={money(r.returns)} />
              <Detail label={t('Discount given')} value={money(r.discounts)} />
              {(shop.taxEnabled || n(r.tax) > 0) && <Detail label={t('{tax} collected', { tax: t(taxLabel) })} value={money(r.tax)} />}
            </dl>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{t('Returns are taken off the day the bill was made. Held (unfinished) bills are not counted.')}</p>
          </Card>
        </div>
      </div>
    </ReportFrame>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900"><Num>{value}</Num></dd>
    </div>
  );
}
