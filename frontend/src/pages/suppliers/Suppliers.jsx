import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Boxes, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, Truck, Wallet, X } from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { date, money } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, StatCard,
  Table, Td, Textarea, Th, useConfirm, useToast,
} from '../../components/ui';

// Labels are English keys — show them with t(st.label).
export const PAY_STATUS = {
  paid: { label: 'Paid', color: 'green' },
  partial: { label: 'Partly paid', color: 'amber' },
  pending: { label: 'Unpaid', color: 'red' },
};

export default function Suppliers() {
  return (
    <Routes>
      <Route index element={<SupplierList />} />
      <Route path=":id" element={<SupplierDetail />} />
    </Routes>
  );
}

// ---------------------------------------------------------------- list

function SupplierList() {
  const navigate = useNavigate();
  const t = useT();
  const [search, setSearch] = useState('');
  const [show, setShow] = useState('active');
  const [editing, setEditing] = useState(null);
  const list = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers'), select: (r) => r.data || [] });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (list.data || []).filter((s) => {
      if (show === 'active' && !s.is_active) return false;
      if (show === 'due' && !(Number(s.outstanding_balance) > 0)) return false;
      if (!term) return true;
      return [s.name, s.company, s.phone, s.city, s.email].some((x) => x && String(x).toLowerCase().includes(term));
    });
  }, [list.data, search, show]);

  const totalDue = (list.data || []).reduce((a, s) => a + Number(s.outstanding_balance || 0), 0);
  const owing = (list.data || []).filter((s) => Number(s.outstanding_balance) > 0).length;

  return (
    <Page>
      <PageHeader
        title={t('Suppliers')}
        subtitle={t('People and companies you buy stock from, and how much you still owe them.')}
        actions={<Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add supplier')}</Button>}
      />

      {!!list.data?.length && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard icon={Truck} label={t('Suppliers')} value={<span className="num">{list.data.length}</span>} />
          <StatCard icon={Wallet} label={t('Total you owe')} value={<span className="num">{money(totalDue)}</span>} tone={totalDue > 0 ? 'red' : 'green'} />
          <button type="button" className="text-start" onClick={() => setShow('due')}>
            <StatCard icon={Boxes} label={t('Suppliers you owe')} value={<span className="num">{owing}</span>} tone="amber" />
          </button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input className="ps-10 pe-10" placeholder={t('Search name, company, phone or city…')} value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-600" aria-label={t('Clear')}><X className="size-5" /></button>}
          </div>
          <div className="w-full sm:w-52">
            <Select value={show} onChange={(e) => setShow(e.target.value)} aria-label={t('Show')}>
              <option value="active">{t('Suppliers I buy from')}</option>
              <option value="all">{t('All suppliers')}</option>
              <option value="due">{t('Suppliers I owe money')}</option>
            </Select>
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState
            icon={Truck}
            title={list.data?.length ? t('No supplier found') : t('No suppliers yet')}
            action={!list.data?.length && <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add your first supplier')}</Button>}
          >
            {list.data?.length ? t('Try a different name, or choose "All suppliers".') : t('Add the people you buy stock from. Then you can write down what you bought and what you still owe.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>{t('Supplier')}</Th><Th>{t('Phone')}</Th><Th className="hidden md:table-cell">{t('City')}</Th><Th className="text-end">{t('You owe')}</Th><Th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const due = Number(s.outstanding_balance || 0);
                return (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/suppliers/${s.id}`)}>
                    <Td className="py-3.5">
                      <div className="text-base font-medium text-slate-900">{s.name}{!s.is_active && <Badge className="ms-2">{t('Not buying now')}</Badge>}</div>
                      {s.company && <div className="text-sm text-slate-500">{s.company}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600"><span className="num">{s.phone}</span></Td>
                    <Td className="hidden text-slate-600 md:table-cell">{s.city || '—'}</Td>
                    <Td className="whitespace-nowrap text-end">{due > 0 ? <span className="num font-semibold text-red-600">{money(due)}</span> : <span className="text-slate-400">{t('Nothing')}</span>}</Td>
                    <Td className="text-end">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={(e) => { e.stopPropagation(); setEditing(s); }}>{t('Edit')}</Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && <SupplierForm supplier={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={(s) => !editing.id && navigate(`/suppliers/${s.id}`)} />}
    </Page>
  );
}

// ---------------------------------------------------------------- form (also used by Purchases for quick-add)

export function SupplierForm({ supplier, onClose, onSaved, initialName = '' }) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const [form, setForm] = useState(() => ({
    name: supplier?.name || initialName,
    company: supplier?.company || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    city: supplier?.city || '',
    country: supplier?.country || '',
    address: supplier?.address || '',
    notes: supplier?.notes || '',
    is_active: supplier ? !!supplier.is_active : true,
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, name: form.name.trim(), phone: form.phone.trim() };
      for (const k of ['company', 'email', 'city', 'country', 'address', 'notes']) body[k] = body[k].trim() || null;
      return supplier ? api.put(`/suppliers/${supplier.id}`, body) : api.post('/suppliers', body);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast(supplier ? t('Supplier saved') : t('{name} added', { name: res.data.name }));
      onSaved?.(res.data);
      onClose();
    },
    onError: setError,
  });

  const submit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    save.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={supplier ? t('Edit {name}', { name: supplier.name }) : t('Add supplier')}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="supplier-form" loading={save.isPending}>{supplier ? t('Save') : t('Add supplier')}</Button>
        </>
      )}
    >
      <form id="supplier-form" onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Name')} hint={t('Person or salesman you deal with')} required error={error?.errors?.name?.[0]}>
            <Input autoFocus value={form.name} onChange={set('name')} required maxLength={255} />
          </Field>
          <Field label={t('Phone')} required error={error?.errors?.phone?.[0]}>
            <Input type="tel" dir="ltr" className="text-start" value={form.phone} onChange={set('phone')} required maxLength={30} placeholder="03xx-xxxxxxx" />
          </Field>
          <Field label={t('Company / firm (optional)')} error={error?.errors?.company?.[0]}>
            <Input value={form.company} onChange={set('company')} maxLength={255} />
          </Field>
          <Field label={t('Email (optional)')} error={error?.errors?.email?.[0]}>
            <Input type="email" value={form.email} onChange={set('email')} maxLength={255} />
          </Field>
          <Field label={t('City')}><Input value={form.city} onChange={set('city')} maxLength={255} /></Field>
          <Field label={t('Country')}><Input value={form.country} onChange={set('country')} maxLength={255} placeholder={t('Pakistan')} /></Field>
        </div>
        <Field label={t('Address')}><Textarea rows={2} value={form.address} onChange={set('address')} /></Field>
        <Field label={t('Note (optional)')} hint={t('When to pay, delivery days, salesman name…')}><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        {supplier && (
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-base text-slate-700">
            <input type="checkbox" className="size-5 rounded border-slate-300 accent-brand-600" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            <span>{t('I still buy from them')} <span className="block text-sm text-slate-500">{t('Untick to hide them when you add new stock.')}</span></span>
          </label>
        )}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- detail

function SupplierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [status]);

  const sup = useQuery({ queryKey: ['suppliers', id], queryFn: () => api.get(`/suppliers/${id}`), select: (r) => r.data });
  const pq = { supplier_id: id, payment_status: status, page, per_page: 15 };
  const purchases = useQuery({
    queryKey: ['purchases', pq], queryFn: () => api.get('/purchases', pq), enabled: can('purchases.view'), placeholderData: (p) => p,
  });
  const { rows, meta } = paged(purchases.data);
  const s = sup.data;

  const remove = async () => {
    if (!(await confirm({
      title: t('Delete supplier?'),
      message: t('{name} will be removed. If you have bought stock from them before, they cannot be deleted — edit them and untick "I still buy from them" instead.', { name: s.name }),
      danger: true,
      confirmLabel: t('Delete'),
    }))) return;
    try {
      await api.del(`/suppliers/${id}`);
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast(t('Supplier deleted'));
      navigate('/suppliers');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (sup.isLoading) return <Page><Loading /></Page>;
  if (sup.error) return <Page><ErrorBox error={sup.error} /></Page>;
  const due = Number(s.outstanding_balance || 0);

  return (
    <Page>
      <button type="button" onClick={() => navigate('/suppliers')} className="mb-3 inline-flex items-center gap-1.5 py-1 text-base text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-5 rtl:rotate-180" />{t('All suppliers')}
      </button>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{s.name}{!s.is_active && <Badge>{t('Not buying now')}</Badge>}</span>}
        subtitle={s.company || t('Supplier')}
        actions={(
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>{t('Edit')}</Button>
            <Button variant="ghost" icon={Trash2} onClick={remove} className="text-red-600 hover:bg-red-50">{t('Delete')}</Button>
            {can('purchases.manage') && s.is_active && <Button size="lg" icon={Plus} onClick={() => navigate(`/purchases/new?supplier_id=${s.id}`)}>{t('Stock arrived')}</Button>}
          </>
        )}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="text-base text-slate-500">{t('You owe this supplier')}</div>
            <div className={`num mt-1 block text-3xl font-semibold tracking-tight ${due > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(due)}</div>
            <p className="mt-2 text-sm text-slate-500">{t('Money not paid yet on all stock bought from them. To pay, open a purchase below and tap "Pay supplier".')}</p>
          </Card>
          <Card>
            <CardHeader title={t('Contact')} />
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-center gap-2 text-slate-700"><Phone className="size-4 text-slate-400" /><a href={`tel:${s.phone}`} className="num text-base hover:underline">{s.phone}</a></div>
              {s.email && <div className="flex items-center gap-2 text-slate-700"><Mail className="size-4 text-slate-400" />{s.email}</div>}
              {(s.address || s.city || s.country) && (
                <div className="flex items-start gap-2 text-slate-700"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />{[s.address, s.city, s.country].filter(Boolean).join(', ')}</div>
              )}
              {s.notes && <div className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-slate-600">{s.notes}</div>}
              <div className="text-xs text-slate-400">{t('Added on {date}', { date: date(s.created_at) })}</div>
            </dl>
          </Card>
        </div>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title={t('Stock bought from them')}
            subtitle={meta ? (meta.total === 1 ? t('1 purchase') : t('{n} purchases', { n: meta.total })) : null}
            action={(
              <div className="w-40">
                <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Show')}>
                  <option value="">{t('All')}</option>
                  <option value="pending">{t('Unpaid')}</option>
                  <option value="partial">{t('Partly paid')}</option>
                  <option value="paid">{t('Paid')}</option>
                </Select>
              </div>
            )}
          />
          {!can('purchases.view') ? (
            <EmptyState icon={Boxes} title={t('Purchases hidden')}>{t('You are not allowed to see purchases. Ask the shop owner.')}</EmptyState>
          ) : purchases.isLoading ? <Loading /> : purchases.error ? <div className="p-4"><ErrorBox error={purchases.error} /></div> : !rows.length ? (
            <EmptyState icon={Boxes} title={status ? t('Nothing found') : t('Nothing bought from them yet')}>
              {status ? t('Choose "All" to see every purchase.') : t('When stock arrives from this supplier, tap "Stock arrived" to write it down.')}
            </EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>{t('Purchase')}</Th><Th>{t('Date')}</Th><Th className="text-end">{t('Total')}</Th><Th className="text-end">{t('Still owed')}</Th><Th>{t('Payment')}</Th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const st = PAY_STATUS[p.payment_status] || { label: p.payment_status, color: 'gray' };
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/purchases/${p.po_number}`)}>
                      <Td className="py-3.5">
                        <div className="num font-medium text-brand-700">{p.po_number}</div>
                        <div className="text-xs text-slate-500">
                          {p.items_count === 1 ? t('1 item') : t('{n} items', { n: p.items_count })}
                          {p.invoice_number && <> · {t('Bill {no}', { no: p.invoice_number })}</>}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600"><span className="num">{date(p.purchase_date)}</span></Td>
                      <Td className="whitespace-nowrap text-end"><span className="num">{money(p.grand_total)}</span></Td>
                      <Td className="whitespace-nowrap text-end">{Number(p.due_amount) > 0 ? <span className="num font-medium text-red-600">{money(p.due_amount)}</span> : <span className="text-slate-400">—</span>}</Td>
                      <Td><Badge color={st.color}>{t(st.label)}</Badge></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <Pagination meta={meta} onPage={setPage} />
        </Card>
      </div>

      {editing && <SupplierForm supplier={s} onClose={() => setEditing(false)} />}
    </Page>
  );
}
