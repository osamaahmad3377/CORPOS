// Logos. ShopLogo = the shop's own (white-label) logo from Settings → Brand,
// falling back to its initial on the brand colour. NextcoreLogo = the
// developer's logo: public/brand/nextcore-logo.png when present (copied from
// /branding at build time), otherwise a built-in wordmark.
import { useState } from 'react';
import { useShop } from '../lib/shop';
import { cx } from './ui';

export function ShopLogo({ className = 'size-10', rounded = 'rounded-xl' }) {
  const shop = useShop();
  const [broken, setBroken] = useState(false);
  if (shop.logoUrl && !broken) {
    return <img src={shop.logoUrl} alt={shop.shopName} onError={() => setBroken(true)} className={cx(className, rounded, 'bg-white object-contain')} />;
  }
  return (
    <div className={cx(className, rounded, 'grid shrink-0 place-items-center bg-brand-600 font-bold text-white')} style={{ color: 'var(--brand-ink, #fff)' }}>
      {(shop.shopName || 'C').trim().charAt(0).toUpperCase()}
    </div>
  );
}

export function NextcoreWordmark({ className = 'h-7', mono = false }) {
  // Built-in placeholder until the real logo file is added.
  return (
    <svg viewBox="0 0 168 36" className={className} role="img" aria-label="NextCore">
      <rect x="0" y="2" width="32" height="32" rx="9" fill={mono ? 'currentColor' : '#0f172a'} stroke={mono ? 'none' : '#334155'} strokeWidth="1" />
      <path d="M9 25V11l14 14V11" fill="none" stroke={mono ? '#fff' : '#38bdf8'} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <text x="40" y="25" fontFamily="Inter Variable, Segoe UI, sans-serif" fontSize="20" fontWeight="800" fill="currentColor" letterSpacing="-0.4">Next</text>
      <text x="90" y="25" fontFamily="Inter Variable, Segoe UI, sans-serif" fontSize="20" fontWeight="800" fill={mono ? 'currentColor' : '#0ea5e9'} letterSpacing="-0.4">Core</text>
    </svg>
  );
}

const LOGO_FILES = ['/brand/nextcore-logo.png', '/brand/nextcore-logo.svg'];

export function NextcoreLogo({ className = 'h-7', mono = false }) {
  const [attempt, setAttempt] = useState(0);
  if (attempt >= LOGO_FILES.length) return <NextcoreWordmark className={className} mono={mono} />;
  return <img src={LOGO_FILES[attempt]} alt="NextCore" onError={() => setAttempt((a) => a + 1)} className={cx(className, 'w-auto object-contain', mono && 'grayscale')} />;
}

export const NEXTCORE = {
  product: 'CorePOS',
  company: 'NextCore',
  website: 'nextcore.com.pk',
  email: 'info@nextcore.com.pk',
};
