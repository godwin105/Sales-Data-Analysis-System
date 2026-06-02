import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ShoppingCart, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { salesApi } from '../api/sales';
import { useToast } from '../context/ToastContext';
import { extractError } from '../api/client';
import { formatQuantity, formatTZS } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';

export default function RecordSale() {
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([{ rowId: 1, product_id: '', quantity: '1' }]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nextRowId = useMemo(() => () => Math.max(0, ...items.map((i) => i.rowId)) + 1, [items]);

  useEffect(() => {
    let active = true;
    salesApi
      .inStockProducts()
      .then(({ data }) => active && setProducts(data.products))
      .catch((err) => active && toast.error(extractError(err, t('sales.errorLoad'))))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const productById = useMemo(() => {
    const map = {};
    products.forEach((p) => { map[p.product_id] = p; });
    return map;
  }, [products]);

  const computed = useMemo(() => {
    const lines = items.map((item) => {
      const product = productById[item.product_id];
      const qty = Number(item.quantity) || 0;
      const unit = product ? Number(product.selling_price) : 0;
      const subtotal = qty * unit;
      const exceedsStock = product && qty > product.quantity;
      return { ...item, product, qty, unit, subtotal, exceedsStock };
    });
    const total = lines.reduce((s, l) => s + l.subtotal, 0);
    return { lines, total };
  }, [items, productById]);

  function addRow() {
    setItems((arr) => [...arr, { rowId: nextRowId(), product_id: '', quantity: '1' }]);
  }

  function removeRow(rowId) {
    setItems((arr) => arr.length > 1 ? arr.filter((i) => i.rowId !== rowId) : arr);
  }

  function updateRow(rowId, field, value) {
    setItems((arr) => arr.map((i) => i.rowId === rowId ? { ...i, [field]: value } : i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validItems = items
      .filter((i) => i.product_id && Number(i.quantity) > 0)
      .map((i) => ({ product_id: Number(i.product_id), quantity: Number(i.quantity) }));

    if (validItems.length === 0) {
      toast.error(t('sales.noItemsError'));
      return;
    }

    const stockProblem = computed.lines.find((l) => l.product && l.exceedsStock);
    if (stockProblem) {
      toast.error(t('sales.onlyAvailableMsg', { count: formatQuantity(stockProblem.product.quantity), name: stockProblem.product.name }));
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await salesApi.record({
        items: validItems,
        notes: notes.trim() || undefined,
      });
      toast.success(data.message);
      if (data.low_stock_warnings && data.low_stock_warnings.length > 0) {
        toast.warning(t('sales.lowStockToast', { names: data.low_stock_warnings.join(', ') }));
      }
      setItems([{ rowId: 1, product_id: '', quantity: '1' }]);
      setNotes('');
      const refreshed = await salesApi.inStockProducts();
      setProducts(refreshed.data.products);
    } catch (err) {
      toast.error(extractError(err, t('sales.errorRecord')));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageSpinner label={t('sales.loading')} />;

  if (products.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={ShoppingCart}
          title={t('sales.noStockTitle')}
          message={t('sales.noStockMessage')}
          action={
            <button onClick={() => navigate('/stock')} className="btn-primary">
              {t('sales.goToStock')}
            </button>
          }
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl">
      <div className="card">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">{t('sales.saleItems')}</h3>

        <div className="space-y-3">
          <div className="hidden sm:grid grid-cols-12 gap-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            <div className="col-span-6">{t('sales.product')}</div>
            <div className="col-span-2">{t('sales.quantity')}</div>
            <div className="col-span-3">{t('sales.subtotal')}</div>
            <div className="col-span-1"></div>
          </div>

          {computed.lines.map((line) => (
            <div
              key={line.rowId}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-start sm:items-center"
            >
              <div className="sm:col-span-6">
                <select
                  value={line.product_id}
                  onChange={(e) => updateRow(line.rowId, 'product_id', e.target.value)}
                  className="form-input"
                >
                  <option value="">{t('sales.chooseProduct')}</option>
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} — {formatTZS(p.selling_price)} ({t('sales.stockIndicator', { count: formatQuantity(p.quantity) })})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <input
                  type="number" min="0.25" step="0.25"
                  value={line.quantity}
                  onChange={(e) => updateRow(line.rowId, 'quantity', e.target.value)}
                  className={`form-input ${line.exceedsStock ? 'error' : ''}`}
                />
                {line.exceedsStock && (
                  <p className="form-error">{t('sales.onlyAvailableShort', { count: formatQuantity(line.product.quantity) })}</p>
                )}
              </div>

              <div className="sm:col-span-3 text-sm font-bold text-slate-800 dark:text-slate-100 sm:px-2">
                {line.subtotal > 0 ? formatTZS(line.subtotal) : '—'}
              </div>

              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeRow(line.rowId)}
                  disabled={items.length === 1}
                  className="p-2 text-slate-400 hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('sales.removeItem')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500"
        >
          <Plus size={16} />
          {t('sales.addItem')}
        </button>
      </div>

      <div className="card">
        <label className="form-label">{t('sales.notes')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
          className="form-input"
          placeholder={t('sales.notesPlaceholder')}
        />
      </div>

      <div className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-brand-50 to-white border-brand-200 dark:bg-slate-800 dark:bg-none dark:border-slate-700">
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
            {t('sales.totalAmount')}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
            {formatTZS(computed.total)}
          </div>
        </div>
        <button
          type="submit"
          className="btn-success text-base px-7 py-3"
          disabled={submitting || computed.total <= 0}
        >
          {submitting ? t('sales.recording') : t('sales.confirmSale')}
        </button>
      </div>

      {computed.lines.some((l) => l.exceedsStock) && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t('sales.exceedsStockWarning')}
          </p>
        </div>
      )}
    </form>
  );
}
