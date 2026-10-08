import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, UserCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { Page } from '../../components/Layout';
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Input, PageHeader, useToast } from '../../components/ui';
import { passwordOk, PasswordRules } from '../users/PasswordRules';
import { useDates } from '../reports/reportKit';

export default function Profile() {
  const t = useT();
  const d = useDates();
  const { user } = useAuth();
  return (
    <Page className="max-w-4xl">
      <PageHeader title={t('My profile')} subtitle={t('Change your name, the email you sign in with, or your password.')} />
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <UserCircle className="size-12 text-slate-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold text-slate-900">{user?.name}</div>
          <div className="truncate text-sm text-slate-500">{user?.email}</div>
        </div>
        <div className="text-end">
          <Badge color="blue"><ShieldCheck className="me-1 size-3.5" />{user?.role ? t(user.role) : ''}</Badge>
          {user?.last_login_at && <div className="mt-1 text-xs text-slate-400">{t('Signed in')} <span className="num">{d.dateTime(user.last_login_at)}</span></div>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailsForm />
        <PasswordForm />
      </div>
    </Page>
  );
}

function DetailsForm() {
  const t = useT();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const emailChanged = email.trim().toLowerCase() !== (user?.email || '').toLowerCase();
  const dirty = name.trim() !== user?.name || emailChanged;

  const save = useMutation({
    mutationFn: () => api.put('/auth/profile', {
      name: name.trim(),
      email: email.trim(),
      ...(emailChanged ? { current_password: currentPassword } : {}),
    }),
    onSuccess: (res) => {
      const u = res?.data || res;
      setUser((prev) => ({ ...prev, ...u }));
      setName(u.name); setEmail(u.email); setCurrentPassword('');
      toast(emailChanged ? t('Saved. Use your new email next time you sign in.') : t('Saved.'));
    },
    onError: (err) => { setErrors(err.errors || {}); setError(err); },
  });

  const submit = (e) => {
    e.preventDefault();
    setErrors({}); setError(null);
    save.mutate();
  };
  const err = (k) => errors[k]?.[0];

  return (
    <Card>
      <CardHeader title={t('Your details')} subtitle={t('Your name shows on bills and in the activity log.')} />
      <form onSubmit={submit} className="space-y-4 p-5">
        {error && !Object.keys(errors).length && <ErrorBox error={error} />}
        <Field label={t('Full name')} required error={err('name')}><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} /></Field>
        <Field label={t('Email (used to sign in)')} required error={err('email')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        {emailChanged && (
          <Field label={t('Your current password')} required error={err('current_password')} hint={t('Needed to change the email you sign in with.')}>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" onClick={() => { setName(user?.name || ''); setEmail(user?.email || ''); setCurrentPassword(''); setErrors({}); setError(null); }}>{t('Undo')}</Button>}
          <Button type="submit" size="lg" loading={save.isPending} disabled={!dirty || !name.trim()}>{t('Save')}</Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const t = useT();
  const toast = useToast();
  const blank = { current_password: '', new_password: '', new_password_confirmation: '' };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', form),
    onSuccess: () => {
      setForm(blank);
      toast(t('Password changed. You are signed out on other computers.'));
    },
    onError: (err) => { setErrors(err.errors || {}); setError(err); },
  });

  const submit = (e) => {
    e.preventDefault();
    setErrors({}); setError(null);
    if (!passwordOk(form.new_password)) return setErrors({ new_password: [t('This password is too weak. Follow the rules below.')] });
    if (form.new_password !== form.new_password_confirmation) return setErrors({ new_password_confirmation: [t('The two passwords are not the same.')] });
    if (form.new_password === form.current_password) return setErrors({ new_password: [t('Choose a new password, not the same as the old one.')] });
    change.mutate();
    return undefined;
  };
  const err = (k) => errors[k]?.[0];

  return (
    <Card>
      <CardHeader title={t('Change password')} subtitle={t('You stay signed in here. Other computers are signed out.')} />
      <form onSubmit={submit} className="space-y-4 p-5">
        {error && !Object.keys(errors).length && <ErrorBox error={error} />}
        <Field label={t('Your current password')} required error={err('current_password')}>
          <Input type="password" value={form.current_password} onChange={set('current_password')} autoComplete="current-password" required />
        </Field>
        <Field label={t('New password')} required error={err('new_password')}>
          <Input type="password" value={form.new_password} onChange={set('new_password')} autoComplete="new-password" required />
          <PasswordRules value={form.new_password} />
        </Field>
        <Field label={t('Type new password again')} required error={err('new_password_confirmation')}>
          <Input type="password" value={form.new_password_confirmation} onChange={set('new_password_confirmation')} autoComplete="new-password" required />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" size="lg" icon={KeyRound} loading={change.isPending}>{t('Change password')}</Button>
        </div>
      </form>
    </Card>
  );
}
