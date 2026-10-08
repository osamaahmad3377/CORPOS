// Quotations / estimates: a priced list for a customer before they buy.
// No stock or money moves. "Turn into a sale" opens the POS with /pos?quote=<id>.
import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FilePlus2, FileText, MessageCircle, Pencil, Printer, ScanBarcode, Search, ShoppingCart, Trash2, UserRound, X,
} from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { date, dateTime, money, qty, round3, today } from '../../lib/format';
import { buildQuoteText, openWhatsApp } from '../../lib/whatsapp';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Table, Td, Textarea, Th,
  cx, useConfirm, useToast,
} from '../../components/ui';
import { VariantFinder, badQty, unitStep, useUnitText } from '../inventory/VariantFinder';
import { rich } from '../sales/salesShared';
import { QuotePrint } from './QuotePrint';
import { printNow } from '../../lib/printer';

const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;

export const QUOTE_STATUS = {
  draft: { label: 'Draft', color: 'gray' },
  sent: { label: 'Sent', color: 'blue' },
  converted: { label: 'Turned into sale', color: 'green' },
  expired: { label: 'Expired', color: 'amber' },
};

function StatusBadge({ status }) {
  const t = useT();
  const st = QUOTE_STATUS[status] || { label: status, color: 'gray' };
  return <Badge color={st.color} className="text-sm">{t(st.label)}</Badge>;
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function BackLink({ to, children }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)} className="mb-3 inline-flex items-center gap-1.5 py-1 text-base text-slate-500 hover:text-slate-700">
      <ArrowLeft className="size-5 rtl:rotate-180" />{children}
    </button>
  );
}

function NoAccess() {
  const t = useT();
  return <Page><ErrorBox error={{ message: t('You are not allowed to make quotations. Ask the shop owner.') }} /></Page>;
}

export default function Quotations() {
  const { can } = useAuth();
  if (!can('quotations.manage')) return <NoAccess />;
  return (
    <Routes>
      <Route index element={<QuoteList />} />
      <Route path="new" element={<QuoteEditor />} />
      <Route path=":id" element={<QuoteDetail />} />
      <Route path=":id/edit" element={<QuoteEditor />} />
    </Routes>
  );
}

// ---------------------------------------------------------------- list

