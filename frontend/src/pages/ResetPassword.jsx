import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import PageSpinner from '../components/PageSpinner';
import { authApi } from '../api/auth';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';

export default function ResetPassword() {
  const { token } = useParams();
  const toast = useToast();
  const navigate = useNavigate();

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [pageError, setPageError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    authApi
      .verifyResetToken(token)
      .then(() => active && setTokenValid(true))
      .catch((err) => {
        if (!active) return;
        setTokenError(extractError(err, 'Invalid or expired reset link.'));
      })
      .finally(() => active && setVerifying(false));
    return () => { active = false; };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setPageError(null);
    setErrors({});

    if (password !== confirmPassword) {
      setErrors({ confirm_password: 'Passwords must match.' });
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await authApi.submitResetPassword(token, {
        password,
        confirm_password: confirmPassword,
      });
      setDone(true);
      toast.success(data.message);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else {
        setPageError(extractError(err, 'Reset failed.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (verifying) {
    return (
      <AuthLayout>
        <PageSpinner label="Verifying reset link..." />
      </AuthLayout>
    );
  }

  if (!tokenValid) {
    return (
      <AuthLayout>
        <div className="p-7 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/40 mb-4">
            <AlertCircle className="text-danger" size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Link expired or invalid
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
            {tokenError || 'This password reset link is no longer valid.'}
          </p>
          <Link to="/forgot-password" className="btn-primary inline-flex">
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="p-7 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 mb-4">
            <CheckCircle2 className="text-success" size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Password reset!
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
            Redirecting you to login...
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="p-7">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
          Set a new password
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Choose a strong password you'll remember.
        </p>

        {pageError && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-200">
            {pageError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="form-label">New Password</label>
            <PasswordInput
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!errors.password}
              required
            />
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>

          <div>
            <label className="form-label">Confirm New Password</label>
            <PasswordInput
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={!!errors.confirm_password}
              required
            />
            {errors.confirm_password && <p className="form-error">{errors.confirm_password}</p>}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>

        <div className="text-center mt-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <ArrowLeft size={14} />
            Back to login
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
