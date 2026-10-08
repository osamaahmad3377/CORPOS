// Cash drawer & day closing: open the day with the cash in the drawer, record
// cash put in / taken out, close the day by counting cash, print the Z-report.
import { useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDownCircle, ArrowUpCircle, Banknote, Clock, HandCoins, Lock, ReceiptText, RotateCcw, ShoppingCart, Unlock,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { dateTime, money } from '../../lib/format';
import { Page } from '../../components/Layout';
import {
  Badge, Button, Card, CardHeader, ErrorBox, Field, Input, Loading, Modal, PageHeader, cx, useToast,
} from '../../components/ui';
import { BigMoneyInput, CashCountInput, CashTabs, CloseDayModal, useInvalidateCash } from './cashShared';
import CashHistory from './CashHistory';
import CashReport from './CashReport';

export default function CashDrawer() {
  return (
    <Routes>
      <Route index element={<Today />} />
      <Route path="history" element={<CashHistory />} />
      <Route path=":id" element={<CashReport />} />
    </Routes>
  );
}

// ---------------------------------------------------------------- today

function Today() {
  const t = useT();
  const current = useQuery({ queryKey: ['cash', 'current'], queryFn: () => api.get('/cash/current'), refetchInterval: 30_000 });
  const session = current.data?.data;

  return (
    <Page>
      <PageHeader
        title={t('Cash drawer')}
        subtitle={t('Start the day with the cash in the drawer, and count it when you close. CorePOS tells you if any cash is short.')}
      />
      <CashTabs />
      {current.isLoading ? <Loading /> : current.error ? <ErrorBox error={current.error} /> : session ? <OpenDrawer session={session} /> : <OpenDayCard />}
    </Page>
  );
}

function OpenDayCard() {
  const t = useT();
  const toast = useToast();
  const invalidate = useInvalidateCash();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const open = useMutation({
    mutationFn: () => api.post('/cash/open', { opening_cash: Number(amount || 0), note: note.trim() || null }),
    onSuccess: () => { invalidate(); toast(t('Day started. Good luck with sales!')); },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <Card className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-4">
        <div className="rounded-2xl bg-teal-50 p-4 text-teal-600"><Unlock className="size-9" /></div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('Open the day')}</h2>
          <p className="mt-1 text-base text-slate-500">{t('Your drawer is closed. Open it before you start selling.')}</p>
        </div>
      </div>
      <p className="mb-3 text-lg font-semibold text-slate-800">{t('How much cash is in the drawer now?')}</p>
      <CashCountInput value={amount} onChange={setAmount} autoFocus label={t('Cash in the drawer now')} />
      <p className="mt-2 text-sm text-slate-500">{t('If the drawer is empty, leave it at 0.')}</p>
      <Field label={t('Note (optional)')} className="mt-4">
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      <Button size="xl" className="mt-6 w-full" icon={Unlock} loading={open.isPending} onClick={() => open.mutate()}>
        {t('Open the day with {amount}', { amount: money(amount) })}
      </Button>
    </Card>
  );
}

function SummaryTile({ icon: Icon, label, value, hint, tone = 'brand', big }) {
  const tones = { brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', teal: 'bg-teal-50 text-teal-600' };
  return (
    <Card className={cx('p-5', big && 'border-2 border-emerald-200 bg-emerald-50/40')}>
      <div className="flex items-center gap-3">
        <div className={cx('rounded-lg p-2', tones[tone])}><Icon className="size-6" /></div>
        <span className="text-base text-slate-600">{label}</span>
      </div>
      <div className={cx('num mt-3 block font-bold tracking-tight text-slate-900', big ? 'text-4xl' : 'text-3xl')}>{value}</div>
      {hint && <div className="mt-1 text-sm text-slate-500">{hint}</div>}
    </Card>
  );
}

function FlowRow({ label, value, sign, strong }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 px-5 py-3 text-base', strong ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-700')}>
      <span>{sign && <span className="me-2 inline-block w-3 text-center font-bold text-slate-400">{sign}</span>}{label}</span>
      <span className="num">{money(value)}</span>
    </div>
  );
}

