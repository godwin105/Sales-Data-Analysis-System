import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../components/AuthLayout';
import { authApi } from '../api/auth';

export default function VerifyEmail() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const calledRef = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-firing the effect,
    // which would mark the token used on the first call and fail on the second.
    if (calledRef.current) return;
    calledRef.current = true;

    authApi.verifyEmail(token)
      .then(({ data }) => {
        setMessage(data.message || t('auth.verifyEmail.successMessage'));
        setStatus('success');
      })
      .catch((err) => {
        setMessage(
          err?.response?.data?.error || t('auth.verifyEmail.errorMessage')
        );
        setStatus('error');
      });
  }, [token]);

  return (
    <AuthLayout>
      <div className="p-7 text-center">
        {status === 'loading' && (
          <>
            <Loader size={40} className="mx-auto mb-4 text-brand-600 animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('auth.verifyEmail.verifying')}
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
              {t('auth.verifyEmail.successTitle')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {message}
            </p>
            <Link to="/login" className="btn-primary inline-flex">
              {t('auth.verifyEmail.goToLogin')}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={48} className="mx-auto mb-4 text-danger" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
              {t('auth.verifyEmail.errorTitle')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {message}
            </p>
            <Link to="/login" className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500">
              {t('auth.verifyEmail.backToLogin')}
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
