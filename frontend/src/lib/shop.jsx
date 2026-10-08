import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { DEFAULT_BRAND, applyBrand, applyMode, applySidebar, setStoredMode, storedMode } from './theme';

// Shop-wide configuration: settings (shop/receipt/tax/business/product) and
// the static lists from /meta (units, payment methods, business types).
const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings'), staleTime: 60_000 });
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.get('/meta'), staleTime: Infinity });

  // brand colour + light/dark (per computer, default = shop setting)
  const brandColor = /^#[0-9a-f]{6}$/i.test(settings.data?.brand?.primary_color || '') ? settings.data.brand.primary_color : DEFAULT_BRAND;
  const [mode, setModeState] = useState(() => storedMode() || 'light');
  useEffect(() => {
    if (!storedMode() && settings.data?.brand?.theme) setModeState(settings.data.brand.theme);
  }, [settings.data?.brand?.theme]);
  useEffect(() => {
    applyMode(mode);
    applyBrand(brandColor);
  }, [mode, brandColor]);
  const sidebarColor = settings.data?.brand?.sidebar_color;
  useEffect(() => { applySidebar(sidebarColor); }, [sidebarColor]);
  const setMode = useCallback((m) => { setStoredMode(m); setModeState(m); }, []);

  const value = useMemo(() => {
    const s = settings.data || {};
    const m = meta.data || { units: [], payment_methods: [], business_types: [] };
    const units = Object.fromEntries(m.units.map((u) => [u.code, u]));
    return {
      loading: settings.isLoading || meta.isLoading,
      settings: s,
      meta: m,
      shopName: s.shop?.name || 'My Shop',
      businessType: s.business?.type || 'general',
      option1: s.product?.option1_label || 'Variant',
      option2: s.product?.option2_label || 'Size',
      defaultUnit: s.product?.default_unit || 'pcs',
      taxEnabled: s.tax?.enabled === '1',
      taxPercent: Number(s.tax?.percentage || 0),
      taxLabel: s.tax?.label || 'Tax',
      // optional modules (Settings → Features)
      features: {
        restaurant: s.features?.restaurant === '1',
        serials: s.features?.serials === '1',
        expiry: s.features?.expiry === '1',
      },
      units,
      unitLabel: (code) => units[code]?.label || code || 'Piece',
      isFractional: (code) => !!units[code]?.fractional,
      paymentLabel: (code) => m.payment_methods.find((p) => p.code === code)?.label || code,
      refetchSettings: settings.refetch,
      // restaurant POS (tables, kitchen) — on for restaurants or when switched on
      isRestaurant: s.business?.type === 'restaurant' || s.features?.restaurant === '1',
      tableAreas: tableAreas(s.restaurant),
      takeaway: s.restaurant?.takeaway !== '0',
      delivery: s.restaurant?.delivery !== '0',
      // white-label
      brandColor,
      logoUrl: s.brand?.logo ? `/storage/${s.brand.logo}` : null,
      logoOnReceipt: s.brand?.show_logo_on_receipt !== '0',
      mode,
      setMode,
      isDark: mode === 'dark',
    };
  }, [settings.data, meta.data, settings.isLoading, meta.isLoading, settings.refetch, brandColor, mode, setMode]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export const useShop = () => useContext(ShopContext);

// Dining areas with their tables: [{ name, tables: [{ no, seats }] }].
// Older setups only stored a count — they get tables 1…N in one hall.
export function tableAreas(r = {}) {
  try {
    const layout = JSON.parse(r.layout || 'null');
    if (Array.isArray(layout)) return layout.map((a) => ({ name: a.name || '', tables: Array.isArray(a.tables) ? a.tables : [] }));
  } catch { /* fall back to the count */ }
  const n = Math.max(0, Math.min(300, Number(r.tables ?? 12) || 0));
  return [{ name: '', tables: Array.from({ length: n }, (_, i) => ({ no: String(i + 1), seats: 4 })) }];
}
