// Pieces shared by the cash drawer screens: big money input, note counter,
// expected-vs-counted banner, close-the-day modal and the printable Z-report.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Calculator, History, Lock, PlusCircle, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useShop } from '../../lib/shop';
import { useLang, useT } from '../../lib/i18n';
import { dateTime, money } from '../../lib/format';
import Keypad from '../../components/Keypad';
import { ReceiptCredit } from '../../components/Receipt';
import { Button, ErrorBox, Field, Modal, Textarea, cx, useToast } from '../../components/ui';

// "Today's drawer" / "Past days" switch at the top of every cash screen.
export function CashTabs() {
  const t = useT();
  const tab = ({ isActive }) => cx(
    'inline-flex h-12 items-center gap-2 rounded-lg px-4 text-base font-medium',
    isActive ? 'bg-brand-600 text-brand-ink shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
  );
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <NavLink to="/cash" end className={tab}><Wallet className="size-5" />{t('Today\'s drawer')}</NavLink>
      <NavLink to="/cash/history" className={tab}><History className="size-5" />{t('Past days')}</NavLink>
    </div>
  );
}

export const NOTES = [5000, 1000, 500, 100, 50, 20, 10];

// A difference under Rs 1 (paisa from discounts) counts as correct.
export function diffState(diff) {
  const d = Number(diff || 0);
  if (Math.abs(d) < 1) return 'correct';
  return d < 0 ? 'short' : 'extra';
}

export function useInvalidateCash() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['cash'] });
}

// Big, keypad-friendly money field (physical keyboard or on-screen pad).
export function BigMoneyInput({ value, onChange, autoFocus, label, id }) {
  return (
    <input
      id={id}
      aria-label={label}
      className="num h-20 w-full rounded-xl border-2 border-brand-500 bg-brand-50 px-4 text-end text-4xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/20"
      type="number" inputMode="decimal" min="0" step="0.01" placeholder="0"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  );
}

