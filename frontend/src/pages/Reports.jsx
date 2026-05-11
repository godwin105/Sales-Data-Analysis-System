import { useState } from 'react';
import { Download, FileText, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../api/misc';
import { useToast } from '../context/ToastContext';
import { extractError } from '../api/client';
import { formatTZS, formatNumber, toIsoDate } from '../utils/format';
import EmptyState from '../components/EmptyState';

export default function Reports() {
  const toast = useToast();
  const { t } = useTranslation();
  const [filters, setFilters] = useState({
    type: 'summary',
    period: 'monthly',
    from: '',
    to: toIsoDate(),
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const REPORT_TYPES = [
    { value: 'summary', label: t('reports.types.summary') },
    { value: 'sales', label: t('reports.types.sales') },
    { value: 'expenses', label: t('reports.types.expenses') },
    { value: 'profit', label: t('reports.types.profit') },
  ];

  const PERIODS = [
    { value: 'daily', label: t('reports.periods.daily') },
    { value: 'weekly', label: t('reports.periods.weekly') },
    { value: 'monthly', label: t('reports.periods.monthly') },
    { value: 'custom', label: t('reports.periods.custom') },
  ];

  function buildParams() {
    const params = { type: filters.type, period: filters.period };
    if (filters.period === 'custom') {
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
    }
    return params;
  }

  async function generatePreview(e) {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await reportsApi.preview(buildParams());
      setReport(data.report);
      if (data.report?.warning) toast.warning(data.report.warning);
      if (data.report?.is_empty) {
        toast.info(t('reports.noRecordsToast'));
      }
    } catch (err) {
      const msg = extractError(err, t('reports.errorGenerate'));
      setError(msg);
      toast.error(msg);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const response = await reportsApi.download(buildParams());
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = `report_${filters.type}_${filters.period}_${toIsoDate()}.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(t('reports.downloadedToast'));
    } catch (err) {
      let msg = t('reports.downloadFailed');
      const blob = err?.response?.data;
      if (blob && blob.type === 'application/json') {
        try {
          const text = await blob.text();
          const json = JSON.parse(text);
          msg = json.error || msg;
        } catch {}
      } else {
        msg = extractError(err, msg);
      }
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <form onSubmit={generatePreview} className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="form-label">{t('reports.type')}</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="form-input"
            >
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">{t('reports.period')}</label>
            <select
              value={filters.period}
              onChange={(e) => setFilters({ ...filters, period: e.target.value })}
              className="form-input"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {filters.period === 'custom' && (
            <>
              <div>
                <label className="form-label">{t('reports.from')}</label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">{t('reports.to')}</label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  className="form-input"
                />
              </div>
            </>
          )}

          <div className="md:col-span-2 lg:col-span-4 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={loading}>
              <Filter size={16} />
              {loading ? t('reports.generating') : t('reports.generate')}
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              className="btn-success"
              disabled={!report || report.is_empty || downloading}
            >
              <Download size={16} />
              {downloading ? t('reports.downloading') : t('reports.download')}
            </button>
          </div>
        </div>
      </form>

      {error ? null : !report ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title={t('reports.noReport')}
            message={t('reports.noReportMessage')}
          />
        </div>
      ) : report.is_empty ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title={t('reports.noRecords')}
            message={t('reports.noRecordsMessage')}
          />
        </div>
      ) : (
        <div className="card">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
            {report.title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 uppercase tracking-wider">
            {t('reports.preview')}
          </p>

          {report.show_revenue && (
            <Section title={t('reports.revenue')}>
              <Row label={t('reports.totalSales')} value={formatNumber(report.total_sales)} />
              <Row label={t('reports.grossRevenue')} value={formatTZS(report.gross_revenue)} />
              <Row label={t('reports.avgSale')} value={formatTZS(report.avg_sale)} />
            </Section>
          )}

          {report.show_expenses && (
            <Section title={t('reports.expensesSection')}>
              {Object.keys(report.expenses).length === 0 ? (
                <p className="text-sm text-slate-500 italic px-2">{t('reports.noExpensesNote')}</p>
              ) : (
                <>
                  {Object.entries(report.expenses).map(([cat, amt]) => (
                    <Row key={cat} label={cat} value={formatTZS(amt)} />
                  ))}
                  <Row label={t('reports.totalExpenses')} value={formatTZS(report.total_expenses)} bold />
                </>
              )}
            </Section>
          )}

          {report.show_profit && (
            <div className={`mt-6 rounded-lg p-5 ${report.net_profit >= 0 ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
              <div className="flex items-center justify-between">
                <div className={`text-sm font-bold uppercase tracking-wider ${report.net_profit >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {report.net_profit >= 0 ? t('reports.netProfit') : t('reports.netLoss')}
                </div>
                <div className={`text-2xl sm:text-3xl font-bold ${report.net_profit >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatTZS(Math.abs(report.net_profit))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 pt-3 border-t border-slate-200 dark:border-slate-700">
        {title}
      </h4>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0 ${bold ? 'font-bold pt-3 border-t-2 border-slate-300 dark:border-slate-500' : ''}`}>
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      <span className="text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}
