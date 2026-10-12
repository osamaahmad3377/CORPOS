// The shop's name outside the page itself: the window / tab title and — in
// the desktop app — the start screen (name and brand colour). The app icon
// stays CorePOS. The last shop's name and colour are remembered on this
// computer so the sign-in screen opens in the shop's colours straight away.
const CACHE = 'corepos_brand';

export function rememberedBrand() {
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; }
}

export async function applyShopIdentity({ name, color }) {
  if (!name) return;
  document.title = name;
  try { localStorage.setItem(CACHE, JSON.stringify({ name, color })); } catch { /* ignore */ }
  try { await window.coreposDesktop?.setBrand?.({ name, color }); } catch { /* older desktop app */ }
}
