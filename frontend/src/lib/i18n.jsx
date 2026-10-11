// Every visible string goes through t() with its English text; the English
// text is the key, and src/i18n/<lang>/*.js map it to that language (see
// lib/languages.js). Missing translations fall back (e.g. Pashto -> Urdu ->
// English), so nothing ever shows blank.
//   t('Today\'s sale')                 -> "آج کی سیل"
//   t('{n} items', { n: 3 })           -> "3 اشیاء"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANG_CODES, langInfo } from './languages';

const modules = import.meta.glob('../i18n/*/*.js', { eager: true });
const DICTS = {};
for (const [path, mod] of Object.entries(modules)) {
  const code = path.split('/').at(-2);
  DICTS[code] = Object.assign(DICTS[code] || {}, mod.default || {});
}

const KEY = 'corepos_lang';
const LangContext = createContext(null);

// White-label: messages that name the product use the shop's own name
// instead ("Lite mode makes Madina Store faster…"). The data folder on disk
// really is called CorePOS, so that message keeps it.
function withAppName(str, appName, key) {
  if (!appName || typeof str !== 'string' || !str.includes('CorePOS') || /data folder/.test(key)) return str;
  return str.replace(/CorePOS/g, appName);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { const l = localStorage.getItem(KEY); return LANG_CODES.includes(l) ? l : 'en'; } catch { return 'en'; }
  });
  const info = langInfo(lang);
  const [appName, setAppName] = useState(null);

  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = info.dir;
    el.dataset.font = info.font;
  }, [lang, info]);

  const setLang = useCallback((l) => {
    setLangState(LANG_CODES.includes(l) ? l : 'en');
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => {
    const chain = [DICTS[lang], info.fallback && DICTS[info.fallback]].filter(Boolean);
    const t = (str, vars) => {
      if (str == null) return '';
      let out;
      if (lang !== 'en') for (const d of chain) { if (d[str] !== undefined) { out = d[str]; break; } }
      if (import.meta.env.DEV && lang !== 'en' && DICTS[lang]?.[str] === undefined && typeof str === 'string' && /[a-z]/i.test(str)) {
        ((window.__missing ||= {})[lang] ||= new Set()).add(str);
      }
      return withAppName(interpolate(out ?? str, vars), appName, str);
    };
    const rtl = info.dir === 'rtl';
    // isUrdu: any right-to-left language (prints use the same no-monospace, tall-line layout)
    return { lang, setLang, info, isRtl: rtl, isUrdu: rtl, dir: info.dir, locale: info.locale, t, setAppName };
  }, [lang, setLang, info, appName]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

// Fallback (English, no-op switch) if a component ever renders outside the provider.
const FALLBACK = { lang: 'en', setLang: () => {}, setAppName: () => {}, info: langInfo('en'), isRtl: false, isUrdu: false, dir: 'ltr', locale: 'en-PK', t: (s, v) => interpolate(s ?? '', v) };

export const useLang = () => useContext(LangContext) || FALLBACK;

// const t = useT();
export const useT = () => (useContext(LangContext) || FALLBACK).t;
