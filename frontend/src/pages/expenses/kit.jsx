// Small pieces shared by the Expenses page and the Profit report tab.
import {
  Car, CircleEllipsis, Coffee, Droplets, Flame, Home, Landmark, ShoppingBag, Tag, Users, Wifi, Wrench, Zap,
} from 'lucide-react';
import { useT } from '../../lib/i18n';
import { money } from '../../lib/format';
import { cx } from '../../components/ui';
import { ymd } from '../reports/reportKit';

// Icon + colour for the standard categories; anything the shop types itself gets a tag.
const CATEGORY_LOOK = {
  Rent: [Home, 'bg-indigo-100 text-indigo-700'],
  'Electricity bill': [Zap, 'bg-amber-100 text-amber-700'],
  'Gas bill': [Flame, 'bg-orange-100 text-orange-700'],
  'Water bill': [Droplets, 'bg-sky-100 text-sky-700'],
  'Internet / phone': [Wifi, 'bg-violet-100 text-violet-700'],
  Salaries: [Users, 'bg-emerald-100 text-emerald-700'],
  'Tea & food': [Coffee, 'bg-rose-100 text-rose-700'],
  'Transport / fuel': [Car, 'bg-teal-100 text-teal-700'],
  Repairs: [Wrench, 'bg-slate-200 text-slate-700'],
  'Shop supplies': [ShoppingBag, 'bg-blue-100 text-blue-700'],
  'Taxes & fees': [Landmark, 'bg-yellow-100 text-yellow-800'],
  Other: [CircleEllipsis, 'bg-slate-100 text-slate-600'],
};
export const categoryLook = (c) => CATEGORY_LOOK[c] || [Tag, 'bg-slate-100 text-slate-600'];

export function CategoryIcon({ category, className = 'size-9', iconClass = 'size-5' }) {
  const [Icon, tone] = categoryLook(category);
  return <span className={cx('grid shrink-0 place-items-center rounded-xl', tone, className)}><Icon className={iconClass} /></span>;
}

// Quick date ranges. Dates are YYYY-MM-DD in the shop computer's own time.
export const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: 'custom', label: 'Choose dates' },
];

export function periodRange(id) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (id === 'today') return { start: ymd(now), end: ymd(now) };
  if (id === 'week') return { start: ymd(new Date(y, m, now.getDate() - 6)), end: ymd(now) };
  if (id === 'last') return { start: ymd(new Date(y, m - 1, 1)), end: ymd(new Date(y, m, 0)) };
  return { start: ymd(new Date(y, m, 1)), end: ymd(now) };
}

// Row of big period buttons.
export function PeriodPicker({ value, onChange, className }) {
  const t = useT();
  return (
    <div className={cx('flex flex-wrap gap-2', className)} role="group" aria-label={t('Dates')}>
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={cx(
            'min-h-11 rounded-lg border px-4 text-[15px] font-medium transition-colors',
            value === p.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
          )}
          aria-pressed={value === p.id}
        >
          {t(p.label)}
        </button>
      ))}
    </div>
  );
}

// "Where the money went": one simple bar per category, biggest first.
export function CategoryBars({ rows, total, onPick, active }) {
  const t = useT();
  const max = Math.max(...rows.map((r) => Number(r.total) || 0), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const v = Number(r.total) || 0;
        const pct = total ? Math.round((v / total) * 100) : 0;
        const inner = (
          <>
            <CategoryIcon category={r.category} className="size-10" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <bdi className="font-medium text-slate-800">{t(r.category)}</bdi>
                  <bdi className="text-sm text-slate-400">{r.count === 1 ? t('1 time') : t('{n} times', { n: r.count })}</bdi>
                </span>
                <span className="flex items-baseline gap-2 whitespace-nowrap text-slate-800">
                  <span className="num font-semibold">{money(v)}</span>
                  <span className="num text-sm text-slate-400">{pct}%</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div className="h-2.5 rounded-full bg-rose-500 print:bg-slate-500" style={{ width: `${Math.max((v / max) * 100, v ? 2 : 0)}%` }} />
              </div>
            </div>
          </>
        );
        return (
          <li key={r.category}>
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(r.category)}
                className={cx('flex w-full items-center gap-3 rounded-lg p-1.5 text-start transition-colors hover:bg-slate-50', active === r.category && 'bg-brand-50 ring-1 ring-brand-200')}
              >
                {inner}
              </button>
            ) : <div className="flex items-center gap-3 p-1.5">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}
