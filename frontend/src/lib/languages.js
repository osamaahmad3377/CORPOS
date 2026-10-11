// Languages CorePOS speaks. English text is the key; src/i18n/<code>/*.js map
// it to each language. A missing translation falls back along `fallback`
// (regional languages -> Urdu, which their readers know), then to English.
//   font: 'nastaliq' (Urdu style) or 'naskh' (Arabic / Persian / Sindhi / Pashto
//   style — Nastaliq has no Sindhi ڪ). `locale` is for dates and month names;
//   digits stay Latin everywhere so money and phone numbers read the same.
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', dir: 'ltr', font: 'sans', locale: 'en-PK' },
  { code: 'ur', name: 'Urdu', native: 'اردو', dir: 'rtl', font: 'nastaliq', locale: 'ur-PK' },
  { code: 'pa', name: 'Punjabi', native: 'پنجابی', dir: 'rtl', font: 'nastaliq', locale: 'ur-PK', fallback: 'ur' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', dir: 'rtl', font: 'naskh', locale: 'ur-PK', fallback: 'ur' },
  { code: 'ps', name: 'Pashto', native: 'پښتو', dir: 'rtl', font: 'naskh', locale: 'ur-PK', fallback: 'ur' },
  { code: 'bal', name: 'Balochi', native: 'بلوچی', dir: 'rtl', font: 'nastaliq', locale: 'ur-PK', fallback: 'ur' },
  { code: 'fa', name: 'Persian', native: 'فارسی', dir: 'rtl', font: 'naskh', locale: 'fa-IR-u-nu-latn' },
  { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl', font: 'naskh', locale: 'ar-u-nu-latn' },
];

export const LANG_CODES = LANGUAGES.map((l) => l.code);
export const langInfo = (code) => LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
export const fontVar = (l) => (l.font === 'sans' ? 'var(--font-sans)' : l.font === 'naskh' ? 'var(--font-naskh)' : 'var(--font-urdu)');
