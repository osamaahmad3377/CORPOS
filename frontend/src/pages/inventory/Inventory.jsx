import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, ClipboardCheck, History, PackageX, Search, SlidersHorizontal, Wallet, X,
} from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { dateTime, money, num, qty, round3, variantLabel } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Pagination, Select, StatCard, Table, Td, Textarea, Th,
  cx, useToast,
} from '../../components/ui';
import { VariantFinder, badQty, unitStep } from './VariantFinder';

const TYPES = [
  { value: 'in', label: 'Add stock', hint: 'Goods received without a purchase bill, found items, opening stock', icon: ArrowUpRight },
  { value: 'out', label: 'Remove stock', hint: 'Used in shop, given away, sent to another branch', icon: ArrowDownRight },
  { value: 'damaged', label: 'Damaged / expired', hint: 'Broken, spoiled or past expiry — written off', icon: PackageX },
  { value: 'count', label: 'Set counted quantity', hint: 'After a physical count — enter what is actually on the shelf', icon: ClipboardCheck },
];

const MOVE_TYPES = {
  in: { label: 'Stock in', color: 'green' },
  out: { label: 'Stock out', color: 'gray' },
  damaged: { label: 'Damaged', color: 'red' },
  adjustment: { label: 'Count correction', color: 'amber' },
};

function Tabs() {
  const tab = ({ isActive }) => cx(
    'border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
    isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
  );
  return (
    <div className="mb-5 flex gap-6 border-b border-slate-200">
      <NavLink to="/inventory" end className={tab}>Stock levels</NavLink>
      <NavLink to="/inventory/movements" className={tab}>Stock movements</NavLink>
    </div>
  );
}

