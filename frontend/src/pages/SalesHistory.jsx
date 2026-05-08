import { useEffect, useState } from 'react';
import { Search, History as HistoryIcon, ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import { salesApi } from '../api/sales';
import { useToast } from '../context/ToastContext';
import { extractError } from '../api/client';
import { formatTZS, formatDateTime, formatNumber } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';

export default function SalesHistory() {
  const toast = useToast();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', from: '', to: '' });
  const [expanded, setExpanded] = useState({});

  async function load(params = {}) {
    setLoading(true);
    try {
      const { data } = await salesApi.history(params);
      setSales(data.sales);
      (data.warnings || []).forEach((w) => toast.warning(w));
    } catch (err) {
      toast.error(extractError(err, 'Could not load sales history.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters(e) {
    e.preventDefault();
    const params = {};
    if (filters.q.trim()) params.q = filters.q.trim();
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    load(params);
  }

  function clearFilters() {
    setFilters({ q: '', from: '', to: '' });
    load();
  }

  const hasActiveFilters = filters.q || filters.from || filters.to;

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <form onSubmit={applyFilters} className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="form-label">Search</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                placeholder="Product or recorder..."
                className="form-input pl-10"
              />
            </div>
          </div>
          <div>
            <label className="form-label">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="form-input"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">
              <Filter size={15} />
              Apply
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-secondary"
                title="Clear filters"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Results */}
      {loading ? (
        <PageSpinner label="Loading sales..." />
      ) : sales.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={HistoryIcon}
            title={hasActiveFilters ? 'No sales match your filters' : 'No sales recorded yet'}
            message={hasActiveFilters ? 'Try widening your search.' : 'Sales will appear here once recorded.'}
          />
        </div>
      ) : (
        <div className="card !p-0">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
            Showing <span className="font-bold text-slate-700 dark:text-slate-200">{sales.length}</span> sale{sales.length === 1 ? '' : 's'}
            {sales.length === 200 && ' (limit reached — narrow your filters for more)'}
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {sales.map((s) => (
              <div key={s.sale_id} className="px-4 sm:px-5 py-3.5">
                <div className="flex items-center justify-between gap-3 cursor-pointer"
                     onClick={() => setExpanded((m) => ({ ...m, [s.sale_id]: !m[s.sale_id] }))}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatDateTime(s.sale_date)}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Recorded by <span className="font-medium">{s.recorder_name || '—'}</span>
                      {' · '}
                      {s.items?.length || 0} item{s.items?.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                        {formatTZS(s.total_amount)}
                      </div>
                    </div>
                    <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      {expanded[s.sale_id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {expanded[s.sale_id] && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <tr>
                            <th className="text-left pb-2 font-semibold">Product</th>
                            <th className="text-right pb-2 font-semibold">Qty</th>
                            <th className="text-right pb-2 font-semibold">Unit</th>
                            <th className="text-right pb-2 font-semibold">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.items?.map((it) => (
                            <tr key={it.item_id} className="text-slate-700 dark:text-slate-300">
                              <td className="py-1.5">{it.product_name}</td>
                              <td className="py-1.5 text-right">{formatNumber(it.quantity)}</td>
                              <td className="py-1.5 text-right">{formatTZS(it.unit_price)}</td>
                              <td className="py-1.5 text-right font-bold">{formatTZS(it.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {s.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic">
                        Note: {s.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
