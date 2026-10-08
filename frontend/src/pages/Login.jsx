import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { LanguageSwitch } from '../components/Layout';
import { Button, ErrorBox, Field, Input } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-brand-600 text-xl font-bold text-white">C</div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">CorePOS</h1>
            <p className="text-base text-slate-500">{t('Sign in to continue')}</p>
          </div>
        </div>
        <div className="space-y-4">
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
    </div>
  );
}
