import { useEffect, useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { expensesApi } from '../api/expenses';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';
import { formatTZS, formatDate, toIsoDate } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';


export default function Expenses() {
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const categoryLabel = (category) => t(`categories.expenses.${category}`, category);
  const [list, setList] = useState([]);
  const [categoryTotals, setCategoryTotals] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const [form, setForm] = useState({
    category: '',
    description: '',
    amount: '',
    expense_date: toIsoDate(),
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await expensesApi.list();
      setList(data.expenses);
      setCategoryTotals(data.category_totals || {});
      setCategories(data.categories || []);
      if (!form.category && data.categories?.length) {
        setForm((f) => ({ ...f, category: data.categories[0] }));
      }
    } catch (err) {
      toast.error(extractError(err, t('expenses.errorLoad')));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);  
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const { data } = await expensesApi.add(form);
      toast.success(data.message);
      setForm({ category: form.category, description: '', amount: '', expense_date: toIsoDate() });
      await load();
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else {
        toast.error(extractError(err, t('expenses.errorSave')));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteCandidate) return;
    setBusyDelete(true);
    try {
      const { data } = await expensesApi.remove(deleteCandidate.expense_id);
      toast.success(data.message);
      await load();
    } catch (err) {
      toast.error(extractError(err, t('expenses.errorDelete')));
    } finally {
      setBusyDelete(false);
      setDeleteCandidate(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="card lg:col-span-1 self-start">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Plus size={18} />
          {t('expenses.addExpense')}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">{t('expenses.categoryLabel')}</label>
            <select
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={`form-input ${errors.category ? 'error' : ''}`}
            >
              <option value="">{t('expenses.selectCategory')}</option>
              {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
            {errors.category && <p className="form-error">{errors.category}</p>}
          </div>

          <div>
            <label className="form-label">{t('expenses.descriptionLabel')}</label>
            <input
              type="text"
              maxLength={255}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`form-input ${errors.description ? 'error' : ''}`}
              placeholder={t('expenses.descPlaceholder')}
            />
            {errors.description && <p className="form-error">{errors.description}</p>}
          </div>

          <div>
            <label className="form-label">{t('expenses.amountLabel')}</label>
            <input
              type="number" step="0.01" min="0.01" required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={`form-input ${errors.amount ? 'error' : ''}`}
            />
            {errors.amount && <p className="form-error">{errors.amount}</p>}
          </div>

          <div>
            <label className="form-label">{t('expenses.dateLabel')}</label>
            <input
              type="date" required
              max={toIsoDate()}
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              className={`form-input ${errors.expense_date ? 'error' : ''}`}
            />
            {errors.expense_date && <p className="form-error">{errors.expense_date}</p>}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? t('expenses.saving') : t('expenses.save')}
          </button>
        </form>
      </div>

      <div className="lg:col-span-2 space-y-5">
        {Object.keys(categoryTotals).length > 0 && (
          <div className="card">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 uppercase tracking-wider">
              {t('expenses.totalsByCategory')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(categoryTotals).map(([cat, total]) => (
                <span key={cat} className="px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {categoryLabel(cat)}: <span className="font-bold">{formatTZS(total)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <PageSpinner label={t('expenses.loading')} />
        ) : list.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Receipt}
              title={t('expenses.noExpenses')}
              message={t('expenses.noExpensesMessage')}
            />
          </div>
        ) : (
          <div className="card !p-0">
            <div className="table-wrapper border-0">
              <table className="data-table no-row-hover">
                <thead>
                  <tr>
                    <th>{t('expenses.tableDate')}</th>
                    <th>{t('expenses.tableCategory')}</th>
                    <th>{t('expenses.tableDescription')}</th>
                    <th className="text-right">{t('expenses.tableAmount')}</th>
                    <th className="text-right">{t('expenses.tableActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.expense_id}>
                      <td className="whitespace-nowrap">{formatDate(e.expense_date, i18n.language)}</td>
                      <td className="text-slate-700 dark:text-slate-200">
                        {categoryLabel(e.category)}
                      </td>
                      <td className="text-slate-500 dark:text-slate-400">
                        {e.description || '—'}
                      </td>
                      <td className="text-right font-bold whitespace-nowrap">{formatTZS(e.amount)}</td>
                      <td>
                        <div className="flex justify-end">
                          <button
                            onClick={() => setDeleteCandidate(e)}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-danger"
                            title={t('common.delete')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteCandidate}
        title={t('expenses.deleteConfirmTitle')}
        message={t('expenses.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteCandidate(null)}
        busy={busyDelete}
      />
    </div>
  );
}
