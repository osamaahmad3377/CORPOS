// Delivery riders: the people who take orders to customers' homes (no login
// needed). Shows each rider's deliveries, sales, delivery charges, average
// time, and the cash they still have to hand in.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Clock, Crown, Pencil, Phone, Plus, Search, Trash2, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { money } from '../../lib/format';
import { Page } from '../../components/Layout';
import { initials, matchWaiters } from '../../components/WaiterPicker';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, StatCard, Switch, cx, useConfirm, useToast } from '../../components/ui';

const PERIODS = [['today', 'Today', 0], ['7', 'Last 7 days', 6], ['30', 'Last 30 days', 29]];
const iso = (d) => d.toISOString().slice(0, 10);

export default function Riders() {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = can('users.manage');
  const [period, setPeriod] = useState('today');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // {} = new
  const days = PERIODS.find((p) => p[0] === period)[2];
  const from = iso(new Date(Date.now() - days * 86400000));
  const list = useQuery({ queryKey: ['riders', 'page', period], queryFn: () => api.get('/riders', { from, to: iso(new Date()) }), placeholderData: (p) => p });
  const all = list.data?.data || [];
  const rows = useMemo(() => matchWaiters(all, q), [all, q]);
  const active = all.filter((r) => r.is_active);
  const deliveries = all.reduce((a, r) => a + r.deliveries, 0);
  const fees = all.reduce((a, r) => a + r.fees, 0);
  const withRiders = all.reduce((a, r) => a + r.cash_to_collect, 0);
  const best = [...all].sort((a, b) => b.deliveries - a.deliveries)[0];
  const maxDel = Math.max(1, ...all.map((r) => r.deliveries));
  const refresh = () => { qc.invalidateQueries({ queryKey: ['riders'] }); qc.invalidateQueries({ queryKey: ['deliveries'] }); };

  const toggle = async (r, on) => {
    try { await api.put(`/riders/${r.id}`, { name: r.name, phone: r.phone, is_active: on }); refresh(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (r) => {
    if (!(await confirm({ title: t('Remove {name}?', { name: r.name }), message: t('A rider who already made deliveries is switched off instead, so old bills keep the name.'), danger: true, confirmLabel: t('Remove') }))) return;
    try {
      const res = await api.del(`/riders/${r.id}`);
      toast(res.deactivated ? t('{name} switched off (has old deliveries)', { name: r.name }) : t('{name} removed', { name: r.name }));
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Page>
      <PageHeader
        title={t('Riders')}
        subtitle={t('The people who deliver orders. Choose the rider when an order leaves — the rider brings the cash back.')}
        actions={canEdit && <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add rider')}</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Bike} label={t('Active riders')} value={<span className="num">{active.length}</span>} />
        <StatCard icon={Clock} tone="amber" label={t('Deliveries')} value={<span className="num">{deliveries}</span>} />
        <StatCard icon={Wallet} tone="green" label={t('Delivery charges')} value={money(fees)} />
        <StatCard icon={withRiders > 0 ? Wallet : Crown} tone="red" label={withRiders > 0 ? t('Cash with riders now') : t('Top rider')} value={withRiders > 0 ? money(withRiders) : <span className="truncate text-xl">{best && best.deliveries > 0 ? best.name : '—'}</span>} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-900/[0.06] p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input className="h-11 ps-10" placeholder={t('Search by name or first letter…')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-2">
            {PERIODS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPeriod(k)} className={cx('rounded-full px-4 py-2 text-sm font-semibold transition', period === k ? 'bg-brand-600 text-brand-ink' : 'bg-slate-500/10 text-slate-600 hover:bg-slate-500/15')}>{t(label)}</button>
            ))}
          </div>
        </div>

        {list.isLoading ? <Loading /> : !rows.length ? (
          <EmptyState icon={Bike} title={q ? t('No rider matches "{q}"', { q }) : t('No riders yet')} action={!q && canEdit && <Button icon={Plus} size="lg" onClick={() => setEditing({})}>{t('Add your first rider')}</Button>}>
            {!q && t('Add the names of the people who deliver your orders.')}
          </EmptyState>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <div key={r.id} className={cx('glass-tile rounded-2xl p-4', !r.is_active && 'opacity-60')}>
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]">{initials(r.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-slate-900">{r.name}</div>
                    <div className="truncate text-sm text-slate-500">
                      {r.phone ? <a href={`tel:${r.phone}`} className="num inline-flex items-center gap-1 hover:text-brand-700" dir="ltr"><Phone className="size-3.5" />{r.phone}</a> : (r.is_active ? t('Working') : t('Switched off'))}
                    </div>
                  </div>
                  {canEdit && <Switch size="sm" checked={r.is_active} label={t('Working')} onChange={(v) => toggle(r, v)} />}
                </div>
                {r.out_now > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-brand-ink">
                    <span className="flex items-center gap-1.5"><Bike className="size-4" />{t('{n} orders out now', { n: r.out_now })}</span>
                    {r.cash_to_collect > 0 && <span className="num">{t('Cash {amount}', { amount: money(r.cash_to_collect) })}</span>}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-500/[0.06] py-2"><div className="num text-lg font-bold text-slate-900">{r.deliveries}</div><div className="text-[11px] text-slate-500">{t('Deliveries')}</div></div>
                  <div className="rounded-xl bg-slate-500/[0.06] py-2"><div className="num text-lg font-bold text-slate-900">{money(r.sales)}</div><div className="text-[11px] text-slate-500">{t('Sales')}</div></div>
                  <div className="rounded-xl bg-slate-500/[0.06] py-2"><div className="num text-lg font-bold text-slate-900">{r.avg_minutes == null ? '—' : t('{n} min', { n: r.avg_minutes })}</div><div className="text-[11px] text-slate-500">{t('Avg. time')}</div></div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{t('Delivery charges')}</span><span className="num font-semibold text-slate-700">{money(r.fees)}</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-500/15" dir="ltr"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(r.deliveries / maxDel) * 100}%` }} /></div>
                {canEdit && (
                  <div className="mt-3 flex justify-end gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(r)}>{t('Edit')}</Button>
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600 hover:bg-red-50" onClick={() => remove(r)}>{t('Remove')}</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && <RiderForm rider={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={refresh} />}
    </Page>
  );
}

function RiderForm({ rider, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(rider?.name || '');
  const [phone, setPhone] = useState(rider?.phone || '');
  const [error, setError] = useState(null);
  const save = useMutation({
    mutationFn: () => (rider ? api.put(`/riders/${rider.id}`, { name: name.trim(), phone: phone.trim() || null, is_active: rider.is_active }) : api.post('/riders', { name: name.trim(), phone: phone.trim() || null })),
    onSuccess: () => { toast(rider ? t('Saved') : t('{name} added', { name: name.trim() })); onSaved(); onClose(); },
    onError: setError,
  });
  return (
    <Modal open onClose={onClose} size="sm" title={rider ? t('Edit {name}', { name: rider.name }) : t('Add rider')}
      footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button><Button size="lg" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>{t('Save')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <ErrorBox error={error} />
        <Field label={t('Name')} required><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Imran Ali')} /></Field>
        <Field label={t('Phone')} hint={t('Printed on the delivery slip so the customer can call the rider.')}><Input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" /></Field>
      </form>
    </Modal>
  );
}
