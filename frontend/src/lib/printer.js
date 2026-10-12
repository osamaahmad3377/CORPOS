// Printing. In the desktop app the user picks a printer per job type once
// (Settings → Printers, saved on this computer) and we print straight to it,
// no dialog. Without a choice — or in a normal browser — the system print
// dialog opens. Only the element with class "print-area" is printed.
//
//   await printNow('receipt' | 'label' | 'document')
const KEY = 'corepos_printers';

export function printerPrefs() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export function savePrinterPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export const isDesktop = () => typeof window !== 'undefined' && !!window.coreposDesktop;

export async function listPrinters() {
  if (!isDesktop()) return [];
  try { return await window.coreposDesktop.printers(); } catch { return []; }
}

// ---------------------------------------------------------------- roll size
// Thermal rolls print ~72 mm of an 80 mm roll (~48 mm of 58 mm). The shop can
// pick another roll width and fine-tune the printed width, left margin and
// text size (Settings → Receipt) for printers that print narrow, cut off or
// off-centre.
const PAPER = { '58mm': { paper: 58, width: 48 }, '80mm': { paper: 80, width: 72 } };
export const TEXT_SIZES = { small: 0.9, normal: 1, large: 1.15, xlarge: 1.3 };
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : d; };

// { paper, width, defaultWidth, margin } in mm, and the text zoom.
export function receiptLayout(r = {}) {
  const custom = r.paper_width === 'custom';
  const base = PAPER[r.paper_width] || PAPER['80mm'];
  const paper = custom ? clamp(r.paper_mm, 40, 120, 80) : base.paper;
  const defaultWidth = custom ? Math.max(30, paper - 8) : base.width;
  return {
    paper,
    defaultWidth,
    width: clamp(r.print_width_mm, 30, paper, defaultWidth),
    margin: Math.min(15, Math.max(0, Number(r.margin_mm) || 0)),
    zoom: TEXT_SIZES[r.text_size] || 1,
  };
}

// Props for the root of a receipt-printer slip (bill, kitchen slip, cash
// report, quotation slip). The printed width stays the same at any text
// size: zoom scales everything, so the width is divided back.
export function slipProps(r) {
  const l = receiptLayout(r);
  return {
    'data-paper': l.paper,
    style: { width: `${(l.width / l.zoom).toFixed(2)}mm`, zoom: l.zoom, '--print-left': `${l.margin}mm` },
  };
}

// The printed width as a CSS length (older callers).
export function receiptWidth(r) {
  return `${receiptLayout(typeof r === 'object' && r ? r : { paper_width: r }).width}mm`;
}

// ---------------------------------------------------------------- printing

const PAGE_CSS = {
  document: '@page { size: A4; margin: 10mm; }',
};

const isRoll = (kind) => kind === 'receipt' || kind === 'kitchen';

// A roll page is exactly the roll width and as long as the slip, so the
// printer driver's own paper size (often 58 mm or A4) can't shrink the bill.
function rollPage() {
  const el = document.querySelector('.print-area');
  const paper = Number(el?.dataset.paper) || 80;
  const px = el ? el.getBoundingClientRect().height : 0;
  const height = Math.max(60, Math.ceil((px * 25.4) / 96) + 8);
  return { paper, height };
}

export async function printNow(kind = 'receipt') {
  let css = PAGE_CSS[kind]; // labels set their own @page
  let pageSize;
  if (isRoll(kind)) {
    // let React paint the slip first so its height is known
    await new Promise((r) => setTimeout(r, 80));
    const { paper, height } = rollPage();
    css = `@page { size: ${paper}mm ${height}mm; margin: 0; }`;
    pageSize = { width: paper * 1000, height: height * 1000 }; // microns
  }
  let style = null;
  if (css) {
    style = document.createElement('style');
    style.textContent = `@media print { ${css} }`;
    document.head.appendChild(style);
  }
  try {
    return await doPrint(kind, pageSize);
  } finally {
    setTimeout(() => style?.remove(), 500);
  }
}

async function doPrint(kind, pageSize) {
  const prefs = printerPrefs();
  // kitchen slips use the receipt printer unless a kitchen printer is set
  const pref = (kind === 'kitchen' && !prefs.kitchen?.name ? prefs.receipt : prefs[kind]) || {};
  if (isDesktop()) {
    // let React paint the print-area first
    await new Promise((r) => setTimeout(r, 80));
    const silent = !!pref.name; // a chosen printer = print directly, no dialog
    let res = await window.coreposDesktop.print({ deviceName: pref.name || '', silent, copies: kind === 'receipt' ? pref.copies || 1 : 1, pageSize });
    if (silent && !res.success && !/cancel/i.test(res.failureReason || '')) {
      // printer offline / renamed: fall back to the dialog so the bill still prints
      res = await window.coreposDesktop.print({ silent: false, pageSize });
    }
    return res;
  }
  window.print();
  return { success: true };
}
