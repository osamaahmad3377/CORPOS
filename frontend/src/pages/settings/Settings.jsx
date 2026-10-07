import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, Lightbulb, Percent, Puzzle, ReceiptText, RotateCcw, Save, ScanBarcode, Store } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { Page } from '../../components/Layout';
import Receipt from '../../components/Receipt';
import {
  Button, Card, CardHeader, Field, Input, Loading, PageHeader, Select, Textarea, cx, useToast,
} from '../../components/ui';
import { BarcodeLabel, FORMATS, LABEL_SIZES } from '../barcodes/labels';

// Every key SettingController@update accepts (minus shop.logo), with defaults.
const DEFAULTS = {
  shop: { name: '', phone: '', address: '', email: '', website: '' },
  receipt: { header: '', footer: '', show_tax_line: '1', paper_width: '80mm' },
  tax: { enabled: '0', label: 'GST', percentage: '0' },
  barcode: { default_format: 'code128', default_label_size: 'small', show_shop_name: '1' },
  business: { type: 'general' },
  product: { option1_label: '', option2_label: '', default_unit: 'pcs' },
  features: { restaurant: '0', serials: '0', expiry: '0' },
};

const SECTIONS = [
  { key: 'shop', label: 'Shop details', icon: Store, groups: ['shop'], preview: 'receipt' },
  { key: 'receipt', label: 'Receipt', icon: ReceiptText, groups: ['receipt'], preview: 'receipt' },
  { key: 'tax', label: 'Tax', icon: Percent, groups: ['tax'], preview: 'receipt' },
  { key: 'barcode', label: 'Barcode labels', icon: ScanBarcode, groups: ['barcode'], preview: 'label' },
  { key: 'business', label: 'Business & products', icon: Briefcase, groups: ['business', 'product'] },
  { key: 'features', label: 'Features', icon: Puzzle, groups: ['features'] },
];

function normalize(s) {
  const out = {};
  for (const [g, keys] of Object.entries(DEFAULTS)) {
    out[g] = {};
    for (const [k, def] of Object.entries(keys)) {
      const v = s?.[g]?.[k];
      out[g][k] = v === undefined || v === null || v === 'null' ? def : String(v);
    }
  }
  return out;
}

const sameGroups = (a, b, groups) => groups.every((g) => Object.keys(DEFAULTS[g]).every((k) => a[g][k] === b[g][k]));

export default function Settings() {
  const shop = useShop();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(null); // last values from the server
  const [draft, setDraft] = useState(null); // what's on screen
  const draftRef = useRef(null);
  draftRef.current = draft;

  useEffect(() => {
    if (saved || shop.loading || !Object.keys(shop.settings || {}).length) return;
    const n = normalize(shop.settings);
    setSaved(n);
    setDraft(n);
  }, [saved, shop.loading, shop.settings]);

  // Live preview: Receipt (and the rest of the app) read settings from the
  // ['settings'] query, so mirror the draft into that cache while editing.
  // Leaving the page refetches, which drops anything that wasn't saved.
  useEffect(() => {
    if (!draft) return;
    qc.setQueryData(['settings'], (old) => mergeInto(old, draft));
  }, [draft, qc]);
  useEffect(() => () => { qc.invalidateQueries({ queryKey: ['settings'] }); }, [qc]);

  const onSaved = async (res, groups) => {
    const fresh = normalize(res);
    setSaved(fresh);
    setDraft((d) => {
      const next = { ...d };
      groups.forEach((g) => { next[g] = fresh[g]; });
      return next;
    });
    await shop.refetchSettings();
    if (draftRef.current) qc.setQueryData(['settings'], (old) => mergeInto(old, draftRef.current));
  };

  if (!draft) return <Page><Loading /></Page>;

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Your shop's details, receipts, tax and how products are described." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.map(({ key, label, icon: Icon, groups }) => {
            const dirty = !sameGroups(draft, saved, groups);
            return (
              <NavLink
                key={key}
                to={`/settings/${key}`}
                className={({ isActive }) => cx(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 whitespace-nowrap">{label}</span>
                {dirty && <span className="size-2 rounded-full bg-amber-500" title="Unsaved changes" />}
              </NavLink>
            );
          })}
        </nav>
        <Routes>
          <Route index element={<Navigate to="shop" replace />} />
          <Route path=":section" element={<Section draft={draft} saved={saved} setDraft={setDraft} onSaved={onSaved} />} />
        </Routes>
      </div>
    </Page>
  );
}

function mergeInto(old, draft) {
  const next = { ...(old || {}) };
  for (const g of Object.keys(draft)) next[g] = { ...(old?.[g] || {}), ...draft[g] };
  return next;
}

