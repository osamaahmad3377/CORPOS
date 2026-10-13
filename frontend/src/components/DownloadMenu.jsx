// "Download" button with a small menu: Excel (.xlsx) or CSV. Give it the rows
// (`rows`) or a function that fetches them (`load`, e.g. every page of a list
// with the filters on screen) and the columns (see lib/download.js).
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useT } from '../lib/i18n';
import { downloadTable } from '../lib/download';
import { Button, cx, useToast } from './ui';

export default function DownloadMenu({ fileName, sheet, columns, rows, load, onDownload, disabled, className, size = 'md', label }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const go = async (format) => {
    setOpen(false);
    setBusy(true);
    try {
      if (onDownload) {
        await onDownload(format);
      } else {
        const data = load ? await load() : rows || [];
        if (!data.length) { toast(t('Nothing to download'), 'info'); return; }
        await downloadTable({ fileName, sheet, columns, rows: data, format });
        toast(t('Downloaded {n} rows', { n: data.length }));
      }
    } catch (e) {
      toast(e.message || String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className={cx('relative print:hidden', className)}>
      <Button variant="secondary" size={size} icon={Download} loading={busy} disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label || t('Download')}<ChevronDown className={cx('size-4 text-slate-400 transition', open && 'rotate-180')} />
      </Button>
      {open && (
        <div role="menu" className="glass-strong absolute end-0 top-full z-40 mt-2 w-64 animate-pop-in overflow-hidden rounded-2xl p-1.5">
          <button type="button" role="menuitem" onClick={() => go('xlsx')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-slate-500/10">
            <FileSpreadsheet className="size-5 shrink-0 text-emerald-600" />
            <span><span className="block font-semibold text-slate-900">{t('Excel file (.xlsx)')}</span><span className="block text-xs text-slate-500">{t('Opens in Excel, with filters')}</span></span>
          </button>
          <button type="button" role="menuitem" onClick={() => go('csv')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-slate-500/10">
            <FileText className="size-5 shrink-0 text-slate-500" />
            <span><span className="block font-semibold text-slate-900">{t('CSV file (.csv)')}</span><span className="block text-xs text-slate-500">{t('For Google Sheets and other programs')}</span></span>
          </button>
        </div>
      )}
    </div>
  );
}
