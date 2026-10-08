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

// Thermal rolls print ~72 mm of an 80 mm roll (~48 mm of 58 mm): receipts
// are sized for that and printed with no page margin.
export function receiptWidth(paper) {
  return paper === '58mm' ? '48mm' : '72mm';
}

const PAGE_CSS = {
  receipt: '@page { margin: 0; }',
  kitchen: '@page { margin: 0; }',
  document: '@page { size: A4; margin: 10mm; }',
};

export async function printNow(kind = 'receipt') {
  const css = PAGE_CSS[kind]; // labels set their own @page
  let style = null;
  if (css) {
    style = document.createElement('style');
    style.textContent = `@media print { ${css} }`;
    document.head.appendChild(style);
  }
  try {
    return await doPrint(kind);
  } finally {
    setTimeout(() => style?.remove(), 500);
  }
}

async function doPrint(kind) {
  const prefs = printerPrefs();
  // kitchen slips use the receipt printer unless a kitchen printer is set
  const pref = (kind === 'kitchen' && !prefs.kitchen?.name ? prefs.receipt : prefs[kind]) || {};
  if (isDesktop()) {
    // let React paint the print-area first
    await new Promise((r) => setTimeout(r, 80));
    const silent = !!pref.name; // a chosen printer = print directly, no dialog
    let res = await window.coreposDesktop.print({ deviceName: pref.name || '', silent, copies: kind === 'receipt' ? pref.copies || 1 : 1 });
    if (silent && !res.success && !/cancel/i.test(res.failureReason || '')) {
      // printer offline / renamed: fall back to the dialog so the bill still prints
      res = await window.coreposDesktop.print({ silent: false });
    }
    return res;
  }
  window.print();
  return { success: true };
}
