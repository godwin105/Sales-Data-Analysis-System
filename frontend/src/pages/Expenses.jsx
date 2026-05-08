import { useEffect, useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { expensesApi } from '../api/expenses';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';
import { formatTZS, formatDate, toIsoDate } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';

const CATEGORY_COLORS = {
  Rent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Utilities: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Salaries: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Purchase Costs': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Miscellaneous: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

export default function Expenses() {
  const toast = useToast();
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
      toast.error(extractError(err, 'Could not load expenses.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

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
        toast.error(extractError(err, 'Could not save expense.'));
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
      toast.error(extractError(err, 'Could not delete expense.'));
    } finally {
      setBusyDelete(false);
      setDeleteCandidate(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Add form */}
      <div className="card lg:col-span-1 self-start">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Plus size={18} />
          Add Expense
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Category *</label>
            <select
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={`form-input ${errors.category ? 'error' : ''}`}
            >
              <option value="">— Select —</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <p className="form-error">{errors.category}</p>}
          </div>

          <div>
            <label className="form-label">Description</label>
            <input
              type="text"
              maxLength={255}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`form-input ${errors.description ? 'error' : ''}`}
              placeholder="e.g. Shop rent for February"
            />
            {errors.description && <p className="form-error">{errors.description}</p>}
          </div>

          <div>
            <label className="form-label">Amount (TZS) *</label>
            <input
              type="number" step="0.01" min="0.01" required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={`form-input ${errors.amount ? 'error' : ''}`}
            />
            {errors.amount && <p className="form-error">{errors.amount}</p>}
          </div>

          <div>
            <label className="form-label">Date *</label>
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
            {submitting ? 'Saving...' : 'Save Expense'}
          </button>
        </form>
      </div>

      {/* Right column: totals + list */}
      <div className="lg:col-span-2 space-y-5">
        {/* Category totals */}
        {Object.keys(categoryTotals).length > 0 && (
          <div className="card">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 uppercase tracking-wider">
              Totals by Category
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(categoryTotals).map(([cat, total]) => (
                <span key={cat} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.Miscellaneous}`}>
                  {cat}: <span className="font-bold">{formatTZS(total)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <PageSpinner label="Loading expenses..." />
        ) : list.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Receipt}
              title="No expenses recorded yet"
              message="Use the form on the left to record your first expense."
            />
          </div>
        ) : (
          <div className="card !p-0">
            <div className="table-wrapper border-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.expense_id}>
                      <td className="whitespace-nowrap">{formatDate(e.expense_date)}</td>
                      <td>
                        <span className={`badge ${CATEGORY_COLORS[e.category] || CATEGORY_COLORS.Miscellaneous}`}>
                          {e.category}
                        </span>
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
                            title="Delete"
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
        title="Delete this expense?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteCandidate(null)}
        busy={busyDelete}
      />
    </div>
  );
}
