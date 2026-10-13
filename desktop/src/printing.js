// Direct printing from the POS pages (bills, kitchen slips, barcode stickers,
// reports). Kept on its own so the printing tests run exactly this code.
//
// The options sent to the printer driver are deliberately plain: the chosen
// printer, copies, no margins, backgrounds on. The page's own CSS (@page) sets
// the layout. Sending a custom paper size or scale makes many Windows thermal
// printer drivers drop the job without printing anything, so neither is sent.

/** Clean the options a page asks for: { deviceName?, silent?, copies? }. */
function printOptions(options = {}) {
  const deviceName = typeof options.deviceName === 'string' ? options.deviceName.trim().slice(0, 300) : '';
  // silent (no dialog) only with a chosen printer; otherwise the print window opens
  const silent = !!options.silent && !!deviceName;
  const copies = Math.min(Math.max(parseInt(options.copies, 10) || 1, 1), 5);
  return {
    silent,
    deviceName: deviceName || undefined,
    copies,
    printBackground: true,
    margins: { marginType: 'none' },
  };
}

/**
 * Print what the page shows now. Resolves { success, failureReason } and never
 * hangs: a printer that never answers a direct print counts as failed after
 * `timeoutMs`.
 */
function printPage(webContents, options = {}, { log = () => {}, timeoutMs = 60_000 } = {}) {
  const opts = printOptions(options);
  return new Promise((resolve) => {
    let done = false;
    const finish = (success, failureReason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!success && !/cancel/i.test(failureReason || '')) {
        log(`print failed on "${opts.deviceName || 'print window'}": ${failureReason || 'unknown reason'}`);
      }
      resolve({ success: !!success, failureReason: failureReason || null });
    };
    // (the print window waits for the person, so only direct printing has a time limit)
    const timer = opts.silent ? setTimeout(() => finish(false, 'The printer did not answer'), timeoutMs) : null;
    try {
      webContents.print(opts, (success, failureReason) => finish(success, failureReason));
    } catch (err) {
      finish(false, err.message || String(err));
    }
  });
}

module.exports = { printOptions, printPage };
