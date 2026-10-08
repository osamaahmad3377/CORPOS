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
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm shadow-lift" style={{ left, top: y - 10 }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------ area trend

export function TrendChart({ data, height = 240, format, formatTick, formatDate, emptyText, ariaLabel }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, '');
  const pad = { l: 48, r: 14, t: 14, b: 30 };
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const n = data.length;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join('');
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${pad.t + ih}L${x(0).toFixed(1)},${pad.t + ih}Z` : '';
  const empty = !data.some((d) => d.value > 0);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = n <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={ref} className="relative" dir="ltr">
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block touch-none select-none">
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={w - pad.r} y1={y(f * max)} y2={y(f * max)} stroke="var(--color-slate-200)" strokeDasharray={f ? '3 4' : undefined} />
              <text x={pad.l - 8} y={y(f * max)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">{formatTick(f * max)}</text>
            </g>
          ))}
          {data.map((d, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.7)) && (
            <text key={d.key} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-slate-400 text-[11px]">{d.label}</text>
          ))}
          {!empty && (
            <>
              <path d={area} fill={`url(#g${gid})`} />
              <path d={line} fill="none" stroke="var(--color-brand-700)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
          {hover != null && !empty && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-slate-300)" />
              <circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill="var(--color-brand-700)" stroke="var(--chart-surface, #fff)" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {empty && w > 0 && <div className="absolute inset-0 grid place-items-center pb-6 text-sm text-slate-400">{emptyText}</div>}
      {hover != null && !empty && (
        <Tooltip x={x(hover)} y={y(data[hover].value)} width={w}>
          <div className="text-xs font-medium text-slate-500">{formatDate(data[hover])}</div>
          <div className="num mt-0.5 text-base font-bold text-slate-900">{format(data[hover].value)}</div>
          {data[hover].sub && <div className="text-xs text-slate-500">{data[hover].sub}</div>}
        </Tooltip>
      )}
      {/* the same numbers as a table, for screen readers */}
      <table className="sr-only">
        <tbody>{data.map((d) => <tr key={d.key}><td>{formatDate(d)}</td><td>{format(d.value)}</td></tr>)}</tbody>
      </table>
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
                    fill="var(--color-brand-600)"
                    opacity={hover != null && hover !== i ? 0.45 : 1}
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
