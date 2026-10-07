import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Boxes, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, Truck, Wallet, X } from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { date, money } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, StatCard,
  Table, Td, Textarea, Th, useConfirm, useToast,
} from '../../components/ui';

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
  const [search, setSearch] = useState('');
  const [show, setShow] = useState('active');
  const [editing, setEditing] = useState(null);
  const list = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers'), select: (r) => r.data || [] });

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (list.data || []).filter((s) => {
      if (show === 'active' && !s.is_active) return false;
      if (show === 'due' && !(Number(s.outstanding_balance) > 0)) return false;
      if (!t) return true;
      return [s.name, s.company, s.phone, s.city, s.email].some((x) => x && String(x).toLowerCase().includes(t));
    });
  }, [list.data, search, show]);

  const totalDue = (list.data || []).reduce((a, s) => a + Number(s.outstanding_balance || 0), 0);
  const owing = (list.data || []).filter((s) => Number(s.outstanding_balance) > 0).length;

  return (
    <Page>
      <PageHeader
        title="Suppliers"
        subtitle="Companies and wholesalers you buy stock from, and what you still owe them."
        actions={<Button icon={Plus} onClick={() => setEditing({})}>Add supplier</Button>}
      />

      {!!list.data?.length && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard icon={Truck} label="Suppliers" value={list.data.length} />
          <StatCard icon={Wallet} label="Total you owe" value={money(totalDue)} tone={totalDue > 0 ? 'red' : 'green'} />
          <StatCard icon={Boxes} label="Suppliers with dues" value={owing} tone="amber" />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9 pr-9" placeholder="Search name, company, phone or city…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Clear"><X className="size-4" /></button>}
          </div>
          <div className="w-full sm:w-48">
            <Select value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="active">Active suppliers</option>
              <option value="all">All suppliers</option>
              <option value="due">With money owed</option>
            </Select>
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState
            icon={Truck}
            title={list.data?.length ? 'No matching suppliers' : 'No suppliers yet'}
            action={!list.data?.length && <Button icon={Plus} onClick={() => setEditing({})}>Add your first supplier</Button>}
          >
            {list.data?.length ? 'Try a different search or filter.' : 'Add the people you buy stock from so you can record purchases and track what you owe.'}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>Supplier</Th><Th>Phone</Th><Th className="hidden md:table-cell">City</Th><Th className="text-right">You owe</Th><Th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const due = Number(s.outstanding_balance || 0);
                return (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/suppliers/${s.id}`)}>
                    <Td>
                      <div className="font-medium text-slate-900">{s.name}{!s.is_active && <Badge className="ml-2">Inactive</Badge>}</div>
                      {s.company && <div className="text-xs text-slate-500">{s.company}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">{s.phone}</Td>
                    <Td className="hidden text-slate-600 md:table-cell">{s.city || '—'}</Td>
                    <Td className="whitespace-nowrap text-right">{due > 0 ? <span className="font-medium text-red-600">{money(due)}</span> : <span className="text-slate-400">Nothing</span>}</Td>
                    <Td className="text-right">
                      <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={(e) => { e.stopPropagation(); setEditing(s); }} aria-label="Edit supplier">
                        <Pencil className="size-4" />
                      </button>
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
      toast(supplier ? 'Supplier saved' : `${res.data.name} added`);
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
      title={supplier ? `Edit ${supplier.name}` : 'Add supplier'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="supplier-form" loading={save.isPending}>{supplier ? 'Save changes' : 'Add supplier'}</Button>
        </>
      )}
    >
      <form id="supplier-form" onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" required error={error?.errors?.name?.[0]}>
            <Input autoFocus value={form.name} onChange={set('name')} required maxLength={255} />
          </Field>
          <Field label="Phone" required error={error?.errors?.phone?.[0]}>
            <Input type="tel" value={form.phone} onChange={set('phone')} required maxLength={30} placeholder="03xx-xxxxxxx" />
          </Field>
          <Field label="Company / firm" error={error?.errors?.company?.[0]}>
            <Input value={form.company} onChange={set('company')} maxLength={255} />
          </Field>
          <Field label="Email" error={error?.errors?.email?.[0]}>
            <Input type="email" value={form.email} onChange={set('email')} maxLength={255} />
          </Field>
          <Field label="City"><Input value={form.city} onChange={set('city')} maxLength={255} /></Field>
          <Field label="Country"><Input value={form.country} onChange={set('country')} maxLength={255} placeholder="Pakistan" /></Field>
        </div>
        <Field label="Address"><Textarea rows={2} value={form.address} onChange={set('address')} /></Field>
        <Field label="Notes" hint="Payment terms, delivery days, salesman name…"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        {supplier && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 rounded border-slate-300 text-brand-600" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active (uncheck to hide from new purchases)
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
    if (!(await confirm({ title: 'Delete supplier?', message: `${s.name} will be removed. Suppliers with purchases can't be deleted — mark them inactive instead.`, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.del(`/suppliers/${id}`);
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast('Supplier deleted');
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
      <button type="button" onClick={() => navigate('/suppliers')} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" />All suppliers
      </button>
      <PageHeader
        title={<span className="flex items-center gap-2">{s.name}{!s.is_active && <Badge>Inactive</Badge>}</span>}
        subtitle={s.company}
        actions={(
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="ghost" icon={Trash2} onClick={remove} className="text-red-600 hover:bg-red-50">Delete</Button>
            {can('purchases.manage') && s.is_active && <Button icon={Plus} onClick={() => navigate(`/purchases/new?supplier_id=${s.id}`)}>New purchase</Button>}
          </>
        )}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="text-sm text-slate-500">You owe this supplier</div>
            <div className={`mt-1 text-3xl font-semibold tracking-tight ${due > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(due)}</div>
            <p className="mt-2 text-xs text-slate-500">Unpaid balance across all purchases. Record payments from each purchase.</p>
          </Card>
          <Card>
            <CardHeader title="Contact" />
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-center gap-2 text-slate-700"><Phone className="size-4 text-slate-400" /><a href={`tel:${s.phone}`} className="hover:underline">{s.phone}</a></div>
              {s.email && <div className="flex items-center gap-2 text-slate-700"><Mail className="size-4 text-slate-400" />{s.email}</div>}
              {(s.address || s.city || s.country) && (
                <div className="flex items-start gap-2 text-slate-700"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />{[s.address, s.city, s.country].filter(Boolean).join(', ')}</div>
              )}
              {s.notes && <div className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-slate-600">{s.notes}</div>}
              <div className="text-xs text-slate-400">Added {date(s.created_at)}</div>
            </dl>
          </Card>
        </div>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Purchases"
            subtitle={meta ? `${meta.total} purchase${meta.total === 1 ? '' : 's'}` : null}
            action={(
              <div className="w-40">
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9">
                  <option value="">All</option>
                  <option value="pending">Unpaid</option>
                  <option value="partial">Partly paid</option>
                  <option value="paid">Paid</option>
                </Select>
              </div>
            )}
          />
          {!can('purchases.view') ? (
            <EmptyState icon={Boxes} title="Purchases hidden">You don&apos;t have permission to view purchases.</EmptyState>
          ) : purchases.isLoading ? <Loading /> : purchases.error ? <div className="p-4"><ErrorBox error={purchases.error} /></div> : !rows.length ? (
            <EmptyState icon={Boxes} title={status ? 'No purchases with this status' : 'No purchases yet'}>
              {status ? 'Try another filter.' : 'Purchases you record from this supplier will appear here.'}
            </EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Purchase</Th><Th>Date</Th><Th className="text-right">Total</Th><Th className="text-right">Due</Th><Th>Status</Th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const st = PAY_STATUS[p.payment_status] || { label: p.payment_status, color: 'gray' };
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/purchases/${p.po_number}`)}>
                      <Td>
                        <div className="font-medium text-brand-700">{p.po_number}</div>
                        <div className="text-xs text-slate-500">{p.items_count} item{p.items_count === 1 ? '' : 's'}{p.invoice_number ? ` · Bill ${p.invoice_number}` : ''}</div>
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600">{date(p.purchase_date)}</Td>
                      <Td className="whitespace-nowrap text-right">{money(p.grand_total)}</Td>
                      <Td className="whitespace-nowrap text-right">{Number(p.due_amount) > 0 ? <span className="font-medium text-red-600">{money(p.due_amount)}</span> : <span className="text-slate-400">—</span>}</Td>
                      <Td><Badge color={st.color}>{st.label}</Badge></Td>
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
