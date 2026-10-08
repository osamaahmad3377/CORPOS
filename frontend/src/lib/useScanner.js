// USB / Bluetooth barcode scanners behave like a keyboard: they "type" the
// code very fast and press Enter (some send Tab). This hook recognises that
// burst anywhere on the page — even when no input has focus — so a scan is
// never lost because the cursor was somewhere else.
//
//   useScanner((code) => addByBarcode(code), { enabled: !modalOpen });
//
// Typing into a normal input is left alone (that input handles its own
// Enter); only keystrokes that arrive scanner-fast and outside text fields
// are captured.
import { useEffect, useRef } from 'react';

const MAX_GAP_MS = 45; // humans type slower than this; scanners are ~5–20ms
const MIN_LENGTH = 4;

function isTextField(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || el.isContentEditable) return true;
  if (tag !== 'INPUT') return false;
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(el.type);
}

export default function useScanner(onScan, { enabled = true, allowInDialog = false } = {}) {
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;
    let buffer = '';
    let last = 0;
    let fast = true;

    const reset = () => { buffer = ''; fast = true; };

    const onKey = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isTextField(document.activeElement)) { reset(); return; }
      if (!allowInDialog && document.querySelector('[data-modal-open="true"]')) { reset(); return; }

      const now = performance.now();
      const gap = now - last;
      last = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= MIN_LENGTH && fast) {
          e.preventDefault();
          const code = buffer;
          reset();
          cb.current(code);
        } else {
          reset();
        }
        return;
      }
      if (e.key.length !== 1) return; // Shift, arrows…

      if (buffer && gap > MAX_GAP_MS) { buffer = ''; fast = true; } // a new burst starts
      buffer += e.key;
      // a scan in progress shouldn't also trigger page shortcuts
      if (buffer.length > 1) e.preventDefault();
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, allowInDialog]);
}
