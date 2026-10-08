import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Languages, ReceiptText, ShieldCheck, WifiOff } from 'lucide-react';
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
    <div className="app-canvas flex min-h-full">
      {/* brand panel (large screens) */}
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex xl:p-12">
        <span aria-hidden className="absolute -start-24 -top-24 size-96 rounded-full bg-brand-600 opacity-25 blur-3xl" />
        <span aria-hidden className="absolute -bottom-32 -end-20 size-96 rounded-full bg-brand-500 opacity-15 blur-3xl" />
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="relative">
          <span className="inline-flex rounded-2xl bg-[#fff] px-5 py-3 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)]"><NextcoreLogo className="h-9" /></span>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-4xl font-bold leading-tight tracking-[-0.02em] xl:text-[44px]">{t('Everything your shop needs, in one place.')}</h2>
          <ul className="mt-8 space-y-4 text-[17px] text-[#c3cad8]">
            {[
              [WifiOff, t('Works without internet — your data stays on this computer')],
              [Languages, t('English and Urdu, easy for everyone')],
              [ReceiptText, t('Bills, stock, udhaar and reports')],
              [ShieldCheck, t('Every person has their own login')],
            ].map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[rgb(255_255_255/0.07)] text-brand-500 ring-1 ring-inset ring-[rgb(255_255_255/0.1)]"><Icon className="size-5" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-[#7c879d]" dir="ltr">{NEXTCORE.product} by <span className="font-semibold text-[#c3cad8]">{NEXTCORE.company}</span> · {NEXTCORE.website} · {NEXTCORE.email}</p>
      </aside>

      {/* sign-in form */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-16">
        <LanguageSwitch className="absolute end-4 top-4" />
        <form onSubmit={submit} className="glass-strong w-full max-w-[28rem] rounded-3xl p-7 sm:p-9">
          <div className="mb-8 text-center lg:text-start">
            <NextcoreLogo className="mx-auto mb-8 h-12 lg:hidden" />
            <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-slate-900">{t('Welcome back')}</h1>
            <p className="mt-1.5 text-base text-slate-500">{t('Sign in to continue')}</p>
          </div>
          <div className="space-y-4">
            {businesses.length > 1 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">{t('Which business?')}</p>
                <div className="grid gap-2">
                  {businesses.map((b) => (
                    <button key={b.id} type="button" onClick={() => pick(b.id)} className={cx('flex items-center gap-3 rounded-2xl border bg-white/70 px-3 py-2.5 text-start shadow-xs transition', picked === b.id ? 'border-brand-500 ring-4 ring-brand-500/15' : 'border-slate-200 hover:border-slate-300')}>
                      <BusinessBadge b={b} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-900">{b.name}</span>
                        <span className="block truncate text-xs text-slate-500">{t(b.type_label)}</span>
                      </span>
                      <span className={cx('grid size-6 place-items-center rounded-full border-2 transition', picked === b.id ? 'border-brand-600 bg-brand-600 text-brand-ink' : 'border-slate-300')}>
                        {picked === b.id && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ErrorBox error={error} />
            <Field label={t('Email')}>
              <Input type="email" autoFocus required autoComplete="username" className="h-12" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t('Password')}>
              <Input type="password" required autoComplete="current-password" className="h-12" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" className="mt-2 w-full" size="lg" loading={busy}>{t('Sign in')}</Button>
          </div>
        </form>
        <p className="absolute bottom-4 px-4 text-center text-xs text-slate-400 lg:hidden" dir="ltr">{NEXTCORE.product} by {NEXTCORE.company} · {NEXTCORE.website} · {NEXTCORE.email}</p>
      </main>
    </div>
  );
}