// Rows of note counts (5000 … 10) plus loose coins; the total updates as you type.
export function NoteCounter({ counts, onCounts }) {
  const t = useT();
  const total = noteTotal(counts);
  const set = (k, v) => onCounts({ ...counts, [k]: v.replace(/[^\d.]/g, '') });
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 grid grid-cols-[1fr_6rem_1fr] items-center gap-2 px-1 text-sm font-medium text-slate-500">
        <span>{t('Note')}</span><span className="text-center">{t('How many?')}</span><span className="text-end">{t('Total')}</span>
      </div>
      <div className="space-y-1.5">
        {NOTES.map((n) => (
          <div key={n} className="grid grid-cols-[1fr_6rem_1fr] items-center gap-2">
            <span className="num rounded-lg bg-white px-3 py-2 text-base font-semibold text-slate-800 ring-1 ring-slate-200">Rs {n}</span>
            <input
              type="number" inputMode="numeric" min="0" step="1" placeholder="0"
              aria-label={t('How many Rs {n} notes?', { n })}
              className="num h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-center text-lg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={counts[n] ?? ''}
              onChange={(e) => set(n, e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <span className="num text-end text-base text-slate-700">{money(n * Number(counts[n] || 0))}</span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_6rem_1fr] items-center gap-2">
          <span className="rounded-lg bg-white px-3 py-2 text-base font-semibold text-slate-800 ring-1 ring-slate-200">{t('Coins & small notes (Rs)')}</span>
          <input
            type="number" inputMode="decimal" min="0" step="1" placeholder="0"
            aria-label={t('Coins & small notes (Rs)')}
            className="num h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-center text-lg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            value={counts.coins ?? ''}
            onChange={(e) => set('coins', e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          <span className="num text-end text-base text-slate-700">{money(counts.coins)}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 px-1 pt-2 text-lg font-bold text-slate-900">
        <span>{t('Total counted')}</span><span className="num">{money(total)}</span>
      </div>
    </div>
  );
}

export function noteTotal(counts) {
  return NOTES.reduce((s, n) => s + n * Number(counts[n] || 0), 0) + Number(counts.coins || 0);
}

// Money entry with optional note counter and on-screen keypad.
export function CashCountInput({ value, onChange, autoFocus, label }) {
  const t = useT();
  const [helper, setHelper] = useState(false);
  const [counts, setCounts] = useState({});
  useEffect(() => { if (helper) onChange(String(noteTotal(counts) || '')); }, [counts, helper]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <BigMoneyInput value={value} onChange={(v) => { setHelper(false); onChange(v); }} autoFocus={autoFocus} label={label} />
      <div className="flex flex-wrap gap-2">
        <Button variant={helper ? 'primary' : 'secondary'} icon={Calculator} onClick={() => setHelper((h) => !h)}>
          {helper ? t('Hide note counter') : t('Count notes for me')}
        </Button>
      </div>
      {helper ? <NoteCounter counts={counts} onCounts={setCounts} /> : <Keypad value={value} onChange={onChange} />}
    </div>
  );
}

// Green "Cash is correct" / red "Short by Rs X" / amber "Extra Rs X".
export function DiffBanner({ diff, big }) {
  const t = useT();
  const s = diffState(diff);
  const amount = money(Math.abs(Number(diff || 0)));
  const cls = { correct: 'border-emerald-300 bg-emerald-50 text-emerald-800', short: 'border-red-300 bg-red-50 text-red-800', extra: 'border-amber-300 bg-amber-50 text-amber-900' }[s];
  const Icon = s === 'correct' ? CheckCircle2 : s === 'short' ? AlertTriangle : PlusCircle;
  return (
    <div className={cx('flex items-center gap-3 rounded-xl border-2 px-4', big ? 'py-4 text-2xl' : 'py-3 text-lg', cls)}>
      <Icon className={cx('shrink-0', big ? 'size-8' : 'size-6')} />
      <div className="min-w-0 space-y-1">
        <div className="font-bold leading-normal">
          {s === 'correct' ? t('Cash is correct') : s === 'short' ? t('Short by {amount}', { amount }) : t('Extra {amount}', { amount })}
        </div>
        {s !== 'correct' && (
          <div className={cx('font-normal leading-normal', big ? 'text-base' : 'text-sm')}>
            {s === 'short' ? t('There is less cash than expected.') : t('There is more cash than expected.')}
          </div>
        )}
      </div>
    </div>
  );
}

// Count the cash and close the day. `path` is /cash/close (own drawer) or
// /cash/sessions/:id/close (a manager closing someone else's drawer).
export function CloseDayModal({ session, path = '/cash/close', onClose, onClosed }) {
  const t = useT();
  const toast = useToast();
  const invalidate = useInvalidateCash();
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const expected = Number(session.expected_cash || 0);
  const has = counted !== '' && !Number.isNaN(Number(counted));
  const diff = Number(counted || 0) - expected;
  const held = session.summary?.held_bills || 0;

  const close = useMutation({
    mutationFn: () => api.post(path, { counted_cash: Number(counted), note: note.trim() || null }),
    onSuccess: (res) => { invalidate(); toast(t('Day closed. Report is ready to print.')); onClosed?.(res.data); },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={session.user && path !== '/cash/close' ? t('Close the day for {name}', { name: session.user.name }) : t('Close the day')}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button>
          <Button size="lg" icon={Lock} disabled={!has} loading={close.isPending} onClick={() => close.mutate()}>{t('Close the day')}</Button>
        </>
      )}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-3 text-lg font-semibold text-slate-800">{t('Count all the cash in the drawer. How much is there?')}</p>
          <CashCountInput value={counted} onChange={setCounted} autoFocus label={t('Cash counted')} />
        </div>
        <div className="space-y-4">
          {held > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{t('{n} bills are still saved for later. Their money is not counted until you finish them on the Sell screen.', { n: held })}</span>
            </div>
          )}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between py-1 text-base text-slate-600">
              <span>{t('Cash that should be in the drawer')}</span><span className="num font-semibold text-slate-900">{money(expected)}</span>
            </div>
            <div className="flex items-center justify-between py-1 text-base text-slate-600">
              <span>{t('Cash counted')}</span><span className="num font-semibold text-slate-900">{has ? money(counted) : '—'}</span>
            </div>
          </div>
          {has ? <DiffBanner diff={diff} big /> : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-4 text-base text-slate-500">{t('Type the cash you counted to see if it is correct.')}</div>
          )}
          <Field label={t('Note (optional)')} hint={t('For example: why cash is short or extra.')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
          {close.error && <ErrorBox error={close.error} />}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Z-report

function Line({ label, value, strong, sub }) {
  return (
    <div className={cx('flex justify-between gap-2', strong && 'font-bold', sub && 'ps-3 opacity-80')}>
      <span>{label}</span><span className="num">{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-2">
      <div className="mb-1 border-b border-black pb-0.5 font-bold uppercase">{title}</div>
      {children}
    </div>
  );
}

// Printable day-closing report. paper = 'receipt' (58/80mm thermal) | 'a4'.
export function ZReport({ session, paper = 'receipt' }) {
  const shop = useShop();
  const { t, isUrdu } = useLang();
  const s = session.summary || {};
  const closed = session.status === 'closed';
  const receiptWidth = shop.settings?.receipt?.paper_width === '58mm' ? '48mm' : '72mm'; // printable width of the roll
  const a4 = paper === 'a4';
  const diff = Number(session.difference || 0);
  const state = diffState(diff);
  const minus = (v) => (Number(v) > 0 ? `-${money(v)}` : money(0));

  const printedAt = useMemo(() => new Date().toISOString(), []);

  return (
    <div
      className={cx('print-area mx-auto bg-white leading-snug', a4 ? 'text-[13px]' : 'text-[12px]')}
      style={{ width: a4 ? '190mm' : receiptWidth, maxWidth: '100%', padding: a4 ? '8mm' : '2mm', color: '#000', background: '#fff', ...(isUrdu ? { lineHeight: 2.1 } : {}) }}
    >
      <div className="text-center">
        {shop.logoUrl && <img src={shop.logoUrl} alt="" className="mx-auto mb-1 max-h-16 max-w-[70%] object-contain" style={{ filter: 'grayscale(1) contrast(1.2)' }} />}
        <div className={cx('font-bold leading-tight', a4 ? 'text-[20px]' : 'text-[16px]')}>{shop.shopName}</div>
        {shop.settings?.shop?.address && <div>{shop.settings.shop.address}</div>}
        {shop.settings?.shop?.phone && <div>{t('Phone')}: <span className="num">{shop.settings.shop.phone}</span></div>}
        <div className={cx('mt-2 font-bold uppercase', a4 ? 'text-[16px]' : 'text-[14px]')}>{t('Day closing report (Z-report)')}</div>
        {!closed && <div className="font-bold">{t('Day still open — figures so far')}</div>}
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <Line label={t('Drawer #')} value={session.id} />
      <Line label={t('Cashier')} value={session.user?.name || '—'} />
      <Line label={t('Day opened')} value={dateTime(session.opened_at)} />
      <Line label={closed ? t('Day closed') : t('Printed at')} value={dateTime(closed ? session.closed_at : printedAt)} />
      {closed && session.closed_by && session.closed_by.id !== session.user?.id && <Line label={t('Closed by')} value={session.closed_by.name} />}

      <div className={a4 ? 'grid grid-cols-2 gap-x-8' : ''}>
        <div>
          <Section title={t('Sales')}>
            <Line label={t('Bills')} value={s.bills ?? 0} />
            <Line label={t('Total sales')} value={money(s.sales_total)} />
            <Line label={t('Discount given')} value={money(s.discounts)} sub />
            <Line label={t('Returns ({n})', { n: s.refunds?.count ?? 0 })} value={minus(s.refunds?.total)} />
            <Line label={t('Sales after returns')} value={money(s.net_sales)} strong />
            <Line label={t('Udhaar given')} value={money(s.udhaar_given)} />
          </Section>

          <Section title={t('Money received')}>
            {(s.payments || []).length === 0 && <div>{t('No sales')}</div>}
            {(s.payments || []).map((p) => (
              <Line key={p.method} label={`${t(shop.paymentLabel(p.method))} (${p.bills})`} value={money(p.amount)} />
            ))}
            <Line label={t('Total received')} value={money(s.paid_total)} strong />
          </Section>
        </div>

        <div>
          <Section title={t('Cash in drawer')}>
            <Line label={t('Opening cash')} value={money(s.opening_cash)} />
            <Line label={`+ ${t('Cash sales')}`} value={money(s.cash_sales)} />
            {Number(s.udhaar_received?.cash) > 0 && <Line label={`+ ${t('Old udhaar received in cash')}`} value={money(s.udhaar_received.cash)} />}
            <Line label={`+ ${t('Cash in')}`} value={money(s.pay_in)} />
            <Line label={`- ${t('Cash out')}`} value={minus(s.pay_out)} />
            <Line label={`- ${t('Cash given back for returns')}`} value={minus(s.refunds?.cash)} />
            {s.expenses?.available && <Line label={`- ${t('Shop expenses paid in cash')}`} value={minus(s.expenses?.cash)} />}
            <div className="my-1 border-t border-black" />
            <Line label={t('Expected cash')} value={money(session.expected_cash)} strong />
            {closed && (
              <>
                <Line label={t('Cash counted')} value={money(session.counted_cash)} strong />
                <Line
                  label={state === 'correct' ? t('Cash is correct') : state === 'short' ? t('Short by') : t('Extra')}
                  value={state === 'correct' ? money(diff) : money(Math.abs(diff))}
                  strong
                />
              </>
            )}
          </Section>

          {(session.movements || []).length > 0 && (
            <Section title={t('Cash in / out')}>
              {session.movements.map((m) => (
                <div key={m.id} className="flex justify-between gap-2">
                  <span className="min-w-0">{m.type === 'in' ? '+' : '-'} {m.reason}</span>
                  <span className="num">{m.type === 'in' ? money(m.amount) : `-${money(m.amount)}`}</span>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>

      {(session.opening_note || session.closing_note) && (
        <Section title={t('Notes')}>
          {session.opening_note && <div>{t('Opening')}: {session.opening_note}</div>}
          {session.closing_note && <div>{t('Closing')}: {session.closing_note}</div>}
        </Section>
      )}

      <div className={cx('mt-6 grid gap-6', a4 ? 'grid-cols-2' : 'grid-cols-1')}>
        <div className="border-t border-black pt-1 text-center">{t('Cashier signature')}</div>
        <div className="border-t border-black pt-1 text-center">{t('Owner / manager signature')}</div>
      </div>

      <ReceiptCredit />
    </div>
  );
}
