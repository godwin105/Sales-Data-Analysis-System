import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../components/AuthLayout';
import { authApi } from '../api/auth';
import { extractError } from '../api/client';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [pageMessage, setPageMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setPageError(null);

    if (!email) {
      setPageError(t('auth.forgot.errorRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await authApi.forgotPassword({ email: email.trim() });
      setPageMessage(data.message);
      setSubmitted(true);
    } catch (err) {
      setPageError(extractError(err, t('auth.forgot.errorFailed')));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthLayout>
        <div className="p-7 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 mb-4">
            <CheckCircle2 className="text-success" size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            {t('auth.forgot.checkInbox')}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
            {pageMessage}
          </p>
          <Link to="/login" className="btn-secondary inline-flex">
            <ArrowLeft size={16} />
            {t('auth.forgot.backToLogin')}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="p-7">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
          {t('auth.forgot.title')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {t('auth.forgot.subtitle')}
        </p>

        {pageError && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-200">
            {pageError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="form-label">{t('auth.forgot.emailLabel')}</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                placeholder={t('auth.forgot.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input pl-10"
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
          </button>
        </div>

        <div className="text-center mt-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <ArrowLeft size={14} />
            {t('auth.forgot.backToLogin')}
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
