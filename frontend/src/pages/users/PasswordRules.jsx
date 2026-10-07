// Password policy shared by Users (create / reset) and Profile (change).
// Mirrors the backend rule: Password::min(8)->mixedCase()->numbers().
import { Check, X } from 'lucide-react';
import { cx } from '../../components/ui';

export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'A number (0–9)', test: (p) => /\d/.test(p) },
];

export const passwordOk = (p) => PASSWORD_RULES.every((r) => r.test(p || ''));

export function PasswordRules({ value }) {
  const p = value || '';
  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(p);
        const Icon = ok ? Check : X;
        return (
          <li key={r.label} className={cx('flex items-center gap-1.5', ok ? 'text-emerald-700' : 'text-slate-500')}>
            <Icon className={cx('size-3.5', ok ? 'text-emerald-600' : 'text-slate-400')} />{r.label}
          </li>
        );
      })}
    </ul>
  );
}
