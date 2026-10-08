import { useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Pencil, Plus, ShieldCheck, UserCheck, UserX, UsersRound } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, cx, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Th,
  useConfirm, useToast,
} from '../../components/ui';
import { useDates } from '../reports/reportKit';
import { passwordOk, PasswordRules } from './PasswordRules';

// Plain names for the permission groups (each is translated with t()).
const MODULE_LABELS = {
  dashboard: 'Today\'s summary',
  products: 'Items & categories',
  barcodes: 'Barcodes',
  purchases: 'Buying stock',
  suppliers: 'Suppliers',
  inventory: 'Stock',
  customers: 'Customers & udhaar',
  sales: 'Selling & bills',
  reports: 'Reports',
  activity_logs: 'Activity log',
  settings: 'Settings',
  users: 'Staff',
};
const moduleLabel = (m) => MODULE_LABELS[m] || String(m || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const roleColor = (name) => ({ Admin: 'blue', Manager: 'green', Cashier: 'amber' }[name] || 'gray');

function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get('/roles'), staleTime: 60_000 });
}

export default function Users() {
  const t = useT();
  const tabs = [{ to: '/users', label: 'Staff members', end: true }, { to: '/users/roles', label: 'What each role can do' }];
  return (
    <Page>
      <PageHeader title={t('Staff')} subtitle={t('People who can sign in to this shop\'s computer, and what each one is allowed to do.')} />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => cx(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-base font-medium transition-colors',
              isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t(tab.label)}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<StaffList />} />
        <Route path="roles" element={<RolesList />} />
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </Page>
  );
}

// ---------------------------------------------------------------- staff

