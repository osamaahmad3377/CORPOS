// End-to-end printing test, run like a fresh install on a shop computer:
// the bundled engine (resources/backend, as in the installer) starts with a
// brand-new shop, the real POS pages open through the real desktop bridge
// (src/preload.js) and every print goes through src/printing.js exactly as in
// the app. Only the paper is simulated: each job is saved as a PDF on a
// receipt-roll page (like the printer driver's paper) and measured.
//
//   npm run prepare:app            (so resources/ has the current code)
//   npm run test:print:e2e
//
// Checks per job: sent to the chosen printer, no custom paper size, only the
// one slip on paper (nothing else from the screen), the right bill on it, and
// — on macOS, where the PDF can be measured — that it fills the roll width.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const { Backend } = require('../src/backend');
const { printPage } = require('../src/printing');

const resourcesDir = path.join(__dirname, '..', 'resources');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corepos-print-test-'));
const outDir = process.env.PRINT_TEST_OUT || path.join(dataDir, 'printed');
fs.mkdirSync(outDir, { recursive: true });

const RECEIPT_PRINTER = 'XP-80C Receipt Printer';
const LABEL_PRINTER = 'Zebra Label Printer';
const SHOP = 'Green Mart Test';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the simulated printer

const jobs = [];
let rollMm = 80; // paper width of the "installed" receipt printer
let failNextDirect = null; // e.g. 'Printer is offline'

async function printedContent(wc) {
  // what the print layout shows = what lands on paper
  wc.debugger.attach('1.3');
  try {
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
    const { result } = await wc.debugger.sendCommand('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const shown = [...document.querySelectorAll('.print-area')].filter((e) => getComputedStyle(e).display !== 'none');
        return { slips: shown.length, kinds: shown.map((e) => e.dataset.print || '?'), text: document.body.innerText };
      })()`,
    });
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: '' });
    return result.value;
  } finally {
    wc.debugger.detach();
  }
}

// Ink width in mm of the first PDF page (macOS: sips renders the PDF).
function inkWidthMm(pdfFile, pageMm) {
  if (process.platform !== 'darwin') return null;
  const png = pdfFile.replace(/\.pdf$/, '.png');
  execFileSync('sips', ['-s', 'format', 'png', '-Z', '1600', pdfFile, '--out', png], { stdio: 'ignore' });
  const img = nativeImage.createFromPath(png);
  const { width, height } = img.getSize();
  const px = img.toBitmap(); // BGRA
  let min = width;
  let max = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (px[i + 3] > 128 && px[i] < 128 && px[i + 1] < 128 && px[i + 2] < 128) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
  }
  if (max < 0) return 0;
  return Math.round(((max - min) / width) * pageMm * 10) / 10;
}

ipcMain.handle('printers', () => [
  { name: RECEIPT_PRINTER, displayName: RECEIPT_PRINTER, isDefault: true, status: 0 },
  { name: LABEL_PRINTER, displayName: LABEL_PRINTER, isDefault: false, status: 0 },
]);
ipcMain.handle('system-info', () => ({ platform: process.platform, arch: process.arch, cores: 4, memoryGB: 8, gpuOff: false }));
ipcMain.handle('brand', () => true);
ipcMain.handle('print', async (event, options) => {
  const wc = event.sender;
  const printer = {
    async print(opts, done) {
      const job = { n: jobs.length + 1, options: opts };
      jobs.push(job);
      if (failNextDirect && opts.silent) {
        const reason = failNextDirect;
        failNextDirect = null;
        job.failed = reason;
        done(false, reason);
        return;
      }
      Object.assign(job, await printedContent(wc));
      const label = opts.deviceName === LABEL_PRINTER;
      const pdf = await wc.printToPDF(label
        ? { preferCSSPageSize: true, printBackground: true, margins: { marginType: 'none' } }
        : { pageSize: { width: rollMm / 25.4, height: 11.69 }, printBackground: true, margins: { marginType: 'none' } });
      job.pdf = path.join(outDir, `job-${job.n}.pdf`);
      fs.writeFileSync(job.pdf, pdf);
      job.inkMm = label ? null : inkWidthMm(job.pdf, rollMm);
      done(true, '');
    },
  };
  return printPage(printer, options, { log: (l) => console.log('   [print log]', l) });
});

// ---------------------------------------------------------------- driving the app

let win;
const js = (code) => win.webContents.executeJavaScript(code);
async function waitFor(code, what, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await js(`!!(${code})`).catch(() => false)) return;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${what}`);
}
// first visible button/link whose text contains `text` (or matches a RegExp) inside `scope`
const btn = (text, scope = 'document') => {
  const test = text instanceof RegExp ? `${text}.test(b.textContent.trim())` : `b.textContent.trim().includes(${JSON.stringify(text)})`;
  return `[...(${scope}).querySelectorAll('button,a')].find((b) => b.offsetParent !== null && !b.disabled && ${test})`;
};
async function click(text, scope) {
  await waitFor(btn(text, scope), `button "${text}"`);
  await js(`${btn(text, scope)}.click()`);
  await sleep(250);
}
async function go(url, base) {
  await win.loadURL(base + url);
  await waitFor(`document.querySelector('main') && !document.querySelector('.animate-spin')`, `page ${url}`);
  await sleep(600);
}
async function nextJob(before, what, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (jobs.length > before && jobs.at(-1).pdf !== undefined) return jobs.at(-1);
    if (jobs.length > before && jobs.at(-1).failed) return jobs.at(-1);
    await sleep(150);
  }
  throw new Error(`nothing was sent to the printer for ${what}`);
}

