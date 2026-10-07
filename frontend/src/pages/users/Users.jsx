import { useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Pencil, Plus, ShieldCheck, UserCheck, UserX, UsersRound } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateTime } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, cx, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Th,
  useConfirm, useToast,
} from '../../components/ui';
import { passwordOk, PasswordRules } from './PasswordRules';

const MODULE_LABELS = {
  dashboard: 'Dashboard',
  products: 'Products & catalog',
  barcodes: 'Barcodes',
  purchases: 'Purchases',
  suppliers: 'Suppliers',
  inventory: 'Inventory',
  customers: 'Customers',
  sales: 'Sales & billing',
  reports: 'Reports',
  activity_logs: 'Activity log',
  settings: 'Settings',
  users: 'Users',
};
const moduleLabel = (m) => MODULE_LABELS[m] || String(m || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const roleColor = (name) => ({ Admin: 'blue', Manager: 'green', Cashier: 'amber' }[name] || 'gray');

function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get('/roles'), staleTime: 60_000 });
}

export default function Users() {
  const tabs = [{ to: '/users', label: 'Staff', end: true }, { to: '/users/roles', label: 'Roles & permissions' }];
  return (
    <Page>
      <PageHeader title="Users" subtitle="Staff who can sign in to CorePOS, and what each role is allowed to do." />
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => cx(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
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
      toast(u.is_active ? `${u.name} can no longer sign in.` : `${u.name} can sign in again.`);
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const onToggle = async (u) => {
    if (u.is_active) {
      const ok = await confirm({
        title: `Deactivate ${u.name}?`,
        message: 'They will be signed out on every device and won’t be able to sign in. Their past sales and activity stay in the records. You can re-activate them later.',
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }
    toggle.mutate(u);
  };

  const rows = useMemo(() => (users.data || []).filter((u) => {
    const t = search.trim().toLowerCase();
    if (t && !`${u.name} ${u.email}`.toLowerCase().includes(t)) return false;
    if (roleId && String(u.role_id) !== roleId) return false;
    if (status === 'active' && !u.is_active) return false;
    if (status === 'inactive' && u.is_active) return false;
    return true;
  }), [users.data, search, roleId, status]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64"><Input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="w-full sm:w-40">
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">All roles</option>
            {(roles.data || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </Select>
        </div>
        <div className="flex-1" />
        <Button icon={Plus} onClick={() => setEditing({})}>Add staff member</Button>
      </div>

      <Card>
        {users.isLoading ? <Loading /> : users.error ? <div className="p-5"><ErrorBox error={users.error} /></div> : !rows.length ? (
          <EmptyState icon={UsersRound} title={users.data?.length ? 'No staff match these filters' : 'No staff yet'}>
            Add a login for each person who uses the till so sales and changes are recorded under their name.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th className="text-right">Actions</Th></tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={cx(!u.is_active && 'bg-slate-50/70')}>
                    <Td>
                      <div className={cx('font-medium', u.is_active ? 'text-slate-900' : 'text-slate-500')}>
                        {u.name}{self && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}
                      </div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </Td>
                    <Td><Badge color={roleColor(u.role)}>{u.role || '—'}</Badge></Td>
                    <Td>{u.is_active ? <Badge color="green">Active</Badge> : <Badge color="red">Deactivated</Badge>}</Td>
                    <Td className="text-slate-600">{u.last_login_at ? dateTime(u.last_login_at) : <span className="text-slate-400">Never</span>}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(u)}>Edit</Button>
                        <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setResetting(u)}>Reset password</Button>
                        {!self && (u.is_active
                          ? <Button size="sm" variant="ghost" icon={UserX} className="text-red-600! hover:bg-red-50" onClick={() => onToggle(u)}>Deactivate</Button>
                          : <Button size="sm" variant="ghost" icon={UserCheck} className="text-emerald-700! hover:bg-emerald-50" onClick={() => onToggle(u)}>Activate</Button>)}
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
      toast(isNew ? 'Staff member added.' : 'Changes saved.');
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
    if (isNew && !passwordOk(form.password)) { setErrors({ password: ['Password doesn’t meet the rules below.'] }); return; }
    if (isNew && form.password !== form.confirm) { setErrors({ confirm: ['Passwords don’t match.'] }); return; }
    save.mutate();
  };
  const err = (k) => errors[k]?.[0];

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add staff member' : `Edit ${user.name}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="user-form" loading={save.isPending}>{isNew ? 'Add staff member' : 'Save changes'}</Button>
        </>
      )}
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        {error && !Object.keys(errors).length && <ErrorBox error={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={err('name')}><Input value={form.name} onChange={set('name')} autoFocus required maxLength={255} /></Field>
          <Field label="Email (used to sign in)" required error={err('email')}><Input type="email" value={form.email} onChange={set('email')} required autoComplete="off" /></Field>
        </div>
        <Field label="Role" required error={err('role_id')} hint={role?.description}>
          <Select value={form.role_id} onChange={set('role_id')} required disabled={self}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        {self && <p className="-mt-2 text-xs text-slate-500">You can’t change your own role — ask another admin.</p>}
        {role?.permissions?.length > 0 && <PermissionSummary role={role} compact />}
        {isNew && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" required error={err('password')}>
              <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
            </Field>
            <Field label="Confirm password" required error={err('confirm')}>
              <Input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
            </Field>
            <div className="sm:col-span-2 -mt-2"><PasswordRules value={form.password} /></div>
          </div>
        )}
        {!self && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 rounded border-slate-300 text-brand-600" checked={form.is_active} onChange={set('is_active')} />
            Active — can sign in
          </label>
        )}
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const reset = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/reset-password`, { password }),
    onSuccess: () => { toast(`Password reset for ${user.name}.`); onClose(); },
    onError: setError,
  });
  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (!passwordOk(password)) return setError(new Error('Password doesn’t meet the rules below.'));
    if (password !== confirm) return setError(new Error('Passwords don’t match.'));
    reset.mutate();
    return undefined;
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Reset password — ${user.name}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="reset-form" loading={reset.isPending}>Reset password</Button>
        </>
      )}
    >
      <form id="reset-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">{user.name} will be signed out on every device and must sign in with the new password. Tell them the new password in person.</p>
        <ErrorBox error={error} />
        <Field label="New password" required><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus /></Field>
        <Field label="Confirm new password" required><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
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
  const groups = groupByModule(role.permissions);
  if (compact) {
    return (
      <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
        <div className="mb-1 font-medium text-slate-700">{role.name} can:</div>
        <div className="flex flex-wrap gap-1">
          {role.permissions.map((p) => <span key={p.slug} className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{p.name}</span>)}
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map(([module, perms]) => (
        <div key={module}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{moduleLabel(module)}</div>
          <ul className="space-y-1">
            {perms.map((p) => (
              <li key={p.slug} className="flex items-center gap-1.5 text-sm text-slate-700"><Check className="size-3.5 text-emerald-600" />{p.name}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RolesList() {
  const roles = useRoles();
  if (roles.isLoading) return <Loading />;
  if (roles.error) return <ErrorBox error={roles.error} />;
  if (!roles.data?.length) return <Card><EmptyState icon={ShieldCheck} title="No roles set up" /></Card>;
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Roles are fixed. Pick the one that fits each person when you add them — give the Admin role only to people you fully trust.</p>
      {roles.data.map((r) => (
        <Card key={r.id}>
          <CardHeader
            title={<span className="flex items-center gap-2">{r.name} <Badge color={roleColor(r.name)}>{r.users_count ?? 0} {r.users_count === 1 ? 'person' : 'people'}</Badge></span>}
            subtitle={r.description}
          />
          <div className="p-5">
            {r.permissions?.length
              ? <PermissionSummary role={r} />
              : <p className="text-sm text-slate-500">{r.permissions ? 'This role has no permissions.' : 'Permission details aren’t available.'}</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}
