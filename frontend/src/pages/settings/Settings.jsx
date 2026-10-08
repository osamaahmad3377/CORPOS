import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, Building2, Check, ImageUp, Printer, UtensilsCrossed, Languages, Lightbulb, Monitor, Moon, Palette, Percent, Plus, Puzzle, ReceiptText, RotateCcw, Save, ScanBarcode, Store, Sun, Trash2, Users, X } from 'lucide-react';
import { BRAND_PRESETS } from '../../lib/theme';
import { isDesktop, listPrinters, printNow, printerPrefs, savePrinterPrefs } from '../../lib/printer';
import { ShopLogo } from '../../components/Brand';
import { api, switchBusiness } from '../../lib/api';
import { BusinessBadge, useBusinesses } from '../../components/BusinessSwitcher';
import { useAuth } from '../../lib/auth';
import { tableAreas, useShop } from '../../lib/shop';
import { useLang, useT } from '../../lib/i18n';
import { Page } from '../../components/Layout';
import Receipt from '../../components/Receipt';
import {
  Button, Card, CardHeader, Field, Input, Loading, Modal, PageHeader, Select, Textarea, cx, useConfirm, useToast,
} from '../../components/ui';
import { BarcodeLabel, FORMATS, LABEL_SIZES } from '../barcodes/labels';

// Every key SettingController@update accepts (minus shop.logo), with defaults.
const DEFAULTS = {
  brand: { primary_color: '#1bd173', theme: 'light', show_logo_on_receipt: '1' },
  shop: { name: '', phone: '', address: '', email: '', website: '' },
  receipt: { header: '', footer: '', show_tax_line: '1', paper_width: '80mm' },
  tax: { enabled: '0', label: 'GST', percentage: '0' },
  barcode: { default_format: 'code128', default_label_size: 'small', show_shop_name: '1' },
  business: { type: 'general' },
  product: { option1_label: '', option2_label: '', default_unit: 'pcs' },
  features: { restaurant: '0', serials: '0', expiry: '0' },
  restaurant: { tables: '12', layout: '', takeaway: '1', delivery: '1' },
};

