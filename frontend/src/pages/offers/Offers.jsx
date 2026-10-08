// Offers & loyalty: automatic discounts the Sell screen gives by itself, and
// loyalty points customers collect. Offers: /api/v1/promotions. Points rules
// live in the `loyalty` settings group (GET / PUT /settings).
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Gift, Pencil, Plus, Power, Search, Star, Tag, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { useCategories } from '../../lib/catalog';
import { date, money, today } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, cx, useConfirm, useToast,
} from '../../components/ui';
import { rich } from '../sales/salesShared';

export default function Offers() {
  const t = useT();
  const tab = ({ isActive }) => cx(
    'inline-flex min-h-12 items-center gap-2 rounded-lg px-4 text-base font-medium transition-colors',
    isActive ? 'glass-tile text-brand-700' : 'text-slate-600 hover:bg-slate-500/10',
  );
  return (
    <Page>
      <PageHeader
        title={t('Offers & loyalty')}
        subtitle={t('Discounts the Sell screen gives by itself, and points your customers collect when they buy.')}
      />
      <nav className="mb-5 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        <NavLink to="/offers" end className={tab}><BadgePercent className="size-5" />{t('Offers')}</NavLink>
        <NavLink to="/offers/loyalty" className={tab}><Star className="size-5" />{t('Loyalty points')}</NavLink>
      </nav>
      <Routes>
        <Route index element={<OfferList />} />
        <Route path="loyalty" element={<LoyaltyTab />} />
      </Routes>
    </Page>
  );
}

// ---------------------------------------------------------------- offers

const STATUS = {
  active: { label: 'Running now', color: 'green' },
  scheduled: { label: 'Starts later', color: 'blue' },
  expired: { label: 'Ended', color: 'red' },
  off: { label: 'Switched off', color: 'gray' },
};

const n2 = (v) => String(Math.round(Number(v || 0) * 100) / 100);

// "15% off" / "Rs 20 off each" / "Buy 2, get 1 free"
function offerText(o, t) {
  if (o.type === 'percent') return t('{n}% off', { n: n2(o.value) });
  if (o.type === 'fixed') return rich(t('{amount} off each'), { amount: <span className="num">{money(o.value)}</span> });
  return t('Buy {x}, get {y} free', { x: o.buy_qty || '?', y: o.get_qty || '?' });
}

function itemsText(o, t) {
  if (o.applies_to === 'category') return o.category ? t('Category: {name}', { name: o.category }) : t('One category');
  if (o.applies_to === 'product') return o.product ? t('Item: {name}', { name: o.product }) : t('One item');
  return t('All items');
}

function datesText(o, t) {
  const from = o.starts_at ? date(o.starts_at) : null;
  const to = o.ends_at ? date(o.ends_at) : null;
  if (from && to) return rich(t('From {from} to {to}'), { from: <span className="num">{from}</span>, to: <span className="num">{to}</span> });
  if (from) return rich(t('From {from}, no end date'), { from: <span className="num">{from}</span> });
  if (to) return rich(t('Until {to}'), { to: <span className="num">{to}</span> });
  return t('No end date');
}

