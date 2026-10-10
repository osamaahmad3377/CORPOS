// Kitchen order ticket (KOT): what to cook, for which table — no prices.
import { useShop } from '../lib/shop';
import { qty, variantLabel } from '../lib/format';
import { useLang } from '../lib/i18n';
import { receiptWidth } from '../lib/printer';

export const ORDER_TYPES = [
  { code: 'dine_in', label: 'Dine-in' },
  { code: 'takeaway', label: 'Takeaway' },
  { code: 'delivery', label: 'Delivery' },
];

export const orderTypeLabel = (code) => ORDER_TYPES.find((t) => t.code === code)?.label || '';

export default function KitchenSlip({ order }) {
  const shop = useShop();
  const { t, isUrdu } = useLang();
  const width = receiptWidth(shop.settings.receipt?.paper_width);
  return (
    <div className={`print-area mx-auto bg-white ${isUrdu ? '' : 'font-mono'} text-[13px] leading-snug text-black`} style={{ width, padding: '2mm' }}>
      <div className="text-center text-[15px] font-bold">{t('KITCHEN ORDER')}</div>
      <div className="text-center">{t(orderTypeLabel(order.order_type))}{order.table_no ? ` — ${t('Table {n}', { n: order.table_no })}` : ''}</div>
      {order.waiter && <div className="text-center text-[13px] font-bold">{t('Waiter')}: {order.waiter}</div>}
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
          <div>{t('Note')}: {order.notes}</div>
        </>
      )}
    </div>
  );
}