// ---------------------------------------------------------------- checks

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    const shot = path.join(outDir, `fail-${results.length}.png`);
    try { fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG()); } catch { /* no window */ }
    console.log(`  FAIL  ${name}\n        ${err.message}\n        screen: ${shot}`);
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
function expectBill(job, { printer = RECEIPT_PRINTER, contains = [], minInk = 64, maxInk = 79 } = {}) {
  expect(job.options.deviceName === printer, `sent to "${job.options.deviceName}", expected "${printer}"`);
  expect(job.options.silent === true, 'should print directly to the chosen printer (no dialog)');
  expect(job.options.pageSize === undefined && job.options.scaleFactor === undefined, 'a custom paper size/scale was sent to the driver');
  expect(job.slips === 1, `${job.slips} slips on paper (expected exactly 1: ${job.kinds})`);
  for (const c of contains) expect(job.text.includes(c), `"${c}" is not on the printed bill`);
  for (const ui of ['Sign out', 'Kitchen screen', 'Customers & udhaar', 'Take payment']) expect(!job.text.includes(ui), `screen text "${ui}" was printed`);
  if (job.inkMm !== null) expect(job.inkMm >= minInk && job.inkMm <= maxInk, `printed ${job.inkMm} mm wide on ${rollMm} mm paper (expected ${minInk}–${maxInk} mm)`);
}

// ---------------------------------------------------------------- run

