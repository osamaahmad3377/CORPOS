import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateTime } from '../../lib/format';
import { Page } from '../../components/Layout';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from '../../components/ui';

// Modules that write to the activity log (see ActivityLogger::log calls in the backend).
const MODULES = [
  { value: 'auth', label: 'Account', color: 'gray' },
  { value: 'sales', label: 'Sales', color: 'blue' },
  { value: 'purchases', label: 'Purchases', color: 'green' },
  { value: 'inventory', label: 'Inventory', color: 'amber' },
];
const moduleInfo = (m) => MODULES.find((x) => x.value === m) || { label: String(m || '—').replace(/_/g, ' '), color: 'gray' };

const ACTIONS = {
  login: 'Signed in',
  logout: 'Signed out',
  change_password: 'Changed password',
  create: 'Created',
  payment: 'Payment received',
  return: 'Return',
  resume: 'Resumed held bill',
  adjust: 'Stock adjusted',
};
const actionLabel = (a, module) => {
  if (a === 'payment' && module === 'purchases') return 'Payment made';
  return ACTIONS[a] || String(a || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
};

const EMPTY = { module: '', user_id: '', start_date: '', end_date: '' };

export default function ActivityLog() {
  const { can } = useAuth();
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const set = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); };

  // Staff list for the user filter needs users.manage; without it the filter is hidden.
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
    select: (r) => r?.data || [],
    enabled: can('users.manage'),
    staleTime: 60_000,
  });

  const q = useQuery({
    queryKey: ['activity-logs', filters, page],
    queryFn: () => api.get('/activity-logs', { ...filters, page, per_page: 30 }),
    placeholderData: keepPreviousData,
  });
  // This endpoint returns the raw Laravel paginator (no `meta` wrapper).
  const rows = q.data?.data || [];
  const meta = q.data ? { current_page: q.data.current_page, last_page: q.data.last_page, total: q.data.total } : null;
  const filtered = Object.values(filters).some(Boolean);

  return (
    <Page>
      <PageHeader title="Activity log" subtitle="Who did what and when — sign-ins, sales, returns, purchases and stock changes." />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-48">
            <span className="mb-1 block text-xs font-medium text-slate-500">Area</span>
            <Select value={filters.module} onChange={set('module')}>
              <option value="">Everything</option>
              {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </label>
          {can('users.manage') && (
            <label className="block w-full sm:w-48">
              <span className="mb-1 block text-xs font-medium text-slate-500">Staff member</span>
              <Select value={filters.user_id} onChange={set('user_id')}>
                <option value="">Everyone</option>
                {(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </label>
          )}
          <label className="block w-full sm:w-44">
            <span className="mb-1 block text-xs font-medium text-slate-500">From</span>
            <Input type="date" value={filters.start_date} max={filters.end_date || undefined} onChange={set('start_date')} />
          </label>
          <label className="block w-full sm:w-44">
            <span className="mb-1 block text-xs font-medium text-slate-500">To</span>
            <Input type="date" value={filters.end_date} min={filters.start_date || undefined} onChange={set('end_date')} />
          </label>
          {filtered && <Button variant="ghost" icon={RotateCcw} onClick={() => { setFilters(EMPTY); setPage(1); }}>Clear</Button>}
        </div>
      </Card>

      <Card>
        {q.isLoading ? <Loading /> : q.error ? <div className="p-5"><ErrorBox error={q.error} /></div> : !rows.length ? (
          <EmptyState icon={ClipboardList} title={filtered ? 'No activity matches these filters' : 'No activity yet'}>
            {filtered ? 'Try a different date range or clear the filters.' : 'Sign-ins, sales and stock changes will be listed here.'}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr><Th>When</Th><Th>Staff member</Th><Th>Area</Th><Th>Action</Th><Th>Details</Th><Th>Computer</Th></tr>
              </thead>
              <tbody>
                {rows.map((log) => {
                  const m = moduleInfo(log.module);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60">
                      <Td className="whitespace-nowrap text-slate-600">{dateTime(log.created_at)}</Td>
                      <Td className="whitespace-nowrap font-medium text-slate-800">{log.user || <span className="font-normal text-slate-400">Removed user</span>}</Td>
                      <Td className="whitespace-nowrap"><Badge color={m.color}>{m.label}</Badge></Td>
                      <Td className="whitespace-nowrap text-slate-700">{actionLabel(log.action, log.module)}</Td>
                      <Td className="min-w-[16rem] text-slate-600">{log.description}</Td>
                      <Td className="whitespace-nowrap text-xs text-slate-400">{log.ip_address === '127.0.0.1' || log.ip_address === '::1' ? 'This computer' : log.ip_address || '—'}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </Card>
    </Page>
  );
}
