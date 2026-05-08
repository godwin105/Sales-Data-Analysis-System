import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import BrandMark from './BrandMark';

/**
 * Shared layout for the public auth pages (login, register, forgot/reset).
 * A centered card on a soft branded background, with theme toggle.
 */
export default function AuthLayout({ children }) {
  const { isDark, toggle } = useTheme();
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950 p-4">
      {/* Theme toggle in corner */}
      <div className="flex justify-end p-2">
        <button
          onClick={toggle}
          className="p-2 rounded-lg bg-white/70 dark:bg-slate-800/70 backdrop-blur text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-colors"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-7">
            <BrandMark size="lg" />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {children}
          </div>
          <p className="text-center text-xs text-slate-500 dark:text-slate-500 mt-5">
            Developed for micro &amp; small businesses · Dar es Salaam, Tanzania
          </p>
        </div>
      </div>
    </div>
  );
}
