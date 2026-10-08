// Past drawer days: one row per opened/closed day. Open a row to see / print its report.
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, History, X } from 'lucide-react';
import { api, paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { dateTime, money } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, EmptyState, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th, cx,
} from '../../components/ui';
import { CashTabs, diffState } from './cashShared';

export function DiffBadge({ session }) {
  const t = useT();
  if (session.status === 'open') return <Badge color="blue">{t('Still open')}</Badge>;
  const s = diffState(session.difference);
  const amt = money(Math.abs(Number(session.difference || 0)));
  if (s === 'correct') return <Badge color="green">{t('Cash is correct')}</Badge>;
  return s === 'short'
    ? <Badge color="red">{t('Short by {amount}', { amount: amt })}</Badge>
    : <Badge color="amber">{t('Extra {amount}', { amount: amt })}</Badge>;
}

export default function CashHistory() {
  const t = useT();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const f = Object.fromEntries(sp.entries());
  const setF = (patch) => setSp((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    return next;
  }, { replace: true });

  const viewAll = can('cash.view_all');
  const params = { start_date: f.from, end_date: f.to, user_id: f.user, status: f.status, page: f.page || 1, per_page: 20 };
  const list = useQuery({ queryKey: ['cash', 'sessions', params], queryFn: () => api.get('/cash/sessions', params), placeholderData: (p) => p });
  const { rows, meta } = paged(list.data);
  const cashiers = list.data?.cashiers || [];
  const filtered = !!(f.from || f.to || f.user || f.status);

  return (
    <Page>
      <PageHeader
        title={t('Cash drawer')}
        subtitle={viewAll ? t('Every day each cashier opened and closed, and whether the cash was correct.') : t('Your past days: opening cash, counted cash and whether it was correct.')}
      />
      <CashTabs />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4 text-base">
          <span className="text-slate-500">{t('From')}</span>
          <div className="w-44"><Input type="date" value={f.from || ''} max={f.to || undefined} onChange={(e) => setF({ from: e.target.value })} aria-label={t('From date')} /></div>
          <span className="text-slate-500">{t('to')}</span>
          <div className="w-44"><Input type="date" value={f.to || ''} min={f.from || undefined} onChange={(e) => setF({ to: e.target.value })} aria-label={t('To date')} /></div>
          {viewAll && cashiers.length > 0 && (
            <div className="w-full sm:w-48"><Select value={f.user || ''} onChange={(e) => setF({ user: e.target.value })} aria-label={t('Cashier')}>
              <option value="">{t('All cashiers')}</option>
              {cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select></div>
          )}
          <div className="w-full sm:w-44"><Select value={f.status || ''} onChange={(e) => setF({ status: e.target.value })} aria-label={t('Status')}>
            <option value="">{t('Open and closed')}</option>
            <option value="open">{t('Still open')}</option>
            <option value="closed">{t('Closed')}</option>
          </Select></div>
          {filtered && <Button variant="ghost" icon={X} onClick={() => setSp({}, { replace: true })}>{t('Clear filters')}</Button>}
        </div>

        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorBox error={list.error} /></div> : !rows.length ? (
          <EmptyState icon={History} title={filtered ? t('No days match these filters') : t('No days yet')}>
            {filtered ? t('Try other dates, or clear the filters.') : t('When you open and close the day, it will show here.')}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="text-start">{t('Day opened')}</Th>
                {viewAll && <Th className="text-start">{t('Cashier')}</Th>}
                <Th className="hidden text-start lg:table-cell">{t('Day closed')}</Th>
                <Th className="hidden text-end md:table-cell">{t('Sales')}</Th>
                <Th className="text-end">{t('Expected cash')}</Th>
                <Th className="text-end">{t('Cash counted')}</Th>
                <Th className="text-start">{t('Result')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={cx('cursor-pointer hover:bg-slate-50', s.status === 'open' && 'bg-brand-50/40')} onClick={() => navigate(`/cash/${s.id}`)}>
                  <Td className="whitespace-nowrap py-4 font-medium text-slate-900"><span className="num">{dateTime(s.opened_at)}</span></Td>
                  {viewAll && <Td className="whitespace-nowrap text-slate-700">{s.user?.name}</Td>}
                  <Td className="hidden whitespace-nowrap text-slate-600 lg:table-cell">{s.closed_at ? <span className="num">{dateTime(s.closed_at)}</span> : '—'}</Td>
                  <Td className="hidden whitespace-nowrap text-end text-slate-700 md:table-cell">
                    <span className="num">{money(s.sales_total)}</span>
                    <div className="text-xs text-slate-400">{t('{n} bills', { n: s.bills })}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-end"><span className="num">{money(s.expected_cash)}</span></Td>
                  <Td className="whitespace-nowrap text-end font-medium">{s.counted_cash == null ? '—' : <span className="num">{money(s.counted_cash)}</span>}</Td>
                  <Td><DiffBadge session={s} /></Td>
                  <Td className="text-end"><ChevronRight className="ms-auto size-5 text-slate-400 rtl:rotate-180" /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination meta={meta} onPage={(p) => setF({ page: String(p) })} />
      </Card>
    </Page>
  );
}
