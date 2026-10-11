// Delivery order details on the Sell screen: phone first — a returning
// customer's name, address and area fill in by themselves — then the area,
// which sets the delivery charge (the cashier can still change it).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, History, MapPin, Pencil, Phone, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { useShop } from '../lib/shop';
import { useT } from '../lib/i18n';
import { cx } from './ui';

const box = 'h-11 w-full rounded-xl border bg-white text-[15px] text-slate-900 shadow-xs transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15';

export const digits = (p) => String(p || '').replace(/[^\d+]/g, '');

// `folded`: once the bill has items the card shrinks to one line (tap to edit),
// so the items stay visible on small screens.
export default function DeliveryDetails({ order, onChange, missing, folded = false, customer, onCustomer }) {
  const t = useT();
  const shop = useShop();
  const set = (patch) => onChange((o) => ({ ...o, ...patch }));
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!folded) setOpen(false); }, [folded]);
  const [phoneQ, setPhoneQ] = useState('');
  useEffect(() => { const h = setTimeout(() => setPhoneQ(digits(order.phone)), 400); return () => clearTimeout(h); }, [order.phone]);
  const known = useQuery({
    queryKey: ['deliveries', 'lookup', phoneQ],
    queryFn: () => api.get('/deliveries/lookup', { phone: phoneQ }),
    enabled: phoneQ.replace('+', '').length >= 10,
    staleTime: 60_000,
  });
  const k = known.data?.found ? known.data : null;

  // a returning customer: fill what the cashier hasn't typed yet
  useEffect(() => {
    if (!k) return;
    // a saved customer: link the bill (loyalty points, udhaar)
    if (k.customer && !customer && onCustomer) onCustomer(k.customer);
    onChange((o) => {
      const area = !o.area && k.area && shop.deliveryAreas.find((a) => a.name === k.area);
      return {
        ...o,
        name: o.name || k.name || '',
        address: o.address || k.address || '',
        ...(area ? { area: area.name, fee: String(area.fee) } : {}),
      };
    });
  }, [k?.name, k?.address, k?.area]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickArea = (name) => {
    const a = shop.deliveryAreas.find((x) => x.name === name);
    set({ area: name, ...(a ? { fee: String(a.fee) } : {}) });
  };
  const need = (v) => missing && !String(v || '').trim();

  if (folded && !open && !missing) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-blue-200/70 bg-blue-50/50 px-3 py-2 text-start transition hover:bg-blue-50 dark:border-blue-400/20 dark:bg-blue-400/[0.06]">
        <MapPin className="size-5 shrink-0 text-blue-600" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{order.name || t('Customer')}<span className="num ms-2 font-normal text-slate-500" dir="ltr">{order.phone}</span></span>
          <span className="block truncate text-xs text-slate-500">{[order.address, order.area].filter(Boolean).join(' · ') || t('No address')}</span>
        </span>
        <Pencil className="size-4 shrink-0 text-slate-400" />
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-blue-200/70 bg-blue-50/50 p-2.5 dark:border-blue-400/20 dark:bg-blue-400/[0.06]">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Phone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input type="tel" inputMode="tel" dir="ltr" value={order.phone} onChange={(e) => set({ phone: e.target.value })} placeholder={t('Phone')} aria-label={t('Customer phone')} className={cx(box, 'num ps-9 pe-2', need(order.phone) ? 'border-amber-400' : 'border-slate-200')} />
        </label>
        <label className="relative min-w-0 flex-1">
          <UserRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={order.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('Customer name')} aria-label={t('Customer name')} className={cx(box, 'ps-9 pe-2 border-slate-200')} />
        </label>
      </div>
      {(k || (folded && open)) && (
        <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-blue-800 dark:text-blue-300">
          {k && <><History className="size-3.5" />{k.orders > 0 ? t('Returning customer · {n} orders before', { n: k.orders }) : t('Known customer')}</>}
          {folded && open && <button type="button" onClick={() => setOpen(false)} className="ms-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-500 hover:bg-white/70">{t('Done')}<ChevronDown className="size-3.5 rotate-180" /></button>}
        </div>
      )}
      <label className="relative block">
        <MapPin className="pointer-events-none absolute start-3 top-3 size-4 text-slate-400" />
        <input value={order.address} onChange={(e) => set({ address: e.target.value })} placeholder={t('Full address — house, street, landmark')} aria-label={t('Delivery address')} className={cx(box, 'ps-9 pe-2', need(order.address) ? 'border-amber-400' : 'border-slate-200')} />
      </label>
      <div className="flex gap-2">
        {shop.deliveryAreas.length > 0 ? (
          <select value={order.area} onChange={(e) => pickArea(e.target.value)} aria-label={t('Area')} className={cx(box, 'min-w-0 flex-1 border-slate-200 px-2')}>
            <option value="">{t('Area…')}</option>
            {shop.deliveryAreas.map((a) => <option key={a.name} value={a.name}>{a.name}{a.fee > 0 ? ` — Rs ${a.fee}` : ''}</option>)}
          </select>
        ) : (
          <input value={order.area} onChange={(e) => set({ area: e.target.value })} placeholder={t('Area (optional)')} aria-label={t('Area')} className={cx(box, 'min-w-0 flex-1 border-slate-200 px-3')} />
        )}
        <label className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white ps-2.5 shadow-xs focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
          <span className="text-xs font-semibold text-slate-500">{t('Delivery Rs')}</span>
          <input type="number" min="0" step="1" value={order.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="0" aria-label={t('Delivery charge')} className="num h-11 w-16 rounded-e-xl bg-transparent pe-2 text-end text-[15px] font-semibold outline-none" />
        </label>
      </div>
    </div>
  );
}