function QuoteList() {
  const t = useT();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const h = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(h);
  }, [search]);

  const q = { search: term, status, start_date: from, end_date: to, page, per_page: 25 };
  const list = useQuery({ queryKey: ['quotations', 'list', q], queryFn: () => api.get('/quotations', q), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const filtered = term || status || from || to;
  const newBtn = <Button size="lg" icon={FilePlus2} onClick={() => navigate('/quotations/new')}>{t('New quotation')}</Button>;

  return (
    <Page>
      <PageHeader
        title={t('Quotations')}
        subtitle={t('Give a customer a price list before they buy. Stock does not change. Later, turn it into a sale with one tap.')}
        actions={newBtn}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input className="ps-10" placeholder={t('Quotation no., customer name or phone…')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-full sm:w-48">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('Status')}>
              <option value="">{t('All quotations')}</option>
              <option value="open">{t('Still valid')}</option>
              <option value="draft">{t(QUOTE_STATUS.draft.label)}</option>
              <option value="sent">{t(QUOTE_STATUS.sent.label)}</option>
              <option value="converted">{t(QUOTE_STATUS.converted.label)}</option>
              <option value="expired">{t(QUOTE_STATUS.expired.label)}</option>
            </Select>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input type="date" className="sm:w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label={t('From date')} />
            <span className="text-sm text-slate-400">{t('to')}</span>
            <Input type="date" className="sm:w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label={t('To date')} />
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState icon={FileText} title={filtered ? t('Nothing found') : t('No quotations yet')} action={!filtered && newBtn}>
            {filtered ? t('Try other dates or filters.') : t('When a customer asks "how much for all this?", make a quotation and print it or send it on WhatsApp.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="text-start">{t('Quotation')}</Th><Th className="text-start">{t('Date')}</Th><Th className="text-start">{t('Customer')}</Th>
                <Th className="hidden text-start md:table-cell">{t('Valid until')}</Th><Th className="text-end">{t('Total')}</Th><Th className="text-start">{t('Status')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/quotations/${r.id}`)}>
                  <Td className="py-3.5">
                    <div className="font-medium text-brand-700"><span className="num">{r.quote_number}</span></div>
                    <div className="text-xs text-slate-500">{r.items_count === 1 ? t('1 item') : t('{n} items', { n: r.items_count })}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600"><span className="num">{date(r.created_at)}</span></Td>
                  <Td className="text-slate-700">
                    <div>{r.customer_name || <span className="text-slate-400">{t('Walk-in customer')}</span>}</div>
                    {r.customer_phone && <div className="text-xs text-slate-500"><span className="num">{r.customer_phone}</span></div>}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-slate-600 md:table-cell"><span className="num">{r.valid_until ? date(r.valid_until) : '—'}</span></Td>
                  <Td className="whitespace-nowrap text-end font-medium text-slate-900"><span className="num">{money(r.grand_total)}</span></Td>
                  <Td><StatusBadge status={r.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={meta} onPage={setPage} />
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------- new / edit

function Step({ n, title, hint, children, className }) {
  return (
    <Card className={className}>
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="num grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-brand-ink">{n}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {hint && <p className="text-sm text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

const lineFromVariant = (v) => ({
  variant_id: v.id,
  name: v.product_name || 'Item',
  label: [v.color, v.size].filter((x) => x && x !== '-').join(' / '),
  sku: v.sku,
  unit: v.unit || 'pcs',
  price: Number(v.selling_price || 0),
  stock: Number(v.stock_qty || 0),
  qty: '1',
  discount: '',
});

const lineFromItem = (it) => ({
  variant_id: it.variant_id,
  name: it.product_name || 'Item',
  label: [it.color, it.size].filter((x) => x && x !== '-').join(' / '),
  sku: it.sku,
  unit: it.unit || 'pcs',
  price: Number(it.unit_price || 0),
  stock: Number(it.stock_qty || 0),
  qty: String(Number(it.quantity)),
  discount: Number(it.discount_per_item) > 0 ? String(Number(it.discount_per_item)) : '',
});

function QuoteEditor() {
  const { id } = useParams();
  const editing = !!id;
  const t = useT();
  const shop = useShop();
  const { can } = useAuth();
  const unitText = useUnitText();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const finder = useRef(null);

  const existing = useQuery({ queryKey: ['quotations', 'one', id], queryFn: () => api.get(`/quotations/${id}`), select: (r) => r.data, enabled: editing });

  const [customer, setCustomer] = useState(null); // saved customer {id,name,phone}
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [validUntil, setValidUntil] = useState(addDays(7));
  const [lines, setLines] = useState([]);
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [flash, setFlash] = useState(null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const q = existing.data;
    if (!q || loaded) return;
    setCustomer(q.customer_id ? { id: q.customer_id, name: q.customer_name, phone: q.customer_phone } : null);
    setName(q.customer_id ? '' : q.customer_name || '');
    setPhone(q.customer_id ? '' : q.customer_phone || '');
    setValidUntil(q.valid_until || '');
    setLines((q.items || []).map(lineFromItem));
    setDiscount(Number(q.discount_amount) > 0 ? String(Number(q.discount_amount)) : '');
    setNotes(q.notes || '');
    setLoaded(true);
  }, [existing.data, loaded]);

  const addVariant = (v) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variant_id === v.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(round3(Number(l.qty || 0) + 1)) } : l));
      return [...ls, lineFromVariant(v)];
    });
    setFlash(v.id);
    setTimeout(() => setFlash((f) => (f === v.id ? null : f)), 900);
  };
  const setLine = (vid, k, val) => setLines((ls) => ls.map((l) => (l.variant_id === vid ? { ...l, [k]: val } : l)));
  const removeLine = (vid) => setLines((ls) => ls.filter((l) => l.variant_id !== vid));

  const lineTotal = (l) => round2(l.price * Number(l.qty || 0) - Number(l.discount || 0));
  const subtotal = round2(lines.reduce((a, l) => a + lineTotal(l), 0));
  const disc = Number(discount || 0);
  const tax = shop.taxEnabled ? Math.round((subtotal - disc) * shop.taxPercent) / 100 : 0;
  const grand = round2(subtotal - disc + tax);

  const lineErrors = Object.fromEntries(lines.map((l) => [l.variant_id, {
    qty: badQty(t, shop, l.unit, l.qty),
    discount: Number(l.discount || 0) < 0 ? t('Cannot be less than 0') : lineTotal(l) < 0 ? t('More than the total') : null,
  }]));
  const problems = [
    !lines.length && t('Add at least one item'),
    lines.some((l) => lineErrors[l.variant_id].qty || lineErrors[l.variant_id].discount) && t('Fix the items marked in red'),
    disc < 0 && t('Discount cannot be less than 0'),
    disc > subtotal + 0.001 && t('Discount is more than the total'),
    !validUntil && t('Choose the date until when prices are valid'),
  ].filter(Boolean);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        customer_id: customer?.id || null,
        customer_name: customer ? null : name.trim() || null,
        customer_phone: customer ? null : phone.trim() || null,
        valid_until: validUntil,
        items: lines.map((l) => ({ variant_id: l.variant_id, quantity: Number(l.qty), discount_per_item: Number(l.discount || 0) })),
        discount_amount: disc || 0,
        notes: notes.trim() || null,
      };
      return editing ? api.put(`/quotations/${id}`, body) : api.post('/quotations', body);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast(editing ? t('Quotation {no} saved', { no: res.data.quote_number }) : t('Quotation {no} made', { no: res.data.quote_number }));
      navigate(`/quotations/${res.data.id}`, { replace: true });
    },
    onError: (err) => { setError(err); toast(err.message, 'error'); },
  });

  const submit = () => {
    setTried(true);
    setError(null);
    if (problems.length) { toast(problems[0], 'error'); return; }
    save.mutate();
  };
  const backToScanner = (e) => { if (e.key === 'Enter') { e.preventDefault(); finder.current?.focus(); } };

  if (editing && existing.isLoading) return <Page><Loading /></Page>;
  if (editing && existing.error) return <Page><BackLink to="/quotations">{t('All quotations')}</BackLink><ErrorBox error={existing.error} /></Page>;
  if (editing && existing.data?.status === 'converted') {
    return <Page><BackLink to={`/quotations/${id}`}>{t('Back')}</BackLink><ErrorBox error={{ message: t('This quotation was already turned into a sale and cannot be changed.') }} /></Page>;
  }

  return (
    <Page>
      <BackLink to={editing ? `/quotations/${id}` : '/quotations'}>{editing ? t('Back') : t('All quotations')}</BackLink>
      <PageHeader
        title={editing ? t('Change quotation {no}', { no: existing.data?.quote_number || '' }) : t('New quotation')}
        subtitle={t('Prices come from your item list. Stock does not change.')}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Step n="1" title={t('Who is it for?')} hint={t('Choose a saved customer, or just write a name and phone. You can also leave it empty.')}>
            <div className="p-5">
              {customer ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-brand-200 bg-brand-50 px-4 py-3">
                  <UserRound className="size-6 shrink-0 text-brand-700" />
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-slate-900">{customer.name}</div>
                    {customer.phone && <div className="text-sm text-slate-600"><span className="num">{customer.phone}</span></div>}
                  </div>
                  <Button variant="secondary" icon={X} onClick={() => setCustomer(null)}>{t('Remove')}</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {can('customers.view') && <CustomerChooser onPick={(c) => setCustomer(c)} />}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Customer name (optional)')}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} /></Field>
                    <Field label={t('Phone (optional)')} hint={t('Needed to send it on WhatsApp')}><Input type="tel" className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" maxLength={30} /></Field>
                  </div>
                </div>
              )}
            </div>
          </Step>

          <Step n="2" title={t('Add the items')} hint={t('Scan each item\'s barcode, or type its name and pick it. Then write how many.')}>
            <div className="border-b border-slate-100 p-4">
              <VariantFinder ref={finder} size="lg" autoFocus={!editing} onPick={addVariant} />
            </div>
            {!lines.length ? (
              <EmptyState icon={ScanBarcode} title={t('No items yet')}>{t('Scan the first item above.')}</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr><Th className="text-start">{t('Item')}</Th><Th className="w-40 text-start">{t('How many?')}</Th><Th className="w-32 text-start">{t('Discount (Rs)')}</Th><Th className="text-end">{t('Total')}</Th><Th className="w-12" /></tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const errs = lineErrors[l.variant_id];
                    const unit = unitText(l.unit);
                    return (
                      <tr key={l.variant_id} className={cx('align-top transition-colors', flash === l.variant_id && 'bg-brand-50')}>
                        <Td>
                          <div className="min-w-36 text-base font-medium text-slate-900">{l.name}{l.label && <span className="font-normal text-slate-500"> · {l.label}</span>}</div>
                          <div className="text-xs text-slate-500"><span className="num">{money(l.price)}</span> / {unit}</div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number" inputMode="decimal" min="0" step={unitStep(shop, l.unit)} value={l.qty}
                              onChange={(e) => setLine(l.variant_id, 'qty', e.target.value)} onKeyDown={backToScanner}
                              className={cx('min-w-20', errs.qty && (tried || l.qty !== '') && 'border-red-400')} aria-label={t('How many?')}
                            />
                            <span className="shrink-0 text-sm text-slate-500">{unit}</span>
                          </div>
                          {errs.qty && (tried || l.qty !== '') && <div className="mt-1 text-xs text-red-600">{errs.qty}</div>}
                        </Td>
                        <Td>
                          <Input
                            type="number" inputMode="decimal" min="0" step="0.01" value={l.discount} placeholder="0"
                            onChange={(e) => setLine(l.variant_id, 'discount', e.target.value)} onKeyDown={backToScanner}
                            className={cx('min-w-20', errs.discount && 'border-red-400')} aria-label={t('Discount (Rs)')}
                          />
                          {errs.discount && <div className="mt-1 text-xs text-red-600">{errs.discount}</div>}
                        </Td>
                        <Td className="whitespace-nowrap pt-5 text-end font-medium text-slate-900"><span className="num">{money(lineTotal(l))}</span></Td>
                        <Td>
                          <button type="button" onClick={() => removeLine(l.variant_id)} className="rounded-lg p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('Remove')} title={t('Remove')}><Trash2 className="size-5" /></button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Step>
        </div>

        <div className="min-w-0">
          <Step n="3" title={t('Total and validity')} hint={lines.length === 1 ? t('1 item') : t('{n} items', { n: lines.length })} className="lg:sticky lg:top-4">
            <div className="space-y-4 px-5 py-4">
              <div className="flex justify-between text-base"><span className="text-slate-600">{t('Items total')}</span><span className="num font-medium">{money(subtotal)}</span></div>
              <Field label={t('Discount on whole quotation (Rs)')} error={disc > subtotal + 0.001 ? t('More than the total') : null}>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </Field>
              {shop.taxEnabled && <div className="flex justify-between text-base"><span className="text-slate-600">{t(shop.taxLabel)} (<span className="num">{shop.taxPercent}%</span>)</span><span className="num">{money(tax)}</span></div>}
              <div className="flex justify-between border-t border-slate-100 pt-3 text-lg"><span className="font-semibold text-slate-900">{t('Quotation total')}</span><span className="num font-bold text-slate-900">{money(grand)}</span></div>
              <Field label={t('Prices valid until')} required error={tried && !validUntil ? t('Choose a date') : null}>
                <Input type="date" value={validUntil} min={today()} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {[3, 7, 15, 30].map((d) => (
                  <Button key={d} size="sm" variant={validUntil === addDays(d) ? 'primary' : 'secondary'} onClick={() => setValidUntil(addDays(d))}>{t('{n} days', { n: d })}</Button>
                ))}
              </div>
              <Field label={t('Note (optional)')}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder={t('e.g. Delivery free, prices include fitting')} /></Field>
              {tried && problems.length > 0 && <ErrorBox error={{ message: problems[0] }} />}
              {error && !problems.length && <ErrorBox error={error} />}
              <Button size="lg" className="w-full" loading={save.isPending} onClick={submit} disabled={!lines.length}>{t('Save quotation')}</Button>
            </div>
          </Step>
        </div>
      </div>
    </Page>
  );
}

function CustomerChooser({ onPick }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api.get('/customers'), enabled: open, select: (r) => r.data || [] });
  const s = search.trim().toLowerCase();
  const digits = s.replace(/\D/g, '');
  const list = (customers.data || []).filter((c) => !s || c.name.toLowerCase().includes(s)
    || (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits))).slice(0, 40);

  return (
    <>
      <Button variant="secondary" size="lg" icon={UserRound} className="w-full sm:w-auto" onClick={() => setOpen(true)}>{t('Choose saved customer')}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('Choose customer')}>
        <Input autoFocus placeholder={t('Search name or phone…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {customers.isLoading && <Loading />}
          {customers.error && <ErrorBox error={customers.error} />}
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => { onPick(c); setOpen(false); }} className="flex w-full items-center justify-between px-2 py-3 text-start hover:bg-slate-50">
              <div><div className="text-base font-semibold text-slate-900">{c.name}</div><div className="text-sm text-slate-500"><span className="num">{c.phone}</span></div></div>
            </button>
          ))}
          {!customers.isLoading && !list.length && <p className="py-6 text-center text-base text-slate-500">{t('No customers found.')}</p>}
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- detail

function QuoteDetail() {
  const { id } = useParams();
  const t = useT();
  const shop = useShop();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [paper, setPaper] = useState(() => {
    try { return localStorage.getItem('corepos_quote_paper') === '80mm' ? '80mm' : 'a4'; } catch { return 'a4'; }
  });
  const choosePaper = (p) => { setPaper(p); try { localStorage.setItem('corepos_quote_paper', p); } catch { /* ignore */ } };

  const res = useQuery({ queryKey: ['quotations', 'one', id], queryFn: () => api.get(`/quotations/${id}`), select: (r) => r.data });
  const q = res.data;

  const markSent = useMutation({
    mutationFn: () => api.patch(`/quotations/${id}`, { status: 'sent' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/quotations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotations'] }); toast(t('Quotation deleted')); navigate('/quotations', { replace: true }); },
    onError: (err) => toast(err.message, 'error'),
  });

  if (res.isLoading) return <Page><Loading /></Page>;
  if (res.error) return <Page><BackLink to="/quotations">{t('All quotations')}</BackLink><ErrorBox error={res.error} /></Page>;

  const converted = q.status === 'converted';
  const expired = q.status === 'expired';
  const missing = (q.items || []).filter((i) => !i.is_available);

  const share = () => {
    openWhatsApp(q.customer_phone, buildQuoteText(q, shop, t));
    if (q.status === 'draft') markSent.mutate();
  };
  const toSale = async () => {
    if (expired && !(await confirm({
      title: t('This quotation has expired'),
      message: t('The prices were valid until {date}. Turn it into a sale anyway?', { date: date(q.valid_until) }),
      confirmLabel: t('Yes, turn into a sale'),
    }))) return;
    navigate(`/pos?quote=${q.id}`);
  };
  const remove = async () => {
    if (await confirm({
      title: t('Delete this quotation?'),
      message: t('Quotation {no} will be removed for good. You cannot undo this.', { no: q.quote_number }),
      danger: true,
      confirmLabel: t('Yes, delete'),
    })) del.mutate();
  };

  return (
    <Page>
      <BackLink to="/quotations">{t('All quotations')}</BackLink>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{rich(t('Quotation {no}'), { no: <span className="num">{q.quote_number}</span> })}<StatusBadge status={q.status} /></span>}
        subtitle={(
          <>
            {q.customer_name || t('Walk-in customer')}
            {q.customer_phone && <> · <span className="num">{q.customer_phone}</span></>}
            {' · '}<span className="num">{date(q.created_at)}</span>
          </>
        )}
      />

      {converted && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-900">
          <CheckCircle2 className="size-6 shrink-0 text-emerald-600" />
          <span className="flex-1">
            {q.converted_invoice_number
              ? rich(t('This quotation was turned into bill {inv}.'), { inv: <b className="num">{q.converted_invoice_number}</b> })
              : t('This quotation was turned into a sale.')}
          </span>
          {q.converted_invoice_number && can('sales.create') && (
            <Link to={`/sales/${q.converted_invoice_number}`} className="py-1 font-medium text-emerald-800 underline">{t('Open the bill')}</Link>
          )}
        </div>
      )}
      {expired && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-amber-600" />
          <span>{rich(t('The prices on this quotation were valid until {date}. Prices may have changed since then.'), { date: <b className="num">{date(q.valid_until)}</b> })}</span>
        </div>
      )}
      {!converted && missing.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-amber-600" />
          <span>{t('Some items on this quotation are no longer sold: {names}', { names: missing.map((i) => i.product_name || i.sku).join(', ') })}</span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        {!converted && can('sales.create') && <Button size="lg" variant="success" icon={ShoppingCart} onClick={toSale}>{t('Turn into a sale')}</Button>}
        <Button size="lg" variant="secondary" icon={MessageCircle} className="border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={share}>{t('Send quotation on WhatsApp')}</Button>
        <Button size="lg" variant="secondary" icon={Printer} onClick={() => printNow(paper === '80mm' ? 'receipt' : 'document')}>{t('Print')}</Button>
        {!converted && <Button size="lg" variant="secondary" icon={Pencil} onClick={() => navigate(`/quotations/${q.id}/edit`)}>{t('Edit')}</Button>}
        {!converted && <Button size="lg" variant="secondary" icon={Trash2} className="text-red-600" loading={del.isPending} onClick={remove}>{t('Delete')}</Button>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader
              title={t('Printed quotation')}
              subtitle={t('This is how it looks on paper.')}
              action={(
                <div className="flex shrink-0 rounded-lg border border-slate-300 p-0.5" role="group" aria-label={t('Paper size')}>
                  {[['a4', t('A4 page')], ['80mm', t('Small receipt')]].map(([k, label]) => (
                    <button key={k} type="button" onClick={() => choosePaper(k)} className={cx('rounded-md px-3 py-2 text-sm font-medium', paper === k ? 'bg-brand-600 text-brand-ink' : 'text-slate-600 hover:bg-slate-100')}>{label}</button>
                  ))}
                </div>
              )}
            />
            <div className="overflow-x-auto bg-slate-100 p-3 sm:p-5">
              <QuotePrint quote={q} paper={paper} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t('Summary')} />
            <dl className="space-y-2.5 px-5 py-4 text-base">
              <Row label={t('Items total')} value={<span className="num">{money(q.subtotal)}</span>} />
              {Number(q.discount_amount) > 0 && <Row label={t('Discount')} value={<span className="num">-{money(q.discount_amount)}</span>} />}
              {Number(q.tax_amount) > 0 && <Row label={t(shop.taxLabel)} value={<span className="num">{money(q.tax_amount)}</span>} />}
              <Row label={t('Quotation total')} value={<span className="num">{money(q.grand_total)}</span>} strong />
              <Row label={t('Valid until')} value={<span className="num">{q.valid_until ? date(q.valid_until) : '—'}</span>} />
            </dl>
          </Card>
          <Card>
            <CardHeader title={t('More details')} />
            <dl className="space-y-2.5 px-5 py-4 text-sm">
              <Row label={t('Written by')} value={q.creator || '—'} />
              <Row label={t('Written on')} value={<span className="num">{dateTime(q.created_at)}</span>} />
              {q.converted_at && <Row label={t('Turned into sale on')} value={<span className="num">{dateTime(q.converted_at)}</span>} />}
              {q.notes && <div dir="auto" className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-start text-slate-600">{q.notes}</div>}
            </dl>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cx('text-end', strong ? 'font-semibold text-slate-900' : 'text-slate-800')}>{value}</dd>
    </div>
  );
}
