import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../components/AuthLayout';
import { authApi } from '../api/auth';
import { useToast } from '../context/ToastContext';
import { extractError } from '../api/client';

export default function CheckEmail() {
  const { t } = useTranslation();
  const toast = useToast();
  const location = useLocation();
  const email = location.state?.email || '';

  const [resending, setResending] = useState(false);

  async function handleResend() {
    if (!email) return;
    setResending(true);
    try {
      await authApi.resendVerification({ email });
      toast.success(t('auth.checkEmail.resendSuccess'));
    } catch (err) {
      toast.error(extractError(err, t('auth.checkEmail.resendFailed')));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout>
      <div className="p-7 text-center">
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
            <MailCheck size={32} className="text-brand-600 dark:text-brand-400" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          {t('auth.checkEmail.title')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
          {t('auth.checkEmail.subtitle')}
        </p>
        {email && (
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-6">
            {email}
          </p>
        )}

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {t('auth.checkEmail.instruction')}
        </p>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending || !email}
          className="btn-secondary w-full mb-4"
        >
          {resending ? t('auth.checkEmail.resending') : t('auth.checkEmail.resendButton')}
        </button>

        <Link
          to="/login"
          className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500"
        >
          {t('auth.checkEmail.backToLogin')}
        </Link>
      </div>
    </AuthLayout>
  );
}
