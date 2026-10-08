import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, ClipboardCheck, History, PackageX, Search, SlidersHorizontal, Wallet, X,
} from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { dateTime, money, num, qty, round3, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, StatCard, Table, Td, Textarea, Th,
  cx, useToast,
} from '../../components/ui';
import { VariantFinder, badQty, unitStep, useUnitText } from './VariantFinder';

// The four things that can happen to stock, in plain words.
const TYPES = [
  { value: 'in', label: 'Add stock', hint: 'Got more without a supplier bill, or stock you already had', icon: ArrowUpRight },
  { value: 'out', label: 'Remove stock', hint: 'Used in the shop, given away or sent somewhere else', icon: ArrowDownRight },
  { value: 'damaged', label: 'Damaged / expired', hint: 'Broken, spoiled or past expiry — cannot be sold', icon: PackageX },
  { value: 'count', label: 'I counted it', hint: 'You counted the shelf — enter the real number', icon: ClipboardCheck },
];

const MOVE_TYPES = {
  in: { label: 'Added', color: 'green' },
  out: { label: 'Removed', color: 'gray' },
  damaged: { label: 'Damaged', color: 'red' },
  adjustment: { label: 'Counted', color: 'amber' },
};

function Tabs() {
  const t = useT();
  const tab = ({ isActive }) => cx(
    'border-b-2 px-1 pb-3 text-base font-medium transition-colors',
    isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
  );
  return (
    <div className="mb-5 flex gap-6 border-b border-slate-200">
      <NavLink to="/inventory" end className={tab}>{t('What is in stock')}</NavLink>
      <NavLink to="/inventory/movements" className={tab}>{t('Stock history')}</NavLink>
    </div>
  );
}

export default function Inventory() {
  const { can } = useAuth();
  const t = useT();
  const [adjust, setAdjust] = useState(null); // { variant } | {} when open

  return (
    <Page>
      <PageHeader
        title={t('Stock count')}
        subtitle={t('How much of each item you have. Change it when stock comes in, goes out or gets damaged.')}
        actions={can('inventory.adjust') && <Button size="lg" icon={SlidersHorizontal} onClick={() => setAdjust({})}>{t('Change stock')}</Button>}
      />
      <Tabs />
      <Routes>
        <Route index element={<StockList onAdjust={(variant) => setAdjust({ variant })} />} />
        <Route path="movements" element={<Movements />} />
        <Route path="*" element={<StockList onAdjust={(variant) => setAdjust({ variant })} />} />
      </Routes>
      {adjust && <AdjustModal initial={adjust.variant} onClose={() => setAdjust(null)} />}
    </Page>
  );
}

// ---------------------------------------------------------------- stock levels

