// App icons from the NextCore / CorePOS logo mark (the green ring of the "o"
// in branding/nextcore-logo.png, measured from that file): a white rounded
// tile with the ring and its dark centre dot, drawn crisp at every size.
//
//   electron scripts/make-icons.cjs
//
// Writes build/icon.png (1024, Mac + Linux), build/icon.ico (Windows, 16-256)
// ../frontend/public/favicon.png (browser tab) and ui/app-icon.png (window).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// ICO file with PNG images inside (Windows Vista and newer read these).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const e = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e); dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt8(0, e + 2); dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(data.length, e + 8); dir.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false }); await win.loadURL('about:blank');
  const res = await win.webContents.executeJavaScript(`(() => {
    const GREEN = '#1dc375', DARK = '#323739';
    const OUT = 41.27, IN = 28.22, DOT = 10.40; // logo pixels
    const GAP_FROM = 305.5, GAP_TO = 317.5;      // degrees, 0 = right, clockwise
    const o = {};
    for (const s of [1024, 512, 256, 128, 64, 48, 32, 16]) {
      const k = document.createElement('canvas'); k.width = s; k.height = s; const g = k.getContext('2d');
      const tiny = s <= 32;
      const m = tiny ? s * 0.02 : s * 0.06, r = s * (tiny ? 0.22 : 0.2), w = s - 2 * m;
      g.beginPath(); g.moveTo(m + r, m); g.arcTo(m + w, m, m + w, m + w, r); g.arcTo(m + w, m + w, m, m + w, r); g.arcTo(m, m + w, m, m, r); g.arcTo(m, m, m + w, m, r); g.closePath();
      g.fillStyle = '#ffffff'; g.fill();
      if (s >= 48) { g.lineWidth = Math.max(1, s * 0.006); g.strokeStyle = 'rgba(15,23,42,0.10)'; g.stroke(); }
      // the mark fills more of the tile at small sizes so it stays readable
      const R = (w / 2) * (tiny ? 0.78 : 0.62), sc = R / OUT, cx = s / 2, cy = s / 2;
      g.beginPath();
      g.arc(cx, cy, ((OUT + IN) / 2) * sc, GAP_TO * Math.PI / 180, (GAP_FROM + 360) * Math.PI / 180);
      g.lineWidth = (OUT - IN) * sc; g.strokeStyle = GREEN; g.lineCap = 'butt'; g.stroke();
      g.beginPath(); g.arc(cx, cy, DOT * sc, 0, Math.PI * 2); g.fillStyle = DARK; g.fill();
      o[s] = k.toDataURL('image/png').split(',')[1];
    }
    // favicon: same mark, no tile
    const f = document.createElement('canvas'); f.width = 64; f.height = 64; const h = f.getContext('2d');
    const sc = 30 / OUT;
    h.beginPath(); h.arc(32, 32, ((OUT + IN) / 2) * sc, GAP_TO * Math.PI / 180, (GAP_FROM + 360) * Math.PI / 180); h.lineWidth = (OUT - IN) * sc; h.strokeStyle = GREEN; h.stroke();
    h.beginPath(); h.arc(32, 32, DOT * sc, 0, Math.PI * 2); h.fillStyle = DARK; h.fill();
    o.favicon = f.toDataURL('image/png').split(',')[1];
    return o;
  })()`);
  const png = (k) => Buffer.from(res[k], 'base64');
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), png(1024));
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico([16, 32, 48, 64, 128, 256].map((size) => ({ size, data: png(size) }))));
  fs.writeFileSync(path.join(root, '..', 'frontend', 'public', 'favicon.png'), png('favicon'));
  fs.writeFileSync(path.join(root, 'ui', 'app-icon.png'), png(256)); // window icon (Linux taskbar)
  console.log('icons written: build/icon.png, build/icon.ico, frontend/public/favicon.png');
  app.exit(0);
});