function Section({ draft, saved, setDraft, onSaved }) {
  const { section } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const meta = SECTIONS.find((s) => s.key === section);

  useEffect(() => { setErrors({}); }, [section]);
  if (!meta) return <Navigate to="/settings/shop" replace />;

  const canEdit = can('settings.manage');
  const dirty = !sameGroups(draft, saved, meta.groups);
  const set = (g, k) => (eOrValue) => {
    const v = typeof eOrValue === 'object' && eOrValue?.target ? eOrValue.target.value : eOrValue;
    setDraft((d) => ({ ...d, [g]: { ...d[g], [k]: v } }));
  };
  const err = (g, k) => errors[`${g}.${k}`]?.[0];

  const discard = () => setDraft((d) => {
    const next = { ...d };
    meta.groups.forEach((g) => { next[g] = saved[g]; });
    return next;
  });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = Object.fromEntries(meta.groups.map((g) => [g, Object.fromEntries(Object.entries(draft[g]).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))]));
    try {
      const res = await api.put('/settings', body);
      await onSaved(res, meta.groups);
      toast(`${meta.label} saved`);
    } catch (ex) {
      setErrors(ex.errors || {});
      toast(ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const props = { d: draft, set, err, canEdit };
  const Form = { shop: ShopForm, receipt: ReceiptForm, tax: TaxForm, barcode: BarcodeForm, business: BusinessForm, features: FeaturesForm }[section];

  return (
    <div className={cx('grid min-w-0 items-start gap-6', meta.preview ? 'xl:grid-cols-[1fr_auto]' : 'max-w-3xl')}>
      <Card className="min-w-0">
        <form onSubmit={save}>
          <fieldset disabled={!canEdit} className="min-w-0">
            <Form {...props} />
          </fieldset>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50 px-5 py-3">
              {dirty && <span className="mr-auto text-sm text-amber-700">You have unsaved changes</span>}
              <Button variant="ghost" icon={RotateCcw} disabled={!dirty || busy} onClick={discard}>Discard</Button>
              <Button type="submit" icon={Save} loading={busy} disabled={!dirty}>Save changes</Button>
            </div>
          )}
        </form>
      </Card>
      {meta.preview === 'receipt' && <ReceiptPreview d={draft} />}
      {meta.preview === 'label' && <LabelPreview d={draft} />}
    </div>
  );
}

// ---------------------------------------------------------------- forms

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function FeaturesForm({ d, set }) {
  const on = (k) => d.features[k] === '1';
  const toggle = (k) => (v) => set('features', k)(v ? '1' : '0');
  return (
    <>
      <CardHeader title="Features" subtitle="Switch on the extra tools your trade needs. Turning one off hides it — no data is deleted." />
      <div className="space-y-5 px-5 py-5">
        <Toggle checked={on('restaurant')} onChange={toggle('restaurant')} label="Restaurant mode" hint="Dine-in / takeaway / delivery, table numbers, kitchen order slips (KOT) and open orders at the POS." />
        <Toggle checked={on('serials')} onChange={toggle('serials')} label="Serial / IMEI numbers" hint="Track each unit of phones, laptops, appliances or vehicles by its serial/IMEI/chassis number, with warranty on the receipt." />
        <Toggle checked={on('expiry')} onChange={toggle('expiry')} label="Batches & expiry dates" hint="Record batch and expiry when buying; sells the earliest-expiring stock first and lists what is about to expire." />
        <p className="text-xs text-slate-500">After switching a feature on, open a product and tick &ldquo;Track serial / IMEI&rdquo; or &ldquo;Track batch &amp; expiry&rdquo; for the items that need it.</p>
      </div>
    </>
  );
}

function ShopForm({ d, set, err }) {
  return (
    <>
      <CardHeader title="Shop details" subtitle="Printed at the top of every receipt." />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Shop name" className="sm:col-span-2" error={err('shop', 'name')}><Input maxLength={255} value={d.shop.name} onChange={set('shop', 'name')} placeholder="e.g. Madina General Store" /></Field>
        <Field label="Phone" error={err('shop', 'phone')}><Input maxLength={50} value={d.shop.phone} onChange={set('shop', 'phone')} placeholder="0300 1234567" /></Field>
        <Field label="Email" error={err('shop', 'email')}><Input type="email" maxLength={255} value={d.shop.email} onChange={set('shop', 'email')} placeholder="Optional" /></Field>
        <Field label="Address" className="sm:col-span-2" error={err('shop', 'address')}><Textarea rows={2} maxLength={500} value={d.shop.address} onChange={set('shop', 'address')} placeholder="Shop #, market, city" /></Field>
        <Field label="Website or Facebook page" className="sm:col-span-2" error={err('shop', 'website')}><Input maxLength={255} value={d.shop.website} onChange={set('shop', 'website')} placeholder="Optional" /></Field>
      </div>
    </>
  );
}

