import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Banknote, ChevronRight, FileText, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Printer, ReceiptText, Search, ShoppingBag,
  Star, Trash2, Users, Wallet, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { date, money, today } from '../../lib/format';
import { buildStatementText, buildUdhaarReminder, openWhatsApp } from '../../lib/whatsapp';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select,
  StatCard, Table, Td, Textarea, Th, cx, useConfirm, useToast,
} from '../../components/ui';
import {
  PaymentMethodSelect, ReceivePaymentModal, StatusBadges, isHeld, rich, saleDue, saleNet, salePaid, useInvalidateSales,
} from '../sales/salesShared';
import { printNow } from '../../lib/printer';

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
  const t = useT();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // {} for new

  const list = useQuery({ queryKey: ['customers'], queryFn: () => api.get('/customers'), select: (r) => r.data || [] });
  const all = list.data || [];

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return all.filter((c) => {
      if (filter === 'due' && !(Number(c.total_due) > 0)) return false;
      if (!term) return true;
      return [c.name, c.city, c.email].some((v) => v?.toLowerCase().includes(term))
        || (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits))
        || (c.phone || '').toLowerCase().includes(term);
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
        title={t('Customers & udhaar')}
        subtitle={t('Your regular customers, what they bought, and how much udhaar they still owe you.')}
        actions={can('customers.create') && <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add customer')}</Button>}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label={t('Customers')} value={<span className="num">{all.length}</span>} />
        <StatCard icon={Wallet} label={t('Total udhaar (still owed to you)')} value={<span className="num">{money(outstanding)}</span>} tone={outstanding > 0 ? 'red' : 'green'} />
        <button type="button" className={cx('rounded-xl text-start', filter === 'due' && 'ring-2 ring-amber-400')} onClick={() => setFilter(filter === 'due' ? '' : 'due')}>
          <StatCard icon={ReceiptText} label={t('Customers who owe you (tap to see)')} value={<span className="num">{withDues}</span>} tone="amber" />
        </button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input className="ps-10 pe-10" placeholder={t('Search name, phone or city…')} value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute end-1 top-1/2 -translate-y-1/2 rounded p-2 text-slate-400 hover:text-slate-600" aria-label={t('Clear')}><X className="size-5" /></button>}
          </div>
          <div className="w-full sm:w-56"><Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('Show')}>
            <option value="">{t('All customers')}</option>
            <option value="due">{t('Only who owe money')}</option>
          </Select></div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState
            icon={Users}
            title={all.length ? t('No matching customers') : t('No customers yet')}
            action={!all.length && can('customers.create') && <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add your first customer')}</Button>}
          >
            {all.length
              ? (filter === 'due' && !search ? t('Nobody owes you money right now.') : t('Try a different name or phone number.'))
              : t('Save your regular customers so you can give them udhaar and keep track of what they owe.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="text-start">{t('Customer')}</Th><Th className="text-start">{t('Phone')}</Th><Th className="text-end">{t('Bills')}</Th>
                <Th className="text-end">{t('Total bought')}</Th><Th className="hidden text-start md:table-cell">{t('Last bought')}</Th><Th className="text-end">{t('Udhaar')}</Th><Th />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const due = Number(c.total_due || 0);
                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/customers/${c.id}`)}>
                    <Td className="py-4">
                      <div className="text-base font-medium text-slate-900">{c.name}</div>
                      {(c.city || c.price_level === 'wholesale' || Number(c.loyalty_points) > 0) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          {c.city && <span>{c.city}</span>}
                          {c.price_level === 'wholesale' && <Badge color="blue">{t('Wholesale')}</Badge>}
                          {Number(c.loyalty_points) > 0 && <Badge color="amber"><Star className="me-1 size-3" />{rich(t('{n} points'), { n: <span className="num">{c.loyalty_points}</span> })}</Badge>}
                        </div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600"><span className="num">{c.phone}</span></Td>
                    <Td className="text-end text-slate-600"><span className="num">{c.sales_count ?? 0}</span></Td>
                    <Td className="whitespace-nowrap text-end"><span className="num">{money(c.total_purchases)}</span></Td>
                    <Td className="hidden whitespace-nowrap text-slate-600 md:table-cell">{c.last_sale_date ? <span className="num">{date(c.last_sale_date)}</span> : <span className="text-slate-400">—</span>}</Td>
                    <Td className="whitespace-nowrap text-end">{due > 0 ? <Badge color="red" className="text-sm"><span className="num">{money(due)}</span></Badge> : <span className="text-slate-400">—</span>}</Td>
                    <Td className="text-end"><ChevronRight className="ms-auto size-5 text-slate-400 rtl:rotate-180" /></Td>
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

const EMPTY = { name: '', phone: '', email: '', city: '', address: '', notes: '', price_level: 'retail' };

function CustomerForm({ customer, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = !customer.id;
  const [form, setForm] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, customer[k] ?? EMPTY[k]])) }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
      return isNew ? api.post('/customers', body) : api.put(`/customers/${customer.id}`, body);
    },
    onSuccess: (res) => {
      toast(isNew ? t('Customer added') : t('Customer updated'));
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
      title={isNew ? t('Add customer') : t('Change details — {name}', { name: customer.name })}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" size="lg" form="customer-form" loading={save.isPending} disabled={!form.name.trim() || !form.phone.trim()}>{isNew ? t('Add customer') : t('Save')}</Button>
        </>
      )}
    >
      <form id="customer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('Name')} required error={err('name')}><Input value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label={t('Phone')} required error={err('phone')} hint={t('Each customer needs a different phone number')}><Input type="tel" className="num" value={form.phone} onChange={set('phone')} placeholder="03xx-xxxxxxx" /></Field>
        <Field label={t('Email (optional)')} error={err('email')}><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label={t('City (optional)')} error={err('city')}><Input value={form.city} onChange={set('city')} /></Field>
        <Field label={t('Price type')} error={err('price_level')} hint={form.price_level === 'wholesale' ? t('Items that have a wholesale price are sold to this customer at that price.') : t('Normal selling price.')} className="sm:col-span-2">
          <Select value={form.price_level || 'retail'} onChange={set('price_level')}>
            <option value="retail">{t('Retail')}</option>
            <option value="wholesale">{t('Wholesale')}</option>
          </Select>
        </Field>
        <Field label={t('Address (optional)')} error={err('address')} className="sm:col-span-2"><Input value={form.address} onChange={set('address')} /></Field>
        <Field label={t('Note (optional)')} error={err('notes')} className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} placeholder={t('e.g. pays at month end')} /></Field>
        {save.error && !Object.keys(errs).length && <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- detail

function CustomerDetail() {
  const t = useT();
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
    onSuccess: () => { toast(t('Customer deleted')); qc.invalidateQueries({ queryKey: ['customers'] }); navigate('/customers'); },
    onError: (e) => toast(e.message, 'error'),
  });

  const back = (
    <Button variant="ghost" onClick={() => navigate('/customers')}>
      <ArrowLeft className="size-5 rtl:rotate-180" />{t('All customers')}
    </Button>
  );
  if (cq.isLoading) return <Page><Loading /></Page>;
  if (cq.error) return <Page><div className="mb-4">{back}</div><ErrorBox error={cq.error} /></Page>;

  const c = cq.data;
  const sales = sq.data || [];
  const unpaid = sales.filter((s) => saleDue(s) > 0).sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
  const due = Number(c.total_due || 0);
  const lastPage = Math.max(1, Math.ceil(sales.length / PER_PAGE));
  const pageRows = sales.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const hasBills = Number(c.sales_count) > 0;

  const remove = async () => {
    if (hasBills) { toast(t('This customer has bills, so they cannot be deleted.'), 'error'); return; }
    if (await confirm({
      title: t('Delete this customer?'),
      message: t('{name} ({phone}) will be removed for good. You cannot undo this.', { name: c.name, phone: c.phone }),
      danger: true,
      confirmLabel: t('Yes, delete'),
    })) del.mutate();
  };

  return (
    <Page>
      <div className="mb-2 -ms-2">{back}</div>
      <PageHeader
        title={c.name}
        subtitle={c.created_at ? rich(t('Customer since {date}'), { date: <span className="num">{date(c.created_at)}</span> }) : null}
        actions={(
          <>
            {canSales && <Button variant="secondary" icon={FileText} onClick={() => setStatement(true)} disabled={!sales.length}>{t('Print statement')}</Button>}
            {canSales && (
              <Button variant="secondary" icon={MessageCircle} className="text-emerald-700" disabled={!sales.length} onClick={() => openWhatsApp(c.phone, buildStatementText(c, sales, shop, t))}>
                {t('Send statement')}
              </Button>
            )}
            {can('customers.edit') && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>{t('Edit')}</Button>}
            {can('customers.delete') && (
              <Button variant="secondary" icon={Trash2} onClick={remove} loading={del.isPending} disabled={hasBills} title={hasBills ? t('Customers with bills cannot be deleted') : t('Delete customer')} className="text-red-600">{t('Delete')}</Button>
            )}
          </>
        )}
      />

      {/* Udhaar — the main thing on this page. */}
      <Card className={cx('mb-5 flex flex-wrap items-center gap-4 p-5', due > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50')}>
        <div className={cx('rounded-full p-3', due > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600')}><Wallet className="size-7" /></div>
        <div className="min-w-48 flex-1">
          <div className={cx('text-base', due > 0 ? 'text-red-800' : 'text-emerald-800')}>{due > 0 ? t('{name} owes you', { name: c.name }) : t('{name} owes you nothing', { name: c.name })}</div>
          {due > 0 && <div className="num text-3xl font-bold text-red-700">{money(due)}</div>}
        </div>
        {due > 0 && (
          <Button size="lg" variant="secondary" icon={MessageCircle} className="h-auto min-h-14 whitespace-normal py-2 border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => openWhatsApp(c.phone, buildUdhaarReminder(c, due, shop, t))}>
            {t('Send udhaar reminder on WhatsApp')}
          </Button>
        )}
        {canSales && unpaid.length > 0 && (
          <Button size="xl" variant="success" icon={Banknote} onClick={() => setPaying('auto')}>{t('Take udhaar payment')}</Button>
        )}
      </Card>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard icon={ShoppingBag} label={t('Total bought')} value={<span className="num">{money(c.total_purchases)}</span>} />
        <StatCard
          icon={Star}
          label={t('Loyalty points')}
          tone="green"
          value={(
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span className="num">{Number(c.loyalty_points || 0)}</span>
              {Number(shop.settings?.loyalty?.point_value) > 0 && Number(c.loyalty_points) > 0 && (
                <span className="text-sm font-normal text-slate-500">{rich(t('worth {amount}'), { amount: <span className="num">{money(Number(c.loyalty_points) * Number(shop.settings.loyalty.point_value))}</span> })}</span>
              )}
            </span>
          )}
        />
        <StatCard
          icon={ReceiptText}
          label={t('Bills')}
          tone="amber"
          value={(
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span className="num">{c.sales_count ?? 0}</span>
              {c.last_sale_date && <span className="text-sm font-normal text-slate-500">{rich(t('last bought {date}'), { date: <span className="num">{date(c.last_sale_date)}</span> })}</span>}
            </span>
          )}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="h-fit p-5 text-base">
          <div className="mb-3 text-sm font-semibold text-slate-500">{t('Contact')}</div>
          <ul className="space-y-2.5 text-slate-700">
            <li className="flex items-center gap-2"><Phone className="size-5 shrink-0 text-slate-400" /><a href={`tel:${c.phone}`} className="num py-1 hover:underline">{c.phone}</a></li>
            {c.email && <li className="flex items-center gap-2"><Mail className="size-5 shrink-0 text-slate-400" /><span className="ltr truncate">{c.email}</span></li>}
            {(c.address || c.city) && <li className="flex items-start gap-2"><MapPin className="mt-1 size-5 shrink-0 text-slate-400" /><span>{[c.address, c.city].filter(Boolean).join(', ')}</span></li>}
          </ul>
          <div className="mb-1 mt-4 text-sm font-semibold text-slate-500">{t('Price type')}</div>
          <p>{c.price_level === 'wholesale' ? <Badge color="blue" className="text-sm">{t('Wholesale')}</Badge> : <span className="text-slate-700">{t('Retail')}</span>}</p>
          {c.notes && <><div className="mb-1 mt-4 text-sm font-semibold text-slate-500">{t('Note')}</div><p className="whitespace-pre-line text-slate-700">{c.notes}</p></>}
        </Card>

        <div className="space-y-5 lg:col-span-2">
          {!canSales ? (
            <Card><EmptyState icon={ReceiptText} title={t('Bills are hidden')}>{t("You don't have permission to see bills. Ask the shop owner.")}</EmptyState></Card>
          ) : sq.isLoading ? <Card><Loading /></Card> : sq.error ? <ErrorBox error={sq.error} /> : (
            <>
              {unpaid.length > 0 && (
                <Card>
                  <CardHeader
                    title={t('Unpaid bills')}
                    subtitle={rich(unpaid.length === 1 ? t('1 bill · {amount} still owed') : t('{n} bills · {amount} still owed'), {
                      n: <span className="num">{unpaid.length}</span>,
                      amount: <span className="num">{money(unpaid.reduce((a, s) => a + saleDue(s), 0))}</span>,
                    })}
                  />
                  <Table>
                    <thead><tr><Th className="text-start">{t('Bill #')}</Th><Th className="text-start">{t('Date')}</Th><Th className="text-end">{t('Bill')}</Th><Th className="text-end">{t('Paid')}</Th><Th className="text-end">{t('Still owed')}</Th><Th /></tr></thead>
                    <tbody>
                      {unpaid.map((s) => (
                        <tr key={s.invoice_number}>
                          <Td><button type="button" className="num py-1 font-medium text-brand-700 hover:underline" onClick={() => navigate(`/sales/${s.invoice_number}`)}>{s.invoice_number}</button></Td>
                          <Td className="whitespace-nowrap text-slate-600"><span className="num">{date(s.sale_date)}</span></Td>
                          <Td className="whitespace-nowrap text-end"><span className="num">{money(saleNet(s))}</span></Td>
                          <Td className="whitespace-nowrap text-end text-slate-600"><span className="num">{money(salePaid(s))}</span></Td>
                          <Td className="whitespace-nowrap text-end font-semibold text-red-600"><span className="num">{money(saleDue(s))}</span></Td>
                          <Td className="text-end"><Button variant="secondary" icon={Banknote} onClick={() => setPaying(s)}>{t('Take payment')}</Button></Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              )}

              <Card>
                <CardHeader title={t('All bills')} subtitle={sales.length === 1 ? t('1 bill') : sales.length ? rich(t('{n} bills'), { n: <span className="num">{sales.length}</span> }) : null} />
                {!sales.length ? (
                  <EmptyState icon={ReceiptText} title={t('No bills yet')}>{t('Choose this customer on the Sell screen to add bills to their account.')}</EmptyState>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th className="text-start">{t('Bill #')}</Th><Th className="text-start">{t('Date')}</Th><Th className="text-end">{t('Items')}</Th><Th className="text-end">{t('Total')}</Th>
                        <Th className="hidden text-start sm:table-cell">{t('Payment')}</Th><Th className="text-start">{t('Status')}</Th><Th />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((s) => (
                        <tr key={s.invoice_number} className={cx('cursor-pointer hover:bg-slate-50', isHeld(s) && 'bg-amber-50/40')} onClick={() => navigate(`/sales/${s.invoice_number}`)}>
                          <Td className="py-4 font-medium text-slate-900"><span className="num">{s.invoice_number}</span></Td>
                          <Td className="whitespace-nowrap text-slate-600"><span className="num">{date(s.sale_date)}</span></Td>
                          <Td className="text-end text-slate-600"><span className="num">{s.items_count}</span></Td>
                          <Td className="whitespace-nowrap text-end font-medium"><span className="num">{money(saleNet(s))}</span></Td>
                          <Td className="hidden whitespace-nowrap text-slate-600 sm:table-cell">{isHeld(s) ? '—' : t(shop.paymentLabel(s.payment_method))}</Td>
                          <Td><StatusBadges sale={s} /></Td>
                          <Td className="text-end"><ChevronRight className="ms-auto size-5 text-slate-400 rtl:rotate-180" /></Td>
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
  const t = useT();
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
      toast(t('Received {amount} from {name}', { amount: money(value), name: customer.name }));
      invalidate();
      onClose();
    } catch (e) {
      setError(done.length ? new Error(t('Saved for bills {bills}, then it stopped: {error}', { bills: done.join(', '), error: e.message })) : e);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Take udhaar payment — {name}', { name: customer.name })}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="success" size="lg" loading={busy} disabled={bad} onClick={submit}>{t('Receive')} <span className="num">{money(value)}</span></Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-red-800">
          <span className="text-base">{t('Total udhaar')}</span><span className="num text-2xl font-bold">{money(totalDue)}</span>
        </div>
        {unpaid.length > 1 && (
          <Field label={t('Which bill is this money for?')}>
            <Select value={target} onChange={(e) => {
              const v = e.target.value;
              setTarget(v);
              setAmount(String(v === 'auto' ? totalDue : saleDue(unpaid.find((s) => s.invoice_number === v))));
            }}
            >
              <option value="auto">{t('Oldest bills first (recommended)')}</option>
              {unpaid.map((s) => <option key={s.invoice_number} value={s.invoice_number}>{t('Bill {inv} · {date} · {amount} owed', { inv: s.invoice_number, date: date(s.sale_date), amount: money(saleDue(s)) })}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('How much money did you get?')} required error={value > maxAmount + 0.001 ? t('Cannot be more than {amount}', { amount: money(maxAmount) }) : null}>
          <div className="flex gap-2">
            <Input type="number" min="0.01" step="0.01" className="h-12 text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            <Button variant="secondary" className="h-12" onClick={() => setAmount(String(maxAmount))}>{t('Full amount')}</Button>
          </div>
        </Field>
        <Field label={t('Paid by')}><PaymentMethodSelect value={method} onChange={setMethod} /></Field>
        {plan.length > 0 && !bad && (
          <div className="rounded-lg bg-slate-50 p-3 text-base">
            <div className="mb-1 text-sm font-semibold text-slate-500">{t('This money will go to')}</div>
            {plan.map(({ sale, pay }) => {
              const left = Math.round((saleDue(sale) - pay) * 100) / 100;
              return (
                <div key={sale.invoice_number} className="flex flex-wrap justify-between gap-2 text-slate-700">
                  <span className="num">{sale.invoice_number}</span>
                  <span>
                    <span className="num">{money(pay)}</span>{' '}
                    <span className="text-sm text-slate-500">
                      ({left > 0 ? rich(t('{amount} still owed'), { amount: <span className="num">{money(left)}</span> }) : t('fully paid')})
                    </span>
                  </span>
                </div>
              );
            })}
            <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold text-slate-900"><span>{t('Udhaar left after this')}</span><span className="num">{money(totalDue - value)}</span></div>
          </div>
        )}
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- statement

function StatementModal({ customer, sales, onClose }) {
  const t = useT();
  const [onlyDue, setOnlyDue] = useState(false);
  const bills = sales.filter((s) => !isHeld(s) && (!onlyDue || saleDue(s) > 0))
    .sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('Customer statement')}
      footer={(
        <>
          <label className="me-auto flex items-center gap-2 py-2 text-base text-slate-600">
            <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} className="size-5 rounded border-slate-300 accent-brand-600" />
            {t('Only bills with money still owed')}
          </label>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Close')}</Button>
          <Button size="lg" icon={Printer} onClick={() => printNow('document')}>{t('Print')}</Button>
        </>
      )}
    >
      <div className="overflow-x-auto rounded-lg border border-slate-200 p-5"><Statement customer={customer} bills={bills} onlyDue={onlyDue} /></div>
      {/* Printed copy lives at the top of <body> so long statements flow over several pages. */}
      {createPortal(<div className="print-area hidden w-full bg-white p-2 print:block"><Statement customer={customer} bills={bills} onlyDue={onlyDue} /></div>, document.body)}
    </Modal>
  );
}

function Statement({ customer, bills, onlyDue }) {
  const t = useT();
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
          {s.phone && <div className="text-slate-600">{t('Phone')}: <span className="num">{s.phone}</span></div>}
        </div>
        <div className="text-end">
          <div className="text-base font-semibold">{t('Account statement')}</div>
          <div className="text-slate-600">{t('Date')}: <span className="num">{date(today())}</span></div>
          {onlyDue && <div className="text-slate-600">{t('Unpaid bills only')}</div>}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-xs text-slate-500">{t('Customer')}</div>
        <div className="font-semibold">{customer.name}</div>
        <div className="text-slate-600">
          <span className="num">{customer.phone}</span>
          {[customer.address, customer.city].filter(Boolean).map((x) => <span key={x}> · {x}</span>)}
        </div>
      </div>
      <table className="mt-4 w-full border-collapse text-start">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className={cx(cell, 'text-start')}>{t('Date')}</th><th className={cx(cell, 'text-start')}>{t('Bill #')}</th><th className={cx(cell, 'text-end')}>{t('Bill amount')}</th>
            {anyReturns && <th className={cx(cell, 'text-end')}>{t('Returned')}</th>}
            <th className={cx(cell, 'text-end')}>{t('Paid')}</th><th className={cx(cell, 'text-end')}>{t('Still owed')}</th>
          </tr>
        </thead>
        <tbody>
          {bills.length ? bills.map((b) => (
            <tr key={b.invoice_number}>
              <td className={cell}><span className="num">{date(b.sale_date)}</span></td>
              <td className={cell}><span className="num">{b.invoice_number}</span></td>
              <td className={cx(cell, 'text-end')}><span className="num">{money(b.grand_total)}</span></td>
              {anyReturns && <td className={cx(cell, 'text-end')}>{Number(b.refunded_amount) > 0 ? <span className="num">-{money(b.refunded_amount)}</span> : '—'}</td>}
              <td className={cx(cell, 'text-end')}><span className="num">{money(salePaid(b))}</span></td>
              <td className={cx(cell, 'text-end font-medium')}>{saleDue(b) > 0 ? <span className="num">{money(saleDue(b))}</span> : '—'}</td>
            </tr>
          )) : <tr><td className={cx(cell, 'text-center text-slate-500')} colSpan={anyReturns ? 6 : 5}>{t('No bills')}</td></tr>}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="px-2 py-2" colSpan={2}>{t('Total')}</td>
            <td className="px-2 py-2 text-end"><span className="num">{money(totals.total)}</span></td>
            {anyReturns && <td className="px-2 py-2 text-end"><span className="num">-{money(totals.returned)}</span></td>}
            <td className="px-2 py-2 text-end"><span className="num">{money(totals.paid)}</span></td>
            <td className="px-2 py-2 text-end"><span className="num">{money(totals.due)}</span></td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-4 flex justify-end">
        <div className="rounded-lg border-2 border-slate-800 px-4 py-2 text-end">
          <div className="text-xs text-slate-600">{t('Amount still owed')}</div>
          <div className="num text-xl font-bold">{money(totals.due)}</div>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">{t('Thank you for shopping with us.')}</p>
    </div>
  );
}
