import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api, business } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { LanguageSwitch } from '../components/Layout';
import { NEXTCORE, NextcoreLogo } from '../components/Brand';
import { Button, ErrorBox, Field, Input, cx } from '../components/ui';
import { BusinessBadge } from '../components/BusinessSwitcher';

export default function Login() {
  const { user, login } = useAuth();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(business.get());
  const list = useQuery({ queryKey: ['businesses', 'public'], queryFn: () => api.get('/businesses/list'), staleTime: 60_000 });
  const businesses = list.data?.data || [];

  // the remembered business was removed from this computer
  useEffect(() => {
    if (businesses.length && !businesses.some((b) => b.id === picked)) { business.set(1); setPicked(1); }
  }, [businesses, picked]);

  const pick = (id) => { business.set(id); setPicked(id); setError(null); };

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-full place-items-center bg-slate-100 p-4">
      <LanguageSwitch className="absolute end-4 top-4" />
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <NextcoreLogo className="h-14 sm:h-16" />
          <p className="mt-4 text-base text-slate-500">{t('Sign in to continue')}</p>
        </div>
        <div className="space-y-4">
          {businesses.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">{t('Which business?')}</p>
              <div className="grid gap-2">
                {businesses.map((b) => (
                  <button key={b.id} type="button" onClick={() => pick(b.id)} className={cx('flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-start transition', picked === b.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300')}>
                    <BusinessBadge b={b} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">{b.name}</span>
                      <span className="block truncate text-xs text-slate-500">{t(b.type_label)}</span>
                    </span>
                    {picked === b.id && <Check className="size-5 text-brand-600" />}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ErrorBox error={error} />
          <Field label={t('Email')}>
            <Input type="email" autoFocus required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('Password')}>
            <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}>{t('Sign in')}</Button>
        </div>
      </form>
      <p className="absolute bottom-4 text-center text-xs text-slate-400" dir="ltr">{NEXTCORE.product} by {NEXTCORE.company} · {NEXTCORE.website} · {NEXTCORE.email}</p>
    </div>
  );
}

