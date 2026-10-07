// Kitchen order ticket (KOT): what to cook, for which table — no prices.
import { useShop } from '../lib/shop';
import { qty, variantLabel } from '../lib/format';

export const ORDER_TYPES = [
  { code: 'dine_in', label: 'Dine-in' },
  { code: 'takeaway', label: 'Takeaway' },
  { code: 'delivery', label: 'Delivery' },
];

export const orderTypeLabel = (code) => ORDER_TYPES.find((t) => t.code === code)?.label || '';

export default function KitchenSlip({ order }) {
  const shop = useShop();
  const width = shop.settings.receipt?.paper_width === '58mm' ? '58mm' : '80mm';
  return (
    <div className="print-area mx-auto bg-white font-mono text-[13px] leading-snug text-black" style={{ width, padding: '2mm' }}>
      <div className="text-center text-[15px] font-bold">KITCHEN ORDER</div>
      <div className="text-center">{orderTypeLabel(order.order_type)}{order.table_no ? ` — Table ${order.table_no}` : ''}</div>
      <div className="mt-1 flex justify-between text-[11px]"><span>{order.invoice_number}</span><span>{new Date().toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}</span></div>
      <div className="my-2 border-t border-dashed border-black" />
      {order.items.map((it, i) => (
        <div key={i} className="mb-1 flex gap-2 text-[14px]">
          <span className="w-10 shrink-0 font-bold">{qty(it.quantity)}x</span>
          <span>{it.product_name}{variantLabel(it) ? ` (${variantLabel(it)})` : ''}</span>
        </div>
      ))}
      {order.notes && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div>Note: {order.notes}</div>
        </>
      )}
    </div>
  );
}
