// English / Urdu. Every visible string goes through t('English text'); the
// English text is the key, and src/i18n/ur/*.js map it to Urdu. Missing
// translations fall back to English, so nothing ever shows blank.
//   t('Today\'s sale')                 -> "آج کی سیل"
//   t('{n} items', { n: 3 })           -> "3 اشیاء"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const modules = import.meta.glob('../i18n/ur/*.js', { eager: true });
const UR = Object.assign({}, ...Object.values(modules).map((m) => m.default || {}));

const KEY = 'corepos_lang';
const LangContext = createContext(null);

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(KEY) === 'ur' ? 'ur' : 'en'; } catch { return 'en'; }
  });

  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => {
    const t = (str, vars) => {
      if (str == null) return '';
      const out = lang === 'ur' ? (UR[str] ?? str) : str;
      if (import.meta.env.DEV && lang === 'ur' && UR[str] === undefined && typeof str === 'string' && /[a-z]/i.test(str)) {
        (window.__missingUrdu ||= new Set()).add(str);
      }
      return interpolate(out, vars);
    };
    return { lang, setLang, isUrdu: lang === 'ur', dir: lang === 'ur' ? 'rtl' : 'ltr', t };
  }, [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

// const t = useT();
export const useT = () => useContext(LangContext).t;
