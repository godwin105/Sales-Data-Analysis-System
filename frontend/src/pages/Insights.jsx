import { useEffect, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb,
  ArrowUpRight, ArrowDownRight, BarChart3,
} from 'lucide-react';
import { insightsApi } from '../api/misc';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { extractError } from '../api/client';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';

export default function Insights() {
  const toast = useToast();
  const { isDark } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    insightsApi
      .load()
      .then(({ data }) => active && setData(data))
      .catch((err) => active && toast.error(extractError(err, 'Could not load insights.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageSpinner label="Analysing your business..." />;
  if (!data) return <EmptyState icon={AlertTriangle} title="Insights unavailable" />;

  if (!data.has_data) {
    return (
      <div className="card">
        <EmptyState
          icon={BarChart3}
          title="Not enough data yet"
          message="Record some sales and expenses, then come back to see insights about your business performance."
        />
      </div>
    );
  }

  const { kpis, priority_alerts, charts, period_label } = data;
  const tickColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#334155' : '#E2E8F0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
            Period
          </p>
          <p className="text-base font-bold text-slate-800 dark:text-slate-100">
            {period_label}
          </p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiBox
          label="Revenue"
          value={`TZS ${kpis.revenue_display}`}
          delta={kpis.revenue_change}
          deltaSuffix="vs last month"
          positive={kpis.revenue_change >= 0}
        />
        <KpiBox
          label="Net Profit"
          value={`TZS ${kpis.profit_display}`}
          delta={kpis.profit_margin}
          deltaSuffix="margin"
          positive={kpis.profit_margin >= 0}
          isPercent
        />
        <KpiBox
          label="Expenses"
          value={`TZS ${kpis.expenses_display}`}
          delta={kpis.expense_change}
          deltaSuffix="vs last month"
          positive={kpis.expense_change <= 0}  // expenses going down is good
        />
        <KpiBox
          label="Critical Alerts"
          value={kpis.critical_alerts}
          deltaSuffix={kpis.critical_alerts > 0 ? 'needs attention' : 'all good'}
          variant={kpis.critical_alerts > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Priority alerts */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
          Priority Alerts
        </h2>

        {/* Stockout warnings */}
        {priority_alerts.critical_stockouts.length > 0 && (
          <div className="card border-l-4 border-l-danger">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-danger flex-shrink-0 mt-1" size={22} />
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Critical Stock Levels
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 mb-3">
                  At current sales velocity, these products will run out within 10 days:
                </p>
                <div className="space-y-2">
                  {priority_alerts.critical_stockouts.map((s) => (
                    <div key={s.name} className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{s.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Selling {s.daily_rate} units/day · {s.units_left} units left
                        </p>
                      </div>
                      <span className="text-sm font-bold text-danger whitespace-nowrap">
                        {s.days_left} days left
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Expense ratio warning */}
        {priority_alerts.expense_ratio_warning && (
          <div className="card border-l-4 border-l-warning">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-warning flex-shrink-0 mt-1" size={22} />
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  High Expense Ratio
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Your expenses are <strong>{priority_alerts.expense_ratio}%</strong> of revenue this month.
                  This is above the healthy threshold (60%) — consider reviewing your expense categories.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Revenue growth */}
        {priority_alerts.revenue_growth && (
          <div className="card border-l-4 border-l-success">
            <div className="flex items-start gap-3">
              <TrendingUp className="text-success flex-shrink-0 mt-1" size={22} />
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Revenue is growing
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Your revenue is up <strong>{kpis.revenue_change}%</strong> compared to last month —
                  TZS {kpis.revenue_gain_display} more. Whatever you're doing, keep it up!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No specific alerts */}
        {priority_alerts.critical_stockouts.length === 0 && !priority_alerts.expense_ratio_warning && !priority_alerts.revenue_growth && (
          <div className="card">
            <div className="flex items-start gap-3">
              <Lightbulb className="text-brand-500 flex-shrink-0 mt-1" size={22} />
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Business is steady
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  No urgent alerts right now. Keep recording sales and expenses regularly to surface
                  trends and forecasts here.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Performance charts */}
      <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider pt-2">
        Performance Trends
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Revenue vs Expenses (last 6 months)">
          <Bar
            data={{
              labels: charts.compare.labels,
              datasets: [
                { label: 'Revenue', data: charts.compare.revenue, backgroundColor: '#2563EB', borderRadius: 6 },
                { label: 'Expenses', data: charts.compare.expenses, backgroundColor: '#DC2626', borderRadius: 6 },
              ],
            }}
            options={legendOpts(tickColor, gridColor)}
          />
        </ChartCard>

        <ChartCard title="Profit Margin Trend (%)">
          <Line
            data={{
              labels: charts.margin.labels,
              datasets: [{
                label: 'Margin',
                data: charts.margin.values,
                borderColor: '#16A34A',
                backgroundColor: 'rgba(22, 163, 74, 0.1)',
                fill: true, tension: 0.3,
                pointRadius: 4, borderWidth: 2,
              }],
            }}
            options={percentOpts(tickColor, gridColor)}
          />
        </ChartCard>

        <ChartCard title="Average Revenue by Day of Week">
          <Bar
            data={{
              labels: charts.days.labels,
              datasets: [{
                label: 'Average Revenue',
                data: charts.days.values,
                backgroundColor: '#F59E0B',
                borderRadius: 6,
              }],
            }}
            options={moneyOpts(tickColor, gridColor)}
          />
        </ChartCard>

        <ChartCard title="Top Selling Products (this month)">
          {charts.velocity.values.length > 0 ? (
            <Bar
              data={{
                labels: charts.velocity.labels,
                datasets: [{
                  label: 'Units Sold',
                  data: charts.velocity.values,
                  backgroundColor: '#8B5CF6',
                  borderRadius: 6,
                }],
              }}
              options={{ ...moneyOpts(tickColor, gridColor), indexAxis: 'y' }}
            />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
              No sales this month yet.
            </p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ===== Subcomponents =====

function KpiBox({ label, value, delta, deltaSuffix, positive, variant, isPercent }) {
  let deltaIcon = null;
  let deltaClass = 'text-slate-500';
  if (typeof delta === 'number') {
    if (positive) { deltaIcon = <ArrowUpRight size={13} />; deltaClass = 'text-success'; }
    else { deltaIcon = <ArrowDownRight size={13} />; deltaClass = 'text-danger'; }
  }

  let valueClass = 'text-slate-800 dark:text-slate-100';
  if (variant === 'danger') valueClass = 'text-danger';
  else if (variant === 'success') valueClass = 'text-success';

  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-1.5 ${valueClass}`}>{value}</p>
      <div className="flex items-center gap-1 mt-2 text-xs">
        {deltaIcon && (
          <span className={`flex items-center gap-0.5 font-semibold ${deltaClass}`}>
            {deltaIcon}
            {Math.abs(delta).toFixed(1)}{isPercent ? '%' : '%'}
          </span>
        )}
        <span className="text-slate-500 dark:text-slate-400">{deltaSuffix}</span>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

function legendOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: tickColor, font: { size: 11 }, boxWidth: 14 } } },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
      y: {
        ticks: { color: tickColor, font: { size: 10 }, callback: (v) => v >= 1000 ? `${v/1000}k` : v },
        grid: { color: gridColor }, beginAtZero: true,
      },
    },
  };
}
function percentOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
      y: {
        ticks: { color: tickColor, font: { size: 10 }, callback: (v) => `${v}%` },
        grid: { color: gridColor },
      },
    },
  };
}
function moneyOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
      y: {
        ticks: { color: tickColor, font: { size: 10 }, callback: (v) => v >= 1000 ? `${v/1000}k` : v },
        grid: { color: gridColor }, beginAtZero: true,
      },
    },
  };
}
