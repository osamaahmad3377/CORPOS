// Password policy shared by Users (create / reset) and Profile (change).
// Mirrors the backend rule: Password::min(8)->mixedCase()->numbers().
import { Check, X } from 'lucide-react';
import { cx } from '../../components/ui';
import { useT } from '../../lib/i18n';

export const PASSWORD_RULES = [
  // Labels are translated with t() where they are shown.
  { label: 'At least 8 letters or numbers', test: (p) => p.length >= 8 },
  { label: 'One capital letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One small letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0–9)', test: (p) => /\d/.test(p) },
];

export const passwordOk = (p) => PASSWORD_RULES.every((r) => r.test(p || ''));

export function PasswordRules({ value }) {
  const t = useT();
  const p = value || '';
  return (
    <ul className="mt-2 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(p);
        const Icon = ok ? Check : X;
        return (
          <li key={r.label} className={cx('flex items-start gap-1.5', ok ? 'text-emerald-700' : 'text-slate-500')}>
            <Icon className={cx('mt-0.5 size-4 shrink-0', ok ? 'text-emerald-600' : 'text-slate-400')} />{t(r.label)}
          </li>
        );
      })}
    </ul>
  );
}
