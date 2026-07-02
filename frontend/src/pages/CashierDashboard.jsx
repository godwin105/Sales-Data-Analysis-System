import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ShoppingCart, Banknote, AlertTriangle, Clock,
  Plus, ChevronRight, Package,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dashboardApi } from '../api/misc';
import { extractError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatTZS } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';

function KpiCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon size={20} strokeWidth={2} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide truncate">
          {label}
        </p>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function CashierDashboard() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAdmin, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  if (isAdmin) return <Navigate to="/dashboard" replace />;

  useEffect(() => {
    (async () => {
      try {
        const { data: d } = await dashboardApi.cashier();
        setData(d);
      } catch (err) {
        toast.error(extractError(err, t('dashboard.errorLoad', 'Failed to load dashboard')));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <PageSpinner />;

  const kpi = data?.kpi || {};
  const recentSales = data?.recent_sales || [];
  const lowStockItems = kpi.low_stock_items || [];

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  function formatTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const isToday = d.toDateString() === new Date().toDateString();
    return isToday
      ? formatTime(iso)
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + formatTime(iso);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {t('cashierDashboard.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{today}</p>
        </div>
        <Link
          to="/sales/new"
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus size={16} />
          {t('cashierDashboard.quickAction')}
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={ShoppingCart}
          label={t('cashierDashboard.mySalesToday')}
          value={kpi.my_sales_today ?? 0}
          sub={t('cashierDashboard.transactionsRecorded')}
          color="bg-brand-600"
        />
        <KpiCard
          icon={Banknote}
          label={t('cashierDashboard.myRevenueToday')}
          value={formatTZS(kpi.my_revenue_today ?? 0)}
          sub={t('cashierDashboard.totalToday')}
          color="bg-success"
        />
        <KpiCard
          icon={AlertTriangle}
          label={t('cashierDashboard.lowStockAlerts')}
          value={kpi.low_stock_count ?? 0}
          sub={kpi.low_stock_count > 0 ? t('cashierDashboard.itemsRunningLow') : t('cashierDashboard.allStocked')}
          color={kpi.low_stock_count > 0 ? 'bg-amber-500' : 'bg-slate-400'}
        />
        <KpiCard
          icon={Clock}
          label={t('cashierDashboard.pendingPayments')}
          value={kpi.pending_payments ?? 0}
          sub={t('cashierDashboard.awaitingConfirmation')}
          color={kpi.pending_payments > 0 ? 'bg-orange-500' : 'bg-slate-400'}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Sales — takes 2/3 width */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">
              {t('cashierDashboard.recentSales')}
            </h2>
            <Link
              to="/sales/history"
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
            >
              {t('cashierDashboard.viewAll')} <ChevronRight size={13} />
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={t('cashierDashboard.noSalesYet')}
              description={t('cashierDashboard.noSalesDesc')}
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {recentSales.map((s) => (
                <div key={s.sale_id} className="flex items-center justify-between py-3 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {formatDate(s.sale_date)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {s.items_count} {t('cashierDashboard.items')}
                      {s.payment_method && ` · ${s.payment_method}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.payment_status === 'pending' && (
                      <span className="badge-warning text-xs">{t('cashierDashboard.pending')}</span>
                    )}
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatTZS(s.total_amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Panel — takes 1/3 width */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200">
              {t('cashierDashboard.lowStockTitle')}
            </h2>
            {lowStockItems.length > 0 && (
              <span className="badge-warning">{lowStockItems.length}</span>
            )}
          </div>

          {lowStockItems.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t('cashierDashboard.allStockedTitle')}
              description={t('cashierDashboard.allStockedDesc')}
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {lowStockItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 gap-2">
                  <p className="text-sm text-slate-700 dark:text-slate-200 min-w-0 truncate">
                    {item.name}
                  </p>
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex-shrink-0">
                    {item.quantity} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}

          {lowStockItems.length > 0 && (
            <p className="text-xs text-slate-400 mt-4 border-t border-slate-100 dark:border-slate-700 pt-3">
              {t('cashierDashboard.lowStockNote')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
