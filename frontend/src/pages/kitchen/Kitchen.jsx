// Kitchen screen: every open order as a big card, oldest first, so the cooks
// see what to make. Refreshes by itself; "Start cooking" / "Ready" tell the
// waiters (the Tables screen shows the same status).
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Clock, CookingPot, CheckCircle2, Maximize2, ShoppingBag, Truck, UtensilsCrossed } from 'lucide-react';
import { api } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { qty, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import { Button, EmptyState, Loading, PageHeader, cx, useToast } from '../../components/ui';

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(h); }, [ms]);
  return now;
}

const FILTERS = [
  { key: 'all', label: 'All open orders' },
  { key: 'new', label: 'New' },
  { key: 'preparing', label: 'Cooking' },
  { key: 'ready', label: 'Ready' },
];

export default function Kitchen() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const now = useNow();
  const [filter, setFilter] = useState('all');
  const orders = useQuery({ queryKey: ['kitchen'], queryFn: () => api.get('/kitchen/orders'), refetchInterval: 10_000, select: (r) => r.data || [] });

  const setStatus = useMutation({
    mutationFn: ({ inv, status }) => api.post(`/kitchen/orders/${inv}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kitchen'] }); qc.invalidateQueries({ queryKey: ['sales', 'held'] }); },
    onError: (e) => toast(e.message, 'error'),
  });

  const list = (orders.data || []).filter((o) => filter === 'all' || o.kitchen_status === filter);
  const count = (k) => (orders.data || []).filter((o) => k === 'all' || o.kitchen_status === k).length;

  return (
    <Page className="max-w-none">
      <PageHeader
        title={t('Kitchen screen')}
        subtitle={t('New orders appear here by themselves. Press Ready when the food is done.')}
        actions={<Button variant="secondary" icon={Maximize2} onClick={() => document.documentElement.requestFullscreen?.()}>{t('Full screen')}</Button>}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cx('rounded-full border-2 px-4 py-1.5 text-base font-semibold', filter === f.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700')}>
            {t(f.label)} <span className="num ms-1 opacity-80">{count(f.key)}</span>
          </button>
        ))}
      </div>

      {orders.isLoading ? <Loading /> : !list.length ? (
        <EmptyState icon={ChefHat} title={t('No orders to cook')}>{t('When a waiter presses "Kitchen" on the Sell screen, the order shows up here.')}</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((o) => {
            const mins = Math.max(0, Math.round((now - new Date(o.created_at).getTime()) / 60000));
            const late = mins >= 20 ? 'border-red-500' : mins >= 10 ? 'border-amber-400' : 'border-slate-200';
            const TypeIcon = o.order_type === 'delivery' ? Truck : o.order_type === 'takeaway' ? ShoppingBag : UtensilsCrossed;
            return (
              <div key={o.invoice_number} className={cx('flex flex-col rounded-2xl border-[3px] bg-white shadow-sm', o.kitchen_status === 'ready' ? 'border-emerald-500' : late)}>
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
                  <div>
                    <div className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
                      <TypeIcon className="size-6 text-brand-600" />
                      {o.table_no ? t('Table {n}', { n: o.table_no }) : t(o.order_type === 'delivery' ? 'Delivery' : 'Takeaway')}
                    </div>
                    <div className="num text-sm text-slate-500">{o.invoice_number}{o.waiter ? ` · ${o.waiter}` : ''}</div>
                  </div>
                  <span className={cx('flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold', mins >= 20 ? 'bg-red-100 text-red-700' : mins >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')}>
                    <Clock className="size-4" /><span className="num">{t('{n} min', { n: mins })}</span>
                  </span>
                </div>
                <ul className="flex-1 space-y-2 p-4">
                  {o.items.map((it) => (
                    <li key={it.id} className="flex items-start gap-3 text-lg">
                      <span className="num min-w-10 rounded-lg bg-slate-900 px-2 text-center font-extrabold text-white">{qty(it.quantity)}</span>
                      <span className="font-semibold leading-snug text-slate-900">{it.name}{variantLabel(it) && <span className="font-normal text-slate-500"> · {variantLabel(it)}</span>}</span>
                    </li>
                  ))}
                </ul>
                {o.notes && <div className="mx-4 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-base font-medium text-amber-900">{t('Note')}: {o.notes}</div>}
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
                  <Button size="lg" variant={o.kitchen_status === 'preparing' ? 'primary' : 'secondary'} icon={CookingPot} disabled={o.kitchen_status === 'preparing'} onClick={() => setStatus.mutate({ inv: o.invoice_number, status: 'preparing' })}>{t('Start cooking')}</Button>
                  <Button size="lg" variant="success" icon={CheckCircle2} disabled={o.kitchen_status === 'ready'} onClick={() => setStatus.mutate({ inv: o.invoice_number, status: 'ready' })}>{t('Ready')}</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
