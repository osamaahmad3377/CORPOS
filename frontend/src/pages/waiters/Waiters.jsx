// Restaurant waiters: the people who take orders (no login needed). Picked on
// each order; this page shows who sold how much and manages the list.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Pencil, Plus, ReceiptText, Search, Trash2, UserRound, Users, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { money } from '../../lib/format';
import { Page } from '../../components/Layout';
import { initials, matchWaiters } from '../../components/WaiterPicker';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, StatCard, Switch, cx, useConfirm, useToast } from '../../components/ui';

const PERIODS = [['today', 'Today', 0], ['7', 'Last 7 days', 6], ['30', 'Last 30 days', 29]];
const iso = (d) => d.toISOString().slice(0, 10);

export default function Waiters() {
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
  const list = useQuery({ queryKey: ['waiters', 'page', period], queryFn: () => api.get('/waiters', { from, to: iso(new Date()) }), placeholderData: (p) => p });
  const all = list.data?.data || [];
  const rows = useMemo(() => matchWaiters(all, q), [all, q]);
  const active = all.filter((w) => w.is_active);
  const totalSales = all.reduce((a, w) => a + w.sales, 0);
  const totalOrders = all.reduce((a, w) => a + w.orders, 0);
  const best = [...all].sort((a, b) => b.sales - a.sales)[0];
  const maxSales = Math.max(1, ...all.map((w) => w.sales));
  const refresh = () => qc.invalidateQueries({ queryKey: ['waiters'] });

  const toggle = async (w, on) => {
    try { await api.put(`/waiters/${w.id}`, { name: w.name, phone: w.phone, is_active: on }); refresh(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (w) => {
    if (!(await confirm({ title: t('Remove {name}?', { name: w.name }), message: t('A waiter who already took orders is switched off instead, so old bills keep the name.'), danger: true, confirmLabel: t('Remove') }))) return;
    try {
      const r = await api.del(`/waiters/${w.id}`);
      toast(r.deactivated ? t('{name} switched off (has old orders)', { name: w.name }) : t('{name} removed', { name: w.name }));
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Page>
      <PageHeader
        title={t('Waiters')}
        subtitle={t('The people who take orders. Pick the waiter on each order — their tables, kitchen slips and bills show the name.')}
        actions={canEdit && <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add waiter')}</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label={t('Active waiters')} value={<span className="num">{active.length}</span>} />
        <StatCard icon={ReceiptText} tone="amber" label={t('Orders')} value={<span className="num">{totalOrders}</span>} />
        <StatCard icon={Wallet} tone="green" label={t('Sales')} value={money(totalSales)} />
        <StatCard icon={Crown} tone="red" label={t('Top waiter')} value={<span className="truncate text-xl">{best && best.sales > 0 ? best.name : '—'}</span>} />
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
          <EmptyState icon={UserRound} title={q ? t('No waiter matches "{q}"', { q }) : t('No waiters yet')} action={!q && canEdit && <Button icon={Plus} size="lg" onClick={() => setEditing({})}>{t('Add your first waiter')}</Button>}>
            {!q && t('Add the names of the people who take orders.')}
          </EmptyState>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((w) => (
              <div key={w.id} className={cx('glass-tile rounded-2xl p-4', !w.is_active && 'opacity-60')}>
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]">{initials(w.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-slate-900">{w.name}</div>
                    <div className="truncate text-sm text-slate-500">{w.phone || (w.is_active ? t('Working') : t('Switched off'))}</div>
                  </div>
                  {canEdit && <Switch size="sm" checked={w.is_active} label={t('Working')} onChange={(v) => toggle(w, v)} />}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-500/[0.06] py-2"><div className="num text-lg font-bold text-slate-900">{w.orders}</div><div className="text-[11px] text-slate-500">{t('Orders')}</div></div>
                  <div className="rounded-xl bg-slate-500/[0.06] py-2"><div className="num text-lg font-bold text-slate-900">{money(w.sales)}</div><div className="text-[11px] text-slate-500">{t('Sales')}</div></div>
                  <div className="rounded-xl bg-slate-500/[0.06] py-2"><div className={cx('num text-lg font-bold', w.open_orders ? 'text-amber-700' : 'text-slate-900')}>{w.open_orders}</div><div className="text-[11px] text-slate-500">{t('Open now')}</div></div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-500/15" dir="ltr"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(w.sales / maxSales) * 100}%` }} /></div>
                {canEdit && (
                  <div className="mt-3 flex justify-end gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(w)}>{t('Edit')}</Button>
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600 hover:bg-red-50" onClick={() => remove(w)}>{t('Remove')}</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && <WaiterForm waiter={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={refresh} />}
    </Page>
  );
}

function WaiterForm({ waiter, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(waiter?.name || '');
  const [phone, setPhone] = useState(waiter?.phone || '');
  const [error, setError] = useState(null);
  const save = useMutation({
    mutationFn: () => (waiter ? api.put(`/waiters/${waiter.id}`, { name: name.trim(), phone: phone.trim() || null, is_active: waiter.is_active }) : api.post('/waiters', { name: name.trim(), phone: phone.trim() || null })),
    onSuccess: () => { toast(waiter ? t('Saved') : t('{name} added', { name: name.trim() })); onSaved(); onClose(); },
    onError: setError,
  });
  return (
    <Modal open onClose={onClose} size="sm" title={waiter ? t('Edit {name}', { name: waiter.name }) : t('Add waiter')}
      footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button><Button size="lg" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>{t('Save')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <ErrorBox error={error} />
        <Field label={t('Name')} required><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Ahmed Raza')} /></Field>
        <Field label={t('Phone (optional)')}><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" /></Field>
      </form>
    </Modal>
  );
}