// Labels are English keys — shown through t(). Keep them in src/i18n/ur/settings.js.
const SECTIONS = [
  { key: 'brand', label: 'Brand & look', icon: Palette, groups: ['brand'], preview: 'receipt' },
  { key: 'shop', label: 'Shop details', icon: Store, groups: ['shop'], preview: 'receipt' },
  { key: 'receipt', label: 'Receipt', icon: ReceiptText, groups: ['receipt'], preview: 'receipt' },
  { key: 'tax', label: 'Tax', icon: Percent, groups: ['tax'], preview: 'receipt' },
  { key: 'barcode', label: 'Barcode stickers', icon: ScanBarcode, groups: ['barcode'], preview: 'label' },
  { key: 'business', label: 'Your business & items', icon: Briefcase, groups: ['business', 'product'] },
  { key: 'features', label: 'Extra tools', icon: Puzzle, groups: ['features'] },
  { key: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed, groups: ['restaurant'], onlyRestaurant: true },
  { key: 'businesses', label: 'My businesses', icon: Building2, groups: [], adminOnly: true },
  { key: 'printers', label: 'Printers', icon: Printer, groups: [] },
  { key: 'language', label: 'Language', icon: Languages, groups: [] },
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
  const t = useT();
  const { can } = useAuth();
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
      <PageHeader title={t('Settings')} subtitle={t('Set up your shop name, bill, tax, barcode stickers and language.')} />
      <div className="grid gap-6 lg:grid-cols-[minmax(200px,max-content)_1fr]">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.filter((x) => (!x.onlyRestaurant || shop.isRestaurant) && (!x.adminOnly || can('settings.manage'))).map(({ key, label, icon: Icon, groups }) => {
            const dirty = !sameGroups(draft, saved, groups);
            return (
              <NavLink
                key={key}
                to={`/settings/${key}`}
                className={({ isActive }) => cx(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-3 text-[15px] font-medium transition-colors',
                  isActive ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="flex-1 whitespace-nowrap">{t(label)}</span>
                {dirty && <span className="size-2.5 rounded-full bg-amber-500" title={t('Not saved yet')} aria-label={t('Not saved yet')} />}
              </NavLink>
            );
          })}
        </nav>
        <Routes>
          <Route index element={<Navigate to="brand" replace />} />
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
  const t = useT();
  const toast = useToast();
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const meta = SECTIONS.find((s) => s.key === section);

  useEffect(() => { setErrors({}); }, [section]);
  if (!meta) return <Navigate to="/settings/shop" replace />;
  if (section === 'language') return <LanguageCard />;
  if (section === 'printers') return <PrintersCard />;
  if (section === 'businesses') return <BusinessesCard />;

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
      toast(t('{section} saved', { section: t(meta.label) }));
    } catch (ex) {
      setErrors(ex.errors || {});
      toast(ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const props = { d: draft, set, err, canEdit };
  const Form = { shop: ShopForm, receipt: ReceiptForm, tax: TaxForm, barcode: BarcodeForm, business: BusinessForm, features: FeaturesForm, brand: BrandForm, restaurant: RestaurantForm }[section];

  return (
    <div className={cx('grid min-w-0 items-start gap-6', meta.preview ? 'xl:grid-cols-[1fr_auto]' : 'max-w-3xl')}>
      <Card className="min-w-0">
        <form onSubmit={save}>
          <fieldset disabled={!canEdit} className="min-w-0">
            <Form {...props} />
          </fieldset>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50 px-5 py-3">
              {dirty && <span className="me-auto text-sm text-amber-700">{t('You changed something. Press Save to keep it.')}</span>}
              <Button variant="ghost" icon={RotateCcw} disabled={!dirty || busy} onClick={discard}>{t('Undo changes')}</Button>
              <Button type="submit" size="lg" icon={Save} loading={busy} disabled={!dirty}>{t('Save')}</Button>
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
        className={cx('relative mt-0.5 inline-flex h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        {/* inset-inline-start (not translate-x) so the knob also moves the right way in Urdu (RTL) */}
        <span className="absolute top-0.5 size-6 rounded-full bg-white shadow transition-all" style={{ insetInlineStart: checked ? 'calc(100% - 1.5rem - 2px)' : 2 }} />
      </button>
      <span>
        <span className="block text-[15px] font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

// White-label look: logo, brand colour, light/dark default.
function BrandForm({ d, set }) {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const color = d.brand.primary_color;
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await api.upload('/settings/logo', fd);
      await shop.refetchSettings();
      toast(t('Logo saved'));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeLogo = async () => {
    setBusy(true);
    try { await api.del('/settings/logo'); await shop.refetchSettings(); toast(t('Logo removed')); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const modes = [
    { code: 'light', label: 'Light', icon: Sun },
    { code: 'dark', label: 'Dark', icon: Moon },
    { code: 'system', label: 'Same as computer', icon: Monitor },
  ];
  return (
    <>
      <CardHeader title={t('Brand & look')} subtitle={t('Your logo and colours — used on the screens and on printed bills.')} />
      <div className="space-y-7 px-5 py-5">
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">{t('Shop logo')}</div>
          <div className="flex flex-wrap items-center gap-4">
            <ShopLogo className="size-20" rounded="rounded-2xl" />
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
              <div className="flex flex-wrap gap-2">
                <Button icon={ImageUp} loading={busy} onClick={() => fileRef.current?.click()}>{shop.logoUrl ? t('Change logo') : t('Upload logo')}</Button>
                {shop.logoUrl && <Button variant="ghost" icon={Trash2} disabled={busy} onClick={removeLogo}>{t('Remove')}</Button>}
              </div>
              <p className="text-xs text-slate-500">{t('PNG or JPG, square works best, up to 2 MB. Saved straight away.')}</p>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">{t('Brand colour')}</div>
          <div className="flex flex-wrap gap-2.5">
            {BRAND_PRESETS.map((p) => (
              <button key={p.hex} type="button" title={p.name} aria-label={p.name} onClick={() => set('brand', 'primary_color')(p.hex)}
                className={cx('grid size-11 place-items-center rounded-xl ring-offset-2 transition hover:scale-105', color.toLowerCase() === p.hex ? 'ring-2 ring-slate-900' : '')}
                style={{ background: p.hex }}>
                {color.toLowerCase() === p.hex && <Check className="size-5 text-white" />}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="color" value={color} onChange={(e) => set('brand', 'primary_color')(e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
              {t('Any other colour')}
            </label>
            <Input className="num w-32 font-mono" value={color} maxLength={7} onChange={(e) => set('brand', 'primary_color')(e.target.value)} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4">
            <span className="text-sm text-slate-500">{t('Preview')}:</span>
            <Button>{t('Take payment')}</Button>
            <Button variant="secondary">{t('Cancel')}</Button>
            <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">{t('Badge')}</span>
            <span className="font-semibold text-brand-600">{t('Link text')}</span>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">{t('Screen theme (default)')}</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {modes.map((m) => (
              <button key={m.code} type="button" onClick={() => { set('brand', 'theme')(m.code); shop.setMode(m.code); }}
                className={cx('flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-start font-medium', d.brand.theme === m.code ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
                <m.icon className="size-5" />{t(m.label)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{t('Each computer can still switch light/dark from the top bar.')}</p>
        </div>

        <Toggle checked={d.brand.show_logo_on_receipt === '1'} onChange={(v) => set('brand', 'show_logo_on_receipt')(v ? '1' : '0')} label={t('Print logo on bills')} hint={t('Shows your logo at the top of every printed bill.')} />
      </div>
    </>
  );
}

function RestaurantForm({ d, set, err }) {
  const t = useT();
  const areas = tableAreas(d.restaurant);
  const all = areas.flatMap((a) => a.tables);
  const save = (next) => set('restaurant', 'layout')(JSON.stringify(next));
  // A new table follows the hall's own naming: after F4 comes F5; plain
  // numbers carry on from the highest number used anywhere.
  const nextNo = (hall, taken) => {
    const used = new Set(taken.map((tb) => String(tb.no).toLowerCase()));
    const last = [...hall].reverse().map((tb) => String(tb.no).match(/^(.*?)(\d+)$/)).find(Boolean);
    const prefix = last && /\D/.test(last[1]) ? last[1] : '';
    const pool = prefix ? hall : taken;
    let n = pool.reduce((m, tb) => {
      const x = String(tb.no).match(/^(.*?)(\d+)$/);
      return x && x[1] === prefix ? Math.max(m, Number(x[2])) : m;
    }, 0) + 1;
    while (used.has(`${prefix}${n}`.toLowerCase())) n++;
    return `${prefix}${n}`;
  };
  const addTables = (ai, count) => {
    const next = areas.map((a) => ({ ...a, tables: [...a.tables] }));
    const taken = [...all];
    for (let i = 0; i < count && taken.length < 300; i++) {
      const tb = { no: nextNo(next[ai].tables, taken), seats: 4 };
      taken.push(tb);
      next[ai].tables.push(tb);
    }
    save(next);
  };
  const editArea = (ai, patch) => save(areas.map((a, i) => (i === ai ? { ...a, ...patch } : a)));
  const editTable = (ai, ti, patch) => editArea(ai, { tables: areas[ai].tables.map((tb, i) => (i === ti ? { ...tb, ...patch } : tb)) });
  const dupes = new Set(all.map((tb) => String(tb.no).trim().toLowerCase()).filter((no, i, arr) => no && arr.indexOf(no) !== i));
  const onOff = (k) => d.restaurant[k] !== '0';

  return (
    <>
      <CardHeader title={t('Restaurant')} subtitle={t('Set up your halls and tables exactly as they are in your restaurant. They appear on the Sell screen.')} />
      <div className="space-y-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle checked={onOff('takeaway')} onChange={(v) => set('restaurant', 'takeaway')(v ? '1' : '0')} label={t('Takeaway orders')} hint={t('Customer picks up the food.')} />
          <Toggle checked={onOff('delivery')} onChange={(v) => set('restaurant', 'delivery')(v ? '1' : '0')} label={t('Delivery orders')} hint={t('Food is sent to the customer’s home.')} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">{t('Halls & tables')}</h3>
            <p className="text-sm text-slate-500">{t('{n} tables in total. Tap a table name to change it — e.g. 1, F2, VIP, Roof 3.', { n: all.length })}</p>
          </div>
          <Button variant="secondary" icon={Plus} onClick={() => save([...areas, { name: '', tables: [] }])} disabled={areas.length >= 30}>{t('Add hall / area')}</Button>
        </div>
        {err('restaurant', 'layout') && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err('restaurant', 'layout')}</p>}

        {areas.map((area, ai) => (
          <div key={ai} className="rounded-2xl border-2 border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 sm:max-w-72">
                <Input value={area.name} onChange={(e) => editArea(ai, { name: e.target.value })} placeholder={t('Hall name — e.g. Main hall, Family hall, Rooftop')} aria-label={t('Hall name')} />
              </div>
              <span className="num text-sm text-slate-500">{t('{n} tables', { n: area.tables.length })}</span>
              <div className="flex-1" />
              {areas.length > 1 && (
                <Button variant="ghost" icon={Trash2} onClick={() => save(areas.filter((_, i) => i !== ai))} className="text-red-600">{t('Remove hall')}</Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {area.tables.map((tb, ti) => {
                const dup = dupes.has(String(tb.no).trim().toLowerCase()) || !String(tb.no).trim();
                return (
                  <div key={ti} className={cx('flex items-center gap-1.5 rounded-xl border-2 bg-white p-1.5', dup ? 'border-red-400' : 'border-slate-200')}>
                    <input value={tb.no} maxLength={20} onChange={(e) => editTable(ai, ti, { no: e.target.value })} aria-label={t('Table name')} placeholder={t('Table name')} className="num w-0 min-w-0 flex-1 rounded-md border border-transparent px-1 py-1 text-base font-bold text-slate-900 hover:border-slate-200 focus:border-brand-400 focus:outline-none" />
                    <label className="flex shrink-0 items-center gap-0.5 text-slate-400" title={t('Seats')}>
                      <Users className="size-3.5" />
                      <input type="number" min="0" max="99" value={tb.seats ?? ''} onChange={(e) => editTable(ai, ti, { seats: e.target.value === '' ? 0 : Math.max(0, Math.min(99, Number(e.target.value))) })} aria-label={t('Seats')} className="num w-9 rounded-md border border-transparent px-0.5 py-1 text-center text-sm text-slate-700 hover:border-slate-200 focus:border-brand-400 focus:outline-none" />
                    </label>
                    <button type="button" onClick={() => editArea(ai, { tables: area.tables.filter((_, i) => i !== ti) })} aria-label={t('Remove table')} className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => addTables(ai, 1)} disabled={all.length >= 300}>{t('Add table')}</Button>
              <Button variant="ghost" size="sm" onClick={() => addTables(ai, 5)} disabled={all.length >= 300}>{t('+5 tables')}</Button>
              <Button variant="ghost" size="sm" onClick={() => addTables(ai, 10)} disabled={all.length >= 300}>{t('+10 tables')}</Button>
            </div>
          </div>
        ))}
        {dupes.size > 0 && <p className="text-sm text-red-600">{t('Two tables have the same name. Give each table its own name before saving.')}</p>}
        <p className="text-sm text-slate-500">{t('A table that has an open order keeps its order even if you rename or remove it — the order shows under “Other open orders”.')}</p>
      </div>
    </>
  );
}

function FeaturesForm({ d, set }) {
  const t = useT();
  const on = (k) => d.features[k] === '1';
  const toggle = (k) => (v) => set('features', k)(v ? '1' : '0');
  return (
    <>
      <CardHeader title={t('Extra tools')} subtitle={t('Switch on only what your shop needs. Switching one off just hides it — nothing is deleted.')} />
      <div className="space-y-6 px-5 py-5">
        <Toggle checked={on('restaurant')} onChange={toggle('restaurant')} label={t('Restaurant mode')} hint={t('Dine-in, takeaway and delivery, table numbers, kitchen slips and open orders on the Sell screen.')} />
        <Toggle checked={on('serials')} onChange={toggle('serials')} label={t('Serial / IMEI numbers')} hint={t('Keep the serial, IMEI or chassis number of each phone, laptop, appliance or vehicle. Warranty prints on the receipt.')} />
        <Toggle checked={on('expiry')} onChange={toggle('expiry')} label={t('Batches & expiry dates')} hint={t('Write the batch and expiry date when stock arrives. The oldest stock is sold first, and you can see what will expire soon.')} />
        <p className="text-sm text-slate-500">{t('After switching one on, open an item and tick “Track serial / IMEI” or “Track batch & expiry” for the items that need it.')}</p>
      </div>
    </>
  );
}

function ShopForm({ d, set, err }) {
  const t = useT();
  return (
    <>
      <CardHeader title={t('Shop details')} subtitle={t('Printed at the top of every receipt.')} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t('Shop name')} className="sm:col-span-2" error={err('shop', 'name')}><Input maxLength={255} value={d.shop.name} onChange={set('shop', 'name')} placeholder={t('e.g. Madina General Store')} /></Field>
        <Field label={t('Phone')} error={err('shop', 'phone')}><Input type="tel" dir="ltr" maxLength={50} value={d.shop.phone} onChange={set('shop', 'phone')} placeholder="0300 1234567" className="text-start" /></Field>
        <Field label={t('Email')} error={err('shop', 'email')}><Input type="email" maxLength={255} value={d.shop.email} onChange={set('shop', 'email')} placeholder={t('Optional')} /></Field>
        <Field label={t('Address')} className="sm:col-span-2" error={err('shop', 'address')}><Textarea rows={2} maxLength={500} value={d.shop.address} onChange={set('shop', 'address')} placeholder={t('Shop #, market, city')} /></Field>
        <Field label={t('Website or Facebook page')} className="sm:col-span-2" error={err('shop', 'website')}><Input dir="ltr" maxLength={255} value={d.shop.website} onChange={set('shop', 'website')} placeholder={t('Optional')} className="text-start" /></Field>
      </div>
    </>
  );
}

function ReceiptForm({ d, set, err }) {
  const t = useT();
  return (
    <>
      <CardHeader title={t('Receipt')} subtitle={t('What customers see on their printed bill.')} />
      <div className="space-y-5 p-5">
        <Field label={t('Paper size')} hint={t('Pick the width of the paper roll in your receipt printer.')} error={err('receipt', 'paper_width')}>
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            {[['58mm', '58 mm (small)'], ['80mm', '80 mm (standard)']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set('receipt', 'paper_width')(v)}
                className={cx('min-h-12 rounded-lg border px-3 py-2 text-[15px] font-medium transition-colors', d.receipt.paper_width === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}>
                {t(l)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('Message at the top')} hint={t('Shown under the shop name, e.g. “Thank you for shopping with us!”')} error={err('receipt', 'header')}>
          <Textarea rows={2} maxLength={500} value={d.receipt.header} onChange={set('receipt', 'header')} />
        </Field>
        <Field label={t('Message at the bottom')} hint={t('Shown at the end, e.g. your return or exchange rule.')} error={err('receipt', 'footer')}>
          <Textarea rows={2} maxLength={500} value={d.receipt.footer} onChange={set('receipt', 'footer')} />
        </Field>
        <Toggle checked={d.receipt.show_tax_line === '1'} onChange={(v) => set('receipt', 'show_tax_line')(v ? '1' : '0')} label={t('Show tax on the receipt')} hint={t('Prints the tax amount on its own line when a sale has tax.')} />
      </div>
    </>
  );
}

function TaxForm({ d, set, err }) {
  const t = useT();
  const on = d.tax.enabled === '1';
  return (
    <>
      <CardHeader title={t('Tax')} subtitle={t('Sales tax added on top of item prices when you make a bill.')} />
      <div className="space-y-5 p-5">
        <Toggle checked={on} onChange={(v) => set('tax', 'enabled')(v ? '1' : '0')} label={t('Add tax to sales')} hint={t('Keep this off if your prices already include tax, or you are not registered for tax.')} />
        <div className={cx('grid gap-4 sm:grid-cols-2', !on && 'opacity-50')}>
          <Field label={t('Tax name')} hint={t('Printed on receipts, e.g. GST or Sales Tax.')} error={err('tax', 'label')}>
            <Input maxLength={50} disabled={!on} value={d.tax.label} onChange={set('tax', 'label')} />
          </Field>
          <Field label={t('Tax rate (%)')} error={err('tax', 'percentage')}>
            <Input type="number" min="0" max="100" step="0.01" required disabled={!on} value={d.tax.percentage} onChange={set('tax', 'percentage')} />
          </Field>
        </div>
      </div>
    </>
  );
}

function BarcodeForm({ d, set, err }) {
  const t = useT();
  return (
    <>
      <CardHeader title={t('Barcode stickers')} subtitle={t('Starting choices for the “Print barcode stickers” page. You can still change them each time you print.')} />
      <div className="space-y-5 p-5">
        <Field label={t('Barcode type')} hint={t('If unsure, keep CODE128.')} error={err('barcode', 'default_format')}>
          <Select value={d.barcode.default_format} onChange={set('barcode', 'default_format')}>
            {Object.entries(FORMATS).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
          </Select>
        </Field>
        <Field label={t('Sticker size')} error={err('barcode', 'default_label_size')}>
          <Select value={d.barcode.default_label_size} onChange={set('barcode', 'default_label_size')}>
            {Object.entries(LABEL_SIZES).map(([k, s]) => <option key={k} value={k}>{t(s.label)}</option>)}
          </Select>
        </Field>
        <Toggle checked={d.barcode.show_shop_name === '1'} onChange={(v) => set('barcode', 'show_shop_name')(v ? '1' : '0')} label={t('Print shop name on stickers')} />
      </div>
    </>
  );
}

function BusinessForm({ d, set, err }) {
  const shop = useShop();
  const t = useT();
  const types = shop.meta.business_types || [];
  const units = shop.meta.units || [];
  const [suggest, setSuggest] = useState(null);
  const current = types.find((x) => x.code === d.business.type);

  const confirm = useConfirm();
  const toast = useToast();
  const [switching, setSwitching] = useState(false);
  const savedType = shop.businessType;

  const onType = (e) => {
    const code = e.target.value;
    set('business', 'type')(code);
    const bt = types.find((x) => x.code === code);
    return setSuggest(bt && code !== savedType ? bt : null);
  };

  // Switch the whole system to the chosen trade: words, unit, tools, categories.
  const apply = async () => {
    const restaurant = suggest.code === 'restaurant';
    const ok = await confirm({
      title: t('Switch to {type}?', { type: t(suggest.label) }),
      message: restaurant
        ? t('CorePOS will work like a restaurant POS: tables, kitchen slips and kitchen screen are switched on, items become your menu (no stock counting for dishes), and menu categories are added. Your existing items, bills and customers are kept.')
        : t('Item words, unit and extra tools change to suit this trade, and its starter categories are added. Your existing items, bills and customers are kept.'),
      confirmLabel: t('Yes, switch'),
    });
    if (!ok) return;
    setSwitching(true);
    try {
      await api.post('/settings/business-type', { type: suggest.code });
      toast(t('Switched to {type}', { type: t(suggest.label) }));
      window.location.assign('/'); // fresh start with the new setup
    } catch (e2) {
      toast(e2.message, 'error');
      setSwitching(false);
    }
  };

  const o1 = t(d.product.option1_label || 'Option 1');
  const o2 = t(d.product.option2_label || 'Option 2');
  return (
    <>
      <CardHeader title={t('Your business & items')} subtitle={t('Words that fit your trade. They are used on the item form, the Sell screen and stickers.')} />
      <div className="space-y-6 p-5">
        <Field label={t('What kind of shop is this?')} hint={t('Pick your trade, then press Switch. Your items, bills and customers are kept.')} error={err('business', 'type')}>
          <Select value={d.business.type} onChange={onType}>
            {!current && <option value={d.business.type}>{d.business.type}</option>}
            {types.map((x) => <option key={x.code} value={x.code}>{t(x.label)}</option>)}
          </Select>
        </Field>

        {suggest && (
          <div className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-brand-50 p-4 sm:flex-row sm:items-center">
            <Lightbulb className="size-6 shrink-0 text-brand-600" />
            <div className="flex-1 text-[15px] text-slate-700">
              <div className="font-semibold text-slate-900">{t('Switch the whole system to {type}?', { type: t(suggest.label) })}</div>
              <div className="mt-1">{suggest.code === 'restaurant'
                ? t('Tables, kitchen slips, kitchen screen and a menu — CorePOS will look and work like a restaurant POS.')
                : t('Item types: {first} and {second}. Sold by: {unit}.', { first: t(suggest.options?.[0] || ''), second: t(suggest.options?.[1] || ''), unit: t(shop.unitLabel(suggest.unit)) })}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={() => { setSuggest(null); set('business', 'type')(savedType); }}>{t('Not now')}</Button>
              <Button icon={Check} loading={switching} onClick={apply}>{t('Switch')}</Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">{t('Item types')}</div>
          <p className="mb-3 text-sm text-slate-500">{t('Some items come in different types — e.g. Color and Size for clothes, Storage and Model for mobiles, Strength and Pack for medicines. Write the two names here. Each type gets its own price, stock and barcode.')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('First name')} error={err('product', 'option1_label')}><Input maxLength={40} value={d.product.option1_label} onChange={set('product', 'option1_label')} placeholder={t('e.g. Color')} /></Field>
            <Field label={t('Second name')} error={err('product', 'option2_label')}><Input maxLength={40} value={d.product.option2_label} onChange={set('product', 'option2_label')} placeholder={t('e.g. Size')} /></Field>
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {t('On the item form you will see:')} <span className="font-medium text-slate-800">{o1}</span> · <span className="font-medium text-slate-800">{o2}</span>
          </div>
        </div>

        <Field label={t('Most items are sold by')} hint={t('Used for new items. Each item can still have its own unit.')} error={err('product', 'default_unit')}>
          <div className="sm:max-w-xs">
            <Select value={d.product.default_unit} onChange={set('product', 'default_unit')}>
              {units.map((u) => <option key={u.code} value={u.code}>{u.fractional ? t('{unit} (can be 1.5 etc.)', { unit: t(u.label) }) : t(u.label)}</option>)}
            </Select>
          </div>
        </Field>
      </div>
    </>
  );
}

// Language is chosen per computer (saved in this browser), not for the whole
// shop — the same choice as the English / اردو button at the top.
// Printers are chosen per computer (each till has its own printer).
const PRINT_JOBS = [
  { kind: 'receipt', label: 'Bill / receipt printer', hint: 'Usually the small thermal printer (58 or 80 mm) at the counter.', auto: true, copies: true },
  { kind: 'kitchen', label: 'Kitchen slip printer', hint: 'Restaurants only. Leave empty to use the bill printer.', auto: true, restaurantOnly: true },
  { kind: 'label', label: 'Barcode sticker printer', hint: 'Label printer or the A4 printer for sticker sheets.' },
  { kind: 'document', label: 'A4 printer (reports, quotations)', hint: 'Leave empty to choose each time.' },
];

function PrintersCard() {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const [prefs, setPrefs] = useState(printerPrefs);
  const [printers, setPrinters] = useState(null);
  const [testing, setTesting] = useState(null);
  const desktop = isDesktop();

  useEffect(() => { listPrinters().then(setPrinters); }, []);
  const update = (kind, patch) => setPrefs((p) => {
    const next = { ...p, [kind]: { ...(p[kind] || {}), ...patch } };
    savePrinterPrefs(next);
    return next;
  });
  const test = async (kind) => {
    setTesting(kind);
    await new Promise((r) => setTimeout(r, 50));
    try { await printNow(kind === 'document' ? 'document' : kind); toast(t('Test page sent to the printer')); } finally { setTesting(null); }
  };
  const jobs = PRINT_JOBS.filter((j) => !j.restaurantOnly || shop.isRestaurant);

  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[1fr_auto]">
      <Card className="min-w-0">
        <CardHeader title={t('Printers')} subtitle={t('Pick a printer once — bills then print straight away without a popup. Saved on this computer only.')} />
        <div className="space-y-6 px-5 py-5">
          {!desktop && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('Direct printing works in the CorePOS desktop app. In a web browser the normal print window opens.')}</div>}
          {desktop && printers && !printers.length && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('No printers found. Install the printer driver in Windows, switch the printer on, then reopen this page.')}</div>}
          {jobs.map((job) => {
            const p = prefs[job.kind] || {};
            return (
              <div key={job.kind} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{t(job.label)}</div>
                    <div className="text-sm text-slate-500">{t(job.hint)}</div>
                  </div>
                  <Button variant="secondary" size="sm" icon={Printer} loading={testing === job.kind} onClick={() => test(job.kind)}>{t('Test print')}</Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Select value={p.name || ''} disabled={!desktop} onChange={(e) => update(job.kind, { name: e.target.value })}>
                    <option value="">{t('Ask every time (show print window)')}</option>
                    {(printers || []).map((pr) => <option key={pr.name} value={pr.name}>{pr.displayName}{pr.isDefault ? ` (${t('default')})` : ''}</option>)}
                  </Select>
                  {job.copies && (
                    <Select className="w-full sm:w-36" value={String(p.copies || 1)} onChange={(e) => update(job.kind, { copies: Number(e.target.value) })}>
                      {[1, 2, 3].map((n) => <option key={n} value={n}>{n === 1 ? t('1 copy') : t('{n} copies', { n })}</option>)}
                    </Select>
                  )}
                </div>
                {job.auto && (
                  <div className="mt-3">
                    <Toggle checked={!!p.auto} onChange={(v) => update(job.kind, { auto: v })} label={job.kind === 'kitchen' ? t('Print the kitchen slip automatically') : t('Print the bill automatically after every sale')} hint={t('No need to press Print.')} />
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-slate-500">{t('Bill paper width (58 / 80 mm) is set in Settings → Receipt.')}</p>
        </div>
      </Card>
      {/* what "Test print" prints */}
      <div className="xl:w-[340px]">
        <div className="mb-2 text-sm font-medium text-slate-500">{t('Test page')}</div>
        <div className="rounded-2xl bg-slate-100 p-3">
          <Receipt sale={{ invoice_number: 'TEST-0001', sale_date: new Date().toISOString(), subtotal: 100, discount_amount: 0, tax_amount: 0, grand_total: 100, payment_method: 'cash', payment_received: 100, change_amount: 0, due_amount: 0, items: [{ id: 1, product_name: t('Printer test'), quantity: 1, unit_price: 100, total_price: 100, discount_per_item: 0 }] }} />
        </div>
      </div>
    </div>
  );
}

function LanguageCard() {
  const { lang, setLang, t } = useLang();
  const choices = [
    { code: 'en', label: 'English', font: 'var(--font-sans)' },
    { code: 'ur', label: 'اردو', font: 'var(--font-urdu)' },
  ];
  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader title={t('Language')} subtitle={t('Choose the language for menus, buttons and receipts.')} />
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('Language')}>
            {choices.map((c) => {
              const active = lang === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setLang(c.code)}
                  className={cx('flex min-h-16 items-center justify-between gap-3 rounded-xl border-2 px-5 py-3 text-xl font-semibold transition-colors',
                    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
                >
                  <span lang={c.code} style={{ fontFamily: c.font }}>{c.label}</span>
                  {active && <Check className="size-6 shrink-0" />}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-slate-600">{t('This is saved on this computer only. Each computer in the shop can use its own language.')}</p>
          <p className="text-sm text-slate-500">{t('Item, customer and supplier names stay as you typed them.')}</p>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- previews

function ReceiptPreview({ d }) {
  const { user } = useAuth();
  const t = useT();
  const sale = useMemo(() => {
    const items = [
      { id: 1, product_name: t('Sample item'), color: null, size: null, quantity: 2, unit: 'pcs', unit_price: 150, discount_per_item: 0, total_price: 300 },
      { id: 2, product_name: t('Item sold by weight'), color: null, size: null, quantity: 1.5, unit: 'kg', unit_price: 240, discount_per_item: 0, total_price: 360 },
      { id: 3, product_name: t('Item with discount'), color: null, size: t('Large'), quantity: 1, unit: 'pcs', unit_price: 450, discount_per_item: 50, total_price: 400 },
    ];
    const subtotal = items.reduce((a, i) => a + i.total_price, 0);
    const tax = d.tax.enabled === '1' ? Math.round(subtotal * Number(d.tax.percentage || 0)) / 100 : 0;
    const total = subtotal + tax;
    const paid = Math.ceil(total / 500) * 500;
    return {
      invoice_number: 'INV-1001', sale_date: new Date().toISOString(), cashier: user?.name, customer: null, items,
      subtotal, discount_amount: 0, tax_amount: tax, grand_total: total, payment_method: 'cash', payment_received: paid, change_amount: paid - total, due_amount: 0,
    };
  }, [d.tax.enabled, d.tax.percentage, user?.name, t]);

  return (
    <div className="xl:sticky xl:top-6">
      <div className="mb-2 text-sm font-medium text-slate-500">{t('Receipt preview · {n} mm', { n: d.receipt.paper_width === '58mm' ? '58' : '80' })}</div>
      <div className="overflow-x-auto rounded-xl bg-slate-200/70 p-4">
        <div className="mx-auto w-fit shadow-md">
          <Receipt sale={sale} />
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-500">{t('A sample bill — it changes as you type.')}</p>
    </div>
  );
}

function LabelPreview({ d }) {
  const shop = useShop();
  const t = useT();
  const item = { id: 0, product_name: t('Sample item'), color: null, size: null, barcode: d.barcode.default_format === 'ean13' ? '8964000123454' : '260100010001', selling_price: '250' };
  return (
    <div className="xl:sticky xl:top-6">
      <div className="mb-2 text-sm font-medium text-slate-500">{t('Sticker preview')}</div>
      <div className="flex justify-center rounded-xl bg-slate-200/70 p-6">
        <BarcodeLabel item={item} size={d.barcode.default_label_size} showShop={d.barcode.show_shop_name === '1'} shopName={d.shop.name || shop.shopName} format={d.barcode.default_format} className="shadow-md" />
      </div>
      <p className="mt-2 text-sm text-slate-500">{t('Shown at real size on most screens.')}</p>
    </div>
  );
}

// Several businesses on one computer — e.g. a mart and a restaurant. Each
// has its own items, bills, customers, staff, settings, logo and colours.
function BusinessesCard() {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data, isLoading } = useBusinesses();
  const types = shop.meta.business_types || [];
  const [name, setName] = useState('');
  const [type, setType] = useState('restaurant');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [typed, setTyped] = useState('');
  const list = data?.data || [];
  const manage = can('settings.manage');

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.post('/businesses', { name: name.trim(), type });
      await qc.invalidateQueries({ queryKey: ['businesses'] });
      setName('');
      const ok = await confirm({
        title: t('{name} is ready', { name: res.data.name }),
        message: t('It starts empty, with its own items, bills, customers and settings. You and the other admins can open it with the same email and password. Open it now?'),
        confirmLabel: t('Open it now'),
        cancelLabel: t('Later'),
      });
      if (ok) await switchBusiness(res.data.id);
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/businesses/${removing.id}`, { confirm: typed });
      await qc.invalidateQueries({ queryKey: ['businesses'] });
      toast(t('{name} removed', { name: removing.name }));
      setRemoving(null);
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title={t('My businesses')} subtitle={t('Run more than one business from this computer — e.g. a mart and a restaurant. Each one has its own items, bills, customers, staff, logo and colours. Switch with the button at the top of the screen.')} />
        <div className="divide-y divide-slate-100">
          {isLoading && <div className="p-5"><Loading /></div>}
          {list.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <BusinessBadge b={b} className="size-12" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold text-slate-900">{b.name}</div>
                <div className="truncate text-sm text-slate-500">{t(b.type_label)}</div>
              </div>
              {b.current ? (
                <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">{t('Open now')}</span>
              ) : (
                <>
                  <Button variant="secondary" disabled={!b.can_open} onClick={() => switchBusiness(b.id).catch((ex) => toast(ex.message, 'error'))}>{t('Open')}</Button>
                  {manage && !b.is_home && (
                    <Button variant="ghost" icon={Trash2} className="text-red-600" onClick={() => { setTyped(''); setRemoving(b); }} aria-label={t('Remove')}>{t('Remove')}</Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      {manage && (
        <Card>
          <form onSubmit={add}>
            <CardHeader title={t('Add another business')} subtitle={t('For example your restaurant next to your mart. It gets its own menu or items, bills, customers and look.')} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label={t('Business name')}>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} placeholder={t('e.g. Madina Restaurant')} required />
              </Field>
              <Field label={t('What kind of business?')}>
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  {types.map((x) => <option key={x.code} value={x.code}>{t(x.label)}</option>)}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end rounded-b-xl border-t border-slate-100 bg-slate-50 px-5 py-3">
              <Button type="submit" size="lg" icon={Plus} loading={busy} disabled={!name.trim() || list.length >= 10}>{t('Add business')}</Button>
            </div>
          </form>
        </Card>
      )}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={removing ? t('Remove {name}?', { name: removing.name }) : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>{t('Cancel')}</Button>
            <Button variant="danger" loading={busy} disabled={typed.trim().toLowerCase() !== (removing?.name || '').trim().toLowerCase()} onClick={remove}>{t('Remove')}</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-slate-600">{t('It disappears from the switch at the top. Its data is not wiped — a copy is kept in the CorePOS data folder (businesses/removed) in case you need it back.')}</p>
          <Field label={t('Type the business name to confirm')}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={removing?.name} autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
