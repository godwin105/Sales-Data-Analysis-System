import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, History,
  Receipt, FileText, TrendingUp, X,
} from 'lucide-react';
import BrandMark from './BrandMark';
import { useAuth } from '../context/AuthContext';

/**
 * Sidebar navigation. On mobile/tablet (<1024px) it slides in from the left
 * when `isOpen` is true. On desktop it's always visible.
 */
export default function Sidebar({ isOpen, onClose }) {
  const { isAdmin } = useAuth();

  // All nav items; cashier sees a subset (only sales recording + history)
  const allItems = [
    { to: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard, adminOnly: true },
    { to: '/stock',         label: 'Stock',         icon: Package,         adminOnly: true },
    { to: '/sales/new',     label: 'Record Sale',   icon: ShoppingCart,    adminOnly: false },
    { to: '/sales/history', label: 'Sales History', icon: History,         adminOnly: false },
    { to: '/expenses',      label: 'Expenses',      icon: Receipt,         adminOnly: true },
    { to: '/reports',       label: 'Reports',       icon: FileText,        adminOnly: true },
    { to: '/insights',      label: 'Business Insights', icon: TrendingUp,  adminOnly: true },
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
            <div className="text-xs font-extrabold tracking-widest text-slate-400">BIASHARA APP</div>
            <div className="text-[10px] text-slate-500 mt-1">Sales Analysis System</div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white"
            aria-label="Close menu"
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
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

      
      </aside>
    </>
  );
}
