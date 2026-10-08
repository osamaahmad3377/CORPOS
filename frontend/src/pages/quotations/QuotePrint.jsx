// Printable quotation: full A4 page, or a narrow 80mm receipt-printer slip.
// Lives in .print-area so window.print() prints only this.
import { useShop } from '../../lib/shop';
import { useLang } from '../../lib/i18n';
import { date, money, qty, variantLabel } from '../../lib/format';
import { ReceiptCredit } from '../../components/Receipt';

export function QuotePrint({ quote: q, paper = 'a4' }) {
  return paper === '80mm' ? <SlipQuote q={q} /> : <PageQuote q={q} />;
}

function useUnit() {
  const shop = useShop();
  const { t } = useLang();
  return (code) => t(shop.unitLabel(code));
}

function PageQuote({ q }) {
  const shop = useShop();
  const { t } = useLang();
  const unit = useUnit();
  const s = shop.settings.shop || {};
  const items = q.items || [];
  const anyDiscount = items.some((i) => Number(i.discount_per_item) > 0);
  const cell = 'border-b border-slate-300 px-2 py-2';

  return (
    <div className="print-area mx-auto w-full max-w-[210mm] bg-white p-6 text-[13px] leading-normal shadow-sm sm:p-10 print:max-w-none print:p-0 print:shadow-none" style={{ color: '#000', background: '#fff' }}>
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {shop.logoUrl && <img src={shop.logoUrl} alt="" className="max-h-16 max-w-28 object-contain" />}
          <div className="min-w-0">
            <div className="text-xl font-bold leading-tight">{shop.shopName}</div>
            {s.address && <div>{s.address}</div>}
            {s.phone && <div>{t('Phone')}: <span className="num">{s.phone}</span></div>}
            {s.email && <div><span className="num">{s.email}</span></div>}
          </div>
        </div>
        <div className="text-end">
          <div className="text-2xl font-bold tracking-wide">{t('QUOTATION')}</div>
          <div className="mt-1">{t('No.')} <span className="num font-semibold">{q.quote_number}</span></div>
          <div>{t('Date')}: <span className="num">{date(q.created_at)}</span></div>
          {q.valid_until && <div>{t('Valid until')}: <span className="num font-semibold">{date(q.valid_until)}</span></div>}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-slate-600">{t('For')}</div>
        <div className="font-semibold">{q.customer_name || t('Walk-in customer')}</div>
        {q.customer_phone && <div><span className="num">{q.customer_phone}</span></div>}
      </div>

      <table className="mt-5 w-full border-collapse text-start">
        <thead>
          <tr className="border-b-2 border-black text-xs">
            <th className="px-2 py-2 text-start">#</th>
            <th className="px-2 py-2 text-start">{t('Item')}</th>
            <th className="px-2 py-2 text-end">{t('Qty')}</th>
            <th className="px-2 py-2 text-end">{t('Price')}</th>
            {anyDiscount && <th className="px-2 py-2 text-end">{t('Discount')}</th>}
            <th className="px-2 py-2 text-end">{t('Total')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={i.id}>
              <td className={cell}><span className="num">{n + 1}</span></td>
              <td className={cell}>{i.product_name || i.sku}{variantLabel(i) ? ` · ${variantLabel(i)}` : ''}</td>
              <td className={`${cell} whitespace-nowrap text-end`}><span className="num">{qty(i.quantity)}</span> {unit(i.unit)}</td>
              <td className={`${cell} whitespace-nowrap text-end`}><span className="num">{money(i.unit_price)}</span></td>
              {anyDiscount && <td className={`${cell} whitespace-nowrap text-end`}>{Number(i.discount_per_item) > 0 ? <span className="num">-{money(i.discount_per_item)}</span> : ''}</td>}
              <td className={`${cell} whitespace-nowrap text-end font-medium`}><span className="num">{money(i.total_price)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-64 space-y-1">
          <div className="flex justify-between gap-4"><span>{t('Items total')}</span><span className="num">{money(q.subtotal)}</span></div>
          {Number(q.discount_amount) > 0 && <div className="flex justify-between gap-4"><span>{t('Discount')}</span><span className="num">-{money(q.discount_amount)}</span></div>}
          {Number(q.tax_amount) > 0 && <div className="flex justify-between gap-4"><span>{t(shop.taxLabel)}</span><span className="num">{money(q.tax_amount)}</span></div>}
          <div className="flex justify-between gap-4 border-t-2 border-black pt-1 text-base font-bold"><span>{t('TOTAL')}</span><span className="num">{money(q.grand_total)}</span></div>
        </div>
      </div>

      {q.notes && <div dir="auto" className="mt-5 whitespace-pre-line rounded border border-slate-300 px-3 py-2 text-start">{q.notes}</div>}
      <div className="mt-6 text-center">
        {q.valid_until && <div className="font-semibold">{t('Prices valid until {date}.', { date: date(q.valid_until) })}</div>}
        <div className="text-xs text-slate-600">{t('This is an estimate, not a bill. Thank you!')}</div>
      </div>
      <div className="mx-auto mt-6 max-w-72"><ReceiptCredit /></div>
    </div>
  );
}

function SlipQuote({ q }) {
  const shop = useShop();
  const { t, isUrdu } = useLang();
  const unit = useUnit();
  const s = shop.settings.shop || {};
  const width = shop.settings.receipt?.paper_width === '58mm' ? '58mm' : '80mm';
  const Line = () => <div className="my-2 border-t border-dashed border-black" />;
  const Row = ({ label, value, bold }) => (
    <div className={`flex justify-between gap-2 ${bold ? 'text-[14px] font-bold' : ''}`}><span>{label}</span><span className="num">{value}</span></div>
  );

  return (
    <div className={`print-area mx-auto bg-white ${isUrdu ? '' : 'font-mono'} text-[12px] leading-snug shadow-sm print:shadow-none`} style={{ width, padding: '2mm', color: '#000', background: '#fff' }}>
      <div className="text-center">
        {shop.logoUrl && <img src={shop.logoUrl} alt="" className="mx-auto mb-1 max-h-16 max-w-[70%] object-contain" style={{ filter: 'grayscale(1) contrast(1.2)' }} />}
        <div className="text-[16px] font-bold leading-tight">{shop.shopName}</div>
        {s.address && <div>{s.address}</div>}
        {s.phone && <div>{t('Phone')}: <span className="num">{s.phone}</span></div>}
        <div className="mt-2 text-[15px] font-bold tracking-wide">{t('QUOTATION')}</div>
      </div>
      <Line />
      <Row label={t('No.')} value={q.quote_number} />
      <Row label={t('Date')} value={date(q.created_at)} />
      {q.valid_until && <Row label={t('Valid until')} value={date(q.valid_until)} />}
      {q.customer_name && <div className="flex justify-between gap-2"><span>{t('For')}</span><span>{q.customer_name}</span></div>}
      {q.customer_phone && <Row label={t('Phone')} value={q.customer_phone} />}
      <Line />
      {(q.items || []).map((i) => (
        <div key={i.id} className="mb-1.5">
          <div className="font-semibold">{i.product_name || i.sku}{variantLabel(i) ? ` (${variantLabel(i)})` : ''}</div>
          <div className="flex justify-between gap-2">
            <span><span className="num">{qty(i.quantity)}</span> {i.unit && i.unit !== 'pcs' ? unit(i.unit) : ''} × <span className="num">{money(i.unit_price)}</span></span>
            <span className="num">{money(i.total_price)}</span>
          </div>
          {Number(i.discount_per_item) > 0 && <div className="flex justify-between text-[11px]"><span>{t('Discount')}</span><span className="num">-{money(i.discount_per_item)}</span></div>}
        </div>
      ))}
      <Line />
      <Row label={t('Subtotal')} value={money(q.subtotal)} />
      {Number(q.discount_amount) > 0 && <Row label={t('Discount')} value={`-${money(q.discount_amount)}`} />}
      {Number(q.tax_amount) > 0 && <Row label={t(shop.taxLabel)} value={money(q.tax_amount)} />}
      <Row label={t('TOTAL')} value={money(q.grand_total)} bold />
      {q.notes && <><Line /><div dir="auto" className="whitespace-pre-line text-start">{q.notes}</div></>}
      <Line />
      <div className="text-center">
        {q.valid_until && <div className="font-semibold">{t('Prices valid until {date}.', { date: date(q.valid_until) })}</div>}
        <div className="text-[11px]">{t('This is an estimate, not a bill. Thank you!')}</div>
      </div>
      <ReceiptCredit />
    </div>
  );
}
