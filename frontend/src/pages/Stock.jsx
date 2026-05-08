import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Edit2, Package2, RefreshCw, Trash2 } from 'lucide-react';
import { stockApi } from '../api/stock';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';
import { formatTZS, formatNumber } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Stock() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editingProduct, setEditingProduct] = useState(null);
  const [restockingProduct, setRestockingProduct] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await stockApi.list();
      setProducts(data.products);
      setCategories(data.categories);
    } catch (err) {
      toast.error(extractError(err, 'Could not load products.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.trim().toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }, [products, search]);

  async function handleDelete() {
    if (!deleteCandidate) return;
    setBusyDelete(true);
    try {
      const { data } = await stockApi.remove(deleteCandidate.product_id);
      toast.success(data.message);
      await load();
    } catch (err) {
      toast.error(extractError(err, 'Could not delete product.'));
    } finally {
      setBusyDelete(false);
      setDeleteCandidate(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input pl-10"
          />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="btn-primary"
        >
          <Plus size={16} />
          Add Product
        </button>
      </div>

      {loading ? (
        <PageSpinner label="Loading products..." />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Package2}
            title={search ? 'No matching products' : 'No products yet'}
            message={search ? 'Try a different search term.' : 'Add your first product to get started.'}
            action={!search && (
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <Plus size={16} />
                Add Product
              </button>
            )}
          />
        </div>
      ) : (
        <div className="card !p-0">
          <div className="table-wrapper border-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Purchase</th>
                  <th>Selling</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.product_id} className={p.is_low_stock ? 'bg-amber-50/60 dark:bg-amber-900/20' : ''}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-slate-500 dark:text-slate-400">{p.category || '—'}</td>
                    <td>{formatTZS(p.purchase_price)}</td>
                    <td>{formatTZS(p.selling_price)}</td>
                    <td>{formatNumber(p.quantity)}</td>
                    <td>
                      {p.is_low_stock ? (
                        <span className="badge-warning">Low Stock</span>
                      ) : (
                        <span className="badge-success">In Stock</span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setEditingProduct(p)}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-brand-600"
                          title="Edit"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setRestockingProduct(p)}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-success"
                          title="Restock"
                        >
                          <RefreshCw size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(p)}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-danger"
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

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Product">
        <ProductForm
          categories={categories}
          onCancel={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); load(); }}
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        title={`Edit Product — ${editingProduct?.name || ''}`}
      >
        {editingProduct && (
          <ProductForm
            categories={categories}
            initial={editingProduct}
            onCancel={() => setEditingProduct(null)}
            onSuccess={() => { setEditingProduct(null); load(); }}
          />
        )}
      </Modal>

      {/* Restock modal */}
      <Modal
        open={!!restockingProduct}
        onClose={() => setRestockingProduct(null)}
        title={`Restock — ${restockingProduct?.name || ''}`}
      >
        {restockingProduct && (
          <RestockForm
            product={restockingProduct}
            onCancel={() => setRestockingProduct(null)}
            onSuccess={() => { setRestockingProduct(null); load(); }}
          />
        )}
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteCandidate}
        title={`Delete '${deleteCandidate?.name}'?`}
        message="If this product has sales history, it will be archived (soft-deleted) to preserve your records. Otherwise it will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteCandidate(null)}
        busy={busyDelete}
      />
    </div>
  );
}

// =========================================================================
// Add/Edit form
// =========================================================================
function ProductForm({ initial, categories, onCancel, onSuccess }) {
  const toast = useToast();
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name || '',
    category: initial?.category || '',
    purchase_price: initial?.purchase_price ?? '',
    selling_price: initial?.selling_price ?? '',
    quantity: initial?.quantity ?? 0,
    low_stock_threshold: initial?.low_stock_threshold ?? 5,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: null }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const payload = { ...form };
      if (isEdit) {
        const { data } = await stockApi.update(initial.product_id, payload);
        toast.success(data.message);
      } else {
        const { data } = await stockApi.add(payload);
        toast.success(data.message);
      }
      onSuccess();
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else {
        toast.error(extractError(err, 'Could not save product.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="form-label">Product Name *</label>
        <input
          type="text" required
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          className={`form-input ${errors.name ? 'error' : ''}`}
          placeholder="e.g. Sugar 1kg"
        />
        {errors.name && <p className="form-error">{errors.name}</p>}
      </div>

      <div>
        <label className="form-label">Category</label>
        <select
          value={form.category || ''}
          onChange={(e) => update('category', e.target.value)}
          className={`form-input ${errors.category ? 'error' : ''}`}
        >
          <option value="">— None —</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.category && <p className="form-error">{errors.category}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Purchase Price (TZS) *</label>
          <input
            type="number" step="0.01" min="0" required
            value={form.purchase_price}
            onChange={(e) => update('purchase_price', e.target.value)}
            className={`form-input ${errors.purchase_price ? 'error' : ''}`}
          />
          {errors.purchase_price && <p className="form-error">{errors.purchase_price}</p>}
        </div>
        <div>
          <label className="form-label">Selling Price (TZS) *</label>
          <input
            type="number" step="0.01" min="0" required
            value={form.selling_price}
            onChange={(e) => update('selling_price', e.target.value)}
            className={`form-input ${errors.selling_price ? 'error' : ''}`}
          />
          {errors.selling_price && <p className="form-error">{errors.selling_price}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">{isEdit ? 'Quantity' : 'Initial Quantity'}</label>
          <input
            type="number" min="0"
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
            className={`form-input ${errors.quantity ? 'error' : ''}`}
          />
          {errors.quantity && <p className="form-error">{errors.quantity}</p>}
        </div>
        <div>
          <label className="form-label">Low Stock Threshold</label>
          <input
            type="number" min="0"
            value={form.low_stock_threshold}
            onChange={(e) => update('low_stock_threshold', e.target.value)}
            className={`form-input ${errors.low_stock_threshold ? 'error' : ''}`}
          />
          <p className="form-help">Alert when stock drops below this</p>
          {errors.low_stock_threshold && <p className="form-error">{errors.low_stock_threshold}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving...' : (isEdit ? 'Save Changes' : 'Add Product')}
        </button>
      </div>
    </form>
  );
}

// =========================================================================
// Restock form
// =========================================================================
function RestockForm({ product, onCancel, onSuccess }) {
  const toast = useToast();
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const payload = { quantity };
      if (purchasePrice) payload.purchase_price = purchasePrice;
      const { data } = await stockApi.restock(product.product_id, payload);
      toast.success(data.message);
      onSuccess();
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else {
        toast.error(extractError(err, 'Could not restock.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-sm">
        <div className="text-slate-500 dark:text-slate-400">Current stock</div>
        <div className="font-bold text-slate-800 dark:text-slate-100">{formatNumber(product.quantity)} units</div>
      </div>

      <div>
        <label className="form-label">Additional Quantity *</label>
        <input
          type="number" min="1" required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={`form-input ${errors.quantity ? 'error' : ''}`}
          placeholder="e.g. 50"
        />
        {errors.quantity && <p className="form-error">{errors.quantity}</p>}
      </div>

      <div>
        <label className="form-label">New Purchase Price (optional)</label>
        <input
          type="number" step="0.01" min="0"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
          className={`form-input ${errors.purchase_price ? 'error' : ''}`}
          placeholder={`Current: ${formatTZS(product.purchase_price)}`}
        />
        <p className="form-help">Leave blank to keep current price</p>
        {errors.purchase_price && <p className="form-error">{errors.purchase_price}</p>}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-success" disabled={submitting}>
          {submitting ? 'Restocking...' : 'Restock'}
        </button>
      </div>
    </form>
  );
}
