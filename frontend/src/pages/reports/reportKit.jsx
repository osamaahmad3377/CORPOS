// Shared building blocks for the report tabs: a report frame with Print and
// Export CSV, a generic column-driven table, and small date helpers.
import { Download, FileBarChart, Printer } from 'lucide-react';
import { useShop } from '../../lib/shop';
import { useLang } from '../../lib/i18n';
import { Button, Card, cx, EmptyState, ErrorBox, Loading, Table, Td, Th } from '../../components/ui';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const thisMonth = () => ymd(new Date()).slice(0, 7);
export const monthStart = () => `${thisMonth()}-01`;

const parseDay = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Date helpers that follow the chosen language (Urdu month names in Urdu mode).
//   const d = useDates(); d.prettyDate('2026-10-08') -> "08 Oct 2026" / "08 اکتوبر، 2026"
export function useDates() {
  const { lang, t } = useLang();
  const loc = lang === 'ur' ? 'ur-PK' : 'en-PK';
  const prettyDate = (s) => (s ? parseDay(s).toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const shortDate = (s) => (s ? parseDay(s).toLocaleDateString(loc, { day: 'numeric', month: 'short' }) : '');
  const prettyMonth = (s) => {
    if (!s) return '';
    const [y, m] = s.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  };
  const dateTime = (v) => (v ? new Date(v).toLocaleString(loc, { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const time = (v) => (v ? new Date(v).toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }) : '');
  const rangeLabel = (start, end) => {
    if (start && end) return start === end ? prettyDate(start) : `${prettyDate(start)} – ${prettyDate(end)}`;
    if (start) return t('From {date}', { date: prettyDate(start) });
    if (end) return t('Up to {date}', { date: prettyDate(end) });
    return t('All dates');
  };
  return { prettyDate, shortDate, prettyMonth, dateTime, time, rangeLabel };
}

// ---------------------------------------------------------------- CSV

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Column titles stay in English (spreadsheets): each column's csvLabel / en.
export function downloadCsv(filename, columns, rows) {
  const cols = columns.filter((c) => c.csv !== false);
  const lines = [
    cols.map((c) => csvCell(c.csvLabel || c.en || c.label)).join(','),
    ...rows.map((r) => cols.map((c) => csvCell(typeof c.csv === 'function' ? c.csv(r) : r[c.key])).join(',')),
  ];
  // BOM so Excel opens UTF-8 (Urdu names) correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- UI

export function FilterBox({ label, className = 'w-full sm:w-44', children }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

// Report frame: what-this-is hint, filters + actions on screen, printable body inside .print-area.
export function ReportFrame({ title, hint, period, filters, csv, loading, error, children }) {
  const shop = useShop();
  const { t } = useLang();
  const d = useDates();
  return (
    <div>
      {hint && <p className="mb-3 text-base text-slate-600 print:hidden">{hint}</p>}
      <Card className="mb-5 p-4 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">{filters}</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={loading || !!error}>{t('Print')}</Button>
            <Button variant="secondary" icon={Download} onClick={csv} disabled={loading || !!error || !csv}>{t('Save as Excel (CSV)')}</Button>
          </div>
        </div>
      </Card>

      {error ? <ErrorBox error={error} /> : loading ? <Loading /> : (
        <div className="print-area w-full">
          <div className="mb-4 hidden print:block">
            <div className="text-lg font-semibold">{shop.shopName}</div>
            <div className="text-base">{title}</div>
            <div className="text-sm text-slate-600">{period} · {t('Printed {date}', { date: d.dateTime(new Date()) })}</div>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

export function Stats({ children }) {
  return <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;
}

// Generic table: columns = [{ key, en (English title, translated on screen, kept for CSV) | label, render?, align?: 'end'|'center', raw?, className?, csv?, csvLabel? }]
// Cells of end-aligned (number) columns are kept left-to-right with .num unless raw.
export function ReportTable({ columns, rows, rowKey = 'id', empty, footer, title }) {
  const { t } = useLang();
  const align = (c) => (c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start');
  const wrap = (c, v) => (c.align === 'end' && !c.raw && v !== null && v !== undefined && v !== '' ? <span className="num">{v}</span> : v);
  return (
    <Card>
      {title && <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">{title}</div>}
      {!rows.length ? <EmptyState icon={FileBarChart} title={empty || t('Nothing to show for these dates.')} /> : (
        <Table>
          <thead>
            <tr>{columns.map((c) => <Th key={c.key} className={align(c)}>{c.label ?? t(c.en)}</Th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={typeof rowKey === 'function' ? rowKey(r, i) : r[rowKey] ?? i} className="hover:bg-slate-50/60">
                {columns.map((c) => (
                  <Td key={c.key} className={cx(align(c), c.className)}>{wrap(c, c.render ? c.render(r, i) : r[c.key])}</Td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-900">
                {columns.map((c, i) => (
                  <td key={c.key} className={cx('px-4 py-3', align(c))}>{footer[c.key] !== undefined ? wrap(c, footer[c.key]) : (i === 0 ? t('Total') : '')}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </Table>
      )}
    </Card>
  );
}
