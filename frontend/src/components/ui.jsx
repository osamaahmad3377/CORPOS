// Shared UI kit. Every page builds from these so the app looks consistent.
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, X } from 'lucide-react';
import { useT } from '../lib/i18n';

export function cx(...c) {
  return c.filter(Boolean).join(' ');
}

// Solid buttons get a soft top highlight and a coloured shadow; the brand
// button's text colour (brand-ink) is picked for contrast with the shop's colour.
const RAISED = 'shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(16_24_40/0.12)] hover:brightness-[0.96] active:brightness-[0.92]';
const BTN = {
  primary: 'btn-jewel bg-brand-600 text-brand-ink active:brightness-[0.95]',
  secondary: 'bg-white/80 text-slate-700 border border-slate-900/10 shadow-xs backdrop-blur hover:bg-white/95 hover:border-slate-900/15',
  danger: `bg-red-600 text-white ${RAISED}`,
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  success: `bg-emerald-600 text-white ${RAISED}`,
};
// Generous sizes: easy to hit on touchscreens and for unsteady hands.
const SIZE = { sm: 'h-9 px-3 text-sm rounded-lg', md: 'h-11 px-4 text-[15px] rounded-xl', lg: 'h-14 px-6 text-lg rounded-xl', xl: 'h-16 px-7 text-xl rounded-2xl' };

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background-color,border-color,filter,transform] duration-150 active:scale-[0.98]',
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

const FIELD = 'block w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 shadow-xs transition-[border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-slate-100 disabled:text-slate-500';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(FIELD, 'h-11', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  // Urdu (Nastaliq) letters overhang — extra start padding stops clipping.
  return <select ref={ref} className={cx(FIELD, 'h-11 pe-8 rtl:ps-5', className)} {...props}>{children}</select>;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx(FIELD, 'py-2', className)} rows={3} {...props} />;
});

export function Field({ label, hint, error, required, className, children }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
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
  return <div className={cx('glass rounded-[22px]', className)} {...props}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-900/[0.06] px-5 py-4 sm:px-6 dark:border-white/[0.06]">
      <div>
        <h3 className="text-[17px] font-semibold tracking-tight text-slate-900">{title}</h3>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
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
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-slate-500/10', BADGE[color], className)}>{children}</span>;
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
      {Icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-slate-100 to-slate-50 ring-1 ring-slate-200/70"><Icon className="size-7 text-slate-400" /></div>}
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error }) {
  const t = useT();
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/10">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {/* server messages get Urdu too when the dictionary has them */}
      <span>{t(error.message || String(error))}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.025em] text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, size = 'md', children, footer }) {
  const t = useT();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div role="dialog" aria-modal="true" data-modal-open="true" className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-[rgb(10_15_28/0.38)] p-4 backdrop-blur-md sm:p-8 sm:pt-[8vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={cx('glass-strong glass-dialog w-full animate-pop-in rounded-2xl', width)}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-900/[0.06] px-6 py-4 dark:border-white/[0.06]">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="-me-2 grid size-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={t('Close')}><X className="size-5" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-900/[0.06] bg-slate-500/[0.04] px-6 py-3.5 dark:border-white/[0.06]">{footer}</div>}
      </div>
    </div>
  );
}

// Tables
export function Table({ children, className }) {
  return <div className={cx('overflow-x-auto', className)}><table className="data-table w-full text-start text-sm">{children}</table></div>;
}
export function Th({ children, className }) {
  return <th className={cx('whitespace-nowrap border-b border-slate-900/[0.07] bg-slate-500/[0.04] px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:border-white/[0.07]', className)}>{children}</th>;
}
export function Td({ children, className, ...props }) {
  return <td className={cx('border-b border-slate-900/[0.05] px-4 py-3.5 align-middle dark:border-white/[0.05]', className)} {...props}>{children}</td>;
}

export function Pagination({ meta, onPage }) {
  const t = useT();
  if (!meta || meta.last_page <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-900/[0.06] px-4 py-3 text-sm text-slate-600 dark:border-white/[0.06]">
      <span>{t('Page {page} of {pages}', { page: meta.current_page, pages: meta.last_page })} · {t('{n} total', { n: meta.total })}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}><ChevronLeft className="size-4 rtl:rotate-180" />{t('Previous')}</Button>
        <Button size="sm" variant="secondary" disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}>{t('Next')}<ChevronRight className="size-4 rtl:rotate-180" /></Button>
      </div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = { brand: 'bg-brand-50 text-brand-700 ring-brand-600/15', green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', amber: 'bg-amber-50 text-amber-700 ring-amber-600/15', red: 'bg-red-50 text-red-700 ring-red-600/15' };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {Icon && <div className={cx('grid size-10 place-items-center rounded-xl ring-1 ring-inset', tones[tone])}><Icon className="size-5" /></div>}
      </div>
      <div className="num mt-2 text-[26px] font-bold tracking-tight text-slate-900">{value}</div>
    </Card>
  );
}

// ---------------------------------------------------------------- toasts

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const tr = useT();
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3000);
  }, []);
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  const colors = { success: 'text-emerald-600', error: 'text-red-600', info: 'text-brand-700' };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className="glass-strong pointer-events-auto flex animate-pop-in items-start gap-3 rounded-2xl px-4 py-3.5 text-base">
              <Icon className={cx('mt-0.5 size-5 shrink-0', colors[t.type])} />
              <span className="text-slate-700">{tr(t.message)}</span>
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
            <Button variant="secondary" onClick={() => close(false)}>{state?.cancelLabel || t('Cancel')}</Button>
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

// On/off switch. `label` is for screen readers when there is no visible text.
export function Switch({ checked, onChange, disabled, label, size = 'md' }) {
  const big = size === 'md';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cx(
        'relative inline-flex shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        big ? 'h-7 w-12' : 'h-6 w-10',
        checked ? 'bg-emerald-600' : 'bg-slate-300',
      )}
    >
      {/* inset-inline-start so the knob also moves the right way in Urdu (RTL) */}
      <span className={cx('absolute top-0.5 rounded-full bg-white shadow transition-all', big ? 'size-6' : 'size-5')} style={{ insetInlineStart: checked ? `calc(100% - ${big ? '1.5rem' : '1.25rem'} - 2px)` : 2 }} />
    </button>
  );
}
