import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const TITLE_KEY_BY_PATH = {
  '/dashboard': 'pageTitle.dashboard',
  '/stock': 'pageTitle.stock',
  '/sales/new': 'pageTitle.recordSale',
  '/sales/history': 'pageTitle.salesHistory',
  '/expenses': 'pageTitle.expenses',
  '/reports': 'pageTitle.reports',
  '/insights': 'pageTitle.insights',
  '/profile': 'pageTitle.profile',
  '/staff': 'pageTitle.staff',
};

function deriveTitleKey(pathname) {
  if (TITLE_KEY_BY_PATH[pathname]) return TITLE_KEY_BY_PATH[pathname];
  const match = Object.keys(TITLE_KEY_BY_PATH).find((p) => pathname.startsWith(p));
  return match ? TITLE_KEY_BY_PATH[match] : 'pageTitle.default';
}

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();
  const title = t(deriveTitleKey(location.pathname));

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
