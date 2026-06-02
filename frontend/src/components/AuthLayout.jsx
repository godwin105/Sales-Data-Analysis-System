import { useTranslation } from 'react-i18next';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import BrandMark from './BrandMark';
import LanguageSwitcher from './LanguageSwitcher';


export default function AuthLayout({ children }) {
  const { isDark, toggle } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950">
      {/* Top-right controls */}
      <div className="absolute right-4 top-6 z-20 flex gap-2 sm:right-8">
        <LanguageSwitcher variant="auth" />
        <button
          onClick={toggle}
          className="p-2 rounded-lg bg-white/70 dark:bg-slate-800/70 backdrop-blur text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-colors"
          aria-label={t('nav.toggleTheme')}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Centered card */}
      <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-4">
        <div className="w-full max-w-md">
          <div className="mb-4">
            <BrandMark size="md" />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
