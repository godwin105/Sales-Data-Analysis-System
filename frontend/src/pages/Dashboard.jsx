import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import {
  DollarSign, TrendingUp, Package, AlertTriangle, ShoppingCart,
} from 'lucide-react';

import { dashboardApi } from '../api/misc';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { extractError } from '../api/client';
import { formatTZS, formatNumber, formatDateTime } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  Tooltip, Legend, Filler,
);

const CHART_COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#DC2626', '#8B5CF6', '#06B6D4'];

export default function Dashboard() {
  const toast = useToast();
  const { isDark } = useTheme();
  const { isCashier } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isCashier) {
      // Cashiers don't get the dashboard — they go straight to record-sale
      // (handled at the routing level normally — defensive here)
      return;
    }
    let active = true;
    dashboardApi
      .load()
      .then(({ data }) => active && setData(data))
      .catch((err) => active && toast.error(extractError(err, 'Could not load dashboard.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageSpinner label="Loading dashboard..." />;
  if (!data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Dashboard unavailable"
        message="Could not load dashboard data. Try refreshing the page."
      />
    );
  }

  const { kpi, recent_sales, charts } = data;
  const tickColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#334155' : '#E2E8F0';

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Today's Revenue"
          value={formatTZS(kpi.today_revenue)}
          icon={DollarSign}
          color="brand"
        />
        <KpiCard
          label="Monthly Profit"
          value={formatTZS(kpi.monthly_profit)}
          icon={TrendingUp}
          color={kpi.monthly_profit >= 0 ? 'success' : 'danger'}
        />
        <KpiCard
          label="Total Products"
          value={formatNumber(kpi.total_products)}
          icon={Package}
          color="warning"
        />
        <KpiCard
          label="Low Stock Alerts"
          value={formatNumber(kpi.low_stock_count)}
          icon={AlertTriangle}
          color={kpi.low_stock_count > 0 ? 'danger' : 'slate'}
        />
      </div>

      {/* Top charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">
            Sales Trend — Last 30 Days
          </h3>
          {charts.trend.values.some((v) => v > 0) ? (
            <div className="h-64">
              <Line
                data={{
                  labels: charts.trend.labels,
                  datasets: [{
                    label: 'Revenue',
                    data: charts.trend.values,
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderWidth: 2,
                  }],
                }}
                options={lineOpts(tickColor, gridColor)}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
              No sales data for the last 30 days yet.
            </p>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">
            Top 5 Products by Revenue
          </h3>
          {charts.top_products.values.length > 0 ? (
            <div className="h-64">
              <Bar
                data={{
                  labels: charts.top_products.labels,
                  datasets: [{
                    label: 'Revenue (TZS)',
                    data: charts.top_products.values,
                    backgroundColor: CHART_COLORS,
                    borderRadius: 6,
                  }],
                }}
                options={barOpts(tickColor, gridColor, true)}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
              No product sales this month yet.
            </p>
          )}
        </div>
      </div>

      {/* Bottom row: doughnut + recent sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">
            Expense Breakdown
          </h3>
          {charts.expenses.values.length > 0 ? (
            <div className="h-64 flex items-center justify-center">
              <Doughnut
                data={{
                  labels: charts.expenses.labels,
                  datasets: [{
                    data: charts.expenses.values,
                    backgroundColor: CHART_COLORS,
                    borderColor: isDark ? '#1E293B' : '#FFFFFF',
                    borderWidth: 2,
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'right',
                      labels: { color: tickColor, font: { size: 12 }, boxWidth: 14 },
                    },
                  },
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
              No expenses recorded this month.
            </p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              Recent Sales
            </h3>
            <Link to="/sales/history" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500">
              View all →
            </Link>
          </div>
          {recent_sales.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="No sales yet"
              message="Recorded sales will appear here."
            />
          ) : (
            <div className="space-y-2">
              {recent_sales.map((s) => (
                <div
                  key={s.sale_id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(s.sale_date)}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      by {s.recorder_name}
                    </div>
                  </div>
                  <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    {formatTZS(s.total_amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }) {
  const palette = {
    brand:   'bg-brand-50 text-brand-600 dark:bg-brand-600/20 dark:text-brand-500',
    success: 'bg-green-50 text-success dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-amber-50 text-warning dark:bg-amber-900/30 dark:text-amber-400',
    danger:  'bg-red-50 text-danger dark:bg-red-900/30 dark:text-red-400',
    slate:   'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  }[color] || 'bg-slate-100 text-slate-600';

  return (
    <div className="card flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1.5 break-words">
          {value}
        </p>
      </div>
      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${palette}`}>
        <Icon size={20} />
      </div>
    </div>
  );
}

function lineOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
      y: {
        ticks: {
          color: tickColor, font: { size: 10 },
          callback: (v) => 'TZS ' + (v >= 1000 ? `${v / 1000}k` : v),
        },
        grid: { color: gridColor, drawBorder: false },
        beginAtZero: true,
      },
    },
  };
}

function barOpts(tickColor, gridColor, horizontal = false) {
  return {
    responsive: true, maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
      y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
    },
  };
}
