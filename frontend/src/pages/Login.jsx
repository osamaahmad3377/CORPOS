import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api, business } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { DEFAULT_BRAND, applyBrand } from '../lib/theme';
import { applyShopIdentity, rememberedBrand } from '../lib/branding';
import { LanguageSwitch } from '../components/Layout';
import { NEXTCORE } from '../components/Brand';
import { Button, ErrorBox, Field, Input, cx } from '../components/ui';
import { BusinessBadge } from '../components/BusinessSwitcher';

export default function Login() {
  const { user, login } = useAuth();
  const { t, locale, setAppName } = useLang();
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

  // The sign-in screen belongs to the shop: its logo, name and colours
  // (the last shop's colours until the list arrives).
  const remembered = rememberedBrand();
  const shop = businesses.find((b) => b.id === picked) || businesses[0] || null;
  const name = shop?.name || remembered?.name || '';
  const color = /^#[0-9a-f]{6}$/i.test(shop?.brand_color || '') ? shop.brand_color : (remembered?.color || DEFAULT_BRAND);
  const logo = shop?.logo_url || null;
  useEffect(() => {
    applyBrand(color);
    if (name) { setAppName(name); applyShopIdentity({ name, color }); }
  }, [name, color, setAppName]);
  const now = useClock();

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
      {/* the shop's own panel (large screens): its colour, logo and name */}
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden p-10 lg:flex xl:p-12"
        style={{ backgroundImage: 'linear-gradient(155deg, var(--color-brand-500), var(--color-brand-700) 60%, var(--color-brand-900))', color: '#fff' }}>
        <span aria-hidden className="absolute -end-28 -top-28 size-[28rem] rounded-full bg-[rgb(255_255_255/0.12)]" />
        <span aria-hidden className="absolute -bottom-40 -start-24 size-[30rem] rounded-full bg-[rgb(255_255_255/0.08)]" />
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
        <div className="relative">
          <ShopMark name={name} logo={logo} className="size-24 text-4xl" />
        </div>
        <div className="relative">
          <p className="text-lg font-medium text-[rgb(255_255_255/0.75)]">{t('Welcome back')}</p>
          <h2 className="mt-1 max-w-md text-[44px] font-extrabold leading-[1.1] tracking-[-0.02em] xl:text-[52px]">{name}</h2>
          {shop?.type_label && <p className="mt-3 text-lg text-[rgb(255_255_255/0.75)]">{t(shop.type_label)}</p>}
          <div className="mt-10 inline-flex flex-col rounded-3xl bg-[rgb(255_255_255/0.12)] px-6 py-4 ring-1 ring-inset ring-[rgb(255_255_255/0.18)] backdrop-blur-md">
            <span className="num text-4xl font-bold tracking-tight">{now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</span>
            <span className="mt-1 text-[15px] text-[rgb(255_255_255/0.8)]">{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
        <p className="relative text-xs text-[rgb(255_255_255/0.55)]" dir="ltr">Powered by {NEXTCORE.product} · {NEXTCORE.website}</p>
      </aside>

      {/* sign-in form */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="absolute end-4 top-4 z-10"><LanguageSwitch /></div>
        <form onSubmit={submit} className="glass-strong w-full max-w-[28rem] rounded-3xl p-7 sm:p-9">
          <div className="mb-8 text-center lg:text-start">
            <div className="mb-6 flex flex-col items-center gap-3 lg:hidden">
              <ShopMark name={name} logo={logo} className="size-20 text-3xl" />
              <span className="text-xl font-bold text-slate-900">{name}</span>
            </div>
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
        <p className="absolute bottom-4 px-4 text-center text-xs text-slate-400 lg:hidden" dir="ltr">Powered by {NEXTCORE.product}</p>
      </main>
    </div>
  );
}

// The shop's logo on a white tile, or its first letter.
function ShopMark({ name, logo, className }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logo]);
  if (logo && !broken) {
    return <span className={cx('grid shrink-0 place-items-center overflow-hidden rounded-3xl bg-white p-2 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.45)]', className)}><img src={logo} alt={name} onError={() => setBroken(true)} className="max-h-full max-w-full object-contain" /></span>;
  }
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-3xl bg-white font-extrabold text-brand-700 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.45)]', className)}>
      {(name || 'C').trim().charAt(0).toUpperCase()}
    </span>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
