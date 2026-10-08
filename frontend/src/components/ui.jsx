// Shared UI kit. Every page builds from these so the app looks consistent.
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, X } from 'lucide-react';
import { useT } from '../lib/i18n';

export function cx(...c) {
  return c.filter(Boolean).join(' ');
}

const BTN = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
};
// Generous sizes: easy to hit on touchscreens and for unsteady hands.
const SIZE = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-[15px]', lg: 'h-14 px-6 text-lg', xl: 'h-16 px-7 text-xl' };

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        BTN[variant], SIZE[size], className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : Icon ? <Icon className={size === 'lg' || size === 'xl' ? 'size-6' : 'size-5'} /> : null}
      {children}
    </button>
  );
});

const FIELD = 'block w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(FIELD, 'h-11', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return <select ref={ref} className={cx(FIELD, 'h-11 pe-8', className)} {...props}>{children}</select>;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx(FIELD, 'py-2', className)} rows={3} {...props} />;
});

export function Field({ label, hint, error, required, className, children }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}{required && <span className="text-red-500"> *</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span>
        : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, children, ...props }) {
  return <div className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const BADGE = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-brand-50 text-brand-700 ring-brand-600/20',
};
export function Badge({ color = 'gray', className, children }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-slate-500/10', BADGE[color], className)}>{children}</span>;
}

export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-slate-400', className)} />;
}

export function Loading({ label }) {
  const t = useT();
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Spinner />{label || t('Loading…')}</div>;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <div className="mb-3 rounded-full bg-slate-100 p-3"><Icon className="size-6 text-slate-400" /></div>}
      <p className="font-medium text-slate-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{error.message || String(error)}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, size = 'md', children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={cx('w-full rounded-xl bg-white shadow-xl', width)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close"><X className="size-6" /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

// Tables
export function Table({ children, className }) {
  return <div className={cx('overflow-x-auto', className)}><table className="w-full text-start text-sm">{children}</table></div>;
}
export function Th({ children, className }) {
  return <th className={cx('whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500', className)}>{children}</th>;
}
export function Td({ children, className, ...props }) {
  return <td className={cx('border-b border-slate-100 px-4 py-3 align-middle', className)} {...props}>{children}</td>;
}

export function Pagination({ meta, onPage }) {
  const t = useT();
  if (!meta || meta.last_page <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>{t('Page {page} of {pages}', { page: meta.current_page, pages: meta.last_page })} · {t('{n} total', { n: meta.total })}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}><ChevronLeft className="size-4 rtl:rotate-180" />{t('Previous')}</Button>
        <Button size="sm" variant="secondary" disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}>{t('Next')}<ChevronRight className="size-4 rtl:rotate-180" /></Button>
      </div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = { brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600' };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        {Icon && <div className={cx('rounded-lg p-2', tones[tone])}><Icon className="size-5" /></div>}
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
    </Card>
  );
}

// ---------------------------------------------------------------- toasts

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3000);
  }, []);
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  const colors = { success: 'text-emerald-600', error: 'text-red-600', info: 'text-brand-600' };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base shadow-lg">
              <Icon className={cx('mt-0.5 size-5 shrink-0', colors[t.type])} />
              <span className="text-slate-700">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// toast('Saved') / toast(err.message, 'error')
export const useToast = () => useContext(ToastContext);

// ---------------------------------------------------------------- confirm

const ConfirmContext = createContext(async () => false);

export function ConfirmProvider({ children }) {
  const t = useT();
  const [state, setState] = useState(null);
  const resolver = useRef(null);
  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve;
    setState(typeof opts === 'string' ? { message: opts } : opts);
  }), []);
  const close = (v) => { resolver.current?.(v); setState(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={state?.title || t('Are you sure?')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => close(false)}>{t('Cancel')}</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirmLabel || t('Confirm')}</Button>
          </>
        )}
      >
        <p className="text-base text-slate-600">{state?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

// if (await confirm({ title, message, danger: true })) …
export const useConfirm = () => useContext(ConfirmContext);