app.whenReady().then(async () => {
  let backend;
  let code = 1;
  try {
    console.log(`Printing test — data in ${dataDir}`);
    backend = new Backend({ resourcesDir, dataDir, preferredPort: 47390, log: () => {} });
    if (!(await backend.isInstalled())) {
      const res = await backend.install({
        shop_name: SHOP, business_type: 'grocery', shop_phone: '03331478695', shop_address: 'Shop#10 Elanzaa Mall D Markaz Gulberg',
        admin_name: 'Test Owner', admin_email: 'owner@test.pk', admin_password: 'Secret123',
      });
      if (!res.ok) throw new Error(`install failed: ${JSON.stringify(res.errors || res)}`);
    }
    const base = await backend.start();
    const api = async (method, p, body, token) => {
      const r = await fetch(base + '/api/v1' + p, {
        method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${method} ${p}: ${data.message || r.status}`);
      return data;
    };
    const { token } = await api('POST', '/auth/login', { email: 'owner@test.pk', password: 'Secret123' });
    const cats = await api('GET', '/categories', null, token);
    await api('POST', '/products', {
      name: 'Test Soap', category_id: (cats.data || cats)[0].id, unit: 'pcs', track_stock: true,
      variants: [{ barcode: '8964000123457', purchase_price: 80, selling_price: 110, stock_qty: 50 }],
    }, token);

    win = new BrowserWindow({
      width: 1366, height: 820, show: false,
      webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    await win.loadURL(base + '/');
    const prefs = { receipt: { name: RECEIPT_PRINTER, copies: 1, auto: false }, label: { name: LABEL_PRINTER } };
    await js(`localStorage.setItem('corepos_token', ${JSON.stringify(token)}); localStorage.setItem('corepos_lang', 'en');
      localStorage.setItem('corepos_printers', ${JSON.stringify(JSON.stringify(prefs))}); localStorage.setItem('corepos_effects', 'lite'); true`);
    expect(await js('!!window.coreposDesktop?.isDesktop'), 'desktop bridge (preload) is not available on the POS page');

    console.log('');
    await check('Settings → Printers → "Test print" on the bill printer', async () => {
      await go('/settings', base);
      await click('Printers');
      const before = jobs.length;
      await click('Test print');
      expectBill(await nextJob(before, 'test print'), { contains: ['TEST-0001', SHOP, 'Software by NextCore', 'nextcore.com.pk'] });
    });

    let firstInvoice = '';
    await check('Sell → Take payment → Finish sale → "Print receipt"', async () => {
      await go('/pos', base);
      await click('Test Soap');
      await click('Take payment');
      await click('Finish sale');
      await waitFor(`document.body.innerText.includes('Sale complete')`, 'the Sale complete window');
      firstInvoice = await js(`(document.querySelector('[data-modal-open] .print-area')?.innerText.match(/[A-Z]+-\\d+/) || [''])[0]`);
      expect(firstInvoice, 'no bill number on the receipt');
      const before = jobs.length;
      await click('Print receipt');
      expectBill(await nextJob(before, 'receipt after payment'), { contains: [firstInvoice, 'Test Soap', 'TOTAL', 'Software by NextCore'] });
    });

    await check('Sell with "print automatically" on → the receipt prints by itself after payment', async () => {
      await js(`localStorage.setItem('corepos_printers', ${JSON.stringify(JSON.stringify({ ...prefs, receipt: { ...prefs.receipt, auto: true } }))}); true`);
      await go('/pos', base);
      await click('Test Soap');
      await click('Test Soap'); // two pieces
      const before = jobs.length;
      await click('Take payment');
      await click('Finish sale');
      const job = await nextJob(before, 'automatic receipt');
      expectBill(job, { contains: ['Test Soap', 'TOTAL'] });
      expect(!job.text.includes(firstInvoice + '\n'), 'the previous bill was printed instead of the new one');
      await js(`localStorage.setItem('corepos_printers', ${JSON.stringify(JSON.stringify(prefs))}); true`);
    });

    await check('Old bills → open a bill → Print receipt → Print', async () => {
      await go(`/sales/${firstInvoice}`, base);
      await click('Print receipt');
      const before = jobs.length;
      await click('Print', '[...document.querySelectorAll("[data-modal-open]")].at(-1)');
      expectBill(await nextJob(before, 'reprint from old bills'), { contains: [firstInvoice, 'Test Soap'] });
    });

    await check('Printer offline → the print window opens so the bill can still be printed', async () => {
      await go('/settings', base);
      await click('Printers');
      failNextDirect = 'Printer is offline';
      const before = jobs.length;
      await click('Test print');
      await nextJob(before, 'offline attempt');
      const retry = await nextJob(before + 1, 'print window after the failure');
      expect(jobs[before].failed === 'Printer is offline', 'the first attempt should have gone to the offline printer');
      expect(retry.options.silent === false, 'the retry should open the print window');
      expect(retry.slips === 1 && retry.text.includes('TEST-0001'), 'the retry did not print the bill');
    });

    await check('58 mm printer and paper setting → bill fits the 58 mm roll', async () => {
      await api('PUT', '/settings', { receipt: { paper_width: '58mm' } }, token);
      rollMm = 58;
      try {
        await go('/settings', base);
        await click('Printers');
        const before = jobs.length;
        await click('Test print');
        expectBill(await nextJob(before, '58 mm test print'), { contains: ['TEST-0001'], minInk: 42, maxInk: 57 });
      } finally {
        rollMm = 80;
        await api('PUT', '/settings', { receipt: { paper_width: '80mm' } }, token);
      }
    });

    await check('Barcode stickers → print on the sticker printer', async () => {
      await go('/barcodes', base);
      await js(`(() => { const i = document.querySelector('input[placeholder*="Scan barcode"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Test Soap'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await click('Test Soap', 'document.querySelector("main")');
      const before = jobs.length;
      await click(/^Print \d+ stickers?$/, 'document.querySelector("main")');
      const job = await nextJob(before, 'barcode stickers');
      expect(job.options.deviceName === LABEL_PRINTER, `stickers went to "${job.options.deviceName}"`);
      expect(job.slips === 1 && job.kinds[0] === 'label', `printed ${job.kinds} instead of the stickers`);
      expect(job.text.replace(/\s/g, '').includes('8964000123457') && job.text.includes('Test Soap'), 'the sticker is missing the item name or barcode number');
      expect(job.text.includes('Rs 110'), 'the sticker is missing the price');
      // bars drawn in whole printer dots (203 dpi) so every bar prints the same width
      const bars = await js(`[...document.querySelectorAll('[data-bar-mm]')].slice(0, 3).map((e) => +e.dataset.barMm)`);
      const dot = 25.4 / 203;
      expect(bars.length && bars.every((b) => Math.abs(b / dot - Math.round(b / dot)) < 0.01 && b >= dot * 0.99), `bar widths ${bars} are not whole printer dots`);
    });

    await check('Roll sticker printer (50 × 30 mm) → one sticker per page at the sticker size', async () => {
      await js(`localStorage.setItem('corepos_label_opts', JSON.stringify({ size: 'large', layout: 'roll', showShop: true, showPrice: true, format: 'code128' })); true`);
      await go('/barcodes', base);
      await js(`(() => { const i = document.querySelector('input[placeholder*="Scan barcode"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Test Soap'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await click('Test Soap', 'document.querySelector("main")');
      // three stickers
      await js(`(() => { const i = document.querySelector('main td input[type=number]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '3'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      const before = jobs.length;
      await click(/^Print 3 stickers$/, 'document.querySelector("main")');
      const job = await nextJob(before, 'roll stickers');
      const pdf = fs.readFileSync(job.pdf, 'latin1');
      const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
      const box = (pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/) || []).slice(1).map((v) => Math.round((v / 72) * 25.4));
      expect(pages === 3, `${pages} pages for 3 stickers`);
      expect(box[0] === 50 && box[1] === 30, `page is ${box.join(' × ')} mm, expected 50 × 30 mm`);
    });

    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed · printed PDFs in ${outDir}`);
    code = failed ? 1 : 0;
  } catch (err) {
    console.log(`\nTEST SETUP FAILED: ${err.stack || err.message}`);
  } finally {
    backend?.stop();
    app.exit(code);
  }
});
