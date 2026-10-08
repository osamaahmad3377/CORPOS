// WhatsApp sharing: build neat plain-text messages (bill, quotation, udhaar
// reminder, account statement) in the current language and open them with
// wa.me. In the desktop app window.open() hands https links to the system
// browser, which opens WhatsApp (app or web).
//
//   import { openWhatsApp, buildReceiptText } from '../../lib/whatsapp';
//   openWhatsApp(customerPhone, buildReceiptText(sale, shop, t));
//
// `shop` is the object from useShop(); `t` from useT(). WhatsApp shows *text*
// in bold. Every message ends with the software credit line.
import { date, dateTime, money, qty, variantLabel } from './format';

export const SOFTWARE_LINE = 'Software: CorePOS · nextcore.com.pk';
const LINE = '------------------------------';
const n = (v) => Number(v || 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;
// Left-to-right marks keep "-Rs 40", dates and phone numbers in the right
// order when the message is in Urdu (right-to-left). Invisible in English.
const ltr = (x) => `\u200E${x}\u200E`;
const m = (v) => ltr(money(v));
const neg = (v) => ltr(`-${money(v)}`);
const d = (v) => ltr(date(v));

// '0300-1234567' / '+92 300 1234567' / '0092300…' / '300 1234567' -> '923001234567'.
// Other international numbers are kept as digits; returns '' when unusable.
export function normalisePkPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('92') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 11) return `92${d.slice(1)}`;
  if (d.startsWith('3') && d.length === 10) return `92${d}`;
  return d.length >= 8 && !d.startsWith('0') ? d : '';
}

