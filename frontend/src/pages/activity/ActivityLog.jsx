import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { money } from '../../lib/format';
import { Page } from '../../components/Layout';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from '../../components/ui';
import { useDates } from '../reports/reportKit';

// Modules that write to the activity log (see ActivityLogger::log calls in the backend).
// Labels are translated with t() where shown.
const MODULES = [
  { value: 'auth', label: 'Sign-in', color: 'gray' },
  { value: 'sales', label: 'Sales', color: 'blue' },
  { value: 'purchases', label: 'Stock bought', color: 'green' },
  { value: 'inventory', label: 'Stock', color: 'amber' },
];
const moduleInfo = (m) => MODULES.find((x) => x.value === m) || { label: String(m || '—').replace(/_/g, ' '), color: 'gray' };

const ACTIONS = {
  login: 'Signed in',
  logout: 'Signed out',
  change_password: 'Changed password',
  create: 'Created',
  payment: 'Money received',
  return: 'Return',
  resume: 'Opened saved bill',
  adjust: 'Changed stock',
  delete: 'Removed saved bill',
};
const actionLabel = (a, module) => {
  if (a === 'payment' && module === 'purchases') return 'Paid supplier';
  if (a === 'create' && module === 'sales') return 'New bill';
  if (a === 'create' && module === 'purchases') return 'Stock bought';
  return ACTIONS[a] || String(a || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
};

const ADJUST_TYPES = { in: 'added', out: 'removed', damaged: 'damaged', adjustment: 'counted' };

// The backend writes English sentences; turn the known ones into plain, translated text.
function describe(log, t, shop) {
  const s = String(log.description || '');
  let m;
  if ((m = s.match(/^User (.+) logged in\.$/))) return t('Signed in as {email}', { email: m[1] });
  if ((m = s.match(/^User (.+) logged out\.$/))) return t('Signed out ({email})', { email: m[1] });
  if ((m = s.match(/^User (.+) changed their password\.$/))) return t('{email} changed their password', { email: m[1] });
  if ((m = s.match(/^Created sale (\S+) \(held\)\.$/))) return t('Bill {inv} saved for later', { inv: m[1] });
  if ((m = s.match(/^Created sale (\S+) \((\w+)\)\.$/))) return t('New bill {inv}', { inv: m[1] });
  if ((m = s.match(/^Resumed held sale (\S+)\.$/))) return t('Saved bill {inv} opened again', { inv: m[1] });
  if ((m = s.match(/^Discarded held bill (\S+)\.$/))) return t('Saved bill {inv} removed', { inv: m[1] });
  if ((m = s.match(/^Processed return for sale (\S+)\.$/))) return t('Items returned from bill {inv}', { inv: m[1] });
  if ((m = s.match(/^Recorded payment of ([\d.]+) via (\S+) against sale (\S+)\.$/))) {
    return t('Received {amount} ({method}) for bill {inv}', { amount: money(m[1]), method: t(shop.paymentLabel(m[2])), inv: m[3] });
  }
  if ((m = s.match(/^Recorded payment of ([\d.]+) against sale (\S+)\.$/))) return t('Received {amount} for bill {inv}', { amount: money(m[1]), inv: m[2] });
  if ((m = s.match(/^Created purchase (\S+)\.$/))) return t('Stock bought — purchase {po}', { po: m[1] });
  if ((m = s.match(/^Recorded payment of ([\d.]+) against purchase (\S+)\.$/))) return t('Paid {amount} to supplier for purchase {po}', { amount: money(m[1]), po: m[2] });
  if ((m = s.match(/^Processed return for purchase (\S+)\.$/))) return t('Items sent back to supplier from purchase {po}', { po: m[1] });
  if ((m = s.match(/^Adjusted stock for variant #(\d+) \((\w+), delta (-?[\d.]+)\)\.$/))) {
    const delta = Number(m[3]);
    return t('Stock {how} for item #{id} ({change})', { how: t(ADJUST_TYPES[m[2]] || m[2]), id: m[1], change: delta > 0 ? `+${delta}` : String(delta) });
  }
  return s;
}

const EMPTY = { module: '', user_id: '', start_date: '', end_date: '' };

export default function ActivityLog() {
  const t = useT();
  const shop = useShop();
  const d = useDates();
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

  const label = 'mb-1.5 block text-sm font-medium text-slate-600';
  return (
    <Page>
      <PageHeader title={t('Activity log')} subtitle={t('A record of who did what, and when: sign-ins, bills, returns, stock bought and stock changes.')} />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-48">
            <span className={label}>{t('Show')}</span>
            <Select value={filters.module} onChange={set('module')}>
              <option value="">{t('Everything')}</option>
              {MODULES.map((m) => <option key={m.value} value={m.value}>{t(m.label)}</option>)}
            </Select>
          </label>
          {can('users.manage') && (
            <label className="block w-full sm:w-48">
              <span className={label}>{t('Staff member')}</span>
              <Select value={filters.user_id} onChange={set('user_id')}>
                <option value="">{t('Everyone')}</option>
                {(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </label>
          )}
          <label className="block w-full sm:w-44">
            <span className={label}>{t('From')}</span>
            <Input type="date" value={filters.start_date} max={filters.end_date || undefined} onChange={set('start_date')} />
          </label>
          <label className="block w-full sm:w-44">
            <span className={label}>{t('To')}</span>
            <Input type="date" value={filters.end_date} min={filters.start_date || undefined} onChange={set('end_date')} />
          </label>
          {filtered && <Button variant="secondary" icon={RotateCcw} onClick={() => { setFilters(EMPTY); setPage(1); }}>{t('Clear')}</Button>}
        </div>
      </Card>

      <Card>
        {q.isLoading ? <Loading /> : q.error ? <div className="p-5"><ErrorBox error={q.error} /></div> : !rows.length ? (
          <EmptyState icon={ClipboardList} title={filtered ? t('Nothing found for these choices') : t('Nothing recorded yet')}>
            {filtered ? t('Try other dates, or press Clear.') : t('Sign-ins, bills and stock changes will show here.')}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="text-start">{t('When')}</Th><Th className="text-start">{t('Staff member')}</Th><Th className="text-start">{t('Type')}</Th>
                  <Th className="text-start">{t('What happened')}</Th><Th className="text-start">{t('Details')}</Th><Th className="text-start">{t('Computer')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => {
                  const m = moduleInfo(log.module);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60">
                      <Td className="whitespace-nowrap text-slate-600"><span className="num">{d.dateTime(log.created_at)}</span></Td>
                      <Td className="whitespace-nowrap font-medium text-slate-800">{log.user || <span className="font-normal text-slate-400">{t('Removed staff member')}</span>}</Td>
                      <Td className="whitespace-nowrap"><Badge color={m.color}>{t(m.label)}</Badge></Td>
                      <Td className="whitespace-nowrap text-slate-700">{t(actionLabel(log.action, log.module))}</Td>
                      <Td className="min-w-[16rem] text-slate-600">{describe(log, t, shop)}</Td>
                      <Td className="whitespace-nowrap text-xs text-slate-400">{log.ip_address === '127.0.0.1' || log.ip_address === '::1' ? t('This computer') : <span className="num">{log.ip_address || '—'}</span>}</Td>
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
