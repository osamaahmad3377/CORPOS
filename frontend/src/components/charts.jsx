// Small SVG charts for the Home overview — no chart library, works offline.
// Colours follow the data-viz method: categorical slots in a fixed order
// (validated for colour-blind safety in light and dark), one series = the
// shop's brand colour, text always in the normal text colours, recessive
// grid, and a hover tooltip on every chart.
import { useId, useLayoutEffect, useState } from 'react';
import { cx } from './ui';

// Categorical slots (blue, orange, aqua, yellow, magenta), light / dark steps.
const SLOTS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
};
const OTHER = { light: '#a8a29e', dark: '#6b6964' };

export function slotColor(i, dark) {
  const s = SLOTS[dark ? 'dark' : 'light'];
  return i < s.length ? s[i] : OTHER[dark ? 'dark' : 'light'];
}
export const otherColor = (dark) => OTHER[dark ? 'dark' : 'light'];

// Pakistani short money for axes: 950, 12k, 1.5L (lakh), 2.3Cr (crore).
// Change in percent, kept short: 12.5%, 140%, >999%.
export function shortPercent(v) {
  const a = Math.abs(Number(v) || 0);
  if (a > 999) return '>999%';
  return `${a >= 100 ? Math.round(a) : Math.round(a * 10) / 10}%`;
}

export function shortMoney(v) {
  const n = Math.abs(Number(v) || 0);
  const f = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
  if (n >= 1e7) return `${f(n / 1e7)}Cr`;
  if (n >= 1e5) return `${f(n / 1e5)}L`;
  if (n >= 1e3) return `${f(n / 1e3)}k`;
  return String(Math.round(n));
}

function niceMax(max) {
  if (!(max > 0)) return 4;
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= rough) * mag;
  return step * 4;
}

