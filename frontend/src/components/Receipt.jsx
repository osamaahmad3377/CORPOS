// Printable receipt for a sale (SaleResource with items). Size follows the
// receipt settings: roll width (58 / 80 mm / custom), printed width, left
// margin and text size (lib/printer.js). Shop branding
// at the top is white-label; the CorePOS/NextCore credit at the bottom is
// always printed (developer promotion) and is not a setting.
import { useShop } from '../lib/shop';
import { useLang } from '../lib/i18n';
import { date, num, qty, variantLabel } from '../lib/format';
import { orderTypeLabel, SLIP_FONT } from './KitchenSlip';
import { NEXTCORE, NextcoreLogo } from './Brand';
import { slipProps } from '../lib/printer';

// One clear font for the whole slip (SLIP_FONT), numbers in even columns,
// pure black — thermal printers print thin grey text faintly, so the text is
// medium weight.

function Rule({ kind = 'dashed' }) {
  const border = kind === 'double' ? '3px double #000' : kind === 'solid' ? '1.5px solid #000' : '1px dashed #000';
  return <div style={{ borderTop: border, margin: '1.6mm 0' }} />;
}

// label on the start side, value on the end side
function Row({ label, value, strong, big, small }) {
  return (
    <div className="flex items-baseline justify-between gap-3" style={{ fontWeight: strong ? 800 : undefined, fontSize: big ? '17px' : small ? '10.5px' : undefined }}>
      <span className="min-w-0">{label}</span>
      <span className="num shrink-0 text-end">{value}</span>
    </div>
  );
}

const ITEM_COLS = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 17% 22% 27%', columnGap: '1.5mm', alignItems: 'baseline' };

// Height of the shop logo on the bill, mm (Settings → Receipt).
export const LOGO_MM = { min: 6, max: 40, default: 16 };
export function receiptLogoMm(r = {}) {
  const n = Number(r?.logo_size);
  return Number.isFinite(n) && n > 0 ? Math.min(LOGO_MM.max, Math.max(LOGO_MM.min, Math.round(n))) : LOGO_MM.default;
}

function clock(v) {
  if (!v) return '';
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  return new Date(v).toLocaleTimeString(rtl ? 'en-GB' : 'en-PK', { hour: rtl ? '2-digit' : 'numeric', minute: '2-digit', hour12: !rtl });
}

// Developer credit at the bottom of every printed slip, one item per line:
// Software by NextCore / logo / website / email.
export function ReceiptCredit() {
  return (
    <div className="mt-2 border-t border-dashed border-black pt-2 text-center leading-tight" dir="ltr" style={{ fontFamily: SLIP_FONT, fontWeight: 500, color: '#000' }}>
      <div className="text-[10px]">Software by <span className="font-bold">{NEXTCORE.company}</span></div>
      <NextcoreLogo className="mx-auto my-1 h-5 brightness-0" mono /> {/* solid black: sharp on thermal paper */}
      <div className="text-[10px]">{NEXTCORE.website}</div>
      <div className="text-[10px]">{NEXTCORE.email}</div>
    </div>
  );
}

