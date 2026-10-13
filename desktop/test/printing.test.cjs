// Unit tests for the desktop print code (src/printing.js).
//   node --test test/printing.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { printOptions, printPage } = require('../src/printing');

// a stand-in for Electron's webContents: records what was sent to the printer
function fakeContents(answer) {
  const calls = [];
  return {
    calls,
    print(opts, cb) {
      calls.push(opts);
      if (answer === 'throw') throw new Error('Printer driver crashed');
      if (answer !== 'never') setTimeout(() => cb(...answer), 5);
    },
  };
}

test('a chosen printer prints directly, with only the safe options', () => {
  const o = printOptions({ deviceName: 'XP-80C', silent: true, copies: 2 });
  assert.deepEqual(o, { silent: true, deviceName: 'XP-80C', copies: 2, printBackground: true, margins: { marginType: 'none' } });
});

test('no custom paper size or scale ever reaches the driver (thermal drivers drop such jobs)', () => {
  const o = printOptions({ deviceName: 'XP-80C', silent: true, pageSize: { width: 80000, height: 140000 }, scaleFactor: 100, landscape: true });
  assert.equal(o.pageSize, undefined);
  assert.equal(o.scaleFactor, undefined);
  assert.equal(o.landscape, undefined);
});

test('without a printer the print window opens (never silent)', () => {
  assert.equal(printOptions({ silent: true }).silent, false);
  assert.equal(printOptions({ silent: true, deviceName: '   ' }).silent, false);
  assert.equal(printOptions({}).deviceName, undefined);
});

test('copies stay between 1 and 5', () => {
  assert.equal(printOptions({ copies: 0 }).copies, 1);
  assert.equal(printOptions({ copies: 'x' }).copies, 1);
  assert.equal(printOptions({ copies: 99 }).copies, 5);
  assert.equal(printOptions({ copies: '3' }).copies, 3);
});

test('a successful print resolves success', async () => {
  const wc = fakeContents([true, '']);
  const res = await printPage(wc, { deviceName: 'XP-80C', silent: true });
  assert.deepEqual(res, { success: true, failureReason: null });
  assert.equal(wc.calls.length, 1);
});

test('a failed print is reported and written to the log', async () => {
  const lines = [];
  const res = await printPage(fakeContents([false, 'Printer is offline']), { deviceName: 'XP-80C', silent: true }, { log: (l) => lines.push(l) });
  assert.deepEqual(res, { success: false, failureReason: 'Printer is offline' });
  assert.match(lines[0], /XP-80C.*Printer is offline/);
});

test('cancelling the print window is not logged as an error', async () => {
  const lines = [];
  await printPage(fakeContents([false, 'cancelled']), {}, { log: (l) => lines.push(l) });
  assert.equal(lines.length, 0);
});

test('a driver error does not crash the app', async () => {
  const res = await printPage(fakeContents('throw'), { deviceName: 'XP-80C', silent: true });
  assert.equal(res.success, false);
  assert.match(res.failureReason, /crashed/);
});

test('a printer that never answers does not freeze the bill screen', async () => {
  const res = await printPage(fakeContents('never'), { deviceName: 'XP-80C', silent: true }, { timeoutMs: 50 });
  assert.deepEqual(res, { success: false, failureReason: 'The printer did not answer' });
});

test('the print window (person choosing) has no time limit', async () => {
  const wc = fakeContents('never');
  const pending = printPage(wc, {}, { timeoutMs: 30 });
  const winner = await Promise.race([pending.then(() => 'answered'), new Promise((r) => setTimeout(() => r('still waiting'), 120))]);
  assert.equal(winner, 'still waiting');
});
