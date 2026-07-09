import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Edit2, Package2, RefreshCw, Trash2, PlusCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { stockApi } from '../api/stock';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';
import { formatTZS, formatQuantity } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Stock() {
  const toast = useToast();
  const { t } = useTranslation();
  const categoryLabel = (category) => t(`categories.stock.${category}`, category);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
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
      setUnits(data.units || []);
    } catch (err) {
      toast.error(extractError(err, t('stock.errorLoad')));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);  

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.trim().toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.category && categoryLabel(p.category).toLowerCase().includes(q))
    );
  }, [products, search, t]);

  async function handleDelete() {
    if (!deleteCandidate) return;
    setBusyDelete(true);
    try {
      const { data } = await stockApi.remove(deleteCandidate.product_id);
      toast.success(data.message);
      await load();
    } catch (err) {
      toast.error(extractError(err, t('stock.errorDelete')));
    } finally {
      setBusyDelete(false);
      setDeleteCandidate(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={t('stock.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input pl-10"
          />
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={16} />
          {t('stock.addProduct')}
        </button>
      </div>

      {loading ? (
        <PageSpinner label={t('stock.loading')} />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Package2}
            title={search ? t('stock.noMatching') : t('stock.noProducts')}
            message={search ? t('stock.noMatchingMessage') : t('stock.noProductsMessage')}
            action={!search && (
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <Plus size={16} />
                {t('stock.addProduct')}
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
                  <th>{t('stock.headerName')}</th>
                  <th>{t('stock.headerCategory')}</th>
                  <th>{t('stock.headerPurchase')}</th>
                  <th>{t('stock.headerSelling')}</th>
                  <th>{t('stock.headerQty')}</th>
                  <th>{t('stock.headerStatus')}</th>
                  <th>{t('stock.headerActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.product_id} className={p.is_low_stock ? 'bg-amber-50/60 dark:bg-amber-900/20' : ''}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-slate-500 dark:text-slate-400">{p.category ? categoryLabel(p.category) : '—'}</td>
                    <td>{formatTZS(p.purchase_price)}</td>
                    <td>{formatTZS(p.selling_price)}</td>
                    <td>{formatQuantity(p.quantity)} <span className="text-slate-400 text-xs">{p.unit || 'pcs'}</span></td>
                    <td>
                      {p.is_low_stock
                        ? <span className="badge-warning">{t('stock.lowStock')}</span>
                        : <span className="badge-success">{t('stock.inStock')}</span>}
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditingProduct(p)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-brand-600" title={t('stock.edit')}>
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setRestockingProduct(p)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-success" title={t('stock.restock')}>
                          <RefreshCw size={15} />
                        </button>
                        <button onClick={() => setDeleteCandidate(p)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-danger" title={t('stock.delete')}>
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

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('stock.form.addTitle')}>
        <ProductForm
          categories={categories}
          units={units}
          onCancel={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); load(); }}
          onCategoryAdded={(name) => setCategories((prev) => [...prev, name].sort())}
        />
      </Modal>

      <Modal
        open={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        title={t('stock.form.editTitle', { name: editingProduct?.name || '' })}
      >
        {editingProduct && (
          <ProductForm
            categories={categories}
            units={units}
            initial={editingProduct}
            onCancel={() => setEditingProduct(null)}
            onSuccess={() => { setEditingProduct(null); load(); }}
            onCategoryAdded={(name) => setCategories((prev) => [...prev, name].sort())}
          />
        )}
      </Modal>

      <Modal
        open={!!restockingProduct}
        onClose={() => setRestockingProduct(null)}
        title={`${t('stock.restock')} — ${restockingProduct?.name || ''}`}
      >
        {restockingProduct && (
          <RestockForm
            product={restockingProduct}
            onCancel={() => setRestockingProduct(null)}
            onSuccess={() => { setRestockingProduct(null); load(); }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteCandidate}
        title={t('stock.deleteConfirmTitle', { name: deleteCandidate?.name })}
        message={t('stock.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteCandidate(null)}
        busy={busyDelete}
      />
    </div>
  );
}

function ProductForm({ initial, categories, units, onCancel, onSuccess, onCategoryAdded }) {
  const toast = useToast();
  const { t } = useTranslation();
  const categoryLabel = (category) => t(`categories.stock.${category}`, category);
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name || '',
    category: initial?.category || '',
    unit: initial?.unit || 'pcs',
    purchase_price: initial?.purchase_price ?? '',
    selling_price: initial?.selling_price ?? '',
    quantity: initial?.quantity ?? 0,
    low_stock_threshold: initial?.low_stock_threshold ?? 5,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  async function handleAddCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setSavingCat(true);
    try {
      await stockApi.addCategory(name);
      onCategoryAdded?.(name);
      update('category', name);
      setNewCatName('');
      setAddingCat(false);
      toast.success(`Category '${name}' added.`);
    } catch (err) {
      toast.error(extractError(err, 'Failed to add category.'));
    } finally {
      setSavingCat(false);
    }
  }

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
        toast.error(extractError(err, t('stock.form.errorSave')));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="form-label">{t('stock.form.productName')}</label>
        <input
          type="text" required
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          className={`form-input ${errors.name ? 'error' : ''}`}
          placeholder={t('stock.form.productPlaceholder')}
        />
        {errors.name && <p className="form-error">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="form-label !mb-0">{t('stock.form.category')}</label>
            <button
              type="button"
              onClick={() => setAddingCat((v) => !v)}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              <PlusCircle size={13} />
              {t('stock.form.addCategory', 'Add')}
            </button>
          </div>
          {addingCat ? (
            <div className="flex gap-1">
              <input
                type="text"
                autoFocus
                placeholder={t('stock.form.newCategoryPlaceholder', 'New category...')}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } if (e.key === 'Escape') setAddingCat(false); }}
                className="form-input text-sm flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={savingCat || !newCatName.trim()}
                className="btn-primary px-3 py-1.5 text-xs"
              >
                {savingCat ? '…' : t('common.save', 'Save')}
              </button>
            </div>
          ) : (
            <select
              value={form.category || ''}
              onChange={(e) => update('category', e.target.value)}
              className={`form-input ${errors.category ? 'error' : ''}`}
            >
              <option value="">{t('stock.form.categoryNone')}</option>
              {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          )}
          {errors.category && <p className="form-error">{errors.category}</p>}
        </div>
        <div>
          <label className="form-label">{t('stock.form.unit')}</label>
          <select
            value={form.unit}
            onChange={(e) => update('unit', e.target.value)}
            className={`form-input ${errors.unit ? 'error' : ''}`}
          >
            {(units.length ? units : ['pcs','kg','g','L','mL','m','box','pkt','doz','ctn','btl','bag','tin','sack']).map((u) => (
              <option key={u} value={u}>{t(`units.${u}`, u)}</option>
            ))}
          </select>
          {errors.unit && <p className="form-error">{errors.unit}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">{t('stock.form.purchasePrice')}</label>
          <input
            type="number" step="0.01" min="0" required
            value={form.purchase_price}
            onChange={(e) => update('purchase_price', e.target.value)}
            className={`form-input ${errors.purchase_price ? 'error' : ''}`}
          />
          {errors.purchase_price && <p className="form-error">{errors.purchase_price}</p>}
        </div>
        <div>
          <label className="form-label">{t('stock.form.sellingPrice')}</label>
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
          <label className="form-label">{isEdit ? t('stock.form.quantity') : t('stock.form.initialQuantity')}</label>
          <input
            type="number" min="0" step="0.25"
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
            className={`form-input ${errors.quantity ? 'error' : ''}`}
          />
          {errors.quantity && <p className="form-error">{errors.quantity}</p>}
        </div>
        <div>
          <label className="form-label">{t('stock.form.lowStockThreshold')}</label>
          <input
            type="number" min="0" step="0.25"
            value={form.low_stock_threshold}
            onChange={(e) => update('low_stock_threshold', e.target.value)}
            className={`form-input ${errors.low_stock_threshold ? 'error' : ''}`}
          />
          <p className="form-help">{t('stock.form.thresholdHelp')}</p>
          {errors.low_stock_threshold && <p className="form-error">{errors.low_stock_threshold}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? t('common.saving') : (isEdit ? t('stock.form.saveChanges') : t('stock.form.addButton'))}
        </button>
      </div>
    </form>
  );
}

function RestockForm({ product, onCancel, onSuccess }) {
  const toast = useToast();
  const { t } = useTranslation();
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
        toast.error(extractError(err, t('stock.restockForm.errorRestock')));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-sm">
        <div className="text-slate-500 dark:text-slate-400">{t('stock.restockForm.currentStock')}</div>
        <div className="font-bold text-slate-800 dark:text-slate-100">
          {formatQuantity(product.quantity)} {product.unit || 'pcs'}
        </div>
      </div>

      <div>
        <label className="form-label">{t('stock.restockForm.additionalQuantity')}</label>
        <input
          type="number" min="0.25" step="0.25" required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={`form-input ${errors.quantity ? 'error' : ''}`}
          placeholder={t('stock.restockForm.qtyPlaceholder')}
        />
        {errors.quantity && <p className="form-error">{errors.quantity}</p>}
      </div>

      <div>
        <label className="form-label">{t('stock.restockForm.newPurchasePrice')}</label>
        <input
          type="number" step="0.01" min="0"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
          className={`form-input ${errors.purchase_price ? 'error' : ''}`}
          placeholder={t('stock.restockForm.currentPlaceholder', { price: formatTZS(product.purchase_price) })}
        />
        <p className="form-help">{t('stock.restockForm.keepCurrent')}</p>
        {errors.purchase_price && <p className="form-error">{errors.purchase_price}</p>}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn-success" disabled={submitting}>
          {submitting ? t('stock.restockForm.submitting') : t('stock.restockForm.submit')}
        </button>
      </div>
    </form>
  );
}
