// Helpers shared by Sales history and Customers (payment modal, badges, money maths).
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useShop } from '../../lib/shop';
import { money, round3 } from '../../lib/format';
import { Badge, Button, ErrorBox, Field, Input, Modal, Select, useToast } from '../../components/ui';

const n = (v) => Number(v || 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;

export const isHeld = (s) => s?.status === 'held';
export const saleDue = (s) => (isHeld(s) ? 0 : n(s?.due_amount));
// Bill value after returns.
export const saleNet = (s) => r2(n(s?.grand_total) - n(s?.refunded_amount));
// What the customer has actually paid towards the bill (after any cash refunds).
// The backend credits returns against paid_amount, so derive it from net - due.
export const salePaid = (s) => (isHeld(s) ? 0 : Math.max(0, r2(saleNet(s) - saleDue(s))));

export function StatusBadges({ sale }) {
  if (isHeld(sale)) return <Badge color="amber">On hold</Badge>;
  const out = [];
  if (sale.status === 'returned') out.push(<Badge key="s">Returned</Badge>);
  else if (n(sale.refunded_amount) > 0) out.push(<Badge key="s" color="blue">Part returned</Badge>);
  if (sale.payment_status === 'paid') out.push(<Badge key="p" color="green">Paid</Badge>);
  else if (sale.payment_status === 'partial') out.push(<Badge key="p" color="amber">Part paid</Badge>);
  else out.push(<Badge key="p" color="red">Unpaid</Badge>);
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
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {(shop.meta.payment_methods || []).map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
    </Select>
  );
}

// Record a payment against one bill with a balance due.
export function ReceivePaymentModal({ sale, onClose, onDone }) {
  const toast = useToast();
  const invalidate = useInvalidateSales();
  const due = saleDue(sale);
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState('cash');
  useEffect(() => { setAmount(String(due)); }, [due]);

  const save = useMutation({
    mutationFn: () => api.post(`/sales/${sale.invoice_number}/payments`, { amount: r2(amount), payment_method: method }),
    onSuccess: (res) => {
      toast(`Received ${money(amount)} for ${sale.invoice_number}`);
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
      title={`Receive payment — ${sale.invoice_number}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="success" loading={save.isPending} disabled={bad} onClick={() => save.mutate()}>Receive {money(value)}</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!bad) save.mutate(); }}>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600"><span>Bill total</span><span>{money(saleNet(sale))}</span></div>
          <div className="flex justify-between text-slate-600"><span>Paid so far</span><span>{money(salePaid(sale))}</span></div>
          <div className="mt-1 flex justify-between font-semibold text-slate-900"><span>Balance due</span><span>{money(due)}</span></div>
        </div>
        <Field label="Amount received" required error={value > due + 0.001 ? `Cannot be more than ${money(due)}` : null}>
          <div className="flex gap-2">
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            <Button variant="secondary" onClick={() => setAmount(String(due))}>Full</Button>
          </div>
        </Field>
        <Field label="Paid by"><PaymentMethodSelect value={method} onChange={setMethod} /></Field>
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