// preBill: the guest bill printed before payment (restaurants) — no paid lines.
// settings: unsaved settings for the live preview in Settings.
export default function Receipt({ sale, preBill = false, settings }) {
  const shop = useShop();
  const { t, isUrdu } = useLang();
  const s = settings || shop.settings;
  const slip = slipProps(s.receipt);
  const items = sale.items || [];
  // logo: on/off in Brand & look, height in Settings → Receipt (mm)
  const showLogo = (s.brand?.show_logo_on_receipt ?? '1') !== '0' && shop.logoUrl;
  const logoMm = receiptLogoMm(s.receipt);
  const showTax = s.receipt?.show_tax_line === '1' && Number(sale.tax_amount) > 0;
  const due = Number(sale.due_amount || 0);
  const pointsEarned = Number(sale.points_earned || 0);
  const pointsUsed = Number(sale.points_redeemed || 0);
  const discount = Number(sale.discount_amount || 0) + items.reduce((a, it) => a + Number(it.discount_per_item || 0) * Number(it.quantity || 0), 0);

  return (
    <div
      data-print="receipt"
      data-paper={slip['data-paper']}
      className="print-area slip mx-auto bg-white"
      style={{
        ...slip.style, padding: '2mm', color: '#000', background: '#fff', fontSize: '12px', fontWeight: 500,
        fontFamily: isUrdu ? 'var(--font-urdu)' : SLIP_FONT, lineHeight: isUrdu ? 2 : 1.35, fontVariantNumeric: 'tabular-nums',
      }}
    >
      {/* shop */}
      <div className="text-center">
        {showLogo && <img src={shop.logoUrl} alt="" className="mx-auto object-contain" style={{ height: `${logoMm}mm`, width: 'auto', maxWidth: '92%', marginBottom: '1.5mm', filter: 'grayscale(1) contrast(1.3)' }} />}
        <div dir="auto" style={{ fontSize: '19px', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.01em' }}>{shop.shopName}</div>
        {s.shop?.address && <div dir="auto" style={{ fontSize: '11px', marginTop: '0.8mm' }}>{s.shop.address}</div>}
        {s.shop?.phone && <div style={{ fontSize: '11px' }}>{t('Phone')}: <span className="num">{s.shop.phone}</span></div>}
        {s.receipt?.header && <div dir="auto" style={{ fontSize: '11px', marginTop: '1mm' }}>{s.receipt.header}</div>}
      </div>

      <Rule kind="solid" />
      <div className="text-center" style={{ fontSize: '12.5px', fontWeight: 800, letterSpacing: isUrdu ? 0 : '0.14em' }}>{preBill ? t('BILL') : t('SALE RECEIPT')}</div>
      <Rule kind="solid" />

      {/* bill details */}
      <Row label={t('Bill #')} value={<span style={{ fontWeight: 700 }}>{sale.invoice_number}</span>} />
      <Row label={t('Date')} value={date(sale.sale_date)} />
      <Row label={t('Time')} value={clock(sale.sale_date)} />
      {sale.cashier && <Row label={t('Cashier')} value={sale.cashier} />}
      {sale.customer && <Row label={t('Customer')} value={sale.customer} />}
      {sale.order_type && <Row label={t('Order')} value={`${t(orderTypeLabel(sale.order_type))}${sale.table_no ? ` · ${t('Table {n}', { n: sale.table_no })}` : ''}`} />}
      {sale.waiter && <Row label={t('Waiter')} value={sale.waiter} />}

      {sale.order_type === 'delivery' && (sale.delivery_name || sale.delivery_phone || sale.delivery_address) && (
        <>
          <Rule />
          <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: isUrdu ? 0 : '0.1em' }}>{t('DELIVER TO')}</div>
          {sale.delivery_name && <div style={{ fontSize: '14px', fontWeight: 800 }}>{sale.delivery_name}</div>}
          {sale.delivery_phone && <div className="num" dir="ltr" style={{ fontSize: '14px', fontWeight: 800 }}>{sale.delivery_phone}</div>}
          {sale.delivery_address && <div dir="auto">{sale.delivery_address}</div>}
          {sale.delivery_area && <div style={{ fontWeight: 700 }}>{sale.delivery_area}</div>}
          {sale.rider && <Row label={t('Rider')} value={`${sale.rider}${sale.rider_phone ? ` · ${sale.rider_phone}` : ''}`} />}
        </>
      )}

      {/* items: name on its own line, then quantity, price and amount in columns */}
      <Rule kind="solid" />
      <div style={{ ...ITEM_COLS, fontSize: '10.5px', fontWeight: 800 }}>
        <span>{t('Item')}</span>
        <span className="text-end">{t('Qty')}</span>
        <span className="text-end">{t('Price')}</span>
        <span className="text-end">{t('Amount')}</span>
      </div>
      <Rule />
      {items.map((it) => {
        const opts = variantLabel(it);
        return (
          <div key={it.id} style={{ marginBottom: '1.2mm', breakInside: 'avoid' }}>
            <div dir="auto" style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{it.product_name}{opts ? ` (${opts})` : ''}</div>
            <div style={ITEM_COLS}>
              <span />
              <span className="num text-end">{qty(it.quantity)}{it.unit && it.unit !== 'pcs' ? ` ${it.unit}` : ''}</span>
              <span className="num text-end">{num(it.unit_price)}</span>
              <span className="num text-end" style={{ fontWeight: 700 }}>{num(it.total_price)}</span>
            </div>
            {Number(it.discount_per_item) > 0 && (
              <div style={{ ...ITEM_COLS, fontSize: '10.5px' }}>
                <span style={{ gridColumn: 'span 3' }}>{it.promotion_name || t('Discount')}</span>
                <span className="num text-end">-{num(Number(it.discount_per_item) * Number(it.quantity || 1))}</span>
              </div>
            )}
            {it.serials?.length > 0 && <div style={{ fontSize: '10.5px' }}>S/N: <span className="num">{it.serials.join(', ')}</span></div>}
            {it.warranty_months > 0 && <div style={{ fontSize: '10.5px' }}>{t('Warranty: {n} months', { n: it.warranty_months })}</div>}
          </div>
        );
      })}

      {/* totals */}
      <Rule />
      <Row label={t('Subtotal')} value={num(sale.subtotal)} />
      {Number(sale.discount_amount) > 0 && <Row label={t('Discount')} value={`-${num(sale.discount_amount)}`} />}
      {showTax && <Row label={shop.taxLabel} value={num(sale.tax_amount)} />}
      {Number(sale.delivery_fee) > 0 && <Row label={t('Delivery charge')} value={num(sale.delivery_fee)} />}
      <Rule kind="double" />
      <Row label={t('TOTAL')} value={`Rs ${num(sale.grand_total)}`} strong big />
      <Rule kind="double" />
      {Number(sale.refunded_amount) > 0 && <Row label={t('Returned')} value={`-${num(sale.refunded_amount)}`} />}
      {preBill && sale.order_type === 'delivery' ? (
        <div className="text-center" style={{ border: '2px solid #000', padding: '1.5mm', marginTop: '1.5mm', fontSize: '15px', fontWeight: 800 }}>
          {t('CASH TO COLLECT')}: <span className="num">Rs {num(Math.max(0, Number(sale.grand_total) - Number(sale.paid_amount || 0)))}</span>
        </div>
      ) : preBill ? (
        <div className="text-center" style={{ fontSize: '11px', fontWeight: 700 }}>{t('Not paid yet — please pay at the counter')}</div>
      ) : (
        <>
          <Row label={`${t('Paid')} (${t(shop.paymentLabel(sale.payment_method))})`} value={num(sale.payment_received)} />
          {Number(sale.change_amount) > 0 && <Row label={t('Change')} value={num(sale.change_amount)} />}
          {due > 0 && <Row label={t('Balance due')} value={`Rs ${num(due)}`} strong />}
        </>
      )}
      {discount > 0 && !preBill && <div className="text-center" style={{ fontSize: '11px', fontWeight: 700, marginTop: '1mm' }}>{t('You saved Rs {amount}', { amount: num(discount) })}</div>}
      {(pointsEarned > 0 || pointsUsed > 0) && (
        <div style={{ fontSize: '10.5px', marginTop: '1mm' }}>
          {pointsUsed > 0 && <Row small label={t('Points used')} value={pointsUsed} />}
          {pointsEarned > 0 && <Row small label={t('Points earned')} value={pointsEarned} />}
        </div>
      )}

      {/* footer */}
      <Rule />
      {s.receipt?.footer && <div dir="auto" className="text-center" style={{ fontSize: '11px' }}>{s.receipt.footer}</div>}
      <div className="text-center" style={{ fontWeight: 800, marginTop: '0.8mm' }}>{t('Thank you! Please come again.')}</div>
      <ReceiptCredit />
    </div>
  );
}
