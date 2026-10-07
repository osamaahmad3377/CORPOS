// Shared building blocks for the report tabs: a report frame with Print and
// Export CSV, a generic column-driven table, and small date helpers.
import { Download, FileBarChart, Printer } from 'lucide-react';
import { useShop } from '../../lib/shop';
import { dateTime } from '../../lib/format';
import { Button, Card, cx, EmptyState, ErrorBox, Loading, Table, Td, Th } from '../../components/ui';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const thisMonth = () => ymd(new Date()).slice(0, 7);
export const monthStart = () => `${thisMonth()}-01`;

export function prettyDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function shortDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

export function prettyMonth(s) {
  if (!s) return '';
  const [y, m] = s.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
}

export function rangeLabel(start, end) {
  if (start && end) return start === end ? prettyDate(start) : `${prettyDate(start)} – ${prettyDate(end)}`;
  if (start) return `From ${prettyDate(start)}`;
  if (end) return `Up to ${prettyDate(end)}`;
  return 'All time';
}

// ---------------------------------------------------------------- CSV

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, columns, rows) {
  const cols = columns.filter((c) => c.csv !== false);
  const lines = [
    cols.map((c) => csvCell(c.csvLabel || c.label)).join(','),
    ...rows.map((r) => cols.map((c) => csvCell(typeof c.csv === 'function' ? c.csv(r) : r[c.key])).join(',')),
  ];
  // BOM so Excel opens UTF-8 (Urdu names) correctly.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
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
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

// Report frame: filters + actions on screen, printable body inside .print-area.
export function ReportFrame({ title, period, filters, csv, loading, error, children }) {
  const shop = useShop();
  return (
    <div>
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">{filters}</div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={loading || !!error}>Print</Button>
            <Button variant="secondary" icon={Download} onClick={csv} disabled={loading || !!error || !csv}>Export CSV</Button>
          </div>
        </div>
      </Card>

      {error ? <ErrorBox error={error} /> : loading ? <Loading /> : (
        <div className="print-area w-full">
          <div className="mb-4 hidden print:block">
            <div className="text-lg font-semibold">{shop.shopName}</div>
            <div className="text-base">{title}</div>
            <div className="text-sm text-slate-600">{period} · Printed {dateTime(new Date())}</div>
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

// Generic table: columns = [{ key, label, render?, align?, className?, csv? }]
export function ReportTable({ columns, rows, rowKey = 'id', empty = 'Nothing to show for this period.', footer, title }) {
  const align = (c) => (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '');
  return (
    <Card>
      {title && <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">{title}</div>}
      {!rows.length ? <EmptyState icon={FileBarChart} title={empty} /> : (
        <Table>
          <thead>
            <tr>{columns.map((c) => <Th key={c.label} className={align(c)}>{c.label}</Th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={typeof rowKey === 'function' ? rowKey(r, i) : r[rowKey] ?? i} className="hover:bg-slate-50/60">
                {columns.map((c) => (
                  <Td key={c.label} className={cx(align(c), c.className)}>{c.render ? c.render(r, i) : r[c.key]}</Td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-900">
                {columns.map((c, i) => (
                  <td key={c.label} className={cx('px-4 py-3', align(c))}>{footer[c.key] ?? (i === 0 ? 'Total' : '')}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </Table>
      )}
    </Card>
  );
}
