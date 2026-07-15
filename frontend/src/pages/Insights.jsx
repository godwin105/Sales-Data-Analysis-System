import { useEffect, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb,
  ArrowUpRight, ArrowDownRight, BarChart3, Package,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { insightsApi } from '../api/misc';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { extractError } from '../api/client';
import { formatNumber, formatQuantity, formatTZS, toIsoDate } from '../utils/format';
import { getProductColors } from '../utils/productColors';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';

const [EAT_YEAR, EAT_MONTH] = toIsoDate().split('-').map(Number);

const EN_MONTH_ABB = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  Tooltip, Legend, Filler,
);

const DOUGHNUT_COLORS = [
  '#2563EB','#16A34A','#F59E0B','#DC2626',
  '#8B5CF6','#0891B2','#DB2777','#65A30D','#EA580C','#9333EA',
];

export default function Insights() {
  const toast       = useToast();
  const { isDark }  = useTheme();
  const { t }       = useTranslation();

  const tMonthAbbr = (abbr) => { const n = EN_MONTH_ABB[abbr]; return n ? t(`monthsAbbr.${n}`) : abbr; };
  const tDay       = (day)  => t(`days.${day}`, day);
  const tCat       = (cat)  => t(`categories.stock.${cat}`, cat);

  const [selYear,  setSelYear]  = useState(EAT_YEAR);
  const [selMonth, setSelMonth] = useState(EAT_MONTH);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const [compareMonths,   setCompareMonths]   = useState(6);
  const [compareData,     setCompareData]     = useState(null);
  const [compareLoading,  setCompareLoading]  = useState(false);

  const [velocityMonths,  setVelocityMonths]  = useState(1);
  const [velocityData,    setVelocityData]    = useState(null);
  const [velocityLoading, setVelocityLoading] = useState(false);

  const [weeklyData,    setWeeklyData]   = useState(null);
  const [weeklyLoading, setWeeklyLoading]= useState(false);

  const isCurrentMonth = selYear === EAT_YEAR && selMonth === EAT_MONTH;

  // Persisted across period changes so the prev boundary stays consistent
  const [businessStart, setBusinessStart] = useState(null);

  // Max months we can compare back — capped to when the business actually started
  const maxCompareMonths = businessStart
    ? Math.max(1, (selYear - businessStart.year) * 12 + (selMonth - businessStart.month) + 1)
    : 12;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setVelocityMonths(1);
    setWeeklyData(null);
    insightsApi.load(selYear, selMonth)
      .then(({ data: d }) => {
        if (!active) return;
        setData(d);
        setCompareData(d.charts?.compare  ?? null);
        setVelocityData(d.charts?.velocity ?? null);
        if (d.business_start) {
          setBusinessStart(d.business_start);
          // Cap compareMonths to how long the business has actually been running
          const maxMo = Math.max(1,
            (selYear - d.business_start.year) * 12 + (selMonth - d.business_start.month) + 1
          );
          setCompareMonths((prev) => Math.min(prev, maxMo));
        }
      })
      .catch((err) => active && toast.error(extractError(err, t('insights.errorLoad'))))
      .finally(() => active && setLoading(false));
    // Fetch initial weekly data (auto-detect current week)
    setWeeklyLoading(true);
    insightsApi.weeklyRevenue(selYear, selMonth, -1)
      .then(({ data: d }) => { if (active) setWeeklyData(d); })
      .catch(() => {})
      .finally(() => active && setWeeklyLoading(false));
    return () => { active = false; };
  }, [selYear, selMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCompare = useCallback((months, year, month) => {
    setCompareLoading(true);
    insightsApi.compare(months, year, month)
      .then(({ data: d }) => setCompareData(d))
      .catch(() => {})
      .finally(() => setCompareLoading(false));
  }, []);

  const fetchVelocity = useCallback((months, year, month) => {
    setVelocityLoading(true);
    insightsApi.velocity(months, year, month)
      .then(({ data: d }) => setVelocityData(d))
      .catch(() => {})
      .finally(() => setVelocityLoading(false));
  }, []);

  const fetchWeekly = useCallback((year, month, weekIndex) => {
    setWeeklyLoading(true);
    insightsApi.weeklyRevenue(year, month, weekIndex)
      .then(({ data: d }) => setWeeklyData(d))
      .catch(() => {})
      .finally(() => setWeeklyLoading(false));
  }, []);

  function handleCompareChange(e) {
    const v = Number(e.target.value);
    setCompareMonths(v);
    fetchCompare(v, selYear, selMonth);
  }

  function handleVelocityChange(e) {
    const v = Number(e.target.value);
    setVelocityMonths(v);
    fetchVelocity(v, selYear, selMonth);
  }

  function handleWeekChange(e) {
    const idx = Number(e.target.value);
    // Optimistically update the stored data's week_index so dropdown stays in sync
    setWeeklyData((prev) => prev ? { ...prev, week_index: idx } : prev);
    fetchWeekly(selYear, selMonth, idx);
  }

  const minSel = businessStart
    ? businessStart.month === 1
      ? { year: businessStart.year - 1, month: 12 }
      : { year: businessStart.year, month: businessStart.month - 1 }
    : null;

  const isAtMin = minSel && selYear === minSel.year && selMonth === minSel.month;

  function goToPrev() {
    if (isAtMin) return;
    if (selMonth === 1) { setSelMonth(12); setSelYear((y) => y - 1); }
    else { setSelMonth((m) => m - 1); }
  }

  function goToNext() {
    if (isCurrentMonth) return;
    if (selMonth === 12) { setSelMonth(1); setSelYear((y) => y + 1); }
    else { setSelMonth((m) => m + 1); }
  }

  if (loading) return <PageSpinner label={t('insights.loading')} />;
  if (!data)   return <EmptyState icon={AlertTriangle} title={t('insights.unavailable')} />;

  const isBeforeStart = data.is_before_start;
  const { kpis, priority_alerts, forecast, charts } = data;
  const periodLabel = `${t(`months.${selMonth}`)} ${selYear}`;
  const tickColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#334155' : '#E2E8F0';

  return (
    <div className="space-y-6 min-w-0">

      {/* Period navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={goToPrev}
          disabled={!!isAtMin}
          className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="text-center">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
            {t('insights.period')}
          </p>
          <p className="text-base font-bold text-slate-800 dark:text-slate-100">{periodLabel}</p>
          {!isCurrentMonth && !isBeforeStart && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {t('insights.historicalView')}
            </span>
          )}
        </div>

        <button
          onClick={goToNext}
          disabled={isCurrentMonth}
          className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── Empty states (navigator stays visible above) ─────────────────────── */}
      {isBeforeStart ? (
        <div className="card border-l-4 border-l-slate-400 dark:border-l-slate-600">
          <div className="flex items-start gap-3 py-2">
            <AlertTriangle className="text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" size={22} />
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-200">
                {t('insights.beforeStartTitle')}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t('insights.beforeStartMessage', {
                  month: businessStart
                    ? `${t(`months.${businessStart.month}`)} ${businessStart.year}`
                    : '',
                })}
              </p>
            </div>
          </div>
        </div>
      ) : !data.has_data ? (
        <div className="card">
          <EmptyState
            icon={BarChart3}
            title={t('insights.notEnoughData')}
            message={t('insights.notEnoughDataMessage')}
          />
        </div>
      ) : <>

      {/* ── KPI cards (5) ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiBox
          label={t('insights.revenue')}
          value={`TZS ${kpis.revenue_display}`}
          delta={kpis.revenue_change}
          deltaSuffix={t('insights.vsLastMonth')}
          positive={kpis.revenue_change >= 0}
        />
        <KpiBox
          label={t('insights.netProfit')}
          value={`TZS ${kpis.profit_display}`}
          delta={kpis.profit_margin}
          deltaSuffix={t('insights.margin')}
          positive={kpis.profit_margin >= 0}
        />
        <KpiBox
          label={t('insights.expenses')}
          value={`TZS ${kpis.expenses_display}`}
          delta={kpis.expense_change}
          deltaSuffix={t('insights.vsLastMonth')}
          positive={kpis.expense_change <= 0}
        />
        <KpiBox
          label={t('insights.totalTransactions')}
          value={formatNumber(kpis.total_transactions)}
          delta={kpis.txn_change}
          deltaSuffix={t('insights.vsLastMonth')}
          positive={kpis.txn_change >= 0}
        />
        <KpiBox
          label={t('insights.criticalAlerts')}
          value={formatNumber(kpis.critical_alerts)}
          deltaSuffix={kpis.critical_alerts > 0 ? t('insights.needsAttention') : t('insights.allGood')}
          variant={kpis.critical_alerts > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* ── Priority alerts ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
          {t('insights.priorityAlerts')}
        </h2>

        {priority_alerts.critical_stockouts.length > 0 && (
          <div className="card border-l-4 border-l-danger">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-danger flex-shrink-0 mt-1" size={22} />
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {t('insights.criticalStockTitle')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 mb-3">
                  {t('insights.criticalStockIntro')}
                </p>
                <div className="space-y-2">
                  {priority_alerts.critical_stockouts.map((s) => (
                    <div key={s.name} className="flex flex-col gap-1 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{s.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t('insights.sellingPerDay', { rate: formatQuantity(s.daily_rate), left: formatQuantity(s.units_left), unit: s.unit || 'pcs' })}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-danger self-start sm:self-auto sm:whitespace-nowrap">
                        {t('insights.daysLeft', { days: formatQuantity(s.days_left) })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {priority_alerts.slow_moving?.length > 0 && (
          <div className="card border-l-4 border-l-warning">
            <div className="flex items-start gap-3">
              <Package className="text-warning flex-shrink-0 mt-1" size={22} />
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {t('insights.slowMovingTitle')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 mb-3">
                  {t('insights.slowMovingIntro')}
                </p>
                <div className="space-y-2">
                  {priority_alerts.slow_moving.map((s) => (
                    <div key={s.name} className="flex flex-col gap-1 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate min-w-0">{s.name}</p>
                      <div className="text-xs text-slate-500 dark:text-slate-400 sm:text-right flex gap-3 sm:block">
                        <p>{formatQuantity(s.units_stock)} {s.unit || 'pcs'} {t('insights.inStock')}</p>
                        <p>{formatQuantity(s.units_sold_30d)} {s.unit || 'pcs'} {t('insights.soldIn30d')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {priority_alerts.expense_ratio_warning && (
          <div className="card border-l-4 border-l-warning">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-warning flex-shrink-0 mt-1" size={22} />
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {t('insights.highExpenseRatio')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {t('insights.highExpenseRatioMessage', { ratio: formatPercent(priority_alerts.expense_ratio) })}
                </p>
              </div>
            </div>
          </div>
        )}

        {priority_alerts.revenue_growth && (
          <div className="card border-l-4 border-l-success">
            <div className="flex items-start gap-3">
              <TrendingUp className="text-success flex-shrink-0 mt-1" size={22} />
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {t('insights.revenueGrowing')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {t('insights.revenueGrowingMessage', { change: formatPercent(kpis.revenue_change), gain: kpis.revenue_gain_display })}
                </p>
              </div>
            </div>
          </div>
        )}

        {priority_alerts.critical_stockouts.length === 0 &&
         !priority_alerts.slow_moving?.length &&
         !priority_alerts.expense_ratio_warning &&
         !priority_alerts.revenue_growth && (
          <div className="card">
            <div className="flex items-start gap-3">
              <Lightbulb className="text-brand-500 flex-shrink-0 mt-1" size={22} />
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {t('insights.businessSteady')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {t('insights.businessSteadyMessage')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Revenue Forecast (current month only) ───────────────────────────── */}
      {isCurrentMonth && forecast?.value > 0 && (
        <div className="card border-l-4 border-l-brand-500">
          <div className="flex items-start gap-3">
            {forecast.trend >= 0
              ? <TrendingUp  className="text-brand-500 flex-shrink-0 mt-1" size={22} />
              : <TrendingDown className="text-slate-500 flex-shrink-0 mt-1" size={22} />
            }
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {t('insights.forecastTitle')}
              </h3>
              <p className="text-xl sm:text-2xl font-bold text-brand-600 dark:text-brand-400 mt-1 break-all">
                TZS {forecast.display}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {Math.abs(forecast.trend) < 2
                  ? t('insights.forecastFlat')
                  : forecast.trend > 0
                    ? t('insights.forecastUp',   { pct: formatPercent(Math.abs(forecast.trend)) })
                    : t('insights.forecastDown', { pct: formatPercent(Math.abs(forecast.trend)) })
                }
                {' — '}{t('insights.forecastDesc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Performance Trends ──────────────────────────────────────────────── */}
      <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider pt-2">
        {t('insights.performanceTrends')}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">

        {/* Top-left: Weekly Revenue by Day of Week */}
        <ChartCard
          title={t('insights.weeklyRevByDay')}
          loading={weeklyLoading}
          action={
            weeklyData?.weeks?.length > 1 ? (
              <PeriodSelect
                value={weeklyData.week_index ?? 0}
                onChange={handleWeekChange}
                options={(weeklyData.weeks || []).map((w) => ({ value: w.index, label: w.label }))}
              />
            ) : null
          }
        >
          {weeklyData?.values?.length > 0 ? (
            <Bar
              data={{
                labels: (weeklyData.labels || []).map(tDay),
                datasets: [{ label: t('insights.revenue'), data: weeklyData.values, backgroundColor: '#F59E0B', borderRadius: 6 }],
              }}
              options={moneyOpts(tickColor, gridColor)}
            />
          ) : (
            <EmptyChart label={t('insights.noData')} />
          )}
        </ChartCard>

        {/* Top-right: Profit Margin Trend */}
        <ChartCard title={t('insights.profitMarginTrend')}>
          <Line
            data={{
              labels: charts.margin.labels.map(tMonthAbbr),
              datasets: [{
                label: t('insights.margin'),
                data: charts.margin.values,
                borderColor: '#16A34A',
                backgroundColor: 'rgba(22,163,74,0.1)',
                fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2,
              }],
            }}
            options={percentOpts(tickColor, gridColor)}
          />
        </ChartCard>

        {/* Bottom-left: Revenue vs Expenses + dropdown */}
        <ChartCard
          title={t('insights.revenueVsExpenses')}
          loading={compareLoading}
          action={
            <PeriodSelect value={compareMonths} onChange={handleCompareChange} options={[
              { value: 1,  label: t('insights.period1Month') },
              { value: 3,  label: t('insights.period3Months') },
              { value: 6,  label: t('insights.period6Months') },
              { value: 12, label: t('insights.period12Months') },
            ].filter((o) => o.value <= maxCompareMonths)} />
          }
        >
          {compareData && (
            <Bar
              data={{
                labels: compareData.labels.map(tMonthAbbr),
                datasets: [
                  { label: t('insights.revenue'),  data: compareData.revenue,  backgroundColor: '#2563EB', borderRadius: 6, maxBarThickness: 72 },
                  { label: t('insights.expenses'), data: compareData.expenses, backgroundColor: '#DC2626', borderRadius: 6, maxBarThickness: 72 },
                ],
              }}
              options={legendOpts(tickColor, gridColor)}
            />
          )}
        </ChartCard>

        {/* Bottom-right: Top Selling Products + dropdown */}
        <ChartCard
          title={t('insights.topSelling')}
          loading={velocityLoading}
          action={
            <PeriodSelect value={velocityMonths} onChange={handleVelocityChange} options={[
              { value: 1, label: t('insights.thisMonth') },
              { value: 2, label: t('insights.last2Months') },
              { value: 3, label: t('insights.last3Months') },
              { value: 6, label: t('insights.last6Months') },
            ]} />
          }
        >
          {velocityData?.values?.length > 0 ? (
            <Bar
              data={{
                labels: velocityData.labels,
                datasets: [{
                  label: t('insights.revenueLabel'),
                  data: velocityData.values,
                  backgroundColor: getProductColors(velocityData.labels),
                  borderRadius: 6,
                }],
              }}
              options={velocityOpts(tickColor, gridColor)}
            />
          ) : (
            <EmptyChart label={t('insights.noSalesMonth')} />
          )}
        </ChartCard>

        {/* Gross Profit per Product */}
        <ChartCard title={t('insights.grossProfitByProduct')}>
          {charts.gross_profit?.values?.length > 0 ? (
            <Bar
              data={{
                labels: charts.gross_profit.labels,
                datasets: [{
                  label: t('insights.grossProfitLabel'),
                  data: charts.gross_profit.values,
                  backgroundColor: getProductColors(charts.gross_profit.labels),
                  borderRadius: 6,
                }],
              }}
              options={velocityOpts(tickColor, gridColor)}
            />
          ) : (
            <EmptyChart label={t('insights.noData')} />
          )}
        </ChartCard>

        {/* Revenue by Product Category */}
        <ChartCard title={t('insights.revenueByCategory')}>
          {charts.cat_revenue?.values?.length > 0 ? (
            <Doughnut
              data={{
                labels: charts.cat_revenue.labels.map(tCat),
                datasets: [{
                  data: charts.cat_revenue.values,
                  backgroundColor: DOUGHNUT_COLORS,
                  borderWidth: 2,
                  borderColor: isDark ? '#1E293B' : '#FFFFFF',
                }],
              }}
              options={doughnutOpts(tickColor)}
            />
          ) : (
            <EmptyChart label={t('insights.noData')} />
          )}
        </ChartCard>

      </div>

      </> /* end has_data */}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiBox({ label, value, delta, deltaSuffix, positive, variant }) {
  let deltaIcon = null, deltaClass = 'text-slate-500';
  if (typeof delta === 'number') {
    if (positive) { deltaIcon = <ArrowUpRight size={13} />;   deltaClass = 'text-success'; }
    else          { deltaIcon = <ArrowDownRight size={13} />; deltaClass = 'text-danger'; }
  }
  let valueClass = 'text-slate-800 dark:text-slate-100';
  if (variant === 'danger')  valueClass = 'text-danger';
  if (variant === 'success') valueClass = 'text-success';

  return (
    <div className="card min-w-0 overflow-hidden">
      <p className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 truncate">{label}</p>
      <p className={`text-base sm:text-lg font-bold mt-1.5 break-words ${valueClass}`}>{value}</p>
      <div className="flex items-center gap-1 mt-2 text-xs flex-wrap">
        {deltaIcon && (
          <span className={`flex items-center gap-0.5 font-semibold flex-shrink-0 ${deltaClass}`}>
            {deltaIcon}{formatPercent(Math.abs(delta))}%
          </span>
        )}
        <span className="text-slate-500 dark:text-slate-400 truncate">{deltaSuffix}</span>
      </div>
    </div>
  );
}

function ChartCard({ title, children, action, loading }) {
  return (
    <div className="card min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 min-w-0 flex-1">{title}</h3>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      <div className={`h-56 sm:h-64 w-full relative overflow-hidden transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
        {children}
      </div>
    </div>
  );
}

function PeriodSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function EmptyChart({ label }) {
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">{label}</p>
  );
}

// ── Chart option helpers ──────────────────────────────────────────────────────

function legendOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: tickColor, font: { size: 11 }, boxWidth: 14 } },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: TZS ${formatNumber(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: tickColor, font: { size: 10 }, callback: (v) => formatNumber(v) }, grid: { color: gridColor }, beginAtZero: true },
    },
  };
}

function percentOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: tickColor, font: { size: 10 }, callback: (v) => `${formatPercent(v)}%` }, grid: { color: gridColor } },
    },
  };
}

function moneyOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: tickColor, font: { size: 10 }, callback: (v) => formatTZS(v) }, grid: { color: gridColor }, beginAtZero: true },
    },
  };
}

function velocityOpts(tickColor, gridColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: {
          color: tickColor, font: { size: 9 }, maxRotation: 45,
          callback: function(val) {
            const label = this.getLabelForValue(val);
            return label && label.length > 13 ? label.slice(0, 13) + '…' : label;
          },
        },
        grid: { display: false },
      },
      y: {
        ticks: { color: tickColor, font: { size: 10 }, callback: (v) => formatTZS(v) },
        grid: { color: gridColor }, beginAtZero: true,
      },
    },
  };
}

function doughnutOpts(tickColor) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: tickColor, font: { size: 10 }, boxWidth: 12, padding: 8 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((sum, value) => sum + Number(value || 0), 0);
            const percent = total > 0 ? (Number(ctx.parsed || 0) / total) * 100 : 0;
            return ` ${ctx.label}: TZS ${formatNumber(ctx.parsed)} (${formatPercent(percent)}%)`;
          },
        },
      },
    },
  };
}

function formatPercent(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
