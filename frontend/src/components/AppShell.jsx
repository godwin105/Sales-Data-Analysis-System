import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const TITLE_BY_PATH = {
  '/dashboard': 'Dashboard',
  '/stock': 'Stock Management',
  '/sales/new': 'Record a Sale',
  '/sales/history': 'Sales History',
  '/expenses': 'Expenses',
  '/reports': 'Reports',
  '/insights': 'Business Insights',
  '/profile': 'My Profile',
  '/staff': 'Staff Management',
};

function deriveTitle(pathname) {
  // Exact match first
  if (TITLE_BY_PATH[pathname]) return TITLE_BY_PATH[pathname];
  // Fallback: starts-with match
  const match = Object.keys(TITLE_BY_PATH).find((p) => pathname.startsWith(p));
  return match ? TITLE_BY_PATH[match] : 'Sales Data Analysis System';
}

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const title = deriveTitle(location.pathname);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <Sidebar isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-[230px] flex flex-col min-h-screen">
        <Topbar title={title} onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 py-5 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
