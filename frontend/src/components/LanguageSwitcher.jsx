import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';


export default function LanguageSwitcher({ variant = 'default' }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function changeLanguage(code) {
    i18n.changeLanguage(code);
    setOpen(false);
  }

  const current = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  // Style variants
  const buttonClass = variant === 'auth'
    ? 'flex items-center px-2.5 py-2 rounded-lg bg-white/70 dark:bg-slate-800/70 backdrop-blur text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-colors text-sm font-semibold'
    : 'flex items-center px-2 py-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-semibold';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClass}
        aria-label="Change language"
        title="Change language"
      >
        <span className="uppercase text-xs">{current}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1.5 z-50">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => changeLanguage(lang.code)}
              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                current === lang.code
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-400 font-semibold'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <span>{lang.nativeLabel}</span>
              <span className="text-xs uppercase opacity-60">{lang.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
