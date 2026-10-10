// Kitchen stock (restaurants): raw materials such as chicken, flour and buns.
// Selling a dish takes its recipe off these automatically; here the owner
// adds items, records what was bought, counted or wasted, and sees alerts.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Beef, History, Minus, PackagePlus, Pencil, Plus, Scale, Search, Trash2, TriangleAlert, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { dateTime, money, qty } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, StatCard, Switch, Table, Td, Th, cx, useConfirm, useToast,
} from '../../components/ui';

export const UNIT_LABEL = { kg: 'Kg', g: 'Gram', litre: 'Litre', ml: 'ml', piece: 'Piece', dozen: 'Dozen', packet: 'Packet' };
const FRACTIONAL = new Set(['kg', 'litre', 'dozen']);
export const unitLabel = (t, u) => t(UNIT_LABEL[u] || u);

// How full an item is compared with its alert level (the bar under the amount).
function StockBar({ item }) {
  const ref = Math.max(item.alert_qty * 3, item.alert_qty + 1, 1);
  const pct = Math.max(0, Math.min(100, (item.stock_qty / ref) * 100));
  const tone = item.level === 'out' ? 'bg-red-500' : item.level === 'low' ? 'bg-amber-500' : 'bg-emerald-500';
  return <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-slate-500/15" dir="ltr"><div className={cx('h-full rounded-full', tone)} style={{ width: `${pct}%` }} /></div>;
}

export function LevelBadge({ level }) {
  const t = useT();
  if (level === 'out') return <Badge color="red">{t('Finished')}</Badge>;
  if (level === 'low') return <Badge color="amber">{t('Running low')}</Badge>;
  return <Badge color="green">{t('OK')}</Badge>;
}

