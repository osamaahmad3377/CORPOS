// One drawer day: result banner, printable Z-report (receipt printer or A4).
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock, Printer, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { dateTime, money } from '../../lib/format';
import { Page } from '../../components/Layout';
import { Button, ErrorBox, Loading, PageHeader, cx } from '../../components/ui';
import { CloseDayModal, DiffBanner, ZReport } from './cashShared';
import { printNow } from '../../lib/printer';

export default function CashReport() {
  const t = useT();
  const { id } = useParams();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const justClosed = !!useLocation().state?.justClosed;
  const [paper, setPaper] = useState('receipt');
  const [closing, setClosing] = useState(false);
  const q = useQuery({ queryKey: ['cash', 'session', id], queryFn: () => api.get(`/cash/sessions/${id}`), select: (r) => r.data });
  const s = q.data;
  const own = s && user && s.user?.id === user.id;

  return (
    <Page>
      <PageHeader
        title={t('Day closing report')}
        subtitle={s ? t('{name} · opened {time}', { name: s.user?.name || '', time: dateTime(s.opened_at) }) : t('Print this report and keep it with the day\'s cash.')}
        actions={(
          <>
            <Button variant="secondary" size="lg" icon={ArrowLeft} className="[&>svg]:rtl:rotate-180" onClick={() => navigate(justClosed ? '/cash' : '/cash/history')}>{t('Back')}</Button>
            {s && <Button size="lg" icon={Printer} onClick={() => printNow(paper === 'a4' ? 'document' : 'receipt')}>{t('Print report')}</Button>}
          </>
        )}
      />

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : s && (
        <div className="space-y-5">
          {s.status === 'closed' ? (
            <div className="space-y-3">
              {justClosed && <p className="text-lg font-semibold text-slate-800">{t('The day is closed. Print this report and keep it with the cash.')}</p>}
              <DiffBanner diff={s.difference} big />
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-base text-slate-600">
                <span>{t('Expected cash')}: <b className="num text-slate-900">{money(s.expected_cash)}</b></span>
                <span>{t('Cash counted')}: <b className="num text-slate-900">{money(s.counted_cash)}</b></span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-base text-brand-900">
              <span className="flex-1">{t('This day is still open. The report shows the figures so far.')}</span>
              {own && <Button icon={Wallet} onClick={() => navigate('/cash')}>{t('Go to today\'s drawer')}</Button>}
              {!own && can('cash.view_all') && <Button icon={Lock} onClick={() => setClosing(true)}>{t('Close this day for them')}</Button>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-base">
            <span className="text-slate-500">{t('Print on')}</span>
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {[['receipt', 'Receipt printer'], ['a4', 'A4 page']].map(([k, label]) => (
                <button
                  key={k} type="button" onClick={() => setPaper(k)}
                  className={cx('h-11 border-e border-slate-300 px-4 last:border-e-0', paper === k ? 'bg-brand-600 text-brand-ink' : 'bg-white text-slate-600 hover:bg-slate-50')}
                >{t(label)}</button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-4 sm:p-6">
            <div className="mx-auto w-fit max-w-full shadow-md">
              <ZReport session={s} paper={paper} />
            </div>
          </div>
        </div>
      )}

      {closing && s && (
        <CloseDayModal
          session={s}
          path={`/cash/sessions/${s.id}/close`}
          onClose={() => setClosing(false)}
          onClosed={() => { setClosing(false); q.refetch(); }}
        />
      )}
    </Page>
  );
}
