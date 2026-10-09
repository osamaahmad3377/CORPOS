// Visual effects per computer: "full" (glass blur, animations) or "lite"
// (solid surfaces, no animation) for slow or old PCs. "auto" picks for you
// from the computer's cores, memory and graphics. Stored on this computer
// only, like the language.

const KEY = 'corepos_effects';
const safe = (fn, fb = null) => { try { return fn(); } catch { return fb; } };

export const effectsSetting = {
  get: () => { const v = safe(() => localStorage.getItem(KEY)); return v === 'full' || v === 'lite' ? v : 'auto'; },
  set: (v) => safe(() => localStorage.setItem(KEY, v)),
};

let system = null; // { cores, memoryGB, gpuOff, platform, arch } from the desktop app

export async function loadSystemInfo() {
  if (system) return system;
  const desk = typeof window !== 'undefined' ? window.coreposDesktop : null;
  system = (desk?.systemInfo ? await safe(() => desk.systemInfo(), null) : null) || {
    cores: navigator.hardwareConcurrency || 4,
    memoryGB: navigator.deviceMemory || null, // browsers report at most 8
    gpuOff: false,
  };
  return system;
}

export function isLowEnd(s = system) {
  if (!s) return false;
  const reduced = safe(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, false);
  return s.gpuOff || (s.cores && s.cores <= 2) || (s.memoryGB && s.memoryGB < 4) || reduced;
}

export function resolvedEffects(setting = effectsSetting.get()) {
  return setting === 'auto' ? (isLowEnd() ? 'lite' : 'full') : setting;
}

export function applyEffects(setting = effectsSetting.get()) {
  document.documentElement.classList.toggle('lite', resolvedEffects(setting) === 'lite');
}

// first paint uses the saved choice; refine once the desktop app answers
export function initEffects() {
  applyEffects();
  loadSystemInfo().then(() => applyEffects());
}