export default function KitchenStock() {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const level = params.get('level') || '';
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState(null); // {} = new item
  const [acting, setActing] = useState(null); // { item, type }
  const [history, setHistory] = useState(null);
  const canEdit = can('inventory.adjust');
  useEffect(() => { const h = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(h); }, [search]);

  const list = useQuery({ queryKey: ['ingredients', level, term], queryFn: () => api.get('/ingredients', { level, search: term }), placeholderData: (p) => p });
  const rows = list.data?.data || [];
  const sum = list.data?.summary || {};
  const refresh = () => { qc.invalidateQueries({ queryKey: ['ingredients'] }); };

  const remove = async (item) => {
    if (!(await confirm({ title: t('Remove {name}?', { name: item.name }), message: t('Its history is removed too. To keep it but stop using it, switch it off instead.'), danger: true, confirmLabel: t('Remove') }))) return;
    try { await api.del(`/ingredients/${item.id}`); toast(t('{name} removed', { name: item.name })); refresh(); } catch (e) { toast(e.message, 'error'); }
  };
  const toggle = async (item, on) => {
    try { await api.put(`/ingredients/${item.id}`, { name: item.name, unit: item.unit, alert_qty: item.alert_qty, is_active: on }); refresh(); } catch (e) { toast(e.message, 'error'); }
  };

  const chips = [['', 'All'], ['alert', 'Needs attention'], ['low', 'Running low'], ['out', 'Finished']];

  return (
    <Page>
      <PageHeader
        title={t('Kitchen stock')}
        subtitle={t('Raw materials like chicken, flour and buns. Selling a dish takes its recipe off automatically — set each dish\'s recipe in Menu items.')}
        actions={canEdit && <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add kitchen item')}</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Beef} label={t('Kitchen items')} value={<span className="num">{sum.items ?? 0}</span>} />
        <StatCard icon={TriangleAlert} tone="amber" label={t('Running low')} value={<span className="num">{sum.low ?? 0}</span>} />
        <StatCard icon={AlertTriangle} tone="red" label={t('Finished')} value={<span className="num">{sum.out ?? 0}</span>} />
        <StatCard icon={Wallet} tone="green" label={t('Stock value')} value={money(sum.stock_value ?? 0)} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-900/[0.06] p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input className="h-11 ps-10" placeholder={t('Search kitchen items…')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setParams(k ? { level: k } : {})}
                className={cx('rounded-full px-4 py-2 text-sm font-semibold transition', level === k ? 'bg-brand-600 text-brand-ink' : 'bg-slate-500/10 text-slate-600 hover:bg-slate-500/15')}>
                {t(label)}
              </button>
            ))}
          </div>
        </div>

        {list.isLoading ? <Loading /> : !rows.length ? (
          <EmptyState icon={Beef} title={level || term ? t('Nothing here') : t('No kitchen items yet')}
            action={!level && !term && canEdit && <Button icon={Plus} size="lg" onClick={() => setEditing({})}>{t('Add your first kitchen item')}</Button>}>
            {level || term ? t('Try another filter or search.') : t('Add chicken, flour, buns, oil… with how much you have now. Then add a recipe to each dish.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('Item')}</Th>
                <Th>{t('In stock')}</Th>
                <Th className="whitespace-nowrap">{t('Alert at')}</Th>
                <Th className="text-end">{t('Average cost')}</Th>
                <Th className="text-end">{t('Value')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={cx(!i.is_active && 'opacity-55')}>
                  <Td className="min-w-40">
                    <div className="font-semibold text-slate-900">{i.name}</div>
                    <div className="text-xs text-slate-500">{i.used_in ? t('In recipes: {n}', { n: i.used_in }) : t('Not in any recipe yet')}{!i.is_active && ` · ${t('Switched off')}`}</div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className={cx('num whitespace-nowrap text-base font-bold', i.level === 'out' ? 'text-red-600' : i.level === 'low' ? 'text-amber-700' : 'text-slate-900')}>{qty(i.stock_qty)}</span>
                      <span className="text-sm text-slate-500">{unitLabel(t, i.unit)}</span>
                      <LevelBadge level={i.level} />
                    </div>
                    <StockBar item={i} />
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600"><span className="num">{qty(i.alert_qty)}</span> {unitLabel(t, i.unit)}</Td>
                  <Td className="whitespace-nowrap text-end"><span className="num">{money(i.cost_per_unit)}</span><span className="text-xs text-slate-400"> / {unitLabel(t, i.unit)}</span></Td>
                  <Td className="num text-end font-medium">{money(i.stock_value)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canEdit && (
                        <>
                          <Button size="sm" icon={PackagePlus} onClick={() => setActing({ item: i, type: 'purchase' })}>{t('Bought')}</Button>
                          <button type="button" title={t('Count')} aria-label={t('Count')} onClick={() => setActing({ item: i, type: 'count' })} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-500/10"><Scale className="size-5" /></button>
                          <button type="button" title={t('Wasted')} aria-label={t('Wasted')} onClick={() => setActing({ item: i, type: 'waste' })} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-500/10"><Minus className="size-5" /></button>
                        </>
                      )}
                      <button type="button" title={t('History')} aria-label={t('History')} onClick={() => setHistory(i)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-500/10"><History className="size-5" /></button>
                      {canEdit && <button type="button" title={t('Edit')} aria-label={t('Edit')} onClick={() => setEditing(i)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-500/10"><Pencil className="size-5" /></button>}
                      {canEdit && <Switch size="sm" checked={i.is_active} label={t('In use')} onChange={(v) => toggle(i, v)} />}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && <IngredientForm item={editing.id ? editing : null} units={list.data?.units || Object.keys(UNIT_LABEL)} onClose={() => setEditing(null)} onSaved={refresh} onRemove={editing.id ? () => { const it = editing; setEditing(null); remove(it); } : null} />}
      {acting && <AdjustModal item={acting.item} type={acting.type} onClose={() => setActing(null)} onSaved={refresh} />}
      {history && <HistoryModal item={history} onClose={() => setHistory(null)} />}
    </Page>
  );
}

export function IngredientForm({ item, units = Object.keys(UNIT_LABEL), onClose, onSaved, onRemove }) {
  const t = useT();
  const toast = useToast();
  const [f, setF] = useState(() => ({ name: item?.name || '', unit: item?.unit || 'kg', stock_qty: '', alert_qty: item ? String(item.alert_qty) : '', cost_per_unit: item ? String(item.cost_per_unit) : '' }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), unit: f.unit, alert_qty: Number(f.alert_qty || 0), cost_per_unit: Number(f.cost_per_unit || 0) };
      return item ? api.put(`/ingredients/${item.id}`, body) : api.post('/ingredients', { ...body, stock_qty: Number(f.stock_qty || 0) });
    },
    onSuccess: (r) => { toast(item ? t('Saved') : t('{name} added', { name: r.data.name })); onSaved?.(r.data); onClose(); },
    onError: setError,
  });
  const u = unitLabel(t, f.unit);
  return (
    <Modal open onClose={onClose} title={item ? t('Edit {name}', { name: item.name }) : t('Add kitchen item')}
      footer={<>{onRemove && <Button variant="ghost" size="lg" icon={Trash2} className="me-auto text-red-600 hover:bg-red-50" onClick={onRemove}>{t('Remove')}</Button>}<Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button><Button size="lg" loading={save.isPending} disabled={!f.name.trim()} onClick={() => save.mutate()}>{t('Save')}</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="sm:col-span-2"><ErrorBox error={error} /></div>
        <Field label={t('Name')} required className="sm:col-span-2"><Input autoFocus value={f.name} onChange={set('name')} placeholder={t('e.g. Chicken, Flour, Burger bun')} /></Field>
        <Field label={t('Measured in')} required>
          <Select value={f.unit} onChange={set('unit')}>{units.map((x) => <option key={x} value={x}>{unitLabel(t, x)}</option>)}</Select>
        </Field>
        {!item && <Field label={t('How much do you have now?')} hint={t('In {unit}. Leave empty if none.', { unit: u })}><Input type="number" min="0" step="any" value={f.stock_qty} onChange={set('stock_qty')} /></Field>}
        <Field label={t('Warn me when it reaches')} hint={t('An alert shows on Home when stock is at or below this.')}><Input type="number" min="0" step="any" value={f.alert_qty} onChange={set('alert_qty')} placeholder="0" /></Field>
        <Field label={t('Price per {unit}', { unit: u })} hint={t('What you pay (Rs). Used to work out each dish\'s cost.')}><Input type="number" min="0" step="0.01" value={f.cost_per_unit} onChange={set('cost_per_unit')} placeholder="0" /></Field>
      </form>
    </Modal>
  );
}

function AdjustModal({ item, type, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState(type === 'count' ? String(item.stock_qty) : '');
  const [cost, setCost] = useState(type === 'purchase' && item.cost_per_unit ? String(item.cost_per_unit) : '');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const u = unitLabel(t, item.unit);
  const meta = {
    purchase: { title: t('Bought {name}', { name: item.name }), label: t('How much did you buy?'), button: t('Add to stock') },
    count: { title: t('Count {name}', { name: item.name }), label: t('How much is there now?'), button: t('Save count') },
    waste: { title: t('Wasted {name}', { name: item.name }), label: t('How much was wasted or spoiled?'), button: t('Take off stock') },
  }[type];
  const n = Number(q || 0);
  const after = type === 'purchase' ? item.stock_qty + n : type === 'count' ? n : item.stock_qty - n;
  const save = useMutation({
    mutationFn: () => api.post(`/ingredients/${item.id}/adjust`, { type, quantity: n, unit_cost: type === 'purchase' && cost !== '' ? Number(cost) : null, note: note.trim() || null }),
    onSuccess: () => { toast(t('Kitchen stock updated')); onSaved?.(); onClose(); },
    onError: setError,
  });
  return (
    <Modal open onClose={onClose} size="sm" title={meta.title}
      footer={<><Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button><Button size="lg" loading={save.isPending} disabled={q === '' || (type !== 'count' && n <= 0)} onClick={() => save.mutate()}>{meta.button}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <ErrorBox error={error} />
        <Field label={meta.label} hint={t('In {unit}', { unit: u })}>
          <Input autoFocus type="number" min="0" step={FRACTIONAL.has(item.unit) ? 'any' : 'any'} inputMode="decimal" className="h-12 text-lg" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        {type === 'purchase' && (
          <Field label={t('Price per {unit}', { unit: u })} hint={t('The average cost is updated for you.')}>
            <Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
        )}
        <Field label={t('Note (optional)')}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'waste' ? t('e.g. spoiled, burnt') : type === 'purchase' ? t('e.g. from Ali Poultry') : ''} /></Field>
        <div className="flex items-center justify-between rounded-xl bg-slate-500/[0.07] px-4 py-3 text-sm">
          <span className="text-slate-600">{t('Stock after this')}</span>
          <span className={cx('num text-base font-bold', after <= 0 ? 'text-red-600' : after <= item.alert_qty ? 'text-amber-700' : 'text-slate-900')}>{qty(Math.round(after * 1000) / 1000)} {u}</span>
        </div>
      </form>
    </Modal>
  );
}

const MOVE_LABEL = { purchase: 'Bought', sale: 'Sold in dishes', count: 'Counted', waste: 'Wasted', correction: 'Correction' };

function HistoryModal({ item, onClose }) {
  const t = useT();
  const q = useQuery({ queryKey: ['ingredients', 'moves', item.id], queryFn: () => api.get(`/ingredients/${item.id}/movements`) });
  const rows = q.data?.data || [];
  return (
    <Modal open onClose={onClose} size="lg" title={t('History of {name}', { name: item.name })}>
      {q.isLoading ? <Loading /> : !rows.length ? <p className="py-8 text-center text-slate-500">{t('Nothing recorded yet.')}</p> : (
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <thead><tr><Th>{t('When')}</Th><Th>{t('What')}</Th><Th className="text-end">{t('Change')}</Th><Th className="text-end">{t('Stock after')}</Th><Th>{t('Details')}</Th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap text-slate-600">{dateTime(m.created_at)}</Td>
                  <Td className="font-medium text-slate-800">{t(MOVE_LABEL[m.type] || m.type)}</Td>
                  <Td className={cx('num text-end font-semibold', m.quantity_change < 0 ? 'text-red-600' : 'text-emerald-700')}>{m.quantity_change > 0 ? '+' : ''}{qty(m.quantity_change)} {unitLabel(t, item.unit)}</Td>
                  <Td className="num text-end">{qty(m.balance_after)}</Td>
                  <Td className="text-sm text-slate-500">{[m.invoice, m.note, m.unit_cost != null ? `${money(m.unit_cost)} / ${unitLabel(t, item.unit)}` : null, m.user].filter(Boolean).join(' · ')}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
