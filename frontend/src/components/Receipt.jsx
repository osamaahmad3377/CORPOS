// Printable receipt for a sale (SaleResource with items). Width follows the
// receipt.paper_width setting (58mm / 80mm thermal printers).
import { useShop } from '../lib/shop';
import { dateTime, money, qty, variantLabel } from '../lib/format';
import { orderTypeLabel } from './KitchenSlip';
import { useLang } from '../lib/i18n';

export default function Receipt({ sale }) {
  const shop = useShop();
  const { t, isUrdu } = useLang();
  const s = shop.settings;
  const width = s.receipt?.paper_width === '58mm' ? '58mm' : '80mm';
  const showTax = s.receipt?.show_tax_line === '1' && Number(sale.tax_amount) > 0;
  const due = Number(sale.due_amount || 0);

  return (
    <div className={`print-area mx-auto bg-white ${isUrdu ? '' : 'font-mono'} text-[12px] leading-snug text-black`} style={{ width, padding: '2mm' }}>
      <div className="text-center">
        <div className="text-[15px] font-bold">{shop.shopName}</div>
        {s.shop?.address && <div>{s.shop.address}</div>}
        {s.shop?.phone && <div>{t('Phone')}: <span className="num">{s.shop.phone}</span></div>}
        {s.receipt?.header && <div className="mt-1">{s.receipt.header}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>{t('Bill #')}</span><span>{sale.invoice_number}</span></div>
      <div className="flex justify-between"><span>{t('Date')}</span><span>{dateTime(sale.sale_date)}</span></div>
      {sale.cashier && <div className="flex justify-between"><span>{t('Cashier')}</span><span>{sale.cashier}</span></div>}
      {sale.customer && <div className="flex justify-between"><span>{t('Customer')}</span><span>{sale.customer}</span></div>}
      {sale.order_type && <div className="flex justify-between"><span>{t('Order')}</span><span>{t(orderTypeLabel(sale.order_type))}{sale.table_no ? ` · ${t('Table {n}', { n: sale.table_no })}` : ''}</span></div>}
      <div className="my-2 border-t border-dashed border-black" />
      {(sale.items || []).map((it) => (
        <div key={it.id} className="mb-1">
          <div>{it.product_name}{variantLabel(it) ? ` (${variantLabel(it)})` : ''}</div>
          <div className="flex justify-between">
            <span>{qty(it.quantity)} {it.unit && it.unit !== 'pcs' ? it.unit : ''} x {money(it.unit_price)}{Number(it.discount_per_item) > 0 ? ` -${money(it.discount_per_item)}` : ''}</span>
            <span>{money(it.total_price)}</span>
          </div>
          {it.serials?.length > 0 && <div className="text-[11px]">S/N: {it.serials.join(', ')}</div>}
          {it.warranty_months > 0 && <div className="text-[11px]">{t('Warranty: {n} months', { n: it.warranty_months })}</div>}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>{t('Subtotal')}</span><span>{money(sale.subtotal)}</span></div>
      {Number(sale.discount_amount) > 0 && <div className="flex justify-between"><span>{t('Discount')}</span><span>-{money(sale.discount_amount)}</span></div>}
      {showTax && <div className="flex justify-between"><span>{shop.taxLabel}</span><span>{money(sale.tax_amount)}</span></div>}
      <div className="flex justify-between text-[14px] font-bold"><span>{t('TOTAL')}</span><span>{money(sale.grand_total)}</span></div>
      {Number(sale.refunded_amount) > 0 && <div className="flex justify-between"><span>{t('Returned')}</span><span>-{money(sale.refunded_amount)}</span></div>}
      <div className="flex justify-between"><span>{t('Paid')} ({t(shop.paymentLabel(sale.payment_method))})</span><span>{money(sale.payment_received)}</span></div>
      {Number(sale.change_amount) > 0 && <div className="flex justify-between"><span>{t('Change')}</span><span>{money(sale.change_amount)}</span></div>}
      {due > 0 && <div className="flex justify-between font-bold"><span>{t('Balance due')}</span><span>{money(due)}</span></div>}
      <div className="my-2 border-t border-dashed border-black" />
      {s.receipt?.footer && <div className="text-center">{s.receipt.footer}</div>}
      <div className="mt-1 text-center text-[10px]" dir="ltr">Powered by CorePOS</div>
    </div>
  );
}