// Width of the chart box; a callback ref so it also works when the box only
// appears after the data has loaded.
function useWidth() {
  const [el, setEl] = useState(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!el) return undefined;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

function Tooltip({ x, y, width, children }) {
  // keep the box inside the chart
  const left = Math.min(Math.max(x, 80), Math.max(80, width - 80));
  return (
    <div className="glass-strong pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl px-3 py-2 text-sm" style={{ left, top: y - 10 }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------ smooth lines

// Monotone cubic curve through the points (no overshoot below zero).
export function smoothPath(pts) {
  const n = pts.length;
  if (!n) return '';
  if (n < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  t[n - 1] = m[n - 2];
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1 = [pts[i][0] + dx[i] / 3, pts[i][1] + (t[i] * dx[i]) / 3];
    const c2 = [pts[i + 1][0] - dx[i] / 3, pts[i + 1][1] - (t[i + 1] * dx[i]) / 3];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

// Tiny trend line for a figure card (decorative — the number is printed beside it).
export function Sparkline({ values, height = 44, color = 'var(--color-brand-600)' }) {
  const [ref, w] = useWidth();
  const gid = useId().replace(/:/g, '');
  const max = Math.max(0, ...values);
  const n = values.length;
  const pts = values.map((v, i) => [n <= 1 ? w / 2 : (i * w) / (n - 1), height - 3 - (max ? (v / max) * (height - 8) : 0)]);
  const line = smoothPath(pts);
  return (
    <div ref={ref} aria-hidden dir="ltr">
      {w > 0 && n > 1 && (
        <svg width={w} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id={`s${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line}L${w},${height}L0,${height}Z`} fill={`url(#s${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="3.5" fill={color} stroke="var(--chart-surface, #fff)" strokeWidth="2" />
        </svg>
      )}
    </div>
  );
}

// ------------------------------------------------------------ area trend

// data: [{ key, label, long, value, compare?, sub? }] — this period as a smooth
// brand area, the period before as a dashed grey line.
export function TrendChart({ data, height = 240, format, formatTick, formatDate, emptyText, ariaLabel, labels = {} }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, '');
  const pad = { l: 48, r: 14, t: 16, b: 30 };
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const n = data.length;
  const hasCompare = data.some((d) => d.compare > 0);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value), ...(hasCompare ? data.map((d) => d.compare || 0) : [])));
  const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = smoothPath(data.map((d, i) => [x(i), y(d.value)]));
  const prevLine = hasCompare ? smoothPath(data.map((d, i) => [x(i), y(d.compare || 0)])) : '';
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${pad.t + ih}L${x(0).toFixed(1)},${pad.t + ih}Z` : '';
  const empty = !data.some((d) => d.value > 0) && !hasCompare;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = n <= 1 ? 0 : Math.round(((e.clientX - r.left - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const h = hover != null ? data[hover] : null;
  const delta = h && h.compare > 0 ? Math.round(((h.value - h.compare) / h.compare) * 100) : null;

  return (
    <div>
      {hasCompare && (
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-medium text-slate-500">
          <span className="flex items-center gap-2"><span className="h-[3px] w-4 rounded-full bg-brand-700" />{labels.current}</span>
          <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-slate-400" />{labels.previous}</span>
        </div>
      )}
      <div ref={ref} className="relative" dir="ltr">
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block touch-none select-none">
            <defs>
              <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.32" />
                <stop offset="70%" stopColor="var(--color-brand-600)" stopOpacity="0.06" />
                <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={pad.l} x2={w - pad.r} y1={y(f * max)} y2={y(f * max)} stroke="var(--color-slate-200)" strokeOpacity={f ? 0.7 : 1} strokeDasharray={f ? '2 5' : undefined} />
                <text x={pad.l - 10} y={y(f * max)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">{formatTick(f * max)}</text>
              </g>
            ))}
            {data.map((d, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.7)) && (
              <text key={d.key} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-slate-400 text-[11px]">{d.label}</text>
            ))}
            {!empty && (
              <>
                {prevLine && <path d={prevLine} fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" opacity="0.8" />}
                <path d={area} fill={`url(#g${gid})`} />
                <path d={line} fill="none" stroke="var(--color-brand-700)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            {h && !empty && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-slate-300)" strokeDasharray="3 3" />
                {hasCompare && <circle cx={x(hover)} cy={y(h.compare || 0)} r="4" fill="var(--color-slate-400)" stroke="var(--chart-surface, #fff)" strokeWidth="2" />}
                <circle cx={x(hover)} cy={y(h.value)} r="5.5" fill="var(--color-brand-700)" stroke="var(--chart-surface, #fff)" strokeWidth="2.5" />
              </g>
            )}
          </svg>
        )}
        {empty && w > 0 && <div className="absolute inset-0 grid place-items-center pb-6 text-sm text-slate-400">{emptyText}</div>}
        {h && !empty && (
          <Tooltip x={x(hover)} y={Math.min(y(h.value), hasCompare ? y(h.compare || 0) : Infinity)} width={w}>
            <div className="text-xs font-medium text-slate-500">{formatDate(h)}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-[3px] w-3 rounded-full bg-brand-700" />
              <span className="num text-base font-bold text-slate-900">{format(h.value)}</span>
              {delta != null && <span className={cx('num rounded-full px-1.5 py-0.5 text-[11px] font-semibold', delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>{delta >= 0 ? '+' : '−'}{shortPercent(delta)}</span>}
            </div>
            {hasCompare && <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500"><span className="w-3 border-t-2 border-dashed border-slate-400" /><span className="num">{format(h.compare || 0)}</span> {labels.previousShort}</div>}
            {h.sub && <div className="mt-0.5 text-xs text-slate-500">{h.sub}</div>}
          </Tooltip>
        )}
        {/* the same numbers as a table, for screen readers */}
        <table className="sr-only">
          <tbody>{data.map((d) => <tr key={d.key}><td>{formatDate(d)}</td><td>{format(d.value)}</td><td>{format(d.compare || 0)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ donut

// items: [{ key, label, value, color }]
export function DonutChart({ items, format, totalLabel, emptyText, size = 176, stacked = false }) {
  const [active, setActive] = useState(null);
  const total = items.reduce((a, b) => a + b.value, 0);
  const stroke = 22;
  const r = (size - stroke) / 2 - 3;
  const C = 2 * Math.PI * r;
  const gap = items.length > 1 ? 2.5 : 0; // surface gap between segments
  let offset = 0;
  const shown = active != null ? items.find((i) => i.key === active) : null;

  if (!total) return <div className="grid h-44 place-items-center text-sm text-slate-400">{emptyText}</div>;

  return (
    <div className={cx('flex flex-col items-center gap-5', !stacked && 'sm:flex-row sm:items-center')}>
      <div className="relative shrink-0" style={{ width: size, height: size }} dir="ltr">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={totalLabel}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-slate-100)" strokeWidth={stroke} />
          {items.map((it) => {
            const len = (it.value / total) * C;
            const seg = (
              <circle
                key={it.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={it.color}
                strokeWidth={active === it.key ? stroke + 6 : stroke}
                strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`}
                strokeDashoffset={-offset}
                opacity={active != null && active !== it.key ? 0.35 : 1}
                className="cursor-pointer transition-[stroke-width,opacity] duration-150"
                onMouseEnter={() => setActive(it.key)}
                onMouseLeave={() => setActive(null)}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="max-w-[70%]">
            <div className="truncate text-xs font-medium text-slate-500">{shown ? shown.label : totalLabel}</div>
            <div className="num text-lg font-bold tracking-tight text-slate-900">{format(shown ? shown.value : total)}</div>
            {shown && <div className="num text-xs text-slate-500">{Math.round((shown.value / total) * 100)}%</div>}
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1">
        {items.map((it) => (
          <li
            key={it.key}
            onMouseEnter={() => setActive(it.key)}
            onMouseLeave={() => setActive(null)}
            className={cx('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors', active === it.key && 'bg-slate-100')}
          >
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-700">{it.label}</span>
            <span className="num font-semibold text-slate-900">{format(it.value)}</span>
            <span className="num w-10 text-end text-xs text-slate-500">{Math.round((it.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ ranked bars

// items: [{ key, label, value, sub }] — one series, brand colour, values labelled.
export function BarList({ items, format, emptyText }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!max) return <div className="grid h-44 place-items-center text-sm text-slate-400">{emptyText}</div>;
  return (
    <ul className="space-y-3.5">
      {items.map((it, idx) => (
        <li key={it.key} title={`${it.label}: ${format(it.value)}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="num w-4 shrink-0 text-xs font-semibold text-slate-400">{idx + 1}</span>
              <span className="truncate font-medium text-slate-800">{it.label}</span>
              {it.sub && <span className="num shrink-0 text-xs text-slate-500">{it.sub}</span>}
            </span>
            <span className="num shrink-0 font-semibold text-slate-900">{format(it.value)}</span>
          </div>
          <div className="ms-6 h-2 overflow-hidden rounded-full bg-slate-100" dir="ltr">
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ hour columns

// hours: [{ hour, bills, total }] for 0…23
export function HourBars({ hours, height = 168, format, billsLabel, emptyText, peakText }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, '');
  // show the shop's working day: from the first to the last busy hour (at least 9am–9pm)
  const busy = hours.filter((h) => h.bills > 0).map((h) => h.hour);
  if (!busy.length) return <div className="grid place-items-center text-sm text-slate-400" style={{ height }}>{emptyText}</div>;
  const from = Math.min(9, ...busy);
  const to = Math.max(21, ...busy);
  const list = hours.filter((h) => h.hour >= from && h.hour <= to);
  const max = Math.max(...list.map((h) => h.bills));
  const pad = { b: 22, t: 8 };
  const ih = height - pad.b - pad.t;
  const slot = w / list.length;
  const bw = Math.max(4, Math.min(22, slot - 4));
  const rr = Math.min(4, bw / 2); // rounded top, flat on the baseline
  const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  const peak = list.reduce((a, h) => (h.bills > a.bills ? h : a), list[0]);

  return (
    <div ref={ref} className="relative" dir="ltr">
      {w > 0 && (
        <svg width={w} height={height} className="block select-none" onMouseLeave={() => setHover(null)} role="img" aria-label={billsLabel}>
          <defs>
            <linearGradient id={`hb${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-600)" />
              <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <line x1="0" x2={w} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--color-slate-200)" />
          {list.map((h, i) => {
            const bh = h.bills ? Math.max(4, (h.bills / max) * ih) : 0;
            const cx0 = i * slot + slot / 2;
            return (
              <g key={h.hour} onMouseEnter={() => setHover(i)}>
                <rect x={i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
                {bh > 0 && (
                  <path
                    d={`M${cx0 - bw / 2},${pad.t + ih}V${pad.t + ih - bh + rr}q0,-${rr} ${rr},-${rr}h${bw - 2 * rr}q${rr},0 ${rr},${rr}V${pad.t + ih}Z`}
                    fill={h.hour === peak.hour ? 'var(--color-brand-700)' : `url(#hb${gid})`}
                    opacity={hover != null && hover !== i ? 0.4 : 1}
                    className="transition-opacity"
                  />
                )}
                {(h.hour % 3 === 0) && <text x={cx0} y={height - 6} textAnchor="middle" className="fill-slate-400 text-[11px]">{hourLabel(h.hour)}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {peakText && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600" dir="auto">
          <span className="size-2 shrink-0 rounded-full bg-brand-600" />
          {peakText(`${hourLabel(peak.hour)} – ${hourLabel((peak.hour + 1) % 24)}`, peak.bills)}
        </p>
      )}
      {hover != null && (
        <Tooltip x={hover * slot + slot / 2} y={pad.t + ih - (list[hover].bills / max) * ih} width={w}>
          <div className="text-xs font-medium text-slate-500">{hourLabel(list[hover].hour)} – {hourLabel((list[hover].hour + 1) % 24)}</div>
          <div className="num mt-0.5 font-bold text-slate-900">{list[hover].bills} {billsLabel}</div>
          <div className="num text-xs text-slate-500">{format(list[hover].total)}</div>
        </Tooltip>
      )}
    </div>
  );
}
