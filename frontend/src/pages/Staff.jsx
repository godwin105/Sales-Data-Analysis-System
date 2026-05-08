import { useEffect, useState } from 'react';
import { Plus, Users, KeyRound, Trash2, Mail } from 'lucide-react';
import { authApi } from '../api/auth';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';
import { formatDate, initials } from '../utils/format';
import PageSpinner from '../components/PageSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import PasswordInput from '../components/PasswordInput';

export default function Staff() {
  const toast = useToast();
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [resetCandidate, setResetCandidate] = useState(null);
  const [removeCandidate, setRemoveCandidate] = useState(null);
  const [busyRemove, setBusyRemove] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await authApi.listStaff();
      setCashiers(data.cashiers);
    } catch (err) {
      toast.error(extractError(err, 'Could not load staff.'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRemove() {
    if (!removeCandidate) return;
    setBusyRemove(true);
    try {
      const { data } = await authApi.removeCashier(removeCandidate.user_id);
      toast.success(data.message);
      await load();
    } catch (err) {
      toast.error(extractError(err, 'Could not remove cashier.'));
    } finally {
      setBusyRemove(false);
      setRemoveCandidate(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage cashier accounts who can record sales for your business.
        </p>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={16} />
          Add Cashier
        </button>
      </div>

      {loading ? (
        <PageSpinner label="Loading staff..." />
      ) : cashiers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title="No cashiers yet"
            message="Add a cashier to let staff record sales without giving them admin access."
            action={
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <Plus size={16} />
                Add Cashier
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cashiers.map((c) => (
            <div key={c.user_id} className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold flex items-center justify-center">
                  {initials(c.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{c.full_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                    <Mail size={11} />
                    {c.email}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Added {formatDate(c.created_at)}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setResetCandidate(c)}
                  className="btn-secondary flex-1 text-xs !px-3 !py-2"
                >
                  <KeyRound size={14} />
                  Reset Password
                </button>
                <button
                  onClick={() => setRemoveCandidate(c)}
                  className="text-danger hover:bg-red-50 dark:hover:bg-red-900/30 px-3 py-2 rounded-lg"
                  title="Remove"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add cashier modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Cashier">
        <AddCashierForm
          onCancel={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); load(); }}
        />
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={!!resetCandidate}
        onClose={() => setResetCandidate(null)}
        title={`Reset Password — ${resetCandidate?.full_name || ''}`}
      >
        {resetCandidate && (
          <ResetPasswordForm
            cashier={resetCandidate}
            onCancel={() => setResetCandidate(null)}
            onSuccess={() => setResetCandidate(null)}
          />
        )}
      </Modal>

      {/* Remove confirmation */}
      <ConfirmDialog
        open={!!removeCandidate}
        title={`Remove ${removeCandidate?.full_name}?`}
        message="If they have sales history, their account will be deactivated and history preserved. Otherwise it will be permanently deleted."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveCandidate(null)}
        busy={busyRemove}
      />
    </div>
  );
}

// =========================================================================
function AddCashierForm({ onCancel, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const { data } = await authApi.addCashier(form);
      toast.success(data.message);
      onSuccess();
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else {
        toast.error(extractError(err, 'Could not add cashier.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="form-label">Full Name *</label>
        <input
          type="text" required
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className={`form-input ${errors.full_name ? 'error' : ''}`}
        />
        {errors.full_name && <p className="form-error">{errors.full_name}</p>}
      </div>
      <div>
        <label className="form-label">Email *</label>
        <input
          type="email" required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={`form-input ${errors.email ? 'error' : ''}`}
        />
        {errors.email && <p className="form-error">{errors.email}</p>}
      </div>
      <div>
        <label className="form-label">Temporary Password *</label>
        <PasswordInput
          required
          placeholder="At least 8 characters"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={!!errors.password}
        />
        <p className="form-help">Share this with the cashier securely. They can change it after first login.</p>
        {errors.password && <p className="form-error">{errors.password}</p>}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add Cashier'}
        </button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ cashier, onCancel, onSuccess }) {
  const toast = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const { data } = await authApi.resetCashierPassword(cashier.user_id, {
        new_password: newPassword,
      });
      toast.success(data.message);
      setDone(data.new_password);
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else {
        toast.error(extractError(err, 'Could not reset password.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-sm font-bold text-green-800 dark:text-green-200">Password reset successfully.</p>
          <p className="text-sm text-green-700 dark:text-green-300 mt-2">
            New password for <strong>{cashier.full_name}</strong>:
          </p>
          <p className="font-mono text-base bg-white dark:bg-slate-900 px-3 py-2 rounded mt-2 border border-green-300 dark:border-green-700">
            {done}
          </p>
          <p className="text-xs text-green-700 dark:text-green-300 mt-3">
            Please share this securely with the cashier (in person or via a private channel).
          </p>
        </div>
        <div className="flex justify-end">
          <button onClick={onSuccess} className="btn-primary">Done</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Set a new password for <strong>{cashier.full_name}</strong>. They'll use this to log in.
      </p>
      <div>
        <label className="form-label">New Password *</label>
        <PasswordInput
          required
          placeholder="At least 8 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={!!errors.new_password}
        />
        {errors.new_password && <p className="form-error">{errors.new_password}</p>}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Resetting...' : 'Reset Password'}
        </button>
      </div>
    </form>
  );
}