// Open WhatsApp with the message ready to send. With no (valid) phone the user
// picks the contact inside WhatsApp.
export function openWhatsApp(phone, text) {
  const p = normalisePkPhone(phone);
  const url = `https://wa.me/${p}?text=${encodeURIComponent(text || '')}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function shopHeader(shop, t) {
  const s = shop?.settings?.shop || {};
  return [
    `*${shop?.shopName || ''}*`,
    s.address,
    s.phone ? `${t('Phone')}: ${ltr(s.phone)}` : null,
  ];
}

function unitText(shop, t, unit) {
  return !unit || unit === 'pcs' ? '' : ` ${t(shop?.unitLabel ? shop.unitLabel(unit) : unit)}`;
}

function itemLines(items, shop, t) {
  const out = [];
  for (const it of items || []) {
    const label = variantLabel(it);
    out.push(`${it.product_name || t('Item')}${label ? ` (${label})` : ''}`);
    const disc = n(it.discount_per_item) > 0 ? ` ${neg(it.discount_per_item)}` : '';
    out.push(`   ${ltr(qty(it.quantity))}${unitText(shop, t, it.unit)} × ${m(it.unit_price)}${disc} = ${m(it.total_price)}`);
  }
  return out;
}

function totalLines(doc, shop, t) {
  return [
    `${t('Subtotal')}: ${m(doc.subtotal)}`,
    n(doc.discount_amount) > 0 ? `${t('Discount')}: ${neg(doc.discount_amount)}` : null,
    n(doc.tax_amount) > 0 ? `${t(shop?.taxLabel || 'Tax')}: ${m(doc.tax_amount)}` : null,
    `*${t('Total')}: ${m(doc.grand_total)}*`,
  ];
}

// Lines with Urdu get a right-to-left mark so WhatsApp lays them out right-to-left
// even when they start with a name or number.
const rtlFix = (l) => (/[\u0600-\u06FF]/.test(l) && !/^[\u200F\u0600-\u06FF]/.test(l) ? `\u200F${l}` : l);
const join = (lines) => lines.filter((l) => l !== null && l !== undefined && l !== false).map((l) => String(l).split('\n').map(rtlFix).join('\n')).join('\n');

// A sale (SaleResource with items) as a plain-text bill.
export function buildReceiptText(sale, shop, t) {
  const held = sale.status === 'held';
  const refunded = n(sale.refunded_amount);
  const net = r2(n(sale.grand_total) - refunded);
  const due = held ? 0 : n(sale.due_amount);
  const paid = held ? 0 : Math.max(0, r2(net - due));
  const footer = shop?.settings?.receipt?.footer;
  return join([
    ...shopHeader(shop, t),
    LINE,
    `${t('Bill #')}: ${sale.invoice_number}`,
    `${t('Date')}: ${ltr(dateTime(sale.sale_date))}`,
    sale.customer ? `${t('Customer')}: ${sale.customer}` : null,
    LINE,
    ...itemLines(sale.items, shop, t),
    LINE,
    ...totalLines(sale, shop, t),
    refunded > 0 ? `${t('Returned')}: ${neg(refunded)}` : null,
    held ? null : `${t('Paid')}: ${m(paid)}`,
    due > 0 ? `*${t('Balance due')}: ${m(due)}*` : null,
    LINE,
    footer || null,
    t('Thank you for shopping with us.'),
    '',
    SOFTWARE_LINE,
  ]);
}

// A quotation (QuotationResource with items) as plain text.
export function buildQuoteText(quote, shop, t) {
  return join([
    ...shopHeader(shop, t),
    LINE,
    `*${t('QUOTATION')}* ${quote.quote_number}`,
    `${t('Date')}: ${d(quote.created_at)}`,
    quote.customer_name ? `${t('For')}: ${quote.customer_name}` : null,
    quote.valid_until ? `${t('Valid until')}: ${d(quote.valid_until)}` : null,
    LINE,
    ...itemLines(quote.items, shop, t),
    LINE,
    ...totalLines(quote, shop, t),
    quote.notes ? `\n${t('Note')}: ${quote.notes}` : null,
    LINE,
    quote.valid_until ? t('Prices valid until {date}.', { date: d(quote.valid_until) }) : null,
    t('This is an estimate, not a bill. Thank you!'),
    '',
    SOFTWARE_LINE,
  ]);
}

// Polite udhaar (credit) reminder for a customer.
export function buildUdhaarReminder(customer, amountDue, shop, t) {
  const phone = shop?.settings?.shop?.phone;
  return join([
    t('Assalam-o-Alaikum {name},', { name: customer?.name || '' }),
    '',
    t('This is a friendly reminder from {shop}.', { shop: shop?.shopName || '' }),
    `${t('Amount still owed')}: *${m(amountDue)}*`,
    t('Please pay when you can. If you have already paid, please ignore this message.'),
    '',
    t('Thank you!'),
    `*${shop?.shopName || ''}*`,
    phone ? `${t('Phone')}: ${ltr(phone)}` : null,
    '',
    SOFTWARE_LINE,
  ]);
}

// Short account statement: totals + the bills still owed (oldest first).
// bills = SaleResource rows of this customer.
export function buildStatementText(customer, bills, shop, t) {
  const done = (bills || []).filter((b) => b.status !== 'held');
  const dueOf = (b) => n(b.due_amount);
  const total = done.reduce((a, b) => a + n(b.grand_total) - n(b.refunded_amount), 0);
  const due = done.reduce((a, b) => a + dueOf(b), 0);
  const unpaid = done.filter((b) => dueOf(b) > 0).sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));
  const shown = unpaid.slice(0, 20);
  return join([
    ...shopHeader(shop, t),
    LINE,
    `*${t('Account statement')}*`,
    `${t('Customer')}: ${customer?.name || ''}`,
    `${t('Date')}: ${d(new Date())}`,
    LINE,
    `${t('Bills')}: ${done.length}`,
    `${t('Total bought')}: ${m(total)}`,
    `${t('Paid')}: ${m(Math.max(0, total - due))}`,
    `*${t('Amount still owed')}: ${m(due)}*`,
    ...(shown.length ? [LINE, t('Unpaid bills:'), ...shown.map((b) => `${d(b.sale_date)} · ${ltr(b.invoice_number)} · ${m(dueOf(b))}`)] : []),
    unpaid.length > shown.length ? t('…and {n} more', { n: unpaid.length - shown.length }) : null,
    LINE,
    t('Thank you for shopping with us.'),
    '',
    SOFTWARE_LINE,
  ]);
}
