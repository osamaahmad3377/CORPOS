import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Lock, Plus, Settings2 } from 'lucide-react';
import { api, switchBusiness } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { cx, useToast } from './ui';

// Logo of a business, or its first letter on its own brand colour.
export function BusinessBadge({ b, className = 'size-10' }) {
  if (b.logo_url) return <img src={b.logo_url} alt="" className={cx(className, 'shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-0.5')} />;
  return (
    <span className={cx(className, 'grid shrink-0 place-items-center rounded-lg text-sm font-bold text-white')} style={{ background: b.brand_color || '#1bd173' }}>
      {(b.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function useBusinesses() {
  return useQuery({ queryKey: ['businesses'], queryFn: () => api.get('/businesses'), staleTime: 60_000 });
}

// Top-bar switch between the businesses on this computer (e.g. Mart ⇄
// Restaurant). Two businesses: a toggle. One or more than two: a drop-down
// list — with only one, admins still see it so "Add another business" is
// easy to find.
export default function BusinessSwitcher() {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const { data } = useBusinesses();
  const [opening, setOpening] = useState(null);
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  const list = data?.data || [];

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  if (list.length === 0 || (list.length === 1 && !can('settings.manage'))) return null;
  const current = list.find((b) => b.current) || list[0];

  const open = async (b) => {
    setMenu(false);
    if (b.current || opening) return;
    if (!b.can_open) { toast(t('You do not have an account in that business. Ask the owner to add you there.'), 'error'); return; }
    setOpening(b);
    try {
      await switchBusiness(b.id);
    } catch (e) {
      setOpening(null);
      toast(e.message, 'error');
    }
  };

  const overlay = opening && (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-white/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 text-center">
        <BusinessBadge b={opening} className="size-16" />
        <span className="flex items-center gap-2 text-lg font-semibold text-slate-800"><Loader2 className="size-5 animate-spin text-brand-700" />{t('Opening {name}…', { name: opening.name })}</span>
      </div>
    </div>
  );

  if (list.length === 2) {
    return (
      <>
        <div className="flex h-11 items-center gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={t('Business')}>
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={b.current}
              onClick={() => open(b)}
              title={b.name}
              className={cx(
                'flex h-9 items-center gap-2 rounded-lg px-1.5 text-sm font-semibold transition sm:px-2',
                b.current ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800',
              )}
            >
              <BusinessBadge b={b} className={cx('size-7', !b.current && 'opacity-70')} />
              <span className="hidden max-w-32 truncate md:inline">{b.name}</span>
              {!b.can_open && <Lock className="size-3.5 text-slate-400" />}
            </button>
          ))}
        </div>
        {overlay}
      </>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
        <BusinessBadge b={current} className="size-7" />
        <span className="hidden max-w-40 truncate md:inline">{current.name}</span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>
      {menu && (
        <div className="absolute start-0 top-12 z-50 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{t(list.length > 1 ? 'Switch business' : 'Your business')}</p>
          {list.map((b) => (
            <button key={b.id} type="button" onClick={() => open(b)} className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start hover:bg-slate-50', b.current && 'bg-brand-50')}>
              <BusinessBadge b={b} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900">{b.name}</span>
                <span className="block truncate text-xs text-slate-500">{t(b.type_label)}</span>
              </span>
              {b.current ? <Check className="size-5 text-brand-700" /> : !b.can_open && <Lock className="size-4 text-slate-400" />}
            </button>
          ))}
          {can('settings.manage') && (
            <div className="mt-1 border-t border-slate-100 pt-1">
              <Link to="/settings/businesses" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                <Plus className="size-4" />{t('Add another business')}
              </Link>
              {list.length > 1 && (
                <Link to="/settings/businesses" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  <Settings2 className="size-4" />{t('Manage businesses')}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
      {overlay}
    </div>
  );
}
