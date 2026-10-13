// Kitchen order ticket (KOT): what to cook, for which table — no prices.
import { useShop } from '../lib/shop';
import { qty, variantLabel } from '../lib/format';
import { useLang } from '../lib/i18n';
import { slipProps } from '../lib/printer';

export const ORDER_TYPES = [
  { code: 'dine_in', label: 'Dine-in' },
  { code: 'takeaway', label: 'Takeaway' },
  { code: 'delivery', label: 'Delivery' },
];

export const orderTypeLabel = (code) => ORDER_TYPES.find((t) => t.code === code)?.label || '';

// One clear font for every printed slip (bills use it too), pure black.
export const SLIP_FONT = '"Inter Variable", "Segoe UI", Arial, sans-serif';

// Read across a busy kitchen: big order type / table, quantities in bold
// boxes, one dish per line, the note in a box.
export default function KitchenSlip({ order }) {
  const shop = useShop();
  const { t, isUrdu } = useLang();
  const slip = slipProps(shop.settings.receipt);
  const rule = (kind = 'dashed') => <div style={{ borderTop: kind === 'solid' ? '1.5px solid #000' : '1px dashed #000', margin: '1.6mm 0' }} />;
  const where = order.table_no ? t('Table {n}', { n: order.table_no }) : t(orderTypeLabel(order.order_type));
  return (
    <div
      data-print="kitchen"
      data-paper={slip['data-paper']}
      className="print-area slip mx-auto bg-white"
      style={{ ...slip.style, padding: '2mm', color: '#000', background: '#fff', fontSize: '13px', fontWeight: 500, fontFamily: isUrdu ? 'var(--font-urdu)' : SLIP_FONT, lineHeight: isUrdu ? 2 : 1.3 }}
    >
      <div className="text-center" style={{ fontSize: '12px', fontWeight: 800, letterSpacing: isUrdu ? 0 : '0.16em' }}>{t('KITCHEN ORDER')}</div>
      {rule('solid')}
      <div className="text-center" style={{ fontSize: '24px', fontWeight: 800, lineHeight: 1.15 }}>{where}</div>
      {order.table_no && <div className="text-center" style={{ fontSize: '12px', fontWeight: 700 }}>{t(orderTypeLabel(order.order_type))}</div>}
      {order.waiter && <div className="text-center" style={{ fontSize: '13px', fontWeight: 700 }}>{t('Waiter')}: {order.waiter}</div>}
      {order.order_type === 'delivery' && (order.delivery_name || order.delivery_area) && (
        <div className="text-center" dir="auto" style={{ fontSize: '13px', fontWeight: 700 }}>{[order.delivery_name, order.delivery_area].filter(Boolean).join(' · ')}</div>
      )}
      <div className="flex justify-between" style={{ fontSize: '11px', marginTop: '1mm' }}>
        <span className="num">{order.invoice_number}</span>
        <span className="num">{new Date().toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      {rule('solid')}
      {order.items.map((it, i) => (
        <div key={i} className="flex items-start" style={{ gap: '2mm', marginBottom: '1.4mm', breakInside: 'avoid' }}>
          <span className="num shrink-0 text-center" style={{ minWidth: '9mm', border: '1.5px solid #000', borderRadius: '1mm', fontSize: '15px', fontWeight: 800, lineHeight: 1.35 }}>{qty(it.quantity)}</span>
          <span dir="auto" style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
            {it.product_name}{variantLabel(it) ? ` (${variantLabel(it)})` : ''}
          </span>
        </div>
      ))}
      {order.notes && (
        <div dir="auto" style={{ border: '1.5px solid #000', padding: '1.5mm', marginTop: '1.5mm', fontSize: '13px', fontWeight: 700 }}>
          {t('Note')}: {order.notes}
        </div>
      )}
      {rule()}
      <div className="text-center" style={{ fontSize: '10.5px' }}>{t('Qty')}: <span className="num">{qty(order.items.reduce((a, it) => a + Number(it.quantity || 0), 0))}</span></div>
    </div>
  );
}
