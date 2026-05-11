import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Package, ShoppingCart, History,
  Receipt, FileText, TrendingUp, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Sidebar navigation. On mobile/tablet (<1024px) it slides in from the left
 * when `isOpen` is true. On desktop it's always visible.
 */
export default function Sidebar({ isOpen, onClose }) {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();

  // All nav items; cashier sees a subset (only sales recording + history)
  const allItems = [
    { to: '/dashboard',     labelKey: 'nav.dashboard',     icon: LayoutDashboard, adminOnly: true },
    { to: '/stock',         labelKey: 'nav.stock',         icon: Package,         adminOnly: true },
    { to: '/sales/new',     labelKey: 'nav.recordSale',    icon: ShoppingCart,    adminOnly: false },
    { to: '/sales/history', labelKey: 'nav.salesHistory',  icon: History,         adminOnly: false },
    { to: '/expenses',      labelKey: 'nav.expenses',      icon: Receipt,         adminOnly: true },
    { to: '/reports',       labelKey: 'nav.reports',       icon: FileText,        adminOnly: true },
    { to: '/insights',      labelKey: 'nav.insights',      icon: TrendingUp,      adminOnly: true },
  ];
  const items = allItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-[230px] bg-navy text-slate-300 flex flex-col
          transform transition-transform duration-200 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:transition-none
        `}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-slate-700 flex items-center justify-between">
          <div>
            <div className="text-xs font-extrabold tracking-widest text-slate-400">
              {t('brand.shortName')}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {t('brand.subtitle')}
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white"
            aria-label={t('nav.closeMenu')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto no-scrollbar">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) => `
                  flex items-center gap-2.5 px-5 py-3 text-sm font-medium
                  border-l-[3px] transition-colors
                  ${isActive
                    ? 'bg-brand-600/30 text-white border-brand-500'
                    : 'text-slate-400 border-transparent hover:bg-slate-800 hover:text-white'
                  }
                `}
              >
                <Icon size={18} strokeWidth={2} />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