function StockList({ onAdjust }) {
  const { can } = useAuth();
  const t = useT();
  const unitText = useUnitText();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [stock, setStock] = useState('');
  const [page, setPage] = useState(1);
  const showCost = can('purchases.view');

  useEffect(() => {
    const h = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(h);
  }, [search]);

  const params = { search: term, stock, page, per_page: 25 };
  const list = useQuery({ queryKey: ['inventory', params], queryFn: () => api.get('/inventory', params), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const summary = list.data?.summary;

  return (
    <>
      {summary && (
        <div className={cx('mb-5 grid grid-cols-2 gap-3 sm:gap-4', showCost && summary.stock_value !== undefined ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          <button type="button" className="text-start" onClick={() => { setStock(''); setPage(1); }}>
            <StatCard icon={Boxes} label={t('Items')} value={<span className="num">{num(summary.items)}</span>} />
          </button>
          <button type="button" className="text-start" onClick={() => { setStock('low'); setPage(1); }}>
            <StatCard icon={AlertTriangle} label={t('Running low')} value={<span className="num">{num(summary.low_stock)}</span>} tone="amber" />
          </button>
          <button type="button" className="text-start" onClick={() => { setStock('out'); setPage(1); }}>
            <StatCard icon={PackageX} label={t('Out of stock')} value={<span className="num">{num(summary.out_of_stock)}</span>} tone="red" />
          </button>
          {showCost && summary.stock_value !== undefined && (
            <StatCard icon={Wallet} label={t('Stock value (at buying price)')} value={<span className="num">{money(summary.stock_value)}</span>} tone="green" />
          )}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input
              className="ps-10 pe-10"
              placeholder={t('Search item name or scan barcode…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTerm(search.trim()); setPage(1); } }}
            />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-600" aria-label={t('Clear')}><X className="size-5" /></button>}
          </div>
          <div className="w-full sm:w-56">
            <Select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }} aria-label={t('Show')}>
              <option value="">{t('All items')}</option>
              <option value="low">{t('Running low or finished')}</option>
              <option value="out">{t('Out of stock only')}</option>
            </Select>
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState icon={Boxes} title={term || stock ? t('Nothing found') : t('No items yet')}>
            {term || stock ? t('Try a different name, or choose "All items".') : t('Add your items first — their stock will show here.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('Item')}</Th>
                <Th className="text-end">{t('In stock')}</Th>
                <Th className="hidden text-end md:table-cell">{t('Warn below')}</Th>
                {showCost && <Th className="hidden text-end lg:table-cell">{t('Buying price')}</Th>}
                <Th className="hidden text-end sm:table-cell">{t('Selling price')}</Th>
                {showCost && <Th className="text-end">{t('Stock value')}</Th>}
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const stockQty = Number(v.stock_qty);
                const label = variantLabel(v);
                const unit = unitText(v.unit);
                return (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="font-medium text-slate-900">
                        {v.product_name}{label && <span className="font-normal text-slate-500"> · {label}</span>}
                        {!v.is_active && <Badge className="ms-2">{t('Hidden')}</Badge>}
                      </div>
                      <div className="text-xs text-slate-500"><span className="num">{v.sku}{v.barcode ? ` · ${v.barcode}` : ''}</span></div>
                    </Td>
                    <Td className="whitespace-nowrap text-end">
                      <Badge color={stockQty <= 0 ? 'red' : v.is_low_stock ? 'amber' : 'green'} className="gap-1 px-2.5 py-1 text-sm">
                        <span className="num">{qty(stockQty)}</span> {unit}
                      </Badge>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-end text-slate-500 md:table-cell"><span className="num">{qty(v.low_stock_threshold)}</span> {unit}</Td>
                    {showCost && <Td className="hidden whitespace-nowrap text-end text-slate-600 lg:table-cell"><span className="num">{money(v.purchase_price)}</span></Td>}
                    <Td className="hidden whitespace-nowrap text-end text-slate-600 sm:table-cell"><span className="num">{money(v.selling_price)}</span> <span className="text-xs text-slate-400">/ {unit}</span></Td>
                    {showCost && <Td className="whitespace-nowrap text-end font-medium text-slate-900"><span className="num">{money(Math.max(stockQty, 0) * Number(v.purchase_price || 0))}</span></Td>}
                    <Td className="whitespace-nowrap text-end">
                      <div className="flex justify-end gap-1.5">
                        <NavLink
                          to={`/inventory/movements?variant_id=${v.id}&label=${encodeURIComponent(v.product_name + (label ? ` · ${label}` : ''))}`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title={t('Stock history')}
                        >
                          <History className="size-4" /><span className="hidden xl:inline">{t('History')}</span>
                        </NavLink>
                        {can('inventory.adjust') && <Button size="sm" variant="secondary" icon={SlidersHorizontal} onClick={() => onAdjust(v)}>{t('Change stock')}</Button>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination meta={meta} onPage={setPage} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- change stock

function AdjustModal({ initial, onClose }) {
  const shop = useShop();
  const t = useT();
  const unitText = useUnitText();
  const toast = useToast();
  const qc = useQueryClient();
  const [variant, setVariant] = useState(initial || null);
  const [type, setType] = useState('in');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [serialText, setSerialText] = useState(''); // new serials (stock in)
  const [picked, setPicked] = useState([]); // existing serials (stock out)
  const [batch, setBatch] = useState({ no: '', expiry: '' });

  const serialItem = !!variant?.track_serial;
  const newSerials = serialText.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  const inStockSerials = useQuery({
    queryKey: ['serials', variant?.id, 'in_stock'],
    queryFn: () => api.get(`/product-variants/${variant.id}/serials`, { status: 'in_stock' }),
    enabled: serialItem && type !== 'in',
    select: (r) => r.data || [],
  });

  const unit = variant?.unit || 'pcs';
  const unitName = unitText(unit);
  const current = Number(variant?.stock_qty || 0);
  const n = serialItem ? (type === 'in' ? newSerials.length : picked.length) : Number(amount || 0);
  const after = type === 'count' ? n : type === 'in' ? current + n : current - n;
  const qtyError = amount === '' ? null : badQty(t, shop, unit, amount, { allowZero: type === 'count' });
  const tooMuch = type !== 'count' && type !== 'in' && amount !== '' && round3(after) < 0;

  const save = useMutation({
    mutationFn: () => api.post('/inventory/adjust', {
      variant_id: variant.id,
      type,
      ...(type === 'count' ? { new_quantity: n } : { quantity: n }),
      ...(serialItem ? { serials: type === 'in' ? newSerials : picked } : {}),
      ...(variant?.track_expiry && type === 'in' ? { batch_no: batch.no.trim() || null, expiry_date: batch.expiry || null } : {}),
      reason: reason.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product-variants'] });
      toast(t('Stock saved: {name} is now {n}', { name: variant.product_name, n: `${qty(after)} ${unitName}` }));
      onClose();
    },
    onError: setError,
  });

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (!variant || (!serialItem && (amount === '' || qtyError)) || (serialItem && !n) || tooMuch) return;
    save.mutate();
  };

  const label = variant ? variantLabel(variant) : '';

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Change stock')}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="adjust-form" loading={save.isPending} disabled={!variant || (serialItem ? !n : amount === '' || !!qtyError) || tooMuch}>{t('Save')}</Button>
        </>
      )}
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-5">
        <ErrorBox error={error} />
        {!variant ? (
          <Field label={t('1. Which item?')} hint={t('Scan the barcode or type the name.')}>
            <VariantFinder autoFocus onPick={(v) => setVariant(v)} />
          </Field>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-base font-medium text-slate-900">{variant.product_name}{label && <span className="font-normal text-slate-500"> · {label}</span>}</div>
              <div className="text-sm text-slate-500">{t('In stock now')}: <span className="font-semibold text-slate-700"><span className="num">{qty(current)}</span> {unitName}</span></div>
            </div>
            {!initial && <Button size="sm" variant="secondary" onClick={() => { setVariant(null); setAmount(''); setPicked([]); setSerialText(''); }}>{t('Pick another item')}</Button>}
          </div>
        )}

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">{t('What happened?')}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.filter((x) => !(serialItem && x.value === 'count')).map((x) => (
              <button
                key={x.value}
                type="button"
                onClick={() => { setType(x.value); if (x.value === 'count' && amount === '' && variant) setAmount(String(qty(current))); }}
                className={cx(
                  'flex items-start gap-3 rounded-xl border-2 px-3 py-3 text-start transition-colors',
                  type === x.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <x.icon className={cx('mt-0.5 size-6 shrink-0', type === x.value ? 'text-brand-600' : 'text-slate-400')} />
                <span>
                  <span className="block text-base font-semibold text-slate-900">{t(x.label)}</span>
                  <span className="block text-sm text-slate-500">{t(x.hint)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {serialItem && (type === 'in' ? (
          <Field label={t('Serial / IMEI numbers ({n})', { n: newSerials.length })} hint={t('Scan each new piece — one per line.')} required>
            <Textarea rows={3} className="font-mono" dir="ltr" value={serialText} onChange={(e) => setSerialText(e.target.value)} />
          </Field>
        ) : (
          <Field label={t('Which pieces? ({n} chosen)', { n: picked.length })} required>
            <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {(inStockSerials.data || []).map((x) => (
                <label key={x.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <input type="checkbox" className="size-5 accent-brand-600" checked={picked.includes(x.serial)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, x.serial] : p.filter((y) => y !== x.serial)))} />
                  <span className="num font-mono">{x.serial}</span>
                </label>
              ))}
              {!inStockSerials.isLoading && !inStockSerials.data?.length && <p className="px-3 py-3 text-sm text-slate-500">{t('No serial numbers in stock for this item.')}</p>}
            </div>
          </Field>
        ))}
        {variant?.track_expiry && type === 'in' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Batch no.')}><Input value={batch.no} onChange={(e) => setBatch((b) => ({ ...b, no: e.target.value }))} /></Field>
            <Field label={t('Expiry date')}><Input type="date" value={batch.expiry} onChange={(e) => setBatch((b) => ({ ...b, expiry: e.target.value }))} /></Field>
          </div>
        )}

        <div className={cx('grid gap-4 sm:grid-cols-2', serialItem && 'hidden')}>
          <Field
            label={`${type === 'count' ? t('How many did you count?') : t('How many?')} (${unitName})`}
            error={qtyError || (tooMuch ? t('Only {n} left in stock', { n: `${qty(current)} ${unitName}` }) : null)}
            hint={shop.isFractional(unit) ? t('You can write part amounts, e.g. 1.5') : t('Whole numbers only')}
            required
          >
            <Input type="number" inputMode="decimal" min="0" step={unitStep(shop, unit)} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!variant} className="h-12 text-lg" />
          </Field>
          {variant && amount !== '' && !qtyError && (
            <div className="flex flex-col justify-center rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">{t('Stock after saving')}</span>
              <span className="mt-0.5 text-lg font-semibold text-slate-900">
                <span className="num">{qty(current)} → <span className={after < current ? 'text-red-600' : after > current ? 'text-emerald-600' : ''}>{qty(after)}</span></span> {unitName}
              </span>
            </div>
          )}
        </div>

        <Field label={t('Why? (optional)')} hint={t('Helps you remember later when you look at stock history.')}>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'damaged' ? t('e.g. Packets torn in delivery') : type === 'count' ? t('e.g. Monthly stock count') : ''} />
        </Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- history

function Movements() {
  const t = useT();
  const unitText = useUnitText();
  const [params, setParams] = useSearchParams();
  const variantId = params.get('variant_id') || '';
  const variantName = params.get('label') || '';
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const h = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(h);
  }, [search]);
  useEffect(() => { setPage(1); }, [variantId]);

  const q = { variant_id: variantId, search: term, type, start_date: from, end_date: to, page, per_page: 25 };
  const list = useQuery({ queryKey: ['inventory', 'adjustments', q], queryFn: () => api.get('/inventory/adjustments', q), placeholderData: (p) => p });
  const rows = list.data?.data || [];
  const meta = list.data ? { current_page: list.data.current_page, last_page: list.data.last_page, total: list.data.total } : null;
  const filtered = term || type || from || to || variantId;

  return (
    <Card>
      <p className="border-b border-slate-100 px-4 pt-4 pb-3 text-sm text-slate-500">{t('Every time stock went up or down — sales, stock bought, returns and changes you made.')}</p>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        {variantId ? (
          <div className="flex min-w-60 flex-1 items-center gap-2">
            <Badge color="blue" className="gap-2 py-1.5 ps-3 pe-1.5 text-sm">
              {t('History of: {name}', { name: variantName || `#${variantId}` })}
              <button type="button" onClick={() => setParams({})} className="rounded-full p-1 hover:bg-brand-100 hover:text-brand-900" aria-label={t('Show all items')}><X className="size-4" /></button>
            </Badge>
          </div>
        ) : (
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <Input className="ps-10" placeholder={t('Search item name or scan barcode…')} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTerm(search.trim()); } }} />
          </div>
        )}
        <div className="w-full sm:w-44">
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label={t('Show')}>
            <option value="">{t('All changes')}</option>
            {Object.entries(MOVE_TYPES).map(([k, m]) => <option key={k} value={k}>{t(m.label)}</option>)}
          </Select>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input type="date" className="sm:w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label={t('From date')} />
          <span className="text-sm text-slate-400">{t('to')}</span>
          <Input type="date" className="sm:w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label={t('To date')} />
        </div>
      </div>

      {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
        <EmptyState icon={History} title={filtered ? t('Nothing found') : t('No stock history yet')}>
          {filtered ? t('Try other dates or choose "All changes".') : t('Sales, stock bought, returns and stock changes will show here.')}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('Date')}</Th><Th>{t('Item')}</Th><Th>{t('What happened')}</Th>
              <Th className="text-end">{t('Before')}</Th><Th className="text-end">{t('Added / removed')}</Th><Th className="text-end">{t('After')}</Th>
              <Th>{t('Why')}</Th><Th>{t('By')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const change = m.quantity_change !== undefined && m.quantity_change !== null
                ? Number(m.quantity_change) : Number(m.quantity_after) - Number(m.quantity_before);
              const mt = MOVE_TYPES[m.adjustment_type] || { label: m.adjustment_type, color: 'gray' };
              const label = variantLabel(m);
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-slate-600"><span className="num">{dateTime(m.created_at)}</span></Td>
                  <Td>
                    <div className="font-medium text-slate-900">{m.product_name || t('Deleted item')}{label && <span className="font-normal text-slate-500"> · {label}</span>}</div>
                    {m.sku && <div className="text-xs text-slate-500"><span className="num">{m.sku}</span></div>}
                  </Td>
                  <Td><Badge color={mt.color}>{t(mt.label)}</Badge></Td>
                  <Td className="whitespace-nowrap text-end text-slate-500"><span className="num">{qty(m.quantity_before)}</span></Td>
                  <Td className={cx('whitespace-nowrap text-end font-medium', change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-slate-500')}>
                    <span className="num">{change > 0 ? '+' : ''}{qty(change)}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-end font-medium text-slate-900"><span className="num">{qty(m.quantity_after)}</span> <span className="text-xs font-normal text-slate-400">{m.unit ? unitText(m.unit) : ''}</span></Td>
                  <Td className="max-w-xs text-slate-600"><span className="line-clamp-2">{m.reason || '—'}</span></Td>
                  <Td className="whitespace-nowrap text-slate-600">{m.adjusted_by || '—'}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </Card>
  );
}