function StaffList() {
  const t = useT();
  const d = useDates();
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const roles = useRoles();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users'), select: (r) => r?.data || [] });
  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null); // {} for new, user for edit
  const [resetting, setResetting] = useState(null);

  const toggle = useMutation({
    mutationFn: (u) => (u.is_active ? api.del(`/users/${u.id}`) : api.put(`/users/${u.id}`, { is_active: true })),
    onSuccess: (_, u) => {
      toast(u.is_active ? t('{name} can no longer sign in.', { name: u.name }) : t('{name} can sign in again.', { name: u.name }));
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const onToggle = async (u) => {
    if (u.is_active) {
      const ok = await confirm({
        title: t('Stop {name} from signing in?', { name: u.name }),
        message: t('{name} will be signed out and can\'t sign in any more. Their old sales stay saved. You can turn them back on later.', { name: u.name }),
        confirmLabel: t('Yes, stop sign-in'),
        danger: true,
      });
      if (!ok) return;
    }
    toggle.mutate(u);
  };

  const rows = useMemo(() => (users.data || []).filter((u) => {
    const s = search.trim().toLowerCase();
    if (s && !`${u.name} ${u.email}`.toLowerCase().includes(s)) return false;
    if (roleId && String(u.role_id) !== roleId) return false;
    if (status === 'active' && !u.is_active) return false;
    if (status === 'inactive' && u.is_active) return false;
    return true;
  }), [users.data, search, roleId, status]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64"><Input placeholder={t('Search name or email')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('Search name or email')} /></div>
        <div className="w-full sm:w-44">
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label={t('Role')}>
            <option value="">{t('All roles')}</option>
            {(roles.data || []).map((r) => <option key={r.id} value={r.id}>{t(r.name)}</option>)}
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Status')}>
            <option value="">{t('Everyone')}</option>
            <option value="active">{t('Can sign in')}</option>
            <option value="inactive">{t('Stopped')}</option>
          </Select>
        </div>
        <div className="flex-1" />
        <Button size="lg" icon={Plus} onClick={() => setEditing({})}>{t('Add staff member')}</Button>
      </div>

      <Card>
        {users.isLoading ? <Loading /> : users.error ? <div className="p-5"><ErrorBox error={users.error} /></div> : !rows.length ? (
          <EmptyState icon={UsersRound} title={users.data?.length ? t('No staff match your search') : t('No staff yet')}>
            {t('Give each person who uses the till their own login, so every sale is saved under their name.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th className="text-start">{t('Name')}</Th><Th className="text-start">{t('Role')}</Th><Th className="text-start">{t('Status')}</Th><Th className="text-start">{t('Last signed in')}</Th><Th className="text-end">{t('Actions')}</Th></tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={cx(!u.is_active && 'bg-slate-50/70')}>
                    <Td>
                      <div className={cx('font-medium', u.is_active ? 'text-slate-900' : 'text-slate-500')}>
                        {u.name}{self && <span className="ms-2 text-xs font-normal text-slate-400">({t('you')})</span>}
                      </div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </Td>
                    <Td><Badge color={roleColor(u.role)} className="whitespace-nowrap">{u.role ? t(u.role) : '—'}</Badge></Td>
                    <Td>{u.is_active ? <Badge color="green" className="whitespace-nowrap">{t('Can sign in')}</Badge> : <Badge color="red" className="whitespace-nowrap">{t('Stopped')}</Badge>}</Td>
                    <Td className="text-slate-600">{u.last_login_at ? <span className="num">{d.dateTime(u.last_login_at)}</span> : <span className="text-slate-400">{t('Never')}</span>}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" icon={Pencil} onClick={() => setEditing(u)}>{t('Edit')}</Button>
                        <Button variant="ghost" icon={KeyRound} onClick={() => setResetting(u)}>{t('New password')}</Button>
                        {!self && (u.is_active
                          ? <Button variant="ghost" icon={UserX} className="text-red-600! hover:bg-red-50" onClick={() => onToggle(u)}>{t('Stop sign-in')}</Button>
                          : <Button variant="ghost" icon={UserCheck} className="text-emerald-700! hover:bg-emerald-50" onClick={() => onToggle(u)}>{t('Allow sign-in')}</Button>)}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && <UserForm user={editing.id ? editing : null} roles={roles.data || []} onClose={() => setEditing(null)} />}
      {resetting && <ResetPassword user={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

function UserForm({ user, roles, onClose }) {
  const t = useT();
  const { user: me, setUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = !user;
  const defaultRole = roles.find((r) => r.name === 'Cashier') || roles[roles.length - 1];
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    role_id: String(user?.role_id || defaultRole?.id || ''),
    is_active: user ? !!user.is_active : true,
    password: '',
    confirm: '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const self = user && user.id === me?.id;
  const role = roles.find((r) => String(r.id) === form.role_id);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name.trim(), email: form.email.trim(), role_id: Number(form.role_id), is_active: form.is_active };
      if (isNew) return api.post('/users', { ...body, password: form.password });
      if (self) delete body.is_active;
      return api.put(`/users/${user.id}`, body);
    },
    onSuccess: (res) => {
      toast(isNew ? t('Staff member added.') : t('Changes saved.'));
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      // Keep the header in sync when editing yourself (permissions come from /auth/me).
      if (self) api.get('/auth/me').then((r) => setUser(r.data || r)).catch(() => {});
      onClose();
      return res;
    },
    onError: (err) => { setErrors(err.errors || {}); setError(err); },
  });

  const submit = (e) => {
    e.preventDefault();
    setErrors({}); setError(null);
    if (isNew && !passwordOk(form.password)) { setErrors({ password: [t('This password is too weak. Follow the rules below.')] }); return; }
    if (isNew && form.password !== form.confirm) { setErrors({ confirm: [t('The two passwords are not the same.')] }); return; }
    save.mutate();
  };
  const err = (k) => errors[k]?.[0];

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t('Add staff member') : t('Edit {name}', { name: user.name })}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="user-form" loading={save.isPending}>{isNew ? t('Add staff member') : t('Save')}</Button>
        </>
      )}
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        {error && !Object.keys(errors).length && <ErrorBox error={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Full name')} required error={err('name')}><Input value={form.name} onChange={set('name')} autoFocus required maxLength={255} /></Field>
          <Field label={t('Email (used to sign in)')} required error={err('email')}><Input type="email" value={form.email} onChange={set('email')} required autoComplete="off" /></Field>
        </div>
        <Field label={t('Role')} required error={err('role_id')} hint={role?.description ? t(role.description) : null}>
          <Select value={form.role_id} onChange={set('role_id')} required disabled={self}>
            {roles.map((r) => <option key={r.id} value={r.id}>{t(r.name)}</option>)}
          </Select>
        </Field>
        {self && <p className="-mt-2 text-sm text-slate-500">{t('You can\'t change your own role. Ask another owner (Admin).')}</p>}
        {role?.permissions?.length > 0 && <PermissionSummary role={role} compact />}
        {isNew && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Password')} required error={err('password')}>
              <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
            </Field>
            <Field label={t('Type password again')} required error={err('confirm')}>
              <Input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
            </Field>
            <div className="sm:col-span-2 -mt-2"><PasswordRules value={form.password} /></div>
          </div>
        )}
        {!self && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-slate-700">
            <input type="checkbox" className="size-5 rounded border-slate-300 text-brand-600" checked={form.is_active} onChange={set('is_active')} />
            {t('Allowed to sign in')}
          </label>
        )}
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }) {
  const t = useT();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const reset = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/reset-password`, { password }),
    onSuccess: () => { toast(t('New password set for {name}.', { name: user.name })); onClose(); },
    onError: setError,
  });
  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (!passwordOk(password)) return setError(new Error(t('This password is too weak. Follow the rules below.')));
    if (password !== confirm) return setError(new Error(t('The two passwords are not the same.')));
    reset.mutate();
    return undefined;
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('New password for {name}', { name: user.name })}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="reset-form" loading={reset.isPending}>{t('Set new password')}</Button>
        </>
      )}
    >
      <form id="reset-form" onSubmit={submit} className="space-y-4">
        <p className="text-base text-slate-600">{t('{name} will be signed out and must sign in with the new password. Tell them the new password yourself.', { name: user.name })}</p>
        <ErrorBox error={error} />
        <Field label={t('New password')} required><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus /></Field>
        <Field label={t('Type new password again')} required><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
        <PasswordRules value={password} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- roles

function groupByModule(perms) {
  const g = {};
  for (const p of perms || []) (g[p.module] = g[p.module] || []).push(p);
  return Object.entries(g);
}

function PermissionSummary({ role, compact }) {
  const t = useT();
  const groups = groupByModule(role.permissions);
  if (compact) {
    return (
      <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        <div className="mb-1.5 font-medium text-slate-700">{t('{role} can:', { role: t(role.name) })}</div>
        <div className="flex flex-wrap gap-1.5">
          {role.permissions.map((p) => <span key={p.slug} className="rounded bg-white px-2 py-0.5 ring-1 ring-slate-200">{t(p.name)}</span>)}
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map(([module, perms]) => (
        <div key={module}>
          <div className="mb-1.5 text-sm font-semibold text-slate-500">{t(moduleLabel(module))}</div>
          <ul className="space-y-1.5">
            {perms.map((p) => (
              <li key={p.slug} className="flex items-start gap-2 text-sm text-slate-700"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{t(p.name)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RolesList() {
  const t = useT();
  const roles = useRoles();
  if (roles.isLoading) return <Loading />;
  if (roles.error) return <ErrorBox error={roles.error} />;
  if (!roles.data?.length) return <Card><EmptyState icon={ShieldCheck} title={t('No roles set up')} /></Card>;
  return (
    <div className="space-y-5">
      <p className="text-base text-slate-600">{t('Each staff member gets one role. The role decides what they can do. Give the owner (Admin) role only to people you fully trust.')}</p>
      {roles.data.map((r) => (
        <Card key={r.id}>
          <CardHeader
            title={<span className="flex flex-wrap items-center gap-2">{t(r.name)} <Badge color={roleColor(r.name)}>{r.users_count === 1 ? t('1 person') : t('{n} people', { n: r.users_count ?? 0 })}</Badge></span>}
            subtitle={r.description ? t(r.description) : null}
          />
          <div className="p-5">
            {r.permissions?.length
              ? <PermissionSummary role={r} />
              : <p className="text-sm text-slate-500">{r.permissions ? t('This role can\'t do anything yet.') : t('Details are not available.')}</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}
