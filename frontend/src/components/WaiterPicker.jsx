// Waiter picker for restaurant orders: a button showing the chosen waiter that
// opens a search list. Typing a letter shows every waiter whose name (first
// or any other name) starts with it; arrow keys + Enter pick, Esc closes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Search, UserRound, X } from 'lucide-react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { cx } from './ui';

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// "a" -> names whose any word starts with "a" (first names first), then contains.
export function matchWaiters(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const starts = [];
  const words = [];
  const contains = [];
  for (const w of list) {
    const n = w.name.toLowerCase();
    if (n.startsWith(q)) starts.push(w);
    else if (n.split(/\s+/).some((p) => p.startsWith(q))) words.push(w);
    else if (n.includes(q)) contains.push(w);
  }
  return [...starts, ...words, ...contains];
}

export default function WaiterPicker({ value, onChange, required = false, className }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const wrap = useRef(null);
  const input = useRef(null);
  const waiters = useQuery({ queryKey: ['waiters', 'active'], queryFn: () => api.get('/waiters', { active: 1 }), staleTime: 60_000 });
  const list = waiters.data?.data || [];
  const current = list.find((w) => w.id === value) || null;
  const results = useMemo(() => matchWaiters(list, q), [list, q]);

  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => {
    if (!open) return undefined;
    setTimeout(() => input.current?.focus(), 10);
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (w) => { onChange(w ? w.id : null, w); setOpen(false); setQ(''); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(results.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) pick(results[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  // highlight the typed part: start of the name, else start of a later name part
  const mark = (name) => {
    const qq = q.trim().toLowerCase();
    if (!qq) return name;
    const lower = name.toLowerCase();
    let i = lower.startsWith(qq) ? 0 : -1;
    if (i < 0) { const m = lower.search(new RegExp(`\\s${qq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)); if (m >= 0) i = m + 1; }
    if (i < 0) i = lower.indexOf(qq);
    if (i < 0) return name;
    return <>{name.slice(0, i)}<span className="font-extrabold text-brand-700 underline decoration-brand-300 decoration-2 underline-offset-4">{name.slice(i, i + qq.length)}</span>{name.slice(i + qq.length)}</>;
  };

  return (
    <div ref={wrap} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cx(
          'flex h-12 w-full items-center gap-2.5 rounded-xl border-2 px-3 text-start transition',
          current ? 'border-brand-600/70 bg-brand-50' : required ? 'border-dashed border-amber-400 bg-amber-50/60' : 'border-dashed border-slate-300 hover:border-slate-400',
        )}
      >
        {current ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-brand-ink">{initials(current.name)}</span>
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-500/10 text-slate-500"><UserRound className="size-4" /></span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('Waiter')}</span>
          <span className={cx('block truncate text-[15px] font-semibold leading-tight', current ? 'text-slate-900' : 'text-slate-500')}>{current ? current.name : t('Choose waiter')}</span>
        </span>
        {current ? (
          <span role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); pick(null); }} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700" aria-label={t('Clear')}><X className="size-4" /></span>
        ) : <ChevronDown className="size-4 text-slate-400" />}
      </button>

      {open && (
        <div className="glass-strong absolute inset-x-0 top-14 z-30 animate-pop-in overflow-hidden rounded-2xl" role="listbox">
          <div className="relative border-b border-slate-900/[0.06] p-2">
            <Search className="pointer-events-none absolute start-5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder={t('Type a name or its first letter…')}
              className="h-11 w-full rounded-xl border border-slate-900/10 bg-white/80 ps-9 pe-3 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {waiters.isLoading ? <p className="px-3 py-3 text-sm text-slate-500">{t('Loading…')}</p>
              : !list.length ? <p className="px-3 py-3 text-sm text-slate-500">{t('No waiters yet. Add them on the Waiters page.')}</p>
                : !results.length ? <p className="px-3 py-3 text-sm text-slate-500">{t('No waiter matches "{q}"', { q })}</p>
                  : results.map((w, i) => (
                    <button
                      key={w.id}
                      type="button"
                      role="option"
                      aria-selected={w.id === value}
                      onMouseEnter={() => setHi(i)}
                      onClick={() => pick(w)}
                      className={cx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition', i === hi ? 'bg-brand-50' : 'hover:bg-slate-500/[0.06]')}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-500/10 text-xs font-bold text-slate-700">{initials(w.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-900">{mark(w.name)}</span>
                        {w.open_orders > 0 && <span className="block text-xs text-slate-500">{t('{n} open orders', { n: w.open_orders })}</span>}
                      </span>
                      {w.id === value && <Check className="size-5 text-brand-700" />}
                    </button>
                  ))}
          </div>
        </div>
      )}
    </div>
  );
}