function ReceiptForm({ d, set, err }) {
  return (
    <>
      <CardHeader title="Receipt" subtitle="What customers see on their printed bill." />
      <div className="space-y-4 p-5">
        <Field label="Paper width" hint="Match your thermal printer's roll." error={err('receipt', 'paper_width')}>
          <div className="grid grid-cols-2 gap-2 sm:w-80">
            {[['58mm', '58 mm (small)'], ['80mm', '80 mm (standard)']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set('receipt', 'paper_width')(v)}
                className={cx('rounded-lg border px-3 py-2 text-sm font-medium transition-colors', d.receipt.paper_width === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Header message" hint="Shown under the shop name, e.g. “Thank you for shopping with us!”" error={err('receipt', 'header')}>
          <Textarea rows={2} maxLength={500} value={d.receipt.header} onChange={set('receipt', 'header')} />
        </Field>
        <Field label="Footer message" hint="Shown at the bottom, e.g. your return or exchange policy." error={err('receipt', 'footer')}>
          <Textarea rows={2} maxLength={500} value={d.receipt.footer} onChange={set('receipt', 'footer')} />
        </Field>
        <Toggle checked={d.receipt.show_tax_line === '1'} onChange={(v) => set('receipt', 'show_tax_line')(v ? '1' : '0')} label="Show tax line" hint="Prints the tax amount separately when a sale includes tax." />
      </div>
    </>
  );
}

function TaxForm({ d, set, err }) {
  const on = d.tax.enabled === '1';
  return (
    <>
      <CardHeader title="Tax" subtitle="Sales tax added on top of item prices at the till." />
      <div className="space-y-4 p-5">
        <Toggle checked={on} onChange={(v) => set('tax', 'enabled')(v ? '1' : '0')} label="Charge tax on sales" hint="Turn off if your prices already include tax or you aren't registered." />
        <div className={cx('grid gap-4 sm:grid-cols-2', !on && 'opacity-50')}>
          <Field label="Tax name" hint="Printed on receipts, e.g. GST or Sales Tax." error={err('tax', 'label')}>
            <Input maxLength={50} disabled={!on} value={d.tax.label} onChange={set('tax', 'label')} />
          </Field>
          <Field label="Rate (%)" error={err('tax', 'percentage')}>
            <Input type="number" min="0" max="100" step="0.01" required disabled={!on} value={d.tax.percentage} onChange={set('tax', 'percentage')} />
          </Field>
        </div>
      </div>
    </>
  );
}

function BarcodeForm({ d, set, err }) {
  return (
    <>
      <CardHeader title="Barcode labels" subtitle="Defaults for the Barcode labels page. You can still change them each time you print." />
      <div className="space-y-4 p-5">
        <Field label="Barcode type" error={err('barcode', 'default_format')}>
          <Select value={d.barcode.default_format} onChange={set('barcode', 'default_format')}>
            {Object.entries(FORMATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Label size" error={err('barcode', 'default_label_size')}>
          <Select value={d.barcode.default_label_size} onChange={set('barcode', 'default_label_size')}>
            {Object.entries(LABEL_SIZES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
        </Field>
        <Toggle checked={d.barcode.show_shop_name === '1'} onChange={(v) => set('barcode', 'show_shop_name')(v ? '1' : '0')} label="Print shop name on labels" />
      </div>
    </>
  );
}

function BusinessForm({ d, set, err }) {
  const shop = useShop();
  const types = shop.meta.business_types || [];
  const units = shop.meta.units || [];
  const [suggest, setSuggest] = useState(null);
  const current = types.find((t) => t.code === d.business.type);

  const onType = (e) => {
    const code = e.target.value;
    set('business', 'type')(code);
    const t = types.find((x) => x.code === code);
    if (!t) return setSuggest(null);
    const differs = t.options?.[0] !== d.product.option1_label || t.options?.[1] !== d.product.option2_label || t.unit !== d.product.default_unit;
    return setSuggest(differs ? t : null);
  };

  const apply = () => {
    set('product', 'option1_label')(suggest.options?.[0] || '');
    set('product', 'option2_label')(suggest.options?.[1] || '');
    set('product', 'default_unit')(suggest.unit || 'pcs');
    setSuggest(null);
  };

  const o1 = d.product.option1_label || 'Option 1';
  const o2 = d.product.option2_label || 'Option 2';
  return (
    <>
      <CardHeader title="Business & products" subtitle="Words that fit your trade, used on product forms, the till and labels." />
      <div className="space-y-5 p-5">
        <Field label="Type of business" hint="Changing this doesn't change your existing products or categories." error={err('business', 'type')}>
          <Select value={d.business.type} onChange={onType}>
            {!current && <option value={d.business.type}>{d.business.type}</option>}
            {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </Select>
        </Field>

        {suggest && (
          <div className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-brand-50 p-4 sm:flex-row sm:items-center">
            <Lightbulb className="size-5 shrink-0 text-brand-600" />
            <div className="flex-1 text-sm text-slate-700">
              Use the usual setup for <b>{suggest.label}</b>? Options <b>{suggest.options?.[0]}</b> and <b>{suggest.options?.[1]}</b>, sold by <b>{shop.unitLabel(suggest.unit)}</b>.
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSuggest(null)}>Keep mine</Button>
              <Button size="sm" onClick={apply}>Use these</Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">Product options</div>
          <p className="mb-3 text-xs text-slate-500">Names for the two ways one product can come in different versions — e.g. Color and Size for clothes, Storage and Model for mobiles, Strength and Pack for medicines. Each version gets its own price, stock and barcode.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First option" error={err('product', 'option1_label')}><Input maxLength={40} value={d.product.option1_label} onChange={set('product', 'option1_label')} placeholder="e.g. Variant" /></Field>
            <Field label="Second option" error={err('product', 'option2_label')}><Input maxLength={40} value={d.product.option2_label} onChange={set('product', 'option2_label')} placeholder="e.g. Size" /></Field>
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            On product forms you&apos;ll see: <span className="font-medium text-slate-800">{o1}</span> · <span className="font-medium text-slate-800">{o2}</span>
          </div>
        </div>

        <Field label="Default unit for new products" hint="What most of your items are sold by. Each product can still use its own unit." error={err('product', 'default_unit')}>
          <div className="sm:w-64">
            <Select value={d.product.default_unit} onChange={set('product', 'default_unit')}>
              {units.map((u) => <option key={u.code} value={u.code}>{u.label}{u.fractional ? ' (allows 1.5 etc.)' : ''}</option>)}
            </Select>
          </div>
        </Field>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- previews

function ReceiptPreview({ d }) {
  const { user } = useAuth();
  const sale = useMemo(() => {
    const items = [
      { id: 1, product_name: 'Sample item', color: null, size: null, quantity: 2, unit: 'pcs', unit_price: 150, discount_per_item: 0, total_price: 300 },
      { id: 2, product_name: 'Item sold by weight', color: null, size: null, quantity: 1.5, unit: 'kg', unit_price: 240, discount_per_item: 0, total_price: 360 },
      { id: 3, product_name: 'Item with discount', color: null, size: 'Large', quantity: 1, unit: 'pcs', unit_price: 450, discount_per_item: 50, total_price: 400 },
    ];
    const subtotal = items.reduce((a, i) => a + i.total_price, 0);
    const tax = d.tax.enabled === '1' ? Math.round(subtotal * Number(d.tax.percentage || 0)) / 100 : 0;
    const total = subtotal + tax;
    const paid = Math.ceil(total / 500) * 500;
    return {
      invoice_number: 'INV-1001', sale_date: new Date().toISOString(), cashier: user?.name, customer: null, items,
      subtotal, discount_amount: 0, tax_amount: tax, grand_total: total, payment_method: 'cash', payment_received: paid, change_amount: paid - total, due_amount: 0,
    };
  }, [d.tax.enabled, d.tax.percentage, user?.name]);

  return (
    <div className="xl:sticky xl:top-6">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Receipt preview · {d.receipt.paper_width === '58mm' ? '58' : '80'} mm</div>
      <div className="overflow-x-auto rounded-xl bg-slate-200/70 p-4">
        <div className="mx-auto w-fit shadow-md">
          <Receipt sale={sale} />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Sample sale — updates as you type.</p>
    </div>
  );
}

function LabelPreview({ d }) {
  const shop = useShop();
  const item = { id: 0, product_name: 'Sample product', color: null, size: null, barcode: d.barcode.default_format === 'ean13' ? '8964000123454' : '260100010001', selling_price: '250' };
  return (
    <div className="xl:sticky xl:top-6">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Label preview</div>
      <div className="flex justify-center rounded-xl bg-slate-200/70 p-6">
        <BarcodeLabel item={item} size={d.barcode.default_label_size} showShop={d.barcode.show_shop_name === '1'} shopName={d.shop.name || shop.shopName} format={d.barcode.default_format} className="shadow-md" />
      </div>
      <p className="mt-2 text-xs text-slate-500">Shown at actual size on most screens.</p>
    </div>
  );
}
