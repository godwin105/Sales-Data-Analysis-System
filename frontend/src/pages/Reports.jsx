import { useState } from 'react';
import { Download, FileText, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '../api/misc';
import { useToast } from '../context/ToastContext';
import { extractError } from '../api/client';
import { formatTZS, formatNumber, toIsoDate } from '../utils/format';
import EmptyState from '../components/EmptyState';

const NAVY = '#1E3A5F';

export default function Reports() {
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const expenseCategoryLabel = (cat) => t(`categories.expenses.${cat}`, cat);

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
    { value: 'summary',  label: t('reports.types.summary') },
    { value: 'sales',    label: t('reports.types.sales') },
    { value: 'expenses', label: t('reports.types.expenses') },
    { value: 'profit',   label: t('reports.types.profit') },
  ];

  const PERIODS = [
    { value: 'daily',   label: t('reports.periods.daily') },
    { value: 'weekly',  label: t('reports.periods.weekly') },
    { value: 'monthly', label: t('reports.periods.monthly') },
    { value: 'custom',  label: t('reports.periods.custom') },
  ];

  function buildParams() {
    const params = { type: filters.type, period: filters.period, lang: i18n.language };
    if (filters.period === 'custom') {
      if (filters.from) params.from = filters.from;
      if (filters.to)   params.to   = filters.to;
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
      if (data.report?.warning)  toast.warning(data.report.warning);
      if (data.report?.is_empty) toast.info(t('reports.noRecordsToast'));
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
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `report_${filters.type}_${filters.period}_${toIsoDate()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(t('reports.downloadedToast'));
    } catch (err) {
      let msg = t('reports.downloadFailed');
      const blob = err?.response?.data;
      if (blob && blob.type === 'application/json') {
        try { const json = JSON.parse(await blob.text()); msg = json.error || msg; } catch {}
      } else {
        msg = extractError(err, msg);
      }
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  }

  // Shorthand for report doc translation keys
  const d = (key) => t(`reports.doc.${key}`);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* ── Filter form ── */}
      <form onSubmit={generatePreview} className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="form-label">{t('reports.type')}</label>
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="form-input">
              {REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">{t('reports.period')}</label>
            <select value={filters.period} onChange={(e) => setFilters({ ...filters, period: e.target.value })} className="form-input">
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {filters.period === 'custom' && (
            <>
              <div>
                <label className="form-label">{t('reports.from')}</label>
                <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="form-input" />
              </div>
              <div>
                <label className="form-label">{t('reports.to')}</label>
                <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="form-input" />
              </div>
            </>
          )}
          <div className="md:col-span-2 lg:col-span-4 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={loading}>
              <Filter size={16} />
              {loading ? t('reports.generating') : t('reports.generate')}
            </button>
            <button type="button" onClick={downloadPdf} className="btn-success" disabled={!report || report.is_empty || downloading}>
              <Download size={16} />
              {downloading ? t('reports.downloading') : t('reports.download')}
            </button>
          </div>
        </div>
      </form>

      {/* ── Preview area ── */}
      {error ? null : !report ? (
        <div className="card">
          <EmptyState icon={FileText} title={t('reports.noReport')} message={t('reports.noReportMessage')} />
        </div>
      ) : report.is_empty ? (
        <div className="card">
          <EmptyState icon={FileText} title={t('reports.noRecords')} message={t('reports.noRecordsMessage')} />
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          {/* 1. Header band */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-6 py-5" style={{ backgroundColor: NAVY }}>
            <div>
              <div className="text-lg font-bold text-white uppercase tracking-wide leading-tight">
                {report.business_name}
              </div>
              <div className="text-xs mt-0.5" style={{ color: '#93C5FD' }}>{d('subtitle')}</div>
            </div>
            <div className="text-right text-xs text-white space-y-1 shrink-0">
              <div><span className="font-semibold">{d('statementDate')}:</span> {new Date().toLocaleString()}</div>
              <div><span className="font-semibold">{t('reports.period')}:</span> {report.period_label}</div>
              <div><span className="font-semibold">{t('reports.type')}:</span> {report.type_label}</div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* 2. Info box — dynamic highlight based on report type */}
            {(() => {
              const typeKey  = report.type_key;
              const profit   = report.net_profit;
              const isProfit = profit >= 0;

              let highlights = [];
              if (typeKey === 'profit') {
                highlights = [{
                  label: isProfit ? t('reports.netProfit') : t('reports.netLoss'),
                  value: formatTZS(Math.abs(profit)),
                  color: isProfit ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300',
                  bg:    isProfit ? 'bg-green-50 dark:bg-green-900/30'   : 'bg-red-50 dark:bg-red-900/30',
                }];
              } else if (typeKey === 'sales') {
                highlights = [{
                  label: t('reports.grossRevenue'),
                  value: formatTZS(report.gross_revenue),
                  color: 'text-blue-900 dark:text-blue-200',
                  bg:    'bg-blue-100 dark:bg-blue-900/30',
                }];
              } else if (typeKey === 'expenses') {
                highlights = [{
                  label: t('reports.totalExpenses'),
                  value: formatTZS(report.total_expenses),
                  color: 'text-blue-900 dark:text-blue-200',
                  bg:    'bg-blue-100 dark:bg-blue-900/30',
                }];
              } else {
                highlights = [
                  { label: t('reports.grossRevenue'),  value: formatTZS(report.gross_revenue),  color: 'text-blue-900 dark:text-blue-200', bg: 'bg-blue-100 dark:bg-blue-900/30' },
                  { label: t('reports.totalExpenses'), value: formatTZS(report.total_expenses), color: 'text-blue-900 dark:text-blue-200', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                ];
              }

              return (
                <table className="w-full text-sm border border-slate-200 dark:border-slate-600">
                  <tbody>
                    {[
                      [d('businessName'), report.business_name],
                      [d('accountOwner'), report.owner_name],
                      [t('reports.type'), report.type_label],
                      [t('reports.period'), report.period_label],
                    ].map(([label, value], i) => (
                      <tr key={i} className="border-b border-slate-200 dark:border-slate-600">
                        <td className="w-2/5 py-2 px-3 font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800">{label}</td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">{value}</td>
                      </tr>
                    ))}
                    {highlights.map((h, i) => (
                      <tr key={i} className={h.bg}>
                        <td className={`w-2/5 py-2 px-3 font-bold ${h.color}`}>{h.label}</td>
                        <td className={`py-2 px-3 font-bold ${h.color}`}>{h.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}

            {/* 3. Sales transactions */}
            {report.show_revenue && (
              <div>
                <SectHeading>{d('salesSection')}</SectHeading>
                {report.sales_rows?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[680px]">
                      <thead>
                        <tr style={{ backgroundColor: NAVY }} className="text-white">
                          <Th center>{d('colSn')}</Th>
                          <Th>{d('colDate')}</Th>
                          <Th>{d('colDetails')}</Th>
                          <Th center>{d('colQty')}</Th>
                          <Th>{d('colRecordedBy')}</Th>
                          <Th right>{d('colAmount')}</Th>
                          <Th right>{d('colBalance')}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.sales_rows.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-slate-900'}>
                            <Td center>{r.sn}</Td>
                            <Td>{r.date}</Td>
                            <Td>
                              {(Array.isArray(r.details) ? r.details : [r.details]).map((name, j) => (
                                <div key={j}>{name}</div>
                              ))}
                            </Td>
                            <Td center>
                              {(Array.isArray(r.qty) ? r.qty : [r.qty]).map((q, j) => (
                                <div key={j}>{q}</div>
                              ))}
                            </Td>
                            <Td>{r.recorded_by}</Td>
                            <Td right>{formatNumber(r.amount)}</Td>
                            <Td right>{formatNumber(r.cumulative)}</Td>
                          </tr>
                        ))}
                        <tr className="bg-blue-100 dark:bg-blue-900/40 font-bold border-t-2 border-blue-300">
                          <td colSpan={4} className="border border-slate-200 dark:border-slate-700 p-2" />
                          <td className="border border-slate-200 dark:border-slate-700 p-2 text-right text-slate-700 dark:text-slate-300">{d('total')}</td>
                          <td className="border border-slate-200 dark:border-slate-700 p-2 text-right text-slate-800 dark:text-slate-100">{formatNumber(report.gross_revenue)}</td>
                          <td className="border border-slate-200 dark:border-slate-700 p-2" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">{d('noSales')}</p>
                )}
              </div>
            )}

            {/* 4. Expense transactions */}
            {report.show_expenses && (
              <div>
                <SectHeading>{d('expenseSection')}</SectHeading>
                {report.expense_rows?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[600px]">
                      <thead>
                        <tr style={{ backgroundColor: NAVY }} className="text-white">
                          <Th center>{d('colSn')}</Th>
                          <Th>{d('colDate')}</Th>
                          <Th>{d('colCategory')}</Th>
                          <Th>{d('colDescription')}</Th>
                          <Th right>{d('colAmount')}</Th>
                          <Th right>{d('colCumulative')}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.expense_rows.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-slate-900'}>
                            <Td center>{r.sn}</Td>
                            <Td>{r.date}</Td>
                            <Td>{expenseCategoryLabel(r.category)}</Td>
                            <Td>{r.description}</Td>
                            <Td right>{formatNumber(r.amount)}</Td>
                            <Td right>{formatNumber(r.cumulative)}</Td>
                          </tr>
                        ))}
                        <tr className="bg-blue-100 dark:bg-blue-900/40 font-bold border-t-2 border-blue-300">
                          <td colSpan={3} className="border border-slate-200 dark:border-slate-700 p-2" />
                          <td className="border border-slate-200 dark:border-slate-700 p-2 text-right text-slate-700 dark:text-slate-300">{d('total')}</td>
                          <td className="border border-slate-200 dark:border-slate-700 p-2 text-right text-slate-800 dark:text-slate-100">{formatNumber(report.total_expenses)}</td>
                          <td className="border border-slate-200 dark:border-slate-700 p-2" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">{d('noExpenses')}</p>
                )}
              </div>
            )}

            {/* 5. Financial summary */}
            {report.show_profit && (
              <div>
                <SectHeading>{d('financialSummary')}</SectHeading>
                <table className="w-full text-sm border border-slate-200 dark:border-slate-600">
                  <tbody>
                    {report.show_revenue && (
                      <>
                        <SumRow label={d('totalSalesLabel')} value={formatNumber(report.total_sales)} />
                        <SumRow label={d('grossRevenue')}    value={formatTZS(report.gross_revenue)} />
                        <SumRow label={t('reports.cogs')}    value={`(${formatTZS(report.cogs)})`} indent />
                        <SumRow label={t('reports.grossProfit')} value={formatTZS(report.gross_profit)} highlight />
                      </>
                    )}
                    {report.show_expenses && Object.entries(report.expenses).map(([cat, amt]) => (
                      <SumRow key={cat} label={expenseCategoryLabel(cat)} value={formatTZS(amt)} />
                    ))}
                    {report.show_expenses && (
                      <SumRow label={d('totalExpenses')} value={formatTZS(report.total_expenses)} />
                    )}
                    {(() => {
                      const profit    = report.net_profit;
                      const isProfit  = profit >= 0;
                      const plColor   = isProfit ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300';
                      const plBg      = isProfit ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30';
                      const borderCol = isProfit ? 'border-green-600' : 'border-red-600';
                      const plLabel   = isProfit ? t('reports.netProfit') : t('reports.netLoss');
                      return (
                        <tr className={plBg}>
                          <td className={`py-3 px-3 font-bold border-t-2 ${plColor} ${borderCol}`}>{plLabel}</td>
                          <td className={`py-3 px-3 text-right font-bold text-lg border-t-2 ${plColor} ${borderCol}`}>
                            {formatTZS(Math.abs(profit))}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}

            {/* 6. Disclaimer */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 italic">{d('disclaimer')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectHeading({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wider mb-2 text-blue-800 dark:text-blue-300">
      {children}
    </div>
  );
}

function Th({ children, right, center }) {
  return (
    <th className={`p-2 border border-slate-600 font-semibold whitespace-nowrap ${center ? 'text-center w-8' : right ? 'text-right w-28' : 'text-left'}`}>
      {children}
    </th>
  );
}

function Td({ children, right, center }) {
  return (
    <td className={`p-2 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 align-top ${center ? 'text-center' : right ? 'text-right' : ''}`}>
      {children}
    </td>
  );
}

function SumRow({ label, value, indent, highlight }) {
  if (highlight) {
    return (
      <tr className="border-b border-slate-200 dark:border-slate-600 bg-blue-50 dark:bg-blue-900/20">
        <td className="py-2 px-3 font-bold text-blue-900 dark:text-blue-200">{label}</td>
        <td className="py-2 px-3 text-right font-bold text-blue-900 dark:text-blue-200">{value}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-slate-200 dark:border-slate-600">
      <td className={`py-2 px-3 font-medium ${indent ? 'pl-6 text-slate-500 dark:text-slate-400 text-xs' : 'text-slate-600 dark:text-slate-400'}`}>{label}</td>
      <td className={`py-2 px-3 text-right ${indent ? 'text-slate-500 dark:text-slate-400 text-xs' : 'text-slate-800 dark:text-slate-200'}`}>{value}</td>
    </tr>
  );
}
