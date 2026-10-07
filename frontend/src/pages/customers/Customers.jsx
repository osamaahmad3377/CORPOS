import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Banknote, ChevronRight, FileText, Mail, MapPin, Pencil, Phone, Plus, Printer, ReceiptText, Search, ShoppingBag,
  Trash2, Users, Wallet, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { date, money, today } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select,
  StatCard, Table, Td, Textarea, Th, cx, useConfirm, useToast,
} from '../../components/ui';
import {
  PaymentMethodSelect, ReceivePaymentModal, StatusBadges, isHeld, saleDue, saleNet, salePaid, useInvalidateSales,
} from '../sales/salesShared';

export default function Customers() {
  return (
    <Routes>
      <Route index element={<CustomerList />} />
      <Route path=":id" element={<CustomerDetail />} />
    </Routes>
  );
}

const PER_PAGE = 25;

// ---------------------------------------------------------------- list

function CustomerList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // {} for new

  const list = useQuery({ queryKey: ['customers'], queryFn: () => api.get('/customers'), select: (r) => r.data || [] });
  const all = list.data || [];

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return all.filter((c) => {
      if (filter === 'due' && !(Number(c.total_due) > 0)) return false;
      if (!t) return true;
      return [c.name, c.city, c.email].some((v) => v?.toLowerCase().includes(t))
        || (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits))
        || (c.phone || '').toLowerCase().includes(t);
    }).sort((a, b) => (filter === 'due' ? Number(b.total_due) - Number(a.total_due) : 0));
  }, [all, search, filter]);
  useEffect(() => { setPage(1); }, [search, filter]);

  const outstanding = all.reduce((a, c) => a + Number(c.total_due || 0), 0);
  const withDues = all.filter((c) => Number(c.total_due) > 0).length;
  const lastPage = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <Page>
      <PageHeader
        title="Customers"
        subtitle="Regular customers, what they've bought and what they still owe (udhaar)."
        actions={can('customers.create') && <Button icon={Plus} onClick={() => setEditing({})}>Add customer</Button>}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Customers" value={all.length} />
        <StatCard icon={Wallet} label="Total outstanding" value={money(outstanding)} tone={outstanding > 0 ? 'red' : 'green'} />
        <button type="button" className="text-left" onClick={() => setFilter(filter === 'due' ? '' : 'due')}>
          <StatCard icon={ReceiptText} label="Customers with dues" value={withDues} tone="amber" />
        </button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9 pr-9" placeholder="Search name, phone or city…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Clear"><X className="size-4" /></button>}
          </div>
          <div className="w-full sm:w-48"><Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
            <option value="">All customers</option>
            <option value="due">Has dues</option>
          </Select></div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState
            icon={Users}
            title={all.length ? 'No matching customers' : 'No customers yet'}
            action={!all.length && can('customers.create') && <Button icon={Plus} onClick={() => setEditing({})}>Add your first customer</Button>}
          >
            {all.length ? (filter === 'due' && !search ? 'Nobody owes you anything right now.' : 'Try a different name or phone number.') : 'Save regular customers to sell on credit and track what they owe.'}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>Customer</Th><Th>Phone</Th><Th className="text-right">Bills</Th><Th className="text-right">Total bought</Th><Th className="hidden md:table-cell">Last purchase</Th><Th className="text-right">Due</Th><Th /></tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const due = Number(c.total_due || 0);
                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/customers/${c.id}`)}>
                    <Td>
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.city && <div className="text-xs text-slate-500">{c.city}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">{c.phone}</Td>
                    <Td className="text-right text-slate-600">{c.sales_count ?? 0}</Td>
                    <Td className="whitespace-nowrap text-right">{money(c.total_purchases)}</Td>
                    <Td className="hidden whitespace-nowrap text-slate-600 md:table-cell">{c.last_sale_date ? date(c.last_sale_date) : <span className="text-slate-400">—</span>}</Td>
                    <Td className="whitespace-nowrap text-right">{due > 0 ? <Badge color="red">{money(due)}</Badge> : <span className="text-slate-400">—</span>}</Td>
                    <Td className="text-right"><ChevronRight className="ml-auto size-4 text-slate-400" /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination meta={{ current_page: page, last_page: lastPage, total: rows.length }} onPage={setPage} />
      </Card>

      {editing && <CustomerForm customer={editing} onClose={() => setEditing(null)} onSaved={(c) => { if (!editing.id) navigate(`/customers/${c.id}`); }} />}
    </Page>
  );
}

// ---------------------------------------------------------------- create / edit

const EMPTY = { name: '', phone: '', email: '', city: '', address: '', notes: '' };

function CustomerForm({ customer, onClose, onSaved }) {
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = !customer.id;
  const [form, setForm] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, customer[k] ?? ''])) }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
      return isNew ? api.post('/customers', body) : api.put(`/customers/${customer.id}`, body);
    },
    onSuccess: (res) => {
      toast(isNew ? 'Customer added' : 'Customer updated');
      qc.invalidateQueries({ queryKey: ['customers'] });
      onSaved?.(res.data);
      onClose();
    },
  });
  const errs = save.error?.errors || {};
  const err = (k) => errs[k]?.[0];
  const submit = (e) => { e.preventDefault(); if (form.name.trim() && form.phone.trim()) save.mutate(); };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add customer' : `Edit ${customer.name}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="customer-form" loading={save.isPending} disabled={!form.name.trim() || !form.phone.trim()}>{isNew ? 'Add customer' : 'Save changes'}</Button>
        </>
      )}
    >
      <form id="customer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={err('name')}><Input value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Phone" required error={err('phone')} hint="Each customer needs a different number"><Input type="tel" value={form.phone} onChange={set('phone')} placeholder="03xx-xxxxxxx" /></Field>
        <Field label="Email" error={err('email')}><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="City" error={err('city')}><Input value={form.city} onChange={set('city')} /></Field>
        <Field label="Address" error={err('address')} className="sm:col-span-2"><Input value={form.address} onChange={set('address')} /></Field>
        <Field label="Notes" error={err('notes')} className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="e.g. pays at month end" /></Field>
        {save.error && !Object.keys(errs).length && <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- detail

function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const shop = useShop();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(null); // 'auto' | sale
  const [statement, setStatement] = useState(false);
  const [page, setPage] = useState(1);

  const cq = useQuery({ queryKey: ['customers', 'detail', id], queryFn: () => api.get(`/customers/${id}`), select: (r) => r.data });
  const canSales = can('sales.create');
  const sq = useQuery({
    queryKey: ['sales', 'customer', id],
    queryFn: () => api.get('/sales', { customer_id: id, per_page: 1000 }),
    select: (r) => r.data || [],
    enabled: canSales,
  });

  const del = useMutation({
    mutationFn: () => api.del(`/customers/${id}`),
    onSuccess: () => { toast('Customer deleted'); qc.invalidateQueries({ queryKey: ['customers'] }); navigate('/customers'); },
    onError: (e) => toast(e.message, 'error'),
  });

  const back = <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/customers')}>All customers</Button>;
  if (cq.isLoading) return <Page><Loading /></Page>;
  if (cq.error) return <Page><div className="mb-4">{back}</div><ErrorBox error={cq.error} /></Page>;

  const c = cq.data;
  const sales = sq.data || [];
  const unpaid = sales.filter((s) => saleDue(s) > 0).sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
  const due = Number(c.total_due || 0);
  const lastPage = Math.max(1, Math.ceil(sales.length / PER_PAGE));
  const pageRows = sales.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const remove = async () => {
    if (Number(c.sales_count) > 0) { toast('This customer has bills on record and cannot be deleted.', 'error'); return; }
    if (await confirm({ title: 'Delete customer?', message: `${c.name} (${c.phone}) will be removed. This cannot be undone.`, danger: true, confirmLabel: 'Delete' })) del.mutate();
  };

  return (
    <Page>
      <div className="mb-2 -ml-2">{back}</div>
      <PageHeader
        title={c.name}
        subtitle={c.created_at ? `Customer since ${date(c.created_at)}` : null}
        actions={(
          <>
            {canSales && <Button variant="secondary" icon={FileText} onClick={() => setStatement(true)} disabled={!sales.length}>Statement</Button>}
            {can('customers.edit') && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
            {can('customers.delete') && (
              <Button variant="secondary" icon={Trash2} onClick={remove} loading={del.isPending} disabled={Number(c.sales_count) > 0} title={Number(c.sales_count) > 0 ? 'Customers with bills on record cannot be deleted' : 'Delete customer'} className="text-red-600">Delete</Button>
            )}
            {canSales && unpaid.length > 0 && <Button variant="success" icon={Banknote} onClick={() => setPaying('auto')}>Receive payment</Button>}
          </>
        )}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Wallet} label="Outstanding (udhaar)" value={money(due)} tone={due > 0 ? 'red' : 'green'} />
        <StatCard icon={ShoppingBag} label="Total bought" value={money(c.total_purchases)} />
        <StatCard icon={ReceiptText} label="Bills" value={`${c.sales_count ?? 0}${c.last_sale_date ? ` · last ${date(c.last_sale_date)}` : ''}`} tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="h-fit p-5 text-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</div>
          <ul className="space-y-2.5 text-slate-700">
            <li className="flex items-center gap-2"><Phone className="size-4 text-slate-400" /><a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a></li>
            {c.email && <li className="flex items-center gap-2"><Mail className="size-4 text-slate-400" /><span className="truncate">{c.email}</span></li>}
            {(c.address || c.city) && <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" /><span>{[c.address, c.city].filter(Boolean).join(', ')}</span></li>}
          </ul>
          {c.notes && <><div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</div><p className="whitespace-pre-line text-slate-700">{c.notes}</p></>}
        </Card>

        <div className="space-y-5 lg:col-span-2">
          {!canSales ? (
            <Card><EmptyState icon={ReceiptText} title="Bills are hidden">You don&apos;t have permission to view sales.</EmptyState></Card>
          ) : sq.isLoading ? <Card><Loading /></Card> : sq.error ? <ErrorBox error={sq.error} /> : (
            <>
              {unpaid.length > 0 && (
                <Card>
                  <CardHeader title="Unpaid bills" subtitle={`${unpaid.length} bill${unpaid.length > 1 ? 's' : ''} · ${money(unpaid.reduce((a, s) => a + saleDue(s), 0))} owed`} />
                  <Table>
                    <thead><tr><Th>Bill #</Th><Th>Date</Th><Th className="text-right">Bill</Th><Th className="text-right">Paid</Th><Th className="text-right">Due</Th><Th /></tr></thead>
                    <tbody>
                      {unpaid.map((s) => (
                        <tr key={s.invoice_number}>
                          <Td><button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => navigate(`/sales/${s.invoice_number}`)}>{s.invoice_number}</button></Td>
                          <Td className="whitespace-nowrap text-slate-600">{date(s.sale_date)}</Td>
                          <Td className="whitespace-nowrap text-right">{money(saleNet(s))}</Td>
                          <Td className="whitespace-nowrap text-right text-slate-600">{money(salePaid(s))}</Td>
                          <Td className="whitespace-nowrap text-right font-semibold text-red-600">{money(saleDue(s))}</Td>
                          <Td className="text-right"><Button size="sm" variant="secondary" icon={Banknote} onClick={() => setPaying(s)}>Receive</Button></Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              )}

              <Card>
                <CardHeader title="All bills" subtitle={sales.length ? `${sales.length} bill${sales.length > 1 ? 's' : ''}` : null} />
                {!sales.length ? (
                  <EmptyState icon={ReceiptText} title="No bills yet">Pick this customer at the POS to link a sale to them.</EmptyState>
                ) : (
                  <Table>
                    <thead><tr><Th>Bill #</Th><Th>Date</Th><Th className="text-right">Items</Th><Th className="text-right">Total</Th><Th className="hidden sm:table-cell">Payment</Th><Th>Status</Th><Th /></tr></thead>
                    <tbody>
                      {pageRows.map((s) => (
                        <tr key={s.invoice_number} className={cx('cursor-pointer hover:bg-slate-50', isHeld(s) && 'bg-amber-50/40')} onClick={() => navigate(`/sales/${s.invoice_number}`)}>
                          <Td className="font-medium text-slate-900">{s.invoice_number}</Td>
                          <Td className="whitespace-nowrap text-slate-600">{date(s.sale_date)}</Td>
                          <Td className="text-right text-slate-600">{s.items_count}</Td>
                          <Td className="whitespace-nowrap text-right font-medium">{money(saleNet(s))}</Td>
                          <Td className="hidden whitespace-nowrap text-slate-600 sm:table-cell">{isHeld(s) ? '—' : shop.paymentLabel(s.payment_method)}</Td>
                          <Td><StatusBadges sale={s} /></Td>
                          <Td className="text-right"><ChevronRight className="ml-auto size-4 text-slate-400" /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                <Pagination meta={{ current_page: page, last_page: lastPage, total: sales.length }} onPage={setPage} />
              </Card>
            </>
          )}
        </div>
      </div>

      {editing && <CustomerForm customer={c} onClose={() => setEditing(false)} />}
      {paying === 'auto' && <CustomerPaymentModal customer={c} unpaid={unpaid} onClose={() => setPaying(null)} />}
      {paying && paying !== 'auto' && <ReceivePaymentModal sale={paying} onClose={() => setPaying(null)} />}
      {statement && <StatementModal customer={c} sales={sales} onClose={() => setStatement(false)} />}
    </Page>
  );
}

// ---------------------------------------------------------------- receive payment (customer level)

// Pay one chosen bill, or spread a lump sum over the oldest bills first.
function CustomerPaymentModal({ customer, unpaid, onClose }) {
  const toast = useToast();
  const invalidate = useInvalidateSales();
  const totalDue = Math.round(unpaid.reduce((a, s) => a + saleDue(s), 0) * 100) / 100;
  const [target, setTarget] = useState(unpaid.length === 1 ? unpaid[0].invoice_number : 'auto');
  const maxAmount = target === 'auto' ? totalDue : saleDue(unpaid.find((s) => s.invoice_number === target));
  const [amount, setAmount] = useState(String(maxAmount));
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const value = Number(amount || 0);
  const bad = value <= 0 || value > maxAmount + 0.001;

  const plan = useMemo(() => {
    const out = [];
    let left = Math.round(value * 100) / 100;
    const bills = target === 'auto' ? unpaid : unpaid.filter((s) => s.invoice_number === target);
    for (const s of bills) {
      if (left <= 0) break;
      const pay = Math.min(left, saleDue(s));
      out.push({ sale: s, pay: Math.round(pay * 100) / 100 });
      left = Math.round((left - pay) * 100) / 100;
    }
    return out;
  }, [value, target, unpaid]);

  const submit = async () => {
    if (bad) return;
    setBusy(true);
    setError(null);
    const done = [];
    try {
      for (const { sale, pay } of plan) {
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/sales/${sale.invoice_number}/payments`, { amount: pay, payment_method: method });
        done.push(sale.invoice_number);
      }
      toast(`Received ${money(value)} from ${customer.name}`);
      invalidate();
      onClose();
    } catch (e) {
      setError(done.length ? new Error(`Saved for ${done.join(', ')}, then failed: ${e.message}`) : e);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive payment — ${customer.name}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="success" loading={busy} disabled={bad} onClick={submit}>Receive {money(value)}</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Apply payment to">
          <Select value={target} onChange={(e) => {
            const t = e.target.value;
            setTarget(t);
            setAmount(String(t === 'auto' ? totalDue : saleDue(unpaid.find((s) => s.invoice_number === t))));
          }}
          >
            {unpaid.length > 1 && <option value="auto">Oldest bills first — {money(totalDue)} owed in total</option>}
            {unpaid.map((s) => <option key={s.invoice_number} value={s.invoice_number}>{s.invoice_number} · {date(s.sale_date)} · {money(saleDue(s))} due</option>)}
          </Select>
        </Field>
        <Field label="Amount received" required error={value > maxAmount + 0.001 ? `Cannot be more than ${money(maxAmount)}` : null}>
          <div className="flex gap-2">
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            <Button variant="secondary" onClick={() => setAmount(String(maxAmount))}>Full</Button>
          </div>
        </Field>
        <Field label="Paid by"><PaymentMethodSelect value={method} onChange={setMethod} /></Field>
        {plan.length > 0 && !bad && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Will be recorded as</div>
            {plan.map(({ sale, pay }) => {
              const left = Math.round((saleDue(sale) - pay) * 100) / 100;
              return (
                <div key={sale.invoice_number} className="flex justify-between gap-2 text-slate-700">
                  <span>{sale.invoice_number}</span>
                  <span>{money(pay)} <span className="text-xs text-slate-500">{left > 0 ? `(${money(left)} still due)` : '(cleared)'}</span></span>
                </div>
              );
            })}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900"><span>Balance after payment</span><span>{money(totalDue - value)}</span></div>
          </div>
        )}
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- statement

function StatementModal({ customer, sales, onClose }) {
  const [onlyDue, setOnlyDue] = useState(false);
  const bills = sales.filter((s) => !isHeld(s) && (!onlyDue || saleDue(s) > 0))
    .sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Customer statement"
      footer={(
        <>
          <label className="mr-auto flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} className="size-4 rounded border-slate-300" />
            Only bills with balance due
          </label>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print</Button>
        </>
      )}
    >
      <div className="rounded-lg border border-slate-200 p-5"><Statement customer={customer} bills={bills} onlyDue={onlyDue} /></div>
      {/* Printed copy lives at the top of <body> so long statements flow over several pages. */}
      {createPortal(<div className="print-area hidden w-full bg-white p-2 print:block"><Statement customer={customer} bills={bills} onlyDue={onlyDue} /></div>, document.body)}
    </Modal>
  );
}

function Statement({ customer, bills, onlyDue }) {
  const shop = useShop();
  const s = shop.settings.shop || {};
  const totals = bills.reduce((a, b) => ({
    total: a.total + Number(b.grand_total), returned: a.returned + Number(b.refunded_amount || 0), paid: a.paid + salePaid(b), due: a.due + saleDue(b),
  }), { total: 0, returned: 0, paid: 0, due: 0 });
  const anyReturns = totals.returned > 0;
  const cell = 'border-b border-slate-200 px-2 py-1.5';

  return (
    <div className="text-[13px] text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
        <div>
          <div className="text-lg font-bold">{shop.shopName}</div>
          {s.address && <div className="text-slate-600">{s.address}</div>}
          {s.phone && <div className="text-slate-600">Ph: {s.phone}</div>}
        </div>
        <div className="text-right">
          <div className="text-base font-semibold uppercase tracking-wide">Account statement</div>
          <div className="text-slate-600">Date: {date(today())}</div>
          {onlyDue && <div className="text-slate-600">Unpaid bills only</div>}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">Customer</div>
        <div className="font-semibold">{customer.name}</div>
        <div className="text-slate-600">{[customer.phone, customer.address, customer.city].filter(Boolean).join(' · ')}</div>
      </div>
      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className={cell}>Date</th><th className={cell}>Bill #</th><th className={cx(cell, 'text-right')}>Bill amount</th>
            {anyReturns && <th className={cx(cell, 'text-right')}>Returned</th>}
            <th className={cx(cell, 'text-right')}>Paid</th><th className={cx(cell, 'text-right')}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {bills.length ? bills.map((b) => (
            <tr key={b.invoice_number}>
              <td className={cell}>{date(b.sale_date)}</td>
              <td className={cell}>{b.invoice_number}</td>
              <td className={cx(cell, 'text-right')}>{money(b.grand_total)}</td>
              {anyReturns && <td className={cx(cell, 'text-right')}>{Number(b.refunded_amount) > 0 ? `-${money(b.refunded_amount)}` : '—'}</td>}
              <td className={cx(cell, 'text-right')}>{money(salePaid(b))}</td>
              <td className={cx(cell, 'text-right font-medium')}>{saleDue(b) > 0 ? money(saleDue(b)) : '—'}</td>
            </tr>
          )) : <tr><td className={cx(cell, 'text-center text-slate-500')} colSpan={anyReturns ? 6 : 5}>No bills</td></tr>}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="px-2 py-2" colSpan={2}>Total</td>
            <td className="px-2 py-2 text-right">{money(totals.total)}</td>
            {anyReturns && <td className="px-2 py-2 text-right">-{money(totals.returned)}</td>}
            <td className="px-2 py-2 text-right">{money(totals.paid)}</td>
            <td className="px-2 py-2 text-right">{money(totals.due)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-4 flex justify-end">
        <div className="rounded-lg border-2 border-slate-800 px-4 py-2 text-right">
          <div className="text-xs uppercase tracking-wide text-slate-600">Amount outstanding</div>
          <div className="text-xl font-bold">{money(totals.due)}</div>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">Thank you for your business.</p>
    </div>
  );
}
