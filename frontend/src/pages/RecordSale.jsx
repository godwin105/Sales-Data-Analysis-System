import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, ShoppingCart, AlertTriangle,
  Smartphone, Banknote, CheckCircle, XCircle,
  Loader, Clock, RefreshCw, Scan,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { salesApi } from '../api/sales';
import { paymentsApi } from '../api/payments';
import { stockApi } from '../api/stock';
import { useToast } from '../context/ToastContext';
import { extractError } from '../api/client';
import { formatQuantity, formatTZS } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';

const POLL_MS      = 4000;   // poll every 4 seconds
const TIMEOUT_SECS = 60;     // safety-net: server auto-fails at 120s, UI normally resolves before this

export default function RecordSale() {
  const toast    = useToast();
  const navigate = useNavigate();
  const { t }    = useTranslation();

  // ── Sale items ──────────────────────────────────────────────────────────────
  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [items,      setItems]      = useState([{ rowId: 1, product_id: '', quantity: '1' }]);
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Payment ─────────────────────────────────────────────────────────────────
  const [payMethod, setPayMethod] = useState('cash');
  const [phone,     setPhone]     = useState('');
  const phoneRef = useRef(null);

  useEffect(() => {
    if (payMethod === 'mobile_money') {
      // Small timeout lets the input finish rendering before focusing
      const t = setTimeout(() => phoneRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [payMethod]);

  // payState: null | { externalId, amount, phone, channel, status, secondsLeft }
  const [payState,   setPayState]  = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const pollRef    = useRef(null);
  const countdownRef = useRef(null);

  // ── Barcode scanner ─────────────────────────────────────────────────────────
  const [scanInput, setScanInput] = useState('');
  const scanRef = useRef(null);

  const nextRowId = useMemo(
    () => () => Math.max(0, ...items.map((i) => i.rowId)) + 1,
    [items],
  );

  useEffect(() => {
    let active = true;
    salesApi
      .inStockProducts()
      .then(({ data }) => active && setProducts(data.products))
      .catch((err)  => active && toast.error(extractError(err, t('sales.errorLoad'))))
      .finally(()   => active && setLoading(false));
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear all timers ────────────────────────────────────────────────────────
  function clearTimers() {
    clearInterval(pollRef.current);
    clearInterval(countdownRef.current);
  }

  // ── Start polling + countdown when a payment is pending ─────────────────────
  useEffect(() => {
    if (!payState || payState.status !== 'pending') return;

    // Countdown display
    countdownRef.current = setInterval(() => {
      setPayState((prev) => {
        if (!prev) return prev;
        const next = (prev.secondsLeft ?? TIMEOUT_SECS) - 1;
        if (next <= 0) {
          clearTimers();
          return { ...prev, status: 'timeout', secondsLeft: 0 };
        }
        return { ...prev, secondsLeft: next };
      });
    }, 1000);

    // Status poll
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await paymentsApi.status(payState.externalId);
        if (data.status !== 'pending') {
          clearTimers();
          setPayState((prev) => ({ ...prev, status: data.status }));
          if (data.status === 'confirmed') {
            toast.success(t('sales.paymentConfirmedToast', { amount: formatTZS(payState.amount) }));
          } else {
            toast.error(t('sales.paymentDeclinedToast'));
          }
        }
      } catch { /* network hiccup — retry next tick */ }
    }, POLL_MS);

    return () => clearTimers();
  }, [payState?.externalId, payState?.status]); // eslint-disable-line

  const productById = useMemo(() => {
    const map = {};
    products.forEach((p) => { map[p.product_id] = p; });
    return map;
  }, [products]);

  const computed = useMemo(() => {
    const lines = items.map((item) => {
      const product      = productById[item.product_id];
      const qty          = Number(item.quantity) || 0;
      const unit         = product ? Number(product.selling_price) : 0;
      const subtotal     = qty * unit;
      const exceedsStock = product && qty > product.quantity;
      return { ...item, product, qty, unit, subtotal, exceedsStock };
    });
    return { lines, total: lines.reduce((s, l) => s + l.subtotal, 0) };
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

  function resetAll() {
    clearTimers();
    setItems([{ rowId: 1, product_id: '', quantity: '1' }]);
    setNotes('');
    setPhone('');
    setPayState(null);
    setCancelling(false);
  }

  async function cancelPayment() {
    if (!payState?.externalId) { resetAll(); return; }
    clearTimers();
    setCancelling(true);
    try {
      await paymentsApi.cancel(payState.externalId);
      await refreshProducts(); // stock was restored on the server
    } catch {
      // If cancel fails (e.g. already confirmed), still reset the UI
    }
    resetAll();
  }

  async function refreshProducts() {
    try {
      const { data } = await salesApi.inStockProducts();
      setProducts(data.products);
    } catch { /* non-critical */ }
  }

  async function handleBarcodeScan(code) {
    try {
      const { data } = await stockApi.getByBarcode(code);
      const p = data.product;
      setItems((arr) => {
        const existing = arr.find((i) => String(i.product_id) === String(p.product_id));
        if (existing) {
          return arr.map((i) =>
            i.rowId === existing.rowId
              ? { ...i, quantity: String(Number(i.quantity) + 1) }
              : i
          );
        }
        const emptyRow = arr.find((i) => !i.product_id);
        if (emptyRow) {
          return arr.map((i) =>
            i.rowId === emptyRow.rowId ? { ...i, product_id: String(p.product_id) } : i
          );
        }
        const newId = Math.max(0, ...arr.map((i) => i.rowId)) + 1;
        return [...arr, { rowId: newId, product_id: String(p.product_id), quantity: '1' }];
      });
      toast.success(t('sales.barcodeAdded', { name: p.name }));
    } catch {
      toast.error(t('sales.barcodeNotFound', { code }));
    }
    scanRef.current?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const validItems = items
      .filter((i) => i.product_id && Number(i.quantity) > 0)
      .map((i)    => ({ product_id: Number(i.product_id), quantity: Number(i.quantity) }));

    if (!validItems.length)                          { toast.error(t('sales.noItemsError')); return; }
    if (computed.lines.find((l) => l.exceedsStock))  {
      const bad = computed.lines.find((l) => l.exceedsStock);
      toast.error(t('sales.onlyAvailableMsg', { count: formatQuantity(bad.product.quantity), name: bad.product.name }));
      return;
    }

    setSubmitting(true);

    // ── Cash ──────────────────────────────────────────────────────────────────
    if (payMethod === 'cash') {
      try {
        const { data } = await salesApi.record({ items: validItems, notes: notes.trim() || undefined });
        toast.success(t('sales.saleRecordedToast'));
        if (data.low_stock_warnings?.length)
          toast.warning(t('sales.lowStockToast', { names: data.low_stock_warnings.join(', ') }));
        resetAll();
        await refreshProducts();
      } catch (err) {
        toast.error(extractError(err, t('sales.errorRecord')));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ── Mobile money ──────────────────────────────────────────────────────────
    if (!phone.trim()) { toast.error(t('sales.enterPhone')); setSubmitting(false); return; }

    try {
      const { data } = await paymentsApi.initiate({
        items: validItems,
        notes: notes.trim() || undefined,
        phone: phone.trim(),
      });

      if (data.low_stock_warnings?.length)
        toast.warning(t('sales.lowStockToast', { names: data.low_stock_warnings.join(', ') }));

      await refreshProducts();

      setPayState({
        externalId:      data.external_id,
        amount:          data.amount,
        customerAmount:  data.customer_amount ?? data.amount,
        status:          'pending',
        phone:           phone.trim(),
        channel:         data.channel || null,
        secondsLeft:     TIMEOUT_SECS,
      });
    } catch (err) {
      toast.error(extractError(err, t('sales.errorRecord')));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageSpinner label={t('sales.loading')} />;

  if (!products.length) {
    return (
      <div className="card">
        <EmptyState
          icon={ShoppingCart}
          title={t('sales.noStockTitle')}
          message={t('sales.noStockMessageCashier', 'No products have been recorded in the system yet. Please contact the business owner to add products.')}
        />
      </div>
    );
  }

  // ── Payment status overlay ───────────────────────────────────────────────────
  if (payState) {
    const isPending   = payState.status === 'pending';
    const isConfirmed = payState.status === 'confirmed';
    const isFailed    = payState.status === 'failed';
    const isTimeout   = payState.status === 'timeout';

    const borderColor = isConfirmed ? 'border-green-400 dark:border-green-600'
                      : (isFailed || isTimeout) ? 'border-red-400 dark:border-red-600'
                      : 'border-brand-400 dark:border-brand-600';

    return (
      <div className="max-w-lg mx-auto space-y-4 px-1">
        <div className={`card border-2 ${borderColor}`}>

          {/* ── Pending ── */}
          {isPending && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader className="text-brand-600 animate-spin flex-shrink-0" size={22} />
                <p className="font-bold text-slate-800 dark:text-slate-100 text-base">
                  {t('sales.waitingConfirm')}
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm space-y-1.5">
                <p className="text-slate-600 dark:text-slate-300">
                  {t('sales.promptSentTo')} <span className="font-bold">{payState.phone}</span>
                </p>
                {payState.channel && (
                  <p className="text-slate-600 dark:text-slate-300">
                    {t('sales.networkLabel')}: <span className="font-bold">{payState.channel}</span>
                  </p>
                )}
                <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-slate-600 dark:text-slate-300">
                    {t('sales.saleAmount')}: <span className="font-semibold">{formatTZS(payState.amount)}</span>
                  </p>
                  {payState.customerAmount > payState.amount && (
                    <>
                      <p className="text-amber-600 dark:text-amber-400 text-xs">
                        {t('sales.networkFee')}: +{formatTZS(payState.customerAmount - payState.amount)}
                      </p>
                      <p className="text-slate-800 dark:text-slate-100 font-bold">
                        {t('sales.customerPays')}: {formatTZS(payState.customerAmount)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Countdown bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>{t('sales.checkingEvery')}</span>
                  <span className="font-mono">{t('sales.secondsLeft', { s: payState.secondsLeft })}</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full transition-all duration-1000"
                    style={{ width: `${((payState.secondsLeft ?? TIMEOUT_SECS) / TIMEOUT_SECS) * 100}%` }}
                  />
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300">
                {t('sales.ussdWarning')}
              </div>

              <button
                onClick={cancelPayment}
                disabled={cancelling}
                className="btn-secondary w-full text-sm"
              >
                {cancelling ? t('sales.cancelling') : t('sales.cancelNewSale')}
              </button>
            </div>
          )}

          {/* ── Confirmed ── */}
          {isConfirmed && (
            <div className="space-y-4 text-center">
              <CheckCircle className="text-green-500 mx-auto" size={48} />
              <div>
                <p className="font-bold text-green-700 dark:text-green-300 text-lg">{t('sales.paymentConfirmed')}</p>
                <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
                  {t('sales.receivedFrom', { amount: formatTZS(payState.customerAmount ?? payState.amount), phone: payState.phone })}
                  {payState.channel && ` ${t('sales.viaNetwork', { channel: payState.channel })}`}
                </p>
              </div>
              <button onClick={resetAll} className="btn-primary w-full">
                {t('sales.recordAnother')}
              </button>
            </div>
          )}

          {/* ── Failed ── */}
          {isFailed && (
            <div className="space-y-4 text-center">
              <XCircle className="text-red-500 mx-auto" size={48} />
              <div>
                <p className="font-bold text-red-700 dark:text-red-300 text-lg">{t('sales.paymentDeclined')}</p>
                <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
                  {t('sales.declinedMessage')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={cancelPayment} disabled={cancelling} className="btn-secondary flex-1 text-sm">
                  {cancelling ? t('sales.reversing') : <><RefreshCw size={14} /> {t('sales.newSale')}</>}
                </button>
                <button
                  onClick={() => { clearTimers(); setPayState(null); setPayMethod('cash'); }}
                  disabled={cancelling}
                  className="btn-primary flex-1 text-sm"
                >
                  <Banknote size={14} /> {t('sales.collectCash')}
                </button>
              </div>
            </div>
          )}

          {/* ── Timeout ── */}
          {isTimeout && (
            <div className="space-y-4 text-center">
              <Clock className="text-amber-500 mx-auto" size={48} />
              <div>
                <p className="font-bold text-amber-700 dark:text-amber-300 text-lg">{t('sales.noResponseYet')}</p>
                <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
                  {t('sales.noResponseMessage', { phone: payState.phone, minutes: TIMEOUT_SECS / 60 })}
                </p>
              </div>
              <button
                onClick={() => setPayState((prev) => ({ ...prev, status: 'pending', secondsLeft: 120 }))}
                className="btn-primary w-full text-sm"
              >
                <RefreshCw size={14} className="inline mr-1" /> {t('sales.checkAgain')}
              </button>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={cancelPayment} disabled={cancelling} className="btn-secondary flex-1 text-sm">
                  {cancelling ? t('sales.reversing') : t('sales.cancelSale')}
                </button>
                <button
                  onClick={() => { clearTimers(); setPayState(null); setPayMethod('cash'); }}
                  disabled={cancelling}
                  className="btn-secondary flex-1 text-sm"
                >
                  <Banknote size={14} /> {t('sales.collectCash')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Sale form ────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-4xl">

      {/* Items */}
      <div className="card">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">
          {t('sales.saleItems')}
        </h3>

        {/* Barcode scanner input */}
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
          <Scan size={16} className="text-slate-400 flex-shrink-0" />
          <input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const code = scanInput.trim();
                setScanInput('');
                if (code) handleBarcodeScan(code);
              }
            }}
            placeholder={t('sales.scanBarcodePlaceholder')}
            className="form-input text-sm font-mono flex-1"
            autoComplete="off"
          />
        </div>

        <div className="space-y-3">
          {/* Column labels — hidden on mobile */}
          <div className="hidden sm:grid grid-cols-12 gap-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            <div className="col-span-5">{t('sales.product')}</div>
            <div className="col-span-3">{t('sales.quantity')}</div>
            <div className="col-span-3">{t('sales.subtotal')}</div>
            <div className="col-span-1"></div>
          </div>

          {computed.lines.map((line) => (
            <div key={line.rowId}>

              {/* ── Mobile layout ── */}
              <div className="sm:hidden space-y-2">
                {/* Product + trash on same flex row */}
                <div className="flex items-center gap-2">
                  <select
                    value={line.product_id}
                    onChange={(e) => updateRow(line.rowId, 'product_id', e.target.value)}
                    className="form-input text-sm flex-1"
                  >
                    <option value="">{t('sales.chooseProduct')}</option>
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.name} — {formatTZS(p.selling_price)}/{p.unit || 'pcs'} ({formatQuantity(p.quantity)} {p.unit || 'pcs'} {t('sales.inStock', 'in stock')})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRow(line.rowId)}
                    disabled={items.length === 1}
                    className="flex-shrink-0 p-2 text-slate-400 hover:text-red-500 disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Qty + Subtotal row */}
                <div className="flex items-start gap-3">
                  <div className="w-28">
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">
                      {t('sales.quantity')}
                    </label>
                    <input
                      type="number" min="0.25" step="0.25"
                      value={line.quantity}
                      onChange={(e) => updateRow(line.rowId, 'quantity', e.target.value)}
                      className={`form-input text-sm ${line.exceedsStock ? 'error' : ''}`}
                    />
                    {line.exceedsStock && (
                      <p className="form-error text-xs">
                        {t('sales.onlyAvailableShort', { count: formatQuantity(line.product.quantity) })}
                      </p>
                    )}
                  </div>
                  <div className="pt-5">
                    <span className="text-xs text-slate-500 font-semibold">{t('sales.subtotal')}: </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {line.subtotal > 0 ? formatTZS(line.subtotal) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Desktop layout ── */}
              <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
                <div className="col-span-5">
                  <select
                    value={line.product_id}
                    onChange={(e) => updateRow(line.rowId, 'product_id', e.target.value)}
                    className="form-input text-sm"
                  >
                    <option value="">{t('sales.chooseProduct')}</option>
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.name} — {formatTZS(p.selling_price)}/{p.unit || 'pcs'} ({formatQuantity(p.quantity)} {p.unit || 'pcs'} {t('sales.inStock', 'in stock')})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0.25" step="0.25"
                      value={line.quantity}
                      onChange={(e) => updateRow(line.rowId, 'quantity', e.target.value)}
                      className={`form-input text-sm flex-1 ${line.exceedsStock ? 'error' : ''}`}
                    />
                    {line.product && (
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex-shrink-0">
                        {line.product.unit || 'pcs'}
                      </span>
                    )}
                  </div>
                  {line.exceedsStock && (
                    <p className="form-error text-xs">
                      {t('sales.onlyAvailableShort', { count: formatQuantity(line.product.quantity) })}
                    </p>
                  )}
                </div>
                <div className="col-span-3 px-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {line.subtotal > 0 ? formatTZS(line.subtotal) : '—'}
                  </span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeRow(line.rowId)}
                    disabled={items.length === 1}
                    className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
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

      {/* Payment method */}
      <div className="card">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          {t('sales.paymentMethod')}
        </h3>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { id: 'cash',         label: t('sales.cash'),        Icon: Banknote },
            { id: 'mobile_money', label: t('sales.mobileMoney'), Icon: Smartphone },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPayMethod(id)}
              className={`flex items-center justify-center gap-2 py-3 px-3 rounded-lg border-2 font-semibold text-sm transition-colors ${
                payMethod === id
                  ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-500'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {payMethod === 'mobile_money' && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
            <label className="form-label">{t('sales.customerPhone')}</label>
            <input
              ref={phoneRef}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('sales.phonePlaceholder')}
              className="form-input"
            />
            <p className="mt-1 text-xs text-slate-400">
              {t('sales.networkDetected')}
            </p>
          </div>
        )}
      </div>

      {/* Notes — optional, placed last so it doesn't interrupt the main flow */}
      <div className="card">
        <label className="form-label">{t('sales.notes')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
          className="form-input text-sm"
          placeholder={t('sales.notesPlaceholder')}
        />
      </div>

      {/* Total + submit */}
      <div className="card bg-gradient-to-r from-brand-50 to-white border-brand-200 dark:bg-slate-800 dark:bg-none dark:border-slate-700">
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
              {t('sales.totalAmount')}
            </div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              {formatTZS(computed.total)}
            </div>
          </div>
          <button
            type="submit"
            className="btn-success w-full py-3 text-base"
            disabled={submitting || computed.total <= 0}
          >
            {submitting
              ? (payMethod === 'mobile_money' ? t('sales.sendingRequest') : t('sales.recording'))
              : payMethod === 'mobile_money'
                ? t('sales.sendRequest', { amount: formatTZS(computed.total) })
                : t('sales.confirmSale')
            }
          </button>
        </div>
      </div>

      {/* Stock warning */}
      {computed.lines.some((l) => l.exceedsStock) && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-amber-800 dark:text-amber-200">{t('sales.exceedsStockWarning')}</p>
        </div>
      )}
    </form>
  );
}
