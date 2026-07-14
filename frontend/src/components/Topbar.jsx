import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Sun, Moon, User, LogOut, Users, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { initials, todayLong } from '../utils/format';
import { assetUrl } from '../utils/media';
import NotificationBell from './NotificationBell';
import { SUPPORTED_LANGUAGES } from '../i18n';

//Top bar: page title, date, language switcher, theme toggle, avatar dropdown.
export default function Topbar({ title, onOpenMenu }) {
  const { user, isAdmin, logout } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    toast.info(t('auth.logoutToast'));
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 h-16 flex items-center justify-between">
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMenu}
          className="lg:hidden text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 p-1.5 rounded-md"
          aria-label={t('nav.openMenu')}
        >
          <Menu size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 truncate">{title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">{todayLong(i18n.language)}</p>
        </div>
      </div>

      {/* Center: business name badge */}
      {user?.business_name && (
        <div className="absolute left-1/2 -translate-x-1/2 hidden sm:flex items-center pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 shadow-md shadow-brand-500/30">
            <Store size={13} className="flex-shrink-0 text-white/80" />
            <span className="text-sm font-extrabold text-white tracking-wide truncate max-w-[160px] lg:max-w-[240px]">
              {user.business_name}
            </span>
          </div>
        </div>
      )}

      {/* Right: notification + theme + avatar */}
      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />

        <button
          onClick={toggleTheme}
          className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded-md transition-colors"
          aria-label={t('nav.toggleTheme')}
          title={isDark ? t('nav.lightMode') : t('nav.darkMode')}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 px-2 py-1.5 rounded-md transition-colors"
          >
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-sm flex items-center justify-center shadow-sm">
              {user?.profile_image_url ? (
                <img
                  src={assetUrl(user.profile_image_url)}
                  alt={user?.full_name || t('nav.profile')}
                  className="w-full h-full object-cover"
                />
              ) : (
                initials(user?.full_name)
              )}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                {user?.full_name?.split(' ')[0] || ''}
              </div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                {user?.role === 'admin' ? t('role.admin') : t('role.cashier')}
              </div>
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1.5 z-50">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {user?.full_name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user?.email}
                </div>
              </div>

              <button
                onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5"
              >
                <User size={16} />
                {t('nav.profile')}
              </button>

              {isAdmin && (
                <button
                  onClick={() => { setMenuOpen(false); navigate('/staff'); }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5"
                >
                  <Users size={16} />
                  {t('nav.staff')}
                </button>
              )}

              <div className="px-4 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  {t('language.label')}
                </p>
                <div className="flex gap-1.5">
                  {SUPPORTED_LANGUAGES.map((lang) => {
                    const active = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2) === lang.code;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => i18n.changeLanguage(lang.code)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {lang.nativeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="my-1 border-t border-slate-200 dark:border-slate-700"></div>

              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2.5"
              >
                <LogOut size={16} />
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