function OfferList() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null); // {} = new
  const list = useQuery({ queryKey: ['promotions'], queryFn: () => api.get('/promotions'), select: (r) => r.data || [] });
  const all = list.data || [];
  const rows = filter ? all.filter((o) => (filter === 'active' ? o.status === 'active' || o.status === 'scheduled' : o.status === 'expired' || o.status === 'off')) : all;
  const running = all.filter((o) => o.status === 'active').length;

  const toggle = useMutation({
    mutationFn: (o) => api.put(`/promotions/${o.id}`, { ...toBody(o), is_active: !o.is_active }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['promotions'] }); toast(res.data.is_active ? t('Offer switched on') : t('Offer switched off')); },
    onError: (err) => toast(err.message, 'error'),
  });

  const remove = async (o) => {
    if (!(await confirm({ title: t('Delete this offer?'), message: t('"{name}" will stop at once. Old bills keep showing it.', { name: o.name }), danger: true, confirmLabel: t('Delete') }))) return;
    try {
      await api.del(`/promotions/${o.id}`);
      qc.invalidateQueries({ queryKey: ['promotions'] });
      toast(t('Offer deleted'));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const chip = (key, label) => (
    <button type="button" onClick={() => setFilter(key)} className={cx('min-h-11 rounded-full px-4 text-sm font-medium ring-1 ring-inset', filter === key ? 'bg-brand-600 text-brand-ink ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>{label}</button>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-slate-600">
          {running > 0 ? t('{n} offer(s) running now. The Sell screen takes them off the bill by itself.', { n: running }) : t('No offer is running right now.')}
        </p>
        <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add offer')}</Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          {chip('', t('All offers'))}
          {chip('active', t('Running or starting later'))}
          {chip('old', t('Ended or switched off'))}
        </div>
        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState
            icon={Gift}
            title={all.length ? t('No offers here') : t('No offers yet')}
            action={!all.length && <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Make your first offer')}</Button>}
          >
            {all.length ? t('Try another filter above.') : t('Make an offer like "10% off all soaps" or "Buy 2, get 1 free". The Sell screen gives it by itself.')}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((o) => {
              const st = STATUS[o.status] || STATUS.off;
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
                  <div className={cx('grid size-12 shrink-0 place-items-center rounded-xl', o.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400')}>
                    {o.type === 'buy_x_get_y' ? <Gift className="size-6" /> : <Tag className="size-6" />}
                  </div>
                  <div className="min-w-56 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-slate-900">{o.name}</span>
                      <Badge color={st.color} className="text-sm">{t(st.label)}</Badge>
                    </div>
                    <div className="mt-1 text-[15px] text-slate-700"><span className="font-medium text-brand-700">{offerText(o, t)}</span> · {itemsText(o, t)}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {datesText(o, t)}
                      {o.times_used > 0 && <> · {rich(t('Given on {n} bill line(s)'), { n: <span className="num">{o.times_used}</span> })}</>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" icon={Pencil} onClick={() => setEditing(o)}>{t('Edit')}</Button>
                    <Button variant="secondary" icon={Power} loading={toggle.isPending && toggle.variables?.id === o.id} onClick={() => toggle.mutate(o)}>{o.is_active ? t('Switch off') : t('Switch on')}</Button>
                    <Button variant="ghost" icon={Trash2} className="text-red-600 hover:bg-red-50" onClick={() => remove(o)}>{t('Delete')}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && <OfferForm offer={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function toBody(o) {
  return {
    name: o.name,
    type: o.type,
    value: o.type === 'buy_x_get_y' ? undefined : Number(o.value),
    buy_qty: o.type === 'buy_x_get_y' ? Number(o.buy_qty) : undefined,
    get_qty: o.type === 'buy_x_get_y' ? Number(o.get_qty) : undefined,
    applies_to: o.applies_to,
    category_id: o.applies_to === 'category' ? Number(o.category_id) || null : undefined,
    product_id: o.applies_to === 'product' ? Number(o.product_id) || null : undefined,
    starts_at: o.starts_at || null,
    ends_at: o.ends_at || null,
    is_active: !!o.is_active,
  };
}

function Choice({ active, onClick, icon: Icon, title, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx('flex min-h-16 items-start gap-3 rounded-xl border-2 p-3 text-start transition-colors', active ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300')}
    >
      {Icon && <Icon className={cx('mt-0.5 size-6 shrink-0', active ? 'text-brand-700' : 'text-slate-400')} />}
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        {hint && <span className="mt-0.5 block text-sm text-slate-500">{hint}</span>}
      </span>
    </button>
  );
}

const EMPTY_OFFER = { name: '', type: 'percent', value: '', buy_qty: '2', get_qty: '1', applies_to: 'all', category_id: '', product_id: '', product: '', starts_at: '', ends_at: '', is_active: true };

function OfferForm({ offer, onClose }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const categories = useCategories();
  const isNew = !offer.id;
  const [f, setF] = useState(() => (isNew ? { ...EMPTY_OFFER, starts_at: today() } : {
    ...EMPTY_OFFER,
    ...offer,
    value: offer.type === 'buy_x_get_y' ? '' : n2(offer.value),
    buy_qty: offer.buy_qty ? String(offer.buy_qty) : '2',
    get_qty: offer.get_qty ? String(offer.get_qty) : '1',
    category_id: offer.category_id ? String(offer.category_id) : '',
    product_id: offer.product_id || '',
    product: offer.product || '',
    starts_at: offer.starts_at || '',
    ends_at: offer.ends_at || '',
  }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pick = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body = toBody({ ...f, name: f.name.trim() });
      return isNew ? api.post('/promotions', body) : api.put(`/promotions/${offer.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] });
      toast(isNew ? t('Offer saved') : t('Offer updated'));
      onClose();
    },
  });
  const errs = save.error?.errors || {};
  const err = (k) => (errs[k]?.[0] ? t(errs[k][0]) : null);

  const valueOk = f.type === 'buy_x_get_y' ? Number(f.buy_qty) >= 1 && Number(f.get_qty) >= 1 : Number(f.value) > 0 && (f.type !== 'percent' || Number(f.value) <= 100);
  const targetOk = f.applies_to === 'all' || (f.applies_to === 'category' ? !!f.category_id : !!f.product_id);
  const datesOk = !f.starts_at || !f.ends_at || f.ends_at >= f.starts_at;
  const canSave = f.name.trim() && valueOk && targetOk && datesOk;
  const preview = { ...f, category: (categories.data || []).find((c) => String(c.id) === String(f.category_id))?.path };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? t('New offer') : t('Change offer — {name}', { name: offer.name })}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="offer-form" size="lg" loading={save.isPending} disabled={!canSave}>{t('Save offer')}</Button>
        </>
      )}
    >
      <form id="offer-form" className="space-y-6" onSubmit={(e) => { e.preventDefault(); if (canSave) save.mutate(); }}>
        {save.error && !Object.keys(errs).length && <ErrorBox error={save.error} />}

        <Field label={t('Offer name')} required error={err('name')} hint={t('Shown on the bill next to the item.')}>
          <Input autoFocus maxLength={255} value={f.name} onChange={set('name')} placeholder={t('e.g. Eid sale, Soap buy 2 get 1')} />
        </Field>

        <section>
          <h3 className="mb-2 font-semibold text-slate-800">{t('What kind of offer?')}</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Choice active={f.type === 'percent'} onClick={() => pick('type', 'percent')} icon={BadgePercent} title={t('Percent off')} hint={t('e.g. 10% off')} />
            <Choice active={f.type === 'fixed'} onClick={() => pick('type', 'fixed')} icon={Tag} title={t('Rs off')} hint={t('e.g. Rs 20 off each item')} />
            <Choice active={f.type === 'buy_x_get_y'} onClick={() => pick('type', 'buy_x_get_y')} icon={Gift} title={t('Buy X, get Y free')} hint={t('e.g. buy 2, get 1 free')} />
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {f.type === 'percent' && (
              <Field label={t('How many percent off?')} required error={err('value')}>
                <div className="relative">
                  <Input type="number" min="0.01" max="100" step="0.01" className="h-12 pe-10 text-lg" value={f.value} onChange={set('value')} placeholder="10" />
                  <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">%</span>
                </div>
              </Field>
            )}
            {f.type === 'fixed' && (
              <Field label={t('How many rupees off each item?')} required error={err('value')} hint={t('For items sold by weight or length, this is per kg / litre / metre.')}>
                <Input type="number" min="0.01" step="0.01" className="h-12 text-lg" value={f.value} onChange={set('value')} placeholder="20" />
              </Field>
            )}
            {f.type === 'buy_x_get_y' && (
              <>
                <Field label={t('Customer buys')} required error={err('buy_qty')}>
                  <Input type="number" min="1" step="1" className="h-12 text-lg" value={f.buy_qty} onChange={set('buy_qty')} />
                </Field>
                <Field label={t('and gets this many free')} required error={err('get_qty')}>
                  <Input type="number" min="1" step="1" className="h-12 text-lg" value={f.get_qty} onChange={set('get_qty')} />
                </Field>
                <p className="text-sm text-slate-500 sm:col-span-2">{t('The free pieces must be the same item, on the same bill line.')}</p>
              </>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold text-slate-800">{t('On which items?')}</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Choice active={f.applies_to === 'all'} onClick={() => pick('applies_to', 'all')} title={t('All items')} hint={t('Everything in the shop')} />
            <Choice active={f.applies_to === 'category'} onClick={() => pick('applies_to', 'category')} title={t('A category')} hint={t('e.g. all soaps')} />
            <Choice active={f.applies_to === 'product'} onClick={() => pick('applies_to', 'product')} title={t('One item')} hint={t('Only this one item')} />
          </div>
          <div className="mt-3">
            {f.applies_to === 'category' && (
              <Field label={t('Which category?')} required error={err('category_id')} hint={t('Its smaller categories are included too.')}>
                <Select value={f.category_id} onChange={set('category_id')}>
                  <option value="">{t('Choose…')}</option>
                  {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
                </Select>
              </Field>
            )}
            {f.applies_to === 'product' && (
              <Field label={t('Which item?')} required error={err('product_id')}>
                <ProductPicker value={f.product_id ? { id: f.product_id, name: f.product } : null} onChange={(p) => setF((x) => ({ ...x, product_id: p?.id || '', product: p?.name || '' }))} />
              </Field>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold text-slate-800">{t('When?')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Starts on')} hint={t('Leave empty to start now')} error={err('starts_at')}><Input type="date" value={f.starts_at} onChange={set('starts_at')} /></Field>
            <Field label={t('Ends on (last day)')} hint={t('Leave empty for no end date')} error={err('ends_at') || (!datesOk ? t('The end date must be on or after the start date.') : null)}><Input type="date" value={f.ends_at} min={f.starts_at || undefined} onChange={set('ends_at')} /></Field>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-3 text-[15px] text-slate-800">
            <input type="checkbox" className="size-5 accent-brand-600" checked={!!f.is_active} onChange={(e) => pick('is_active', e.target.checked)} />
            {t('Offer is switched on')}
          </label>
        </section>

        {valueOk && targetOk && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[15px] text-emerald-900">
            <span className="font-semibold">{t('The customer gets:')}</span> {offerText(preview, t)} · {itemsText(preview, t)}
            {f.type === 'buy_x_get_y' && <div className="mt-1 text-sm">{t('Example: {n} pieces on the bill = {free} free.', { n: (Number(f.buy_qty) + Number(f.get_qty)) * 2, free: Number(f.get_qty) * 2 })}</div>}
            <div className="mt-1 text-sm text-emerald-800">{t('If two offers fit one item, the customer gets the bigger one.')}</div>
          </div>
        )}
      </form>
    </Modal>
  );
}

// Search /products and pick one.
function ProductPicker({ value, onChange }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const h = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(h); }, [q]);
  const res = useQuery({ queryKey: ['products', 'offer-pick', term], queryFn: () => api.get('/products', { search: term, per_page: 8 }), enabled: term.length > 0, select: (r) => r.data || [] });

  if (value) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3">
        <span className="font-medium text-slate-900">{value.name}</span>
        <Button variant="ghost" size="sm" icon={X} onClick={() => onChange(null)}>{t('Change')}</Button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
        <Input className="h-12 ps-10" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTerm(q.trim()); } }} placeholder={t('Type the item name or scan its barcode')} />
      </div>
      {term && (
        <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200">
          {res.isLoading ? <Loading /> : !res.data?.length ? <p className="px-3 py-3 text-sm text-slate-500">{t('No matching items')}</p> : res.data.map((p) => (
            <button key={p.id} type="button" onClick={() => onChange({ id: p.id, name: p.name })} className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-start last:border-0 hover:bg-slate-50">
              <span className="font-medium text-slate-900">{p.name}</span>
              <span className="text-sm text-slate-500">{p.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- loyalty

function LoyaltyTab() {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can('settings.manage');
  const saved = shop.settings?.loyalty || {};
  const initial = useMemo(() => ({
    enabled: saved.enabled === '1',
    points_per_100: saved.points_per_100 ?? '1',
    point_value: saved.point_value ?? '1',
    min_redeem: saved.min_redeem ?? '100',
  }), [saved.enabled, saved.points_per_100, saved.point_value, saved.min_redeem]);
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: () => api.put('/settings', { loyalty: {
      enabled: f.enabled ? '1' : '0',
      points_per_100: String(Number(f.points_per_100 || 0)),
      point_value: String(Number(f.point_value || 0)),
      min_redeem: String(Math.max(0, Math.floor(Number(f.min_redeem || 0)))),
    } }),
    onSuccess: (res) => {
      qc.setQueryData(['settings'], res);
      shop.refetchSettings?.();
      toast(t('Points settings saved'));
    },
  });

  const per100 = Number(f.points_per_100 || 0);
  const worth = Number(f.point_value || 0);
  const min = Math.max(0, Math.floor(Number(f.min_redeem || 0)));
  const spend = 1000;
  const earned = Math.floor((spend / 100) * per100 + 1e-9);
  const errs = save.error?.errors || {};
  const err = (k) => (errs[`loyalty.${k}`]?.[0] ? t(errs[`loyalty.${k}`][0]) : null);
  const inline = 'num mx-1 inline-block h-12 w-24 rounded-lg border border-slate-300 bg-white px-2 text-center text-lg font-semibold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100';

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title={t('Loyalty points')} subtitle={t('Customers collect points when they buy, and later use them as money off their bill.')} />
        <form className="space-y-6 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {save.error && !Object.keys(errs).length && <ErrorBox error={save.error} />}
          {!canEdit && <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{t('Only the shop owner can change these settings.')}</div>}

          <label className="flex cursor-pointer items-start gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={f.enabled}
              disabled={!canEdit}
              onClick={() => setF((x) => ({ ...x, enabled: !x.enabled }))}
              className={cx('relative mt-0.5 inline-flex h-8 w-14 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', f.enabled ? 'bg-brand-600' : 'bg-slate-300')}
            >
              <span className="absolute top-1 size-6 rounded-full bg-white shadow transition-all" style={{ insetInlineStart: f.enabled ? 'calc(100% - 1.5rem - 4px)' : 4 }} />
            </button>
            <span>
              <span className="block text-base font-semibold text-slate-900">{t('Give points to customers')}</span>
              <span className="block text-sm text-slate-500">{t('Points are given only when a saved customer is chosen on the bill.')}</span>
            </span>
          </label>

          <fieldset disabled={!canEdit} className={cx('space-y-5', !f.enabled && 'opacity-60')}>
            <div>
              <div className="text-[17px] leading-loose text-slate-800">
                {rich(t('Customer gets {input} point(s) for every Rs 100'), { input: <input type="number" min="0" max="100" step="0.1" className={inline} value={f.points_per_100} onChange={set('points_per_100')} aria-label={t('Points for every Rs 100')} /> })}
              </div>
              {err('points_per_100') && <span className="text-xs text-red-600">{err('points_per_100')}</span>}
            </div>
            <div>
              <div className="text-[17px] leading-loose text-slate-800">
                {rich(t('1 point = Rs {input}'), { input: <input type="number" min="0" max="1000" step="0.01" className={inline} value={f.point_value} onChange={set('point_value')} aria-label={t('Value of 1 point in Rs')} /> })}
              </div>
              {err('point_value') && <span className="text-xs text-red-600">{err('point_value')}</span>}
            </div>
            <div>
              <div className="text-[17px] leading-loose text-slate-800">
                {rich(t('Minimum points to use: {input}'), { input: <input type="number" min="0" step="1" className={inline} value={f.min_redeem} onChange={set('min_redeem')} aria-label={t('Minimum points to use')} /> })}
              </div>
              <p className="text-sm text-slate-500">{t('A customer can use points only after collecting at least this many.')}</p>
              {err('min_redeem') && <span className="text-xs text-red-600">{err('min_redeem')}</span>}
            </div>
          </fieldset>

          <div className="rounded-xl bg-brand-50 px-4 py-3 text-[15px] leading-relaxed text-brand-900">
            <div className="mb-1 font-semibold">{t('Example')}</div>
            {rich(t('A customer buys for {spend} and gets {points} points.'), { spend: <span className="num font-semibold">{money(spend)}</span>, points: <span className="num font-semibold">{earned}</span> })}
            {' '}
            {rich(t('{points} points = {amount} off a later bill.'), { points: <span className="num font-semibold">{Math.max(min, 1)}</span>, amount: <span className="num font-semibold">{money(Math.max(min, 1) * worth)}</span> })}
            {!f.enabled && <div className="mt-1 text-sm text-brand-800">{t('Points are switched off now — switch them on above.')}</div>}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="lg" loading={save.isPending} disabled={!dirty}>{t('Save')}</Button>
              {dirty && <Button variant="secondary" size="lg" onClick={() => setF(initial)}>{t('Undo changes')}</Button>}
            </div>
          )}
        </form>
      </Card>

      <TopCustomers />
    </div>
  );
}

function TopCustomers() {
  const t = useT();
  const { can } = useAuth();
  const list = useQuery({ queryKey: ['customers'], queryFn: () => api.get('/customers'), select: (r) => r.data || [], enabled: can('customers.view') });
  if (!can('customers.view')) return null;
  const top = (list.data || []).filter((c) => Number(c.loyalty_points) > 0).sort((a, b) => b.loyalty_points - a.loyalty_points).slice(0, 8);
  return (
    <Card className="h-fit">
      <CardHeader title={t('Customers with most points')} />
      {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !top.length ? (
        <p className="px-5 py-6 text-sm text-slate-500">{t('No customer has points yet. Points are given when a customer is chosen on the bill.')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {top.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{c.name}</span>
                <span className="num block text-xs text-slate-500">{c.phone}</span>
              </span>
              <Badge color="amber" className="text-sm"><Star className="me-1 size-3.5" /><span className="num">{c.loyalty_points}</span></Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
