// Big on-screen number pad for touchscreens. The physical keyboard keeps
// working too (the value is a normal string the caller also shows in an input).
import { Delete } from 'lucide-react';
import { useT } from '../lib/i18n';
import { cx } from './ui';

export default function Keypad({ value, onChange, allowDecimal = true, onEnter, enterLabel, className }) {
  const t = useT();
  const press = (k) => {
    const v = String(value ?? '');
    if (k === 'back') return onChange(v.slice(0, -1));
    if (k === 'clear') return onChange('');
    if (k === '.') {
      if (!allowDecimal || v.includes('.')) return undefined;
      return onChange(v === '' ? '0.' : `${v}.`);
    }
    if (v === '0' && k !== '.') return onChange(k);
    const [, dec] = v.split('.');
    if (dec !== undefined && dec.length >= 3) return undefined; // up to 0.001
    return onChange(v + k);
  };
  const key = 'h-16 rounded-xl border border-slate-200 bg-white text-2xl font-semibold text-slate-800 shadow-sm active:scale-95 active:bg-slate-100 transition num';
  return (
    <div className={cx('grid grid-cols-3 gap-2', className)} dir="ltr">
      {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k) => (
        <button key={k} type="button" className={key} onClick={() => press(k)}>{k}</button>
      ))}
      <button type="button" className={cx(key, !allowDecimal && 'invisible')} onClick={() => press('.')}>.</button>
      <button type="button" className={key} onClick={() => press('0')}>0</button>
      <button type="button" className={cx(key, 'grid place-items-center text-slate-600')} onClick={() => press('back')} aria-label="Delete"><Delete className="size-7" /></button>
      <button type="button" className={cx(key, 'text-lg text-red-600')} onClick={() => press('clear')}>{t('Clear')}</button>
      {onEnter && (
        <button type="button" className="col-span-2 h-16 rounded-xl bg-brand-600 text-xl font-bold text-white shadow-sm transition active:scale-95" onClick={onEnter}>
          {enterLabel || t('OK')}
        </button>
      )}
    </div>
  );
}
