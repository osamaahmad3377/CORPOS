// Colour wheel: drag around the wheel for the colour (hue), towards the
// middle for softer shades (saturation), and the slider for brightness.
// Works with mouse and touch. value / onChange are "#rrggbb".
import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';

export function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { h: 0, s: 0, v: 1 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }) {
  const f = (k) => {
    const x = (k + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(x, 4 - x, 1));
  };
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

export default function ColorWheel({ value, onChange, size = 176 }) {
  const t = useT();
  const ref = useRef(null);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const dragging = useRef(false);

  // follow outside changes (presets, typed hex) unless the wheel itself made them
  useEffect(() => {
    if (value && value.toLowerCase() !== hsvToHex(hsv).toLowerCase()) setHsv(hexToHsv(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  const pick = (e) => {
    const box = ref.current.getBoundingClientRect();
    const r = box.width / 2;
    const dx = e.clientX - (box.left + r);
    const dy = e.clientY - (box.top + r);
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / r);
    update({ ...hsv, h, s, v: hsv.v < 0.15 ? 0.85 : hsv.v });
  };

  const r = size / 2;
  const mx = r + Math.cos((hsv.h * Math.PI) / 180) * hsv.s * (r - 2);
  const my = r + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * (r - 2);
  const current = hsvToHex(hsv);
  const pure = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });

  return (
    <div className="flex flex-col items-center gap-3" style={{ width: size }}>
      <div
        ref={ref}
        role="slider"
        aria-label={t('Colour wheel')}
        aria-valuetext={current}
        tabIndex={0}
        className="relative cursor-crosshair touch-none select-none rounded-full shadow-[0_8px_24px_-10px_rgb(15_23_42/0.4),inset_0_0_0_1px_rgb(255_255_255/0.6)]"
        style={{
          width: size,
          height: size,
          background: 'radial-gradient(circle closest-side, #fff, rgb(255 255 255 / 0)), conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
        onPointerMove={(e) => { if (dragging.current) pick(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 15 : 5;
          if (e.key === 'ArrowLeft') update({ ...hsv, h: (hsv.h + 360 - step) % 360 });
          if (e.key === 'ArrowRight') update({ ...hsv, h: (hsv.h + step) % 360 });
          if (e.key === 'ArrowUp') update({ ...hsv, s: Math.min(1, hsv.s + 0.05) });
          if (e.key === 'ArrowDown') update({ ...hsv, s: Math.max(0, hsv.s - 0.05) });
        }}
      >
        {/* brightness */}
        <div className="pointer-events-none absolute inset-0 rounded-full bg-black" style={{ opacity: 1 - hsv.v }} />
        <span
          className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_2px_8px_rgb(0_0_0/0.45)]"
          style={{ left: mx, top: my, background: current }}
        />
      </div>
      <label className="w-full">
        <span className="sr-only">{t('Brightness')}</span>
        <input
          type="range" min="15" max="100" step="1" value={Math.round(hsv.v * 100)}
          onChange={(e) => update({ ...hsv, v: Number(e.target.value) / 100 })}
          className="h-3 w-full cursor-pointer rounded-full accent-[var(--color-brand-600)]"
          style={{ background: `linear-gradient(90deg, #262626, ${pure})` }}
          aria-label={t('Brightness')}
        />
      </label>
    </div>
  );
}
