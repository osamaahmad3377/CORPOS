// Helpers shared by Old bills (sales history) and Customers (payment modal, badges, money maths).
import { Fragment, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useShop } from '../../lib/shop';
import { useT } from '../../lib/i18n';
import { money, round3 } from '../../lib/format';
import { Badge, Button, ErrorBox, Field, Input, Modal, Select, useToast } from '../../components/ui';

const n = (v) => Number(v || 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;

// Put React nodes (e.g. <span className="num">) into a translated sentence:
//   rich(t('Customer since {date}'), { date: <span className="num">{date(x)}</span> })
// t() is called without vars so the {placeholders} survive for us to fill.
// Wrapped in one <span> so spaces survive inside flex containers (Badge, headers).
export function rich(str, vars) {
  return <span>{richParts(str, vars)}</span>;
}
function richParts(str, vars) {
  return String(str).split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    // eslint-disable-next-line react/no-array-index-key
    return <Fragment key={i}>{m && vars[m[1]] !== undefined ? vars[m[1]] : part}</Fragment>;
  });
}

export const isHeld = (s) => s?.status === 'held';
export const saleDue = (s) => (isHeld(s) ? 0 : n(s?.due_amount));
// Bill value after returns.
export const saleNet = (s) => r2(n(s?.grand_total) - n(s?.refunded_amount));
// What the customer has actually paid towards the bill (after any cash refunds).
// The backend credits returns against paid_amount, so derive it from net - due.
export const salePaid = (s) => (isHeld(s) ? 0 : Math.max(0, r2(saleNet(s) - saleDue(s))));

export function StatusBadges({ sale }) {
  const t = useT();
  if (isHeld(sale)) return <Badge color="amber">{t('Saved for later')}</Badge>;
  const out = [];
  if (sale.status === 'returned') out.push(<Badge key="s">{t('Returned')}</Badge>);
  else if (n(sale.refunded_amount) > 0) out.push(<Badge key="s" color="blue">{t('Part returned')}</Badge>);
  if (sale.payment_status === 'paid') out.push(<Badge key="p" color="green">{t('Paid')}</Badge>);
  else if (sale.payment_status === 'partial') out.push(<Badge key="p" color="amber">{t('Part paid')}</Badge>);
  else out.push(<Badge key="p" color="red">{t('Unpaid')}</Badge>);
  return <span className="inline-flex flex-wrap gap-1">{out}</span>;
}

export function useInvalidateSales() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['reports'] });
  };
}

export function PaymentMethodSelect({ value, onChange }) {
  const shop = useShop();
  const t = useT();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {(shop.meta.payment_methods || []).map((p) => <option key={p.code} value={p.code}>{t(p.label)}</option>)}
    </Select>
  );
}

// Record a payment against one bill with a balance due.
export function ReceivePaymentModal({ sale, onClose, onDone }) {
  const t = useT();
  const toast = useToast();
  const invalidate = useInvalidateSales();
  const due = saleDue(sale);
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState('cash');
  useEffect(() => { setAmount(String(due)); }, [due]);

  const save = useMutation({
    mutationFn: () => api.post(`/sales/${sale.invoice_number}/payments`, { amount: r2(amount), payment_method: method }),
    onSuccess: (res) => {
      toast(t('Received {amount} for bill {inv}', { amount: money(amount), inv: sale.invoice_number }));
      invalidate();
      onDone?.(res.data);
      onClose();
    },
  });
  const value = n(amount);
  const bad = value <= 0 || value > due + 0.001;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('Receive payment — bill {inv}', { inv: sale.invoice_number })}
      footer={(
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="success" size="lg" loading={save.isPending} disabled={bad} onClick={() => save.mutate()}>
            {t('Receive')} <span className="num">{money(value)}</span>
          </Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!bad) save.mutate(); }}>
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-base">
          <div className="flex justify-between gap-3 text-slate-600"><span>{t('Bill total')}</span><span className="num">{money(saleNet(sale))}</span></div>
          <div className="flex justify-between gap-3 text-slate-600"><span>{t('Paid so far')}</span><span className="num">{money(salePaid(sale))}</span></div>
          <div className="flex justify-between gap-3 text-lg font-semibold text-red-700"><span>{t('Still owed')}</span><span className="num">{money(due)}</span></div>
        </div>
        <Field
          label={t('How much money did you get?')}
          required
          error={value > due + 0.001 ? t('Cannot be more than {amount}', { amount: money(due) }) : null}
        >
          <div className="flex gap-2">
            <Input type="number" min="0.01" step="0.01" className="h-12 text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            <Button variant="secondary" className="h-12" onClick={() => setAmount(String(due))}>{t('Full amount')}</Button>
          </div>
        </Field>
        <Field label={t('Paid by')}><PaymentMethodSelect value={method} onChange={setMethod} /></Field>
        <ErrorBox error={save.error} />
      </form>
    </Modal>
  );
}

// Estimate of the refund for a set of return quantities, mirroring SaleReturnController.
export function refundEstimate(sale, qtyBySaleItem) {
  const ratio = n(sale.subtotal) > 0 ? n(sale.grand_total) / n(sale.subtotal) : 1;
  let total = 0;
  for (const it of sale.items || []) {
    const q = round3(qtyBySaleItem[it.id]);
    if (q > 0 && n(it.quantity) > 0) total += r2((n(it.total_price) / n(it.quantity)) * q * ratio);
  }
  return r2(total);
}
