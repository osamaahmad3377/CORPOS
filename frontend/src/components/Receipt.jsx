// Printable receipt for a sale (SaleResource with items). Width follows the
// receipt.paper_width setting (58mm / 80mm thermal printers). Shop branding
// at the top is white-label; the CorePOS/NextCore credit at the bottom is
// always printed (developer promotion) and is not a setting.
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { dateTime, money, qty, variantLabel } from '../lib/format';
import { orderTypeLabel } from './KitchenSlip';
import { NEXTCORE, NextcoreLogo } from './Brand';
import { receiptWidth } from '../lib/printer';

function Row({ label, value, strong, big }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'font-bold' : ''} ${big ? 'text-[15px]' : ''}`}>
      <span>{label}</span><span className="num">{value}</span>
    </div>
  );
}

export function ReceiptCredit() {
  return (
    <div className="mt-2 border-t border-dashed border-black pt-2 text-center" dir="ltr" style={{ fontFamily: 'Inter Variable, Arial, sans-serif' }}>
      <div className="flex items-center justify-center gap-1.5" style={{ color: '#000' }}>
        <span className="text-[9px]">Software by</span>
        <NextcoreLogo className="h-4" mono />
      </div>
      <div className="text-[9px] leading-tight">{NEXTCORE.product} · {NEXTCORE.website}</div>
      <div className="text-[9px] leading-tight">{NEXTCORE.email}</div>
    </div>
  );
}

// preBill: the guest bill printed before payment (restaurants) — no paid lines.
export default function Receipt({ sale, preBill = false }) {
  const shop = useShop();
  const { t, isUrdu } = useLang();
  const s = shop.settings;
  const width = receiptWidth(s.receipt?.paper_width);
  const showTax = s.receipt?.show_tax_line === '1' && Number(sale.tax_amount) > 0;
  const due = Number(sale.due_amount || 0);
  const pointsEarned = Number(sale.points_earned || 0);
  const pointsUsed = Number(sale.points_redeemed || 0);

  return (
    <div className={`print-area mx-auto bg-white ${isUrdu ? '' : 'font-mono'} text-[12px] leading-snug`} style={{ width, padding: '2mm', color: '#000', background: '#fff', lineHeight: isUrdu ? 2.1 : undefined }}>
      <div className="text-center">
        {shop.logoOnReceipt && shop.logoUrl && <img src={shop.logoUrl} alt="" className="mx-auto mb-1 max-h-16 max-w-[70%] object-contain" style={{ filter: 'grayscale(1) contrast(1.2)' }} />}
        <div className="text-[16px] font-bold leading-tight">{shop.shopName}</div>
        {s.shop?.address && <div>{s.shop.address}</div>}
        {s.shop?.phone && <div>{t('Phone')}: <span className="num">{s.shop.phone}</span></div>}
        {s.receipt?.header && <div className="mt-1 italic">{s.receipt.header}</div>}
      </div>

      {preBill && <div className="mt-2 text-center text-[14px] font-bold">{t('BILL')}</div>}
      <div className="my-2 border-t border-dashed border-black" />
      <Row label={t('Bill #')} value={sale.invoice_number} />
      <Row label={t('Date')} value={dateTime(sale.sale_date)} />
      {sale.cashier && <div className="flex justify-between"><span>{t('Cashier')}</span><span>{sale.cashier}</span></div>}
      {sale.customer && <div className="flex justify-between"><span>{t('Customer')}</span><span>{sale.customer}</span></div>}
      {sale.order_type && <div className="flex justify-between"><span>{t('Order')}</span><span>{t(orderTypeLabel(sale.order_type))}{sale.table_no ? ` · ${t('Table {n}', { n: sale.table_no })}` : ''}</span></div>}

      <div className="my-2 border-t border-dashed border-black" />
      {(sale.items || []).map((it) => (
        <div key={it.id} className="mb-1.5">
          <div className="font-semibold">{it.product_name}{variantLabel(it) ? ` (${variantLabel(it)})` : ''}</div>
          <div className="flex justify-between">
            <span className="num">{qty(it.quantity)}{it.unit && it.unit !== 'pcs' ? ` ${it.unit}` : ''} × {money(it.unit_price)}</span>
            <span className="num">{money(it.total_price)}</span>
          </div>
          {Number(it.discount_per_item) > 0 && <div className="flex justify-between text-[11px]"><span>{it.promotion_name || t('Discount')}</span><span className="num">-{money(it.discount_per_item)}</span></div>}
          {it.serials?.length > 0 && <div className="text-[11px]">S/N: <span className="num">{it.serials.join(', ')}</span></div>}
          {it.warranty_months > 0 && <div className="text-[11px]">{t('Warranty: {n} months', { n: it.warranty_months })}</div>}
        </div>
      ))}

      <div className="my-2 border-t border-dashed border-black" />
      <Row label={t('Subtotal')} value={money(sale.subtotal)} />
      {Number(sale.discount_amount) > 0 && <Row label={t('Discount')} value={`-${money(sale.discount_amount)}`} />}
      {showTax && <Row label={shop.taxLabel} value={money(sale.tax_amount)} />}
      <div className="my-1 border-t border-black" />
      <Row label={t('TOTAL')} value={money(sale.grand_total)} strong big />
      {Number(sale.refunded_amount) > 0 && <Row label={t('Returned')} value={`-${money(sale.refunded_amount)}`} />}
      {preBill ? (
        <div className="mt-1 text-center text-[11px]">{t('Not paid yet — please pay at the counter')}</div>
      ) : (
        <>
          <Row label={`${t('Paid')} (${t(shop.paymentLabel(sale.payment_method))})`} value={money(sale.payment_received)} />
          {Number(sale.change_amount) > 0 && <Row label={t('Change')} value={money(sale.change_amount)} />}
          {due > 0 && <Row label={t('Balance due')} value={money(due)} strong />}
        </>
      )}
      {(pointsEarned > 0 || pointsUsed > 0) && (
        <div className="mt-1 text-[11px]">
          {pointsUsed > 0 && <div>{t('Points used: {n}', { n: pointsUsed })}</div>}
          {pointsEarned > 0 && <div>{t('Points earned: {n}', { n: pointsEarned })}</div>}
        </div>
      )}

      {s.receipt?.footer && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="text-center">{s.receipt.footer}</div>
        </>
      )}
      <div className="mt-1 text-center font-semibold">{t('Thank you! Please come again.')}</div>
      <ReceiptCredit />
    </div>
  );
}