export default function Inventory() {
  const { can } = useAuth();
  const [adjust, setAdjust] = useState(null); // { variant } | {} when open

  return (
    <Page>
      <PageHeader
        title="Inventory"
        subtitle="How much of everything you have, and every change to it."
        actions={can('inventory.adjust') && <Button icon={SlidersHorizontal} onClick={() => setAdjust({})}>Adjust stock</Button>}
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
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [stock, setStock] = useState('');
  const [page, setPage] = useState(1);
  const showCost = can('purchases.view');

  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = { search: term, stock, page, per_page: 25 };
  const list = useQuery({ queryKey: ['inventory', params], queryFn: () => api.get('/inventory', params), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const summary = list.data?.summary;

  return (
    <>
      {summary && (
        <div className={cx('mb-5 grid grid-cols-2 gap-3 sm:gap-4', showCost && summary.stock_value !== undefined ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          <StatCard icon={Boxes} label="Items tracked" value={num(summary.items)} />
          <button type="button" className="text-left" onClick={() => { setStock('low'); setPage(1); }}>
            <StatCard icon={AlertTriangle} label="Running low" value={num(summary.low_stock)} tone="amber" />
          </button>
          <button type="button" className="text-left" onClick={() => { setStock('out'); setPage(1); }}>
            <StatCard icon={PackageX} label="Out of stock" value={num(summary.out_of_stock)} tone="red" />
          </button>
          {showCost && summary.stock_value !== undefined && <StatCard icon={Wallet} label="Stock value (at cost)" value={money(summary.stock_value)} tone="green" />}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9 pr-9"
              placeholder="Search name, SKU or scan barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTerm(search.trim()); setPage(1); } }}
            />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Clear"><X className="size-4" /></button>}
          </div>
          <div className="w-full sm:w-52">
            <Select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }}>
              <option value="">All stock levels</option>
              <option value="low">Running low or out</option>
              <option value="out">Out of stock only</option>
            </Select>
          </div>
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState icon={Boxes} title={term || stock ? 'Nothing matches' : 'No stock items yet'}>
            {term || stock ? 'Try a different search or stock filter.' : 'Add products first — their stock shows up here.'}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">In stock</Th>
                <Th className="hidden text-right md:table-cell">Alert at</Th>
                {showCost && <Th className="hidden text-right lg:table-cell">Cost</Th>}
                <Th className="hidden text-right sm:table-cell">Selling</Th>
                {showCost && <Th className="text-right">Stock value</Th>}
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const stockQty = Number(v.stock_qty);
                const label = variantLabel(v);
                return (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="font-medium text-slate-900">
                        {v.product_name}{label && <span className="font-normal text-slate-500"> · {label}</span>}
                        {!v.is_active && <Badge className="ml-2">Hidden</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">{v.sku}{v.barcode ? ` · ${v.barcode}` : ''}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <Badge color={stockQty <= 0 ? 'red' : v.is_low_stock ? 'amber' : 'green'}>{qty(stockQty)} {v.unit}</Badge>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-right text-slate-500 md:table-cell">{qty(v.low_stock_threshold)} {v.unit}</Td>
                    {showCost && <Td className="hidden whitespace-nowrap text-right text-slate-600 lg:table-cell">{money(v.purchase_price)}</Td>}
                    <Td className="hidden whitespace-nowrap text-right text-slate-600 sm:table-cell">{money(v.selling_price)} <span className="text-xs text-slate-400">/ {v.unit}</span></Td>
                    {showCost && <Td className="whitespace-nowrap text-right font-medium text-slate-900">{money(Math.max(stockQty, 0) * Number(v.purchase_price || 0))}</Td>}
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <NavLink to={`/inventory/movements?variant_id=${v.id}&label=${encodeURIComponent(v.product_name + (label ? ` · ${label}` : ''))}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Stock history" aria-label="Stock history">
                          <History className="size-4" />
                        </NavLink>
                        {can('inventory.adjust') && <Button size="sm" variant="secondary" onClick={() => onAdjust(v)}>Adjust</Button>}
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

// ---------------------------------------------------------------- adjust modal

function AdjustModal({ initial, onClose }) {
  const shop = useShop();
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
  const current = Number(variant?.stock_qty || 0);
  const n = serialItem ? (type === 'in' ? newSerials.length : picked.length) : Number(amount || 0);
  const after = type === 'count' ? n : type === 'in' ? current + n : current - n;
  const qtyError = amount === '' ? null : badQty(shop, unit, amount, { allowZero: type === 'count' });
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
      toast(`Stock updated: ${variant.product_name} now ${qty(after)} ${unit}`);
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
      title="Adjust stock"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="adjust-form" loading={save.isPending} disabled={!variant || (serialItem ? !n : amount === '' || !!qtyError) || tooMuch}>Save adjustment</Button>
        </>
      )}
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-5">
        <ErrorBox error={error} />
        {!variant ? (
          <Field label="Product" hint="Scan the item's barcode or type to search.">
            <VariantFinder autoFocus onPick={(v) => setVariant(v)} />
          </Field>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-900">{variant.product_name}{label && <span className="font-normal text-slate-500"> · {label}</span>}</div>
              <div className="text-xs text-slate-500">{variant.sku} · Now in stock: <span className="font-medium text-slate-700">{qty(current)} {unit}</span></div>
            </div>
            {!initial && <Button size="sm" variant="ghost" onClick={() => { setVariant(null); setAmount(''); }}>Change</Button>}
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">What happened?</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.filter((t) => !(serialItem && t.value === 'count')).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setType(t.value); if (t.value === 'count' && amount === '' && variant) setAmount(String(qty(current))); }}
                className={cx(
                  'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  type === t.value ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <t.icon className={cx('mt-0.5 size-4 shrink-0', type === t.value ? 'text-brand-600' : 'text-slate-400')} />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{t.label}</span>
                  <span className="block text-xs text-slate-500">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {serialItem && (type === 'in' ? (
          <Field label={`Serial / IMEI numbers (${newSerials.length})`} hint="Scan each new unit — one per line." required>
            <Textarea rows={3} className="font-mono" value={serialText} onChange={(e) => setSerialText(e.target.value)} />
          </Field>
        ) : (
          <Field label={`Which units? (${picked.length} selected)`} required>
            <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {(inStockSerials.data || []).map((x) => (
                <label key={x.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={picked.includes(x.serial)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, x.serial] : p.filter((y) => y !== x.serial)))} />
                  <span className="font-mono">{x.serial}</span>
                </label>
              ))}
              {!inStockSerials.isLoading && !inStockSerials.data?.length && <p className="px-3 py-3 text-sm text-slate-500">No serials in stock.</p>}
            </div>
          </Field>
        ))}
        {variant?.track_expiry && type === 'in' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Batch no."><Input value={batch.no} onChange={(e) => setBatch((b) => ({ ...b, no: e.target.value }))} /></Field>
            <Field label="Expiry date"><Input type="date" value={batch.expiry} onChange={(e) => setBatch((b) => ({ ...b, expiry: e.target.value }))} /></Field>
          </div>
        )}

        <div className={cx('grid gap-4 sm:grid-cols-2', serialItem && 'hidden')}>
          <Field
            label={type === 'count' ? `Counted quantity (${unit})` : `Quantity (${unit})`}
            error={qtyError || (tooMuch ? `Only ${qty(current)} ${unit} in stock` : null)}
            hint={shop.isFractional(unit) ? 'Decimals allowed, e.g. 1.5' : 'Whole numbers'}
            required
          >
            <Input type="number" inputMode="decimal" min="0" step={unitStep(shop, unit)} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!variant} />
          </Field>
          {variant && amount !== '' && !qtyError && (
            <div className="flex flex-col justify-center rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">Stock after saving</span>
              <span className="mt-0.5 text-lg font-semibold text-slate-900">
                {qty(current)} → <span className={after < current ? 'text-red-600' : after > current ? 'text-emerald-600' : ''}>{qty(after)}</span> {unit}
              </span>
            </div>
          )}
        </div>

        <Field label="Reason / note" hint="Optional, but helps when checking stock history later.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'damaged' ? 'e.g. Packets torn in delivery' : type === 'count' ? 'e.g. Monthly stock count' : ''} />
        </Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- movements

function Movements() {
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
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [variantId]);

  const q = { variant_id: variantId, search: term, type, start_date: from, end_date: to, page, per_page: 25 };
  const list = useQuery({ queryKey: ['inventory', 'adjustments', q], queryFn: () => api.get('/inventory/adjustments', q), placeholderData: (p) => p });
  const rows = list.data?.data || [];
  const meta = list.data ? { current_page: list.data.current_page, last_page: list.data.last_page, total: list.data.total } : null;
  const filtered = term || type || from || to || variantId;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        {variantId ? (
          <div className="flex min-w-60 flex-1 items-center gap-2">
            <Badge color="blue" className="gap-1.5 py-1 text-sm">
              History of: {variantName || `item #${variantId}`}
              <button type="button" onClick={() => setParams({})} className="rounded-full hover:text-brand-900" aria-label="Show all items"><X className="size-3.5" /></button>
            </Badge>
          </div>
        ) : (
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search product, SKU or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setTerm(search.trim()); } }} />
          </div>
        )}
        <div className="w-full sm:w-44">
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All movements</option>
            {Object.entries(MOVE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </Select>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input type="date" className="sm:w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
          <span className="text-sm text-slate-400">to</span>
          <Input type="date" className="sm:w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
        </div>
      </div>

      {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
        <EmptyState icon={History} title={filtered ? 'No movements match' : 'No stock movements yet'}>
          {filtered ? 'Try different filters or dates.' : 'Sales, purchases, returns and adjustments will be listed here.'}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th><Th>Product</Th><Th>Type</Th>
              <Th className="text-right">Before</Th><Th className="text-right">Change</Th><Th className="text-right">After</Th>
              <Th>Reason</Th><Th>By</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const change = m.quantity_change !== undefined && m.quantity_change !== null
                ? Number(m.quantity_change) : Number(m.quantity_after) - Number(m.quantity_before);
              const t = MOVE_TYPES[m.adjustment_type] || { label: m.adjustment_type, color: 'gray' };
              const label = variantLabel(m);
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-slate-600">{dateTime(m.created_at)}</Td>
                  <Td>
                    <div className="font-medium text-slate-900">{m.product_name || 'Deleted item'}{label && <span className="font-normal text-slate-500"> · {label}</span>}</div>
                    {m.sku && <div className="text-xs text-slate-500">{m.sku}</div>}
                  </Td>
                  <Td><Badge color={t.color}>{t.label}</Badge></Td>
                  <Td className="whitespace-nowrap text-right text-slate-500">{qty(m.quantity_before)}</Td>
                  <Td className={cx('whitespace-nowrap text-right font-medium', change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-slate-500')}>
                    {change > 0 ? '+' : ''}{qty(change)}
                  </Td>
                  <Td className="whitespace-nowrap text-right font-medium text-slate-900">{qty(m.quantity_after)} <span className="text-xs font-normal text-slate-400">{m.unit}</span></Td>
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
