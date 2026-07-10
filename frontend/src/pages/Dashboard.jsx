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
  DollarSign, TrendingUp, TrendingDown, Package, AlertTriangle, ShoppingCart,
  BarChart3,
  BarChart2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isCashier) return;
    let active = true;
    dashboardApi
      .load()
      .then(({ data }) => active && setData(data))
      .catch((err) => active && toast.error(extractError(err, t('dashboard.errorLoad'))))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  // Month selectors — declared before early returns so hook order is stable
  const todayDate = new Date();
  const curYear = todayDate.getFullYear();
  const curMonth = todayDate.getMonth() + 1;

  const [topMonth, setTopMonth] = useState({ year: curYear, month: curMonth });
  const [topData, setTopData] = useState(null);
  const [topLoading, setTopLoading] = useState(false);

  const [trendMonth, setTrendMonth] = useState({ year: curYear, month: curMonth });
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const [expenseMonth, setExpenseMonth] = useState({ year: curYear, month: curMonth });
  const [expenseData, setExpenseData] = useState(null);
  const [expenseLoading, setExpenseLoading] = useState(false);

  // monthOptions uses t() so labels update automatically when language changes
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(curYear, todayDate.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    return { year: y, month: m, label: `${t(`months.${m}`)} ${y}` };
  });

  function handleTopMonthChange(e) {
    const [year, month] = e.target.value.split('-').map(Number);
    setTopMonth({ year, month });
    if (year === curYear && month === curMonth) { setTopData(null); return; }
    setTopLoading(true);
    dashboardApi
      .topProductsByMonth(year, month)
      .then(({ data: d }) => setTopData(d))
      .catch(() => toast.error(t('dashboard.errorLoad')))
      .finally(() => setTopLoading(false));
  }

  function handleTrendMonthChange(e) {
    const [year, month] = e.target.value.split('-').map(Number);
    setTrendMonth({ year, month });
    if (year === curYear && month === curMonth) { setTrendData(null); return; }
    setTrendLoading(true);
    dashboardApi
      .salesTrendByMonth(year, month)
      .then(({ data: d }) => setTrendData(d))
      .catch(() => toast.error(t('dashboard.errorLoad')))
      .finally(() => setTrendLoading(false));
  }

  function handleExpenseMonthChange(e) {
    const [year, month] = e.target.value.split('-').map(Number);
    setExpenseMonth({ year, month });
    if (year === curYear && month === curMonth) { setExpenseData(null); return; }
    setExpenseLoading(true);
    dashboardApi
      .expensesByMonth(year, month)
      .then(({ data: d }) => setExpenseData(d))
      .catch(() => toast.error(t('dashboard.errorLoad')))
      .finally(() => setExpenseLoading(false));
  }

  if (loading) return <PageSpinner label={t('dashboard.loading')} />;
  if (!data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('dashboard.unavailable')}
        message={t('dashboard.unavailableMessage')}
      />
    );
  }

  const { kpi, recent_sales, charts } = data;
  const displayTopData = topData || charts.top_products;
  const displayTrendData = trendData || charts.trend;
  const displayExpenseData = expenseData || charts.expenses;
  const tickColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#334155' : '#E2E8F0';
  const expenseLabels = displayExpenseData.labels.map((label) => t(`categories.expenses.${label}`, label));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={t('dashboard.todayRevenue')} value={formatTZS(kpi.today_revenue)} icon={BarChart2} color="brand" />
        <KpiCard label={t('dashboard.monthlyProfit')} value={formatTZS(kpi.monthly_profit)} icon={kpi.monthly_profit >= 0 ? TrendingUp : TrendingDown} color={kpi.monthly_profit >= 0 ? 'success' : 'danger'} />
        <KpiCard label={t('dashboard.totalProducts')} value={formatNumber(kpi.total_products)} icon={Package} color="warning" />
        <KpiCard
          label={t('dashboard.lowStockAlerts')}
          value={formatNumber(kpi.low_stock_count)}
          icon={AlertTriangle}
          color={kpi.low_stock_count > 0 ? 'danger' : 'slate'}
          href="/stock"
          lowStockItems={kpi.low_stock_items || []}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {t('dashboard.salesTrend')}
            </h3>
            <select
              value={`${trendMonth.year}-${trendMonth.month}`}
              onChange={handleTrendMonthChange}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {monthOptions.map((o) => (
                <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {trendLoading ? (
            <div className="h-72 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-600 border-t-transparent" />
            </div>
          ) : displayTrendData.datasets?.length > 0 ? (
            <div className="h-72">
              <Line
                data={{
                  labels: displayTrendData.labels,
                  datasets: displayTrendData.datasets.map((ds, i) => ({
                    label: ds.name,
                    data: ds.values,
                    unit: ds.unit || 'pcs',
                    borderColor: CHART_COLORS[i],
                    backgroundColor: CHART_COLORS[i],
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointStyle: 'circle',
                    borderWidth: 2,
                  })),
                }}
                options={multiLineOpts(tickColor, gridColor)}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
              {t('dashboard.noSalesData')}
            </p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {t('dashboard.topProducts')}
            </h3>
            <select
              value={`${topMonth.year}-${topMonth.month}`}
              onChange={handleTopMonthChange}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {monthOptions.map((o) => (
                <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {topLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-600 border-t-transparent" />
            </div>
          ) : displayTopData.values.length > 0 ? (
            <div className="h-64">
              <Bar
                data={{
                  labels: displayTopData.labels,
                  datasets: [{
                    label: 'Units',
                    data: displayTopData.values,
                    backgroundColor: CHART_COLORS,
                    borderRadius: 6,
                  }],
                }}
                options={verticalBarOpts(tickColor, gridColor, displayTopData.units || [])}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
              {t('dashboard.noProductSales')}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {t('dashboard.expenseBreakdown')}
            </h3>
            <select
              value={`${expenseMonth.year}-${expenseMonth.month}`}
              onChange={handleExpenseMonthChange}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {monthOptions.map((o) => (
                <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {expenseLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-600 border-t-transparent" />
            </div>
          ) : displayExpenseData.values.length > 0 ? (
            <div className="h-64 flex items-center justify-center">
              <Doughnut
                data={{
                  labels: expenseLabels,
                  datasets: [{
                    data: displayExpenseData.values,
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
              {t('dashboard.noExpenses')}
            </p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {t('dashboard.recentSales')}
            </h3>
            <Link to="/sales/history" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500">
              {t('common.viewAll')} →
            </Link>
          </div>
          {recent_sales.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={t('dashboard.noSalesYet')}
              message={t('dashboard.noSalesMessage')}
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
                      {formatDateTime(s.sale_date, i18n.language)}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      {t('dashboard.by', { name: s.recorder_name })}
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

function KpiCard({ label, value, icon: Icon, color, href, lowStockItems }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const palette = {
    brand:   'bg-brand-50 text-brand-600 dark:bg-brand-600/20 dark:text-brand-500',
    success: 'bg-green-50 text-success dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-amber-50 text-warning dark:bg-amber-900/30 dark:text-amber-400',
    danger:  'bg-red-50 text-danger dark:bg-red-900/30 dark:text-red-400',
    slate:   'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  }[color] || 'bg-slate-100 text-slate-600';

  const inner = (
    <>
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
    </>
  );

  if (href) {
    return (
      <div
        className="relative"
        onMouseEnter={() => lowStockItems?.length > 0 && setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
      >
        <Link
          to={href}
          className="card flex items-start justify-between hover:ring-2 hover:ring-brand-300 dark:hover:ring-brand-700 transition-all h-full"
        >
          {inner}
        </Link>

        {tooltipVisible && lowStockItems.length > 0 && (
          <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 uppercase tracking-wide">
              Low Stock Products
            </p>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {lowStockItems.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300 truncate">{item.name}</span>
                  <span className="flex-shrink-0 font-bold text-danger">
                    {item.quantity} left
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card flex items-start justify-between">
      {inner}
    </div>
  );
}

function multiLineOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: tickColor,
          font: { size: 10 },
          boxWidth: 10,
          padding: 8,
          usePointStyle: true,
          pointStyleWidth: 10,
        },
      },
      tooltip: {
        mode: 'nearest',
        intersect: false,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)} ${ctx.dataset.unit || 'pcs'}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
      y: {
        ticks: { color: tickColor, font: { size: 10 }, callback: (v) => formatNumber(v) },
        grid: { color: gridColor, drawBorder: false },
        beginAtZero: true,
      },
    },
  };
}

// Vertical bar: products on X-axis, units sold on Y-axis
function verticalBarOpts(tickColor, gridColor, units = []) {
  return {
    responsive: true, maintainAspectRatio: false,
    indexAxis: 'x',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${formatNumber(ctx.parsed.y)} ${units[ctx.dataIndex] || 'pcs'} sold`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: tickColor,
          font: { size: 10 },
          maxRotation: 30,
          minRotation: 0,
          callback: function (value) {
            const label = this.getLabelForValue(value);
            return label.length > 14 ? label.slice(0, 13) + '…' : label;
          },
        },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: tickColor,
          font: { size: 10 },
          callback: (v) => formatNumber(v),
        },
        grid: { color: gridColor, drawBorder: false },
        beginAtZero: true,
      },
    },
  };
}