function OpenDrawer({ session }) {
  const t = useT();
  const shop = useShop();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [move, setMove] = useState(null); // 'in' | 'out'
  const [closing, setClosing] = useState(false);
  const s = session.summary || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-900">
        <Clock className="size-6 shrink-0 text-emerald-600" />
        <span className="flex-1">{t('Drawer is open since {time}. Started with {amount}.', { time: dateTime(session.opened_at), amount: money(session.opening_cash) })}</span>
        <Badge color="green" className="text-sm">{t('Drawer open')}</Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" variant="secondary" icon={ArrowDownCircle} className="flex-1 sm:flex-none" onClick={() => setMove('in')}>{t('Cash in')}</Button>
        <Button size="lg" variant="secondary" icon={ArrowUpCircle} className="flex-1 sm:flex-none" onClick={() => setMove('out')}>{t('Cash out')}</Button>
        <Button size="lg" variant="secondary" icon={ReceiptText} className="flex-1 sm:flex-none" onClick={() => navigate(`/cash/${session.id}`)}>{t('See report')}</Button>
        <div className="hidden flex-1 sm:block" />
        <Button size="lg" icon={Lock} className="w-full sm:w-auto" onClick={() => setClosing(true)}>{t('Close the day')}</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile big icon={Banknote} tone="green" label={t('Cash that should be in the drawer')} value={money(session.expected_cash)} />
        <SummaryTile icon={ShoppingCart} label={t('Sales since opening')} value={money(s.sales_total)} hint={t('{n} bills', { n: s.bills ?? 0 })} />
        <SummaryTile icon={HandCoins} tone="amber" label={t('Udhaar given')} value={money(s.udhaar_given)} />
        <SummaryTile icon={RotateCcw} tone="teal" label={t('Returns')} value={money(s.refunds?.total)} hint={t('{n} returns', { n: s.refunds?.count ?? 0 })} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('How the cash adds up')} subtitle={t('Cash only. Card and mobile payments are not in the drawer.')} />
          <div className="divide-y divide-slate-100">
            <FlowRow label={t('Opening cash')} value={s.opening_cash} />
            <FlowRow sign="+" label={t('Cash sales')} value={s.cash_sales} />
            {Number(s.udhaar_received?.cash) > 0 && <FlowRow sign="+" label={t('Old udhaar received in cash')} value={s.udhaar_received.cash} />}
            <FlowRow sign="+" label={t('Cash in')} value={s.pay_in} />
            <FlowRow sign="−" label={t('Cash out')} value={s.pay_out} />
            <FlowRow sign="−" label={t('Cash given back for returns')} value={s.refunds?.cash} />
            {s.expenses?.available && <FlowRow sign="−" label={t('Shop expenses paid in cash')} value={s.expenses?.cash} />}
            <FlowRow strong sign="=" label={t('Cash that should be in the drawer')} value={session.expected_cash} />
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t('Money received, by payment type')} />
            {(s.payments || []).length === 0 ? (
              <p className="px-5 py-6 text-base text-slate-500">{t('No sales yet since the day was opened.')}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {s.payments.map((p) => (
                  <div key={p.method} className="flex items-center justify-between gap-3 px-5 py-3 text-base">
                    <span className="text-slate-700">{t(shop.paymentLabel(p.method))} <span className="text-sm text-slate-400">· {t('{n} bills', { n: p.bills })}</span></span>
                    <span className="num font-semibold text-slate-900">{money(p.amount)}</span>
                  </div>
                ))}
                {Number(s.udhaar_given) > 0 && (
                  <div className="flex items-center justify-between gap-3 px-5 py-3 text-base">
                    <span className="text-slate-700">{t('Udhaar (not paid yet)')}</span>
                    <span className="num font-semibold text-amber-700">{money(s.udhaar_given)}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t('Cash in / out')} />
            {(session.movements || []).length === 0 ? (
              <p className="px-5 py-6 text-base text-slate-500">{t('No cash put in or taken out yet.')}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {session.movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-base">
                    <div className="min-w-0">
                      <div className="truncate text-slate-800">{m.reason}</div>
                      <div className="num text-sm text-slate-400">{dateTime(m.created_at)}</div>
                    </div>
                    <span className={cx('num font-semibold', m.type === 'in' ? 'text-emerald-700' : 'text-red-600')}>
                      {m.type === 'in' ? '+' : '−'}{money(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {can('sales.create') && (
        <p className="text-sm text-slate-500">
          {t('Udhaar collected from customers in cash (Old bills → Receive payment) is added automatically.')}{' '}
          <Link to="/pos" className="font-medium text-brand-600 hover:underline">{t('Go to Sell')}</Link>
        </p>
      )}

      {move && <MovementModal type={move} session={session} onClose={() => setMove(null)} />}
      {closing && (
        <CloseDayModal
          session={session}
          onClose={() => setClosing(false)}
          onClosed={(closed) => { setClosing(false); navigate(`/cash/${closed.id}`, { state: { justClosed: true } }); }}
        />
      )}
    </div>
  );
}

const REASONS = {
  in: ['Change / small notes', 'Owner added cash'],
  out: ['Tea & food', 'Transport / fuel', 'Shop supplies', 'Paid to supplier', 'Owner took cash', 'Cash sent to bank'],
};

function MovementModal({ type, session, onClose }) {
  const t = useT();
  const toast = useToast();
  const invalidate = useInvalidateCash();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const ok = Number(amount) > 0 && reason.trim();
  const save = useMutation({
    mutationFn: () => api.post('/cash/movements', { type, amount: Number(amount), reason: reason.trim() }),
    onSuccess: () => { invalidate(); toast(type === 'in' ? t('Cash in saved') : t('Cash out saved')); onClose(); },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={type === 'in' ? t('Cash in — put cash into the drawer') : t('Cash out — take cash from the drawer')}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button>
          <Button size="lg" disabled={!ok} loading={save.isPending} onClick={() => save.mutate()} icon={type === 'in' ? ArrowDownCircle : ArrowUpCircle}>
            {type === 'in' ? t('Save cash in') : t('Save cash out')}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label={t('How much?')}>
          <BigMoneyInput value={amount} onChange={setAmount} autoFocus label={t('How much?')} />
        </Field>
        <Field label={t('Why?')} required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder={type === 'in' ? t('For example: change from the bank') : t('For example: tea for staff')} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {REASONS[type].map((r) => (
            <Button key={r} size="sm" variant={reason === t(r) ? 'primary' : 'secondary'} onClick={() => setReason(t(r))}>{t(r)}</Button>
          ))}
        </div>
        {type === 'out' && session.summary?.expenses?.available && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{t('Shop expenses you save on the Expenses page are already taken out here. Do not add them again.')}</p>
        )}
        {save.error && <ErrorBox error={save.error} />}
      </div>
    </Modal>
  );
}

