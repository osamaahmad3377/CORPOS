// Import items (and their categories) from an Excel / CSV file — e.g. an
// export from another POS — and export all items to Excel or CSV.
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Info, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { useShop } from '../lib/shop';
import { useT } from '../lib/i18n';
import { today } from '../lib/format';
import { FIELDS, downloadItemsFile, fieldLabels, guessMapping, readItemsFile, rowsFromMapping } from '../lib/itemsFile';
import { Button, ErrorBox, Modal, Select, cx, useToast } from './ui';

const CHUNK = 200;

export function ExportItemsButton() {
  const t = useT();
  const shop = useShop();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (format) => {
    setOpen(false);
    setBusy(true);
    try {
      const res = await api.get('/items/export');
      if (!res.data?.length) { toast(t('There are no items to export yet.'), 'info'); return; }
      downloadItemsFile(res.data, { format, labels: { ...fieldLabels(t, shop), active: t('Active') }, fileName: `${(shop.shopName || 'items').replace(/[^\w\- ]+/g, '').trim() || 'items'} items ${today()}` });
      toast(t('{n} items exported', { n: res.data.length }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative">
      <Button variant="secondary" size="lg" icon={Download} loading={busy} onClick={() => setOpen((o) => !o)}>{t('Export')}</Button>
      {open && (
        <div className="glass-strong absolute end-0 top-16 z-30 w-60 animate-pop-in rounded-2xl p-1.5" onMouseLeave={() => setOpen(false)}>
          <button type="button" onClick={() => run('xlsx')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start hover:bg-slate-500/[0.06]">
            <FileSpreadsheet className="size-5 text-emerald-600" /><span><span className="block font-semibold text-slate-900">{t('Excel file (.xlsx)')}</span><span className="block text-xs text-slate-500">{t('Opens in Excel or Google Sheets')}</span></span>
          </button>
          <button type="button" onClick={() => run('csv')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start hover:bg-slate-500/[0.06]">
            <FileSpreadsheet className="size-5 text-brand-600" /><span><span className="block font-semibold text-slate-900">{t('CSV file (.csv)')}</span><span className="block text-xs text-slate-500">{t('For other POS and software')}</span></span>
          </button>
        </div>
      )}
    </div>
  );
}

export function ImportItemsModal({ onClose }) {
  const t = useT();
  const shop = useShop();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const labels = fieldLabels(t, shop);
  const [file, setFile] = useState(null); // { name, headers, rows, headerRow }
  const [mapping, setMapping] = useState({});
  const [update, setUpdate] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);

  const load = async (f) => {
    if (!f) return;
    setError(null);
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error(t('This file is too big (over 20 MB).'));
      const data = await readItemsFile(f);
      if (!data.rows.length) throw new Error(t('No item rows found under the header row.'));
      setFile({ name: f.name, ...data });
      setMapping(guessMapping(data.headers, shop));
    } catch (e) {
      setError(e);
    }
  };

  const template = () => downloadItemsFile([
    { name: 'Basmati Rice', category: 'Grocery > Rice', brand: 'Guard', unit: 'kg', purchase_price: 300, selling_price: 340, stock_qty: 50, low_stock_threshold: 10 },
    { name: 'T-Shirt', category: 'Clothing', option1: 'M', option2: 'Black', barcode: '8964000123456', purchase_price: 700, selling_price: 1200, stock_qty: 12 },
    { name: 'T-Shirt', category: 'Clothing', option1: 'L', option2: 'Black', purchase_price: 700, selling_price: 1200, stock_qty: 8 },
  ], { format: 'xlsx', labels: { ...labels, active: t('Active') }, fileName: 'CorePOS items template' });

  const ready = mapping.name != null && mapping.selling_price != null;
  const run = async () => {
    const all = rowsFromMapping(file.rows, mapping);
    const total = all.length;
    const sum = { created_items: 0, created_types: 0, updated: 0, unchanged: 0, categories: 0, skipped: [] };
    setProgress({ done: 0, total });
    setError(null);
    try {
      for (let i = 0; i < total; i += CHUNK) {
        const res = await api.post('/items/import', { rows: all.slice(i, i + CHUNK), update_existing: update, start_row: file.headerRow + 1 + i });
        for (const k of ['created_items', 'created_types', 'updated', 'unchanged', 'categories']) sum[k] += res[k] || 0;
        sum.skipped.push(...(res.skipped || []));
        setProgress({ done: Math.min(total, i + CHUNK), total });
      }
      setResult(sum);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  };

  const downloadSkipped = () => downloadItemsFile(result.skipped.map((s) => ({ name: s.name || '', description: `${t('Row {n}', { n: s.row })}: ${t(s.reason)}` })), { format: 'xlsx', labels: { ...labels, active: '' }, fileName: 'Skipped rows' });

  // ----- results
  if (result) {
    const made = result.created_items + result.created_types;
    return (
      <Modal open onClose={onClose} size="lg" title={t('Import finished')} footer={<Button size="lg" onClick={onClose}>{t('Done')}</Button>}>
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-inset ring-emerald-600/15">
          <CheckCircle2 className="size-7 shrink-0" />
          <div className="font-semibold">{t('{n} items added', { n: made })}{result.updated ? ` · ${t('{n} updated', { n: result.updated })}` : ''}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[[t('New items'), result.created_items], [t('New types of existing items'), result.created_types], [t('Updated'), result.updated], [t('Categories added'), result.categories]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-slate-500/[0.06] p-3"><div className="num text-2xl font-extrabold text-slate-900">{v}</div><div className="text-xs text-slate-500">{l}</div></div>
          ))}
        </div>
        {result.unchanged > 0 && <p className="mt-3 text-sm text-slate-600">{t('{n} rows were already here and left as they are (tick "Update items that already exist" to update them).', { n: result.unchanged })}</p>}
        {result.skipped.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="font-semibold text-amber-800">{t('{n} rows skipped', { n: result.skipped.length })}</h4>
              <Button size="sm" variant="secondary" icon={Download} onClick={downloadSkipped}>{t('Download list')}</Button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl ring-1 ring-slate-900/10">
              {result.skipped.slice(0, 100).map((s, i) => (
                <div key={i} className="flex gap-3 border-b border-slate-900/5 px-3 py-2 text-sm last:border-0"><span className="num w-16 shrink-0 text-slate-500">{t('Row {n}', { n: s.row })}</span><span className="min-w-0 flex-1 truncate font-medium text-slate-800">{s.name || '—'}</span><span className="text-amber-700">{t(s.reason)}</span></div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal open onClose={progress ? undefined : onClose} size="xl" title={t('Import items')}
      footer={file && (
        <>
          <Button variant="ghost" size="lg" disabled={!!progress} onClick={() => { setFile(null); setMapping({}); }}>{t('Choose another file')}</Button>
          <Button size="lg" icon={Upload} disabled={!ready || !!progress} loading={!!progress} onClick={run}>{t('Import {n} rows', { n: file.rows.length })}</Button>
        </>
      )}>
      <ErrorBox error={error} />
      {!file ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files?.[0]); }}
            className={cx('flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition', drag ? 'border-brand-500 bg-brand-50' : 'border-slate-900/15 hover:border-brand-400 hover:bg-slate-500/[0.03]')}
          >
            <span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700"><FileUp className="size-8" /></span>
            <span className="text-lg font-bold text-slate-900">{t('Choose an Excel or CSV file')}</span>
            <span className="max-w-md text-sm text-slate-500">{t('Or drag it here. An export from your old POS works — CorePOS matches its columns for you.')}</span>
            <span className="text-xs font-medium text-slate-400">.xlsx · .xls · .csv</span>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-slate-500/[0.05] p-4 text-sm text-slate-600">
            <Info className="mt-0.5 size-5 shrink-0 text-brand-700" />
            <div className="min-w-0 flex-1 space-y-1">
              <p>{t('Needed: item name and selling price. Also read if present: category (use "Main > Sub" for a sub-category), brand, unit, sizes / types, barcode, buying price, wholesale price, stock and warning level.')}</p>
              <p>{t('Rows with the same item name become one item with several types. Missing categories are created.')}</p>
            </div>
            <Button variant="secondary" size="sm" icon={Download} onClick={template}>{t('Download template')}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-500/[0.05] px-4 py-3">
            <FileSpreadsheet className="size-6 text-emerald-600" />
            <div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-900">{file.name}</div><div className="text-xs text-slate-500">{t('{n} rows', { n: file.rows.length })} · {t('{n} columns', { n: file.headers.length })}</div></div>
            <button type="button" onClick={() => { setFile(null); setMapping({}); }} disabled={!!progress} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-white/70" aria-label={t('Remove')}><X className="size-5" /></button>
          </div>

          <div>
            <h4 className="mb-1 font-semibold text-slate-900">{t('Match the columns')}</h4>
            <p className="mb-3 text-sm text-slate-500">{t('CorePOS guessed these from the column names. Change any that are wrong.')}</p>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm font-semibold text-slate-700">{labels[f.key]}{f.required && <span className="text-red-500"> *</span>}</span>
                  <Select className="h-10" value={mapping[f.key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                    <option value="">{t('— not in file —')}</option>
                    {file.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </Select>
                </label>
              ))}
            </div>
            {!ready && <p className="mt-3 text-sm font-medium text-amber-700">{t('Choose which column has the item name and the selling price.')}</p>}
          </div>

          <div>
            <h4 className="mb-2 font-semibold text-slate-900">{t('Preview (first 5 rows)')}</h4>
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-900/10">
              <table className="w-full text-sm">
                <thead className="bg-slate-500/[0.05] text-xs text-slate-500"><tr>{FIELDS.filter((f) => mapping[f.key] != null).map((f) => <th key={f.key} className="whitespace-nowrap px-3 py-2 text-start font-semibold">{labels[f.key]}</th>)}</tr></thead>
                <tbody>
                  {rowsFromMapping(file.rows.slice(0, 5), mapping).map((r, i) => (
                    <tr key={i} className="border-t border-slate-900/5">{FIELDS.filter((f) => mapping[f.key] != null).map((f) => <td key={f.key} className="max-w-48 truncate whitespace-nowrap px-3 py-2 text-slate-800">{r[f.key] || <span className="text-slate-300">—</span>}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-2xl ring-1 ring-slate-900/10 p-4">
            <input type="checkbox" className="mt-0.5 size-5 accent-brand-600" checked={update} onChange={(e) => setUpdate(e.target.checked)} />
            <span><span className="block font-semibold text-slate-900">{t('Update items that already exist')}</span><span className="block text-sm text-slate-500">{t('Items found by barcode (or name and type) get the prices and stock from the file. Leave off to only add new items.')}</span></span>
          </label>

          {progress && (
            <div>
              <div className="mb-1 flex justify-between text-sm font-medium text-slate-600"><span>{t('Importing…')}</span><span className="num">{progress.done} / {progress.total}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-500/15" dir="ltr"><div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
