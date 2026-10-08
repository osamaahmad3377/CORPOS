// Expenses: money spent to run the shop (rent, bills, salaries…). Tap a
// category, type the amount, save. Reports → Profit uses these to show real profit.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Pencil, Plus, ReceiptText, Trash2, Wallet, X } from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { money, today } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Button, Card, CardHeader, cx, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, StatCard, Table, Td, Textarea, Th,
  useConfirm, useToast,
} from '../../components/ui';
import { useDates } from '../reports/reportKit';
import { CategoryBars, CategoryIcon, PeriodPicker, periodRange } from './kit';

const DEFAULT_CATEGORIES = ['Rent', 'Electricity bill', 'Gas bill', 'Water bill', 'Internet / phone', 'Salaries', 'Tea & food', 'Transport / fuel', 'Repairs', 'Shop supplies', 'Taxes & fees', 'Other'];

function useExpenseCategories() {
  return useQuery({
    queryKey: ['expenses', 'categories'],
    queryFn: () => api.get('/expenses/categories'),
    select: (r) => r?.data || DEFAULT_CATEGORIES,
    staleTime: 60_000,
  });
}

export default function Expenses() {
  const t = useT();
  const { can } = useAuth();
  const shop = useShop();
  const d = useDates();
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const cats = useExpenseCategories();

  const [period, setPeriod] = useState('month');
  const [range, setRange] = useState(() => periodRange('month'));
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null); // null | { expense?, category? }

  const pickPeriod = (id) => {
    setPeriod(id);
    if (id !== 'custom') setRange(periodRange(id));
    setPage(1);
  };

  const params = { start: range.start, end: range.end, category, payment_method: method, page, per_page: 25 };
  const list = useQuery({ queryKey: ['expenses', 'list', params], queryFn: () => api.get('/expenses', params), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const totals = list.data?.totals || { count: 0, amount: 0, by_category: [] };
  const filtered = category || method;

  const del = useMutation({
    mutationFn: (e) => api.del(`/expenses/${e.id}`),
    onSuccess: () => {
      toast(t('Expense deleted'));
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const askDelete = async (e) => {
    const ok = await confirm({
      title: t('Delete this expense?'),
      message: t('{category} of {amount} on {date} will be removed. Your profit report will change.', { category: t(e.category), amount: money(e.amount), date: d.prettyDate(e.expense_date) }),
      danger: true,
      confirmLabel: t('Delete'),
    });
    if (ok) del.mutate(e);
  };

  const chips = (cats.data || DEFAULT_CATEGORIES).slice(0, 16);
  const biggest = totals.by_category?.[0];
  const periodText = <span className="num">{d.rangeLabel(range.start, range.end)}</span>;
  const wait = list.isLoading ? '…' : null;

  return (
    <Page>
      <PageHeader
        title={t('Expenses')}
        subtitle={t('Write down money you spend to run the shop — rent, bills, salaries. Then reports show your real profit.')}
        actions={(
          <>
            {can('reports.view') && <Link to="/reports/profit" className="inline-flex h-14 items-center gap-2 rounded-lg px-4 text-base font-medium text-brand-700 hover:bg-brand-50"><BarChart3 className="size-5" />{t('See profit')}</Link>}
            <Button size="lg" icon={Plus} onClick={() => setForm({})}>{t('Add expense')}</Button>
          </>
        )}
      />

      {/* Quick add: tap a category, then type the amount */}
      <Card className="mb-5 p-4">
        <p className="mb-3 text-base font-medium text-slate-700">{t('Quick add — tap what you paid for:')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ category: c })}
              className="flex min-h-14 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-start text-[15px] font-medium text-slate-800 transition hover:border-brand-400 hover:bg-brand-50/40"
            >
              <CategoryIcon category={c} />
              <span className="min-w-0 break-words">{t(c)}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Filters */}
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker value={period} onChange={pickPeriod} />
          {period === 'custom' && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input type="date" className="sm:w-40" value={range.start} max={range.end || undefined} onChange={(e) => { setRange((r) => ({ ...r, start: e.target.value })); setPage(1); }} aria-label={t('From date')} />
              <span className="text-sm text-slate-400">{t('to')}</span>
              <Input type="date" className="sm:w-40" value={range.end} min={range.start || undefined} onChange={(e) => { setRange((r) => ({ ...r, end: e.target.value })); setPage(1); }} aria-label={t('To date')} />
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="w-full sm:w-56">
            <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label={t('Category')}>
              <option value="">{t('All kinds of expense')}</option>
              {(cats.data || DEFAULT_CATEGORIES).map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} aria-label={t('Paid by')}>
              <option value="">{t('Any payment')}</option>
              {(shop.meta.payment_methods || []).map((p) => <option key={p.code} value={p.code}>{t(p.label)}</option>)}
            </Select>
          </div>
          {filtered && <Button variant="ghost" icon={X} onClick={() => { setCategory(''); setMethod(''); setPage(1); }}>{t('Clear filters')}</Button>}
        </div>
      </Card>

      {list.error ? <ErrorBox error={list.error} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard icon={Wallet} label={t('Total spent')} value={wait || <span className="num">{money(totals.amount)}</span>} tone="red" />
            <StatCard icon={ReceiptText} label={t('Expenses written')} value={wait || <span className="num">{totals.count}</span>} />
            <div className="col-span-2 lg:col-span-1">
              <StatCard icon={BarChart3} label={t('Biggest expense')} value={wait || (biggest ? <span className="block text-xl">{t(biggest.category)} · <span className="num">{money(biggest.total)}</span></span> : '—')} tone="amber" />
            </div>
          </div>

          <div className="grid gap-5 2xl:grid-cols-5">
            <Card className="2xl:col-span-2">
              <CardHeader title={t('Where the money went')} subtitle={periodText} />
              <div className="p-4">
                {list.isLoading ? <Loading /> : !totals.by_category?.length
                  ? <p className="py-6 text-center text-sm text-slate-500">{t('No expenses in these dates.')}</p>
                  : <CategoryBars rows={totals.by_category} total={Number(totals.amount)} active={category} onPick={(c) => { setCategory(category === c ? '' : c); setPage(1); }} />}
                {!!totals.by_category?.length && <p className="mt-3 text-xs text-slate-400">{t('Tap a line to see only that expense.')}</p>}
              </div>
            </Card>

            <Card className="2xl:col-span-3">
              <CardHeader title={t('Expense list')} subtitle={periodText} />
              {list.isLoading ? <Loading /> : !rows.length ? (
                <EmptyState
                  icon={Wallet}
                  title={filtered ? t('Nothing found') : t('No expenses in these dates')}
                  action={!filtered && <Button size="lg" icon={Plus} onClick={() => setForm({})}>{t('Add expense')}</Button>}
                >
                  {filtered ? t('Try other dates or filters.') : t('When you pay rent, a bill or salary, add it here so you know your real profit.')}
                </EmptyState>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th className="text-start">{t('Expense')}</Th>
                      <Th className="text-start">{t('Date')}</Th>
                      <Th className="hidden text-start md:table-cell">{t('Paid by')}</Th>
                      <Th className="text-end">{t('Amount')}</Th>
                      <Th className="text-end"><span className="sr-only">{t('Actions')}</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/60">
                        <Td className="py-3.5">
                          <div className="flex items-center gap-3">
                            <CategoryIcon category={e.category} className="hidden size-9 sm:grid" />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800">{t(e.category)}</div>
                              {e.note && <div className="text-sm text-slate-500 break-words">{e.note}</div>}
                              {e.user?.name && <div className="text-xs text-slate-400">{t('Added by {name}', { name: e.user.name })}</div>}
                            </div>
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap text-slate-600"><span className="num">{d.prettyDate(e.expense_date)}</span></Td>
                        <Td className="hidden text-slate-600 md:table-cell">{t(shop.paymentLabel(e.payment_method))}</Td>
                        <Td className="whitespace-nowrap text-end font-semibold text-slate-900"><span className="num">{money(e.amount)}</span></Td>
                        <Td className="text-end">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setForm({ expense: e })}>{t('Edit')}</Button>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" icon={Trash2} onClick={() => askDelete(e)} aria-label={t('Delete')}>
                              <span className="hidden lg:inline">{t('Delete')}</span>
                            </Button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                  {meta?.last_page <= 1 && rows.length > 1 && (
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold text-slate-900">
                        <td className="px-4 py-3" colSpan={2}>{t('Total')}</td>
                        <td className="hidden md:table-cell" />
                        <td className="whitespace-nowrap px-4 py-3 text-end"><span className="num">{money(totals.amount)}</span></td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </Table>
              )}
              <Pagination meta={meta} onPage={setPage} />
            </Card>
          </div>
        </>
      )}

      {form && (
        <ExpenseForm
          expense={form.expense}
          presetCategory={form.category}
          categories={cats.data || DEFAULT_CATEGORIES}
          onClose={() => setForm(null)}
          onDelete={form.expense ? () => { const e = form.expense; setForm(null); askDelete(e); } : null}
        />
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- add / edit

function ExpenseForm({ expense, presetCategory, categories, onClose, onDelete }) {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const qc = useQueryClient();
  const amountRef = useRef(null);
  const editing = !!expense;

  const [category, setCategory] = useState(expense?.category || presetCategory || '');
  const [choosing, setChoosing] = useState(!(expense?.category || presetCategory));
  const [custom, setCustom] = useState('');
  const [amount, setAmount] = useState(expense ? String(Number(expense.amount)) : '');
  const [date, setDate] = useState(expense?.expense_date || today());
  const [method, setMethod] = useState(expense?.payment_method || 'cash');
  const [note, setNote] = useState(expense?.note || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!choosing) setTimeout(() => amountRef.current?.focus(), 30);
  }, [choosing]);

  const save = useMutation({
    mutationFn: (body) => (editing ? api.put(`/expenses/${expense.id}`, body) : api.post('/expenses', body)),
    onSuccess: () => {
      toast(editing ? t('Expense changed') : t('Expense saved'));
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const submit = (e) => {
    e?.preventDefault();
    const finalCategory = (custom.trim() || category).trim();
    if (!finalCategory) return setError(t('Choose what you paid for.'));
    if (!(Number(amount) > 0)) { amountRef.current?.focus(); return setError(t('Type the amount you paid.')); }
    if (!date) return setError(t('Choose the date.'));
    setError('');
    save.mutate({ category: finalCategory, amount: Number(amount), expense_date: date, payment_method: method, note: note.trim() || null });
  };

  const pick = (c) => { setCategory(c); setCustom(''); setChoosing(false); };
  const methods = shop.meta.payment_methods?.length ? shop.meta.payment_methods : [{ code: 'cash', label: 'Cash' }];

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('Change expense') : t('Add expense')}
      footer={(
        <>
          {onDelete && <Button variant="ghost" className="me-auto text-red-600 hover:bg-red-50" icon={Trash2} onClick={onDelete}>{t('Delete')}</Button>}
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button size="lg" onClick={submit} loading={save.isPending}>{editing ? t('Save changes') : t('Save expense')}</Button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-5">
        {/* 1. what for */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('What did you pay for?')}<span className="text-red-500"> *</span></span>
          {!choosing && (custom.trim() || category) ? (
            <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
              <CategoryIcon category={category} className="size-11" iconClass="size-6" />
              <span className="flex-1 text-lg font-semibold text-slate-900">{t(category)}</span>
              <Button variant="secondary" onClick={() => setChoosing(true)}>{t('Pick another')}</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pick(c)}
                    className={cx(
                      'flex min-h-12 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-start text-sm font-medium transition',
                      category === c && !custom ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300',
                    )}
                  >
                    <CategoryIcon category={c} className="size-8" iconClass="size-4" />
                    <span className="min-w-0 break-words">{t(c)}</span>
                  </button>
                ))}
              </div>
              <Field label={t('Or type a new name')} className="mt-3">
                <Input
                  value={custom}
                  maxLength={60}
                  placeholder={t('e.g. Generator diesel')}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (custom.trim()) { setCategory(custom.trim()); setChoosing(false); } } }}
                />
              </Field>
            </>
          )}
        </div>

        {/* 2. how much */}
        <Field label={t('Amount (Rs)')} required>
          <Input
            ref={amountRef}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="h-14 text-2xl font-semibold"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Date')} required>
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('Paid by')} required>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((p) => <option key={p.code} value={p.code}>{t(p.label)}</option>)}
            </Select>
          </Field>
        </div>

        <Field label={t('Note (optional)')}>
          <Textarea rows={2} maxLength={1000} value={note} placeholder={t('e.g. September bill, paid to Aslam')} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && <ErrorBox error={{ message: error }} />}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
