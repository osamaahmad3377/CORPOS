// The shop's identity outside the page itself: the window / tab title, the
// tab icon and — in the desktop app — the taskbar / dock icon and the start
// screen. The icon is the shop's logo, or its first letter on the brand colour.
// The last shop's name and colour are remembered on this computer so the
// sign-in screen opens in the shop's colours straight away.
import { onBrand } from './theme';

const CACHE = 'corepos_brand';

export function rememberedBrand() {
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; }
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 256 px PNG data URL.
export async function brandIcon({ name, color, logoUrl }) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const logo = logoUrl ? await loadImage(logoUrl) : null;
  roundRect(ctx, 8, 8, size - 16, size - 16, 56);
  if (logo && logo.width && logo.height) {
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    const box = size - 64;
    const k = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * k;
    const h = logo.height * k;
    ctx.save();
    ctx.clip();
    ctx.drawImage(logo, (size - w) / 2, (size - h) / 2, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = onBrand(color);
    ctx.font = '700 140px "Plus Jakarta Sans Variable", "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name || 'C').trim().charAt(0).toUpperCase(), size / 2, size / 2 + 8);
  }
  try { return canvas.toDataURL('image/png'); } catch { return null; }
}

function setFavicon(href) {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = href;
}

export async function applyShopIdentity({ name, color, logoUrl }) {
  if (!name) return;
  document.title = name;
  try { localStorage.setItem(CACHE, JSON.stringify({ name, color })); } catch { /* ignore */ }
  const icon = await brandIcon({ name, color, logoUrl });
  if (!icon) return;
  setFavicon(icon);
  try { await window.coreposDesktop?.setBrand?.({ name, color, icon }); } catch { /* older desktop app */ }
}
