import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractError } from '../api/client';
import { authApi } from '../api/auth';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const from = location.state?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setPageError(null);

    if (!email || !password) {
      setPageError(t('auth.login.errorRequired'));
      return;
    }

    setUnverifiedEmail(null);
    setSubmitting(true);
    try {
      const data = await login(email.trim(), password);
      toast.success(data.message || t('auth.login.welcomeToast'));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const data = err?.response?.data || {};
      if (data.code === 'email_not_verified') {
        setUnverifiedEmail(email.trim());
        setPageError(t('auth.login.errorEmailNotVerified'));
      } else {
        setPageError(loginErrorMessage(err, t));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      await authApi.resendVerification({ email: unverifiedEmail });
      toast.success(t('auth.login.resendSuccess'));
      setUnverifiedEmail(null);
      setPageError(null);
    } catch {
      toast.error(t('auth.login.resendFailed'));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="p-7">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
          {t('auth.login.title')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {t('auth.login.subtitle')}
        </p>

        {pageError && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-200">
            {pageError}
            {unverifiedEmail && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="mt-2 block font-semibold underline underline-offset-2 hover:no-underline"
              >
                {resending ? t('auth.login.resending') : t('auth.login.resendLink')}
              </button>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="form-label">{t('auth.login.emailLabel')}</label>
            <div className="relative">
              <Mail
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="teddie@biashara.co.tz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input pl-10"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="form-label !mb-0">{t('auth.login.passwordLabel')}</label>
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500"
              >
                {t('auth.login.forgotPassword')}
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full mt-2"
            disabled={submitting}
          >
            {submitting ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-7">
          {t('auth.login.noAccount')}{' '}
          <Link
            to="/register"
            className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500"
          >
            {t('auth.login.createAccount')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

function loginErrorMessage(err, t) {
  const data = err?.response?.data || {};
  if (data.code === 'account_locked') {
    const minutes = data.unlock_in_minutes || 1;
    const key = data.error?.includes('Try again')
      ? 'auth.login.errorAccountLockedRetry'
      : 'auth.login.errorAccountLocked';
    return t(key, { minutes });
  }
  if (data.code === 'invalid_credentials' && data.attempts_remaining != null) {
    return t('auth.login.errorInvalidCredentials', { attempts: data.attempts_remaining });
  }
  return extractError(err, t('auth.login.errorFailed'));
}
