import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Building2, User, Lock, Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PasswordInput from '../components/PasswordInput';
import PasswordStrengthHint from '../components/PasswordStrengthHint';
import BrandMark from '../components/BrandMark';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isDark, toggle } = useTheme();

  const [form, setForm] = useState({
    business_name: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
  });
  const [errors, setErrors] = useState({});
  const [pageError, setPageError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: null }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setPageError(null);
    setErrors({});

    if (form.password !== form.confirm_password) {
      setErrors({ confirm_password: t('auth.register.passwordMismatch') });
      return;
    }

    setSubmitting(true);
    try {
      await register(form);
      navigate('/check-email', { replace: true, state: { email: form.email } });
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else {
        setPageError(extractError(err, t('auth.register.errorFailed')));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950">
      <div className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 py-6">

        {/* Top-right controls */}
        <div className="absolute right-4 top-4 z-20 flex gap-2 sm:right-8">
          <LanguageSwitcher variant="auth" />
          <button
            onClick={toggle}
            className="p-2 rounded-lg bg-white/70 dark:bg-slate-800/70 backdrop-blur text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 shadow-sm transition-colors"
            aria-label={t('nav.toggleTheme')}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="w-full max-w-lg">
          <div className="mb-4">
            <BrandMark size="md" />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <form onSubmit={handleSubmit} className="p-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-0.5">
                {t('auth.register.title')}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('auth.register.subtitle')}
              </p>

              {pageError && (
                <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-200">
                  {pageError}
                </div>
              )}

              {/* 2-column on desktop, single column on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">

                {/* Row 1: Business Name | Email */}
                <div>
                  <label className="form-label">{t('auth.register.businessNameLabel')}</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t('auth.register.businessNamePlaceholder')}
                      value={form.business_name}
                      onChange={(e) => update('business_name', e.target.value)}
                      className={`form-input pl-9 ${errors.business_name ? 'error' : ''}`}
                      required
                    />
                  </div>
                  {errors.business_name && <p className="form-error">{errors.business_name}</p>}
                </div>

                <div>
                  <label className="form-label">{t('auth.register.emailLabel')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder={t('auth.register.emailPlaceholder')}
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      className={`form-input pl-9 ${errors.email ? 'error' : ''}`}
                      required
                    />
                  </div>
                  {errors.email && <p className="form-error">{errors.email}</p>}
                </div>

                {/* Row 2: First Name | Last Name */}
                <div>
                  <label className="form-label">{t('auth.register.firstNameLabel')}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t('auth.register.firstNamePlaceholder')}
                      value={form.first_name}
                      onChange={(e) => update('first_name', e.target.value)}
                      className={`form-input pl-9 ${errors.first_name ? 'error' : ''}`}
                      required
                    />
                  </div>
                  {errors.first_name && <p className="form-error">{errors.first_name}</p>}
                </div>

                <div>
                  <label className="form-label">{t('auth.register.lastNameLabel')}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t('auth.register.lastNamePlaceholder')}
                      value={form.last_name}
                      onChange={(e) => update('last_name', e.target.value)}
                      className={`form-input pl-9 ${errors.last_name ? 'error' : ''}`}
                      required
                    />
                  </div>
                  {errors.last_name && <p className="form-error">{errors.last_name}</p>}
                </div>

                {/* Row 3: Password | Confirm Password */}
                <div>
                  <label className="form-label">{t('auth.register.passwordLabel')}</label>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder={t('auth.register.passwordPlaceholder')}
                    value={form.password}
                    onChange={(e) => update('password', e.target.value)}
                    error={!!errors.password}
                    required
                  />
                  <PasswordStrengthHint value={form.password} />
                  {errors.password && <p className="form-error">{errors.password}</p>}
                </div>

                <div>
                  <label className="form-label">{t('auth.register.confirmPasswordLabel')}</label>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder={t('auth.register.confirmPasswordPlaceholder')}
                    value={form.confirm_password}
                    onChange={(e) => update('confirm_password', e.target.value)}
                    error={!!errors.confirm_password}
                    required
                  />
                  {errors.confirm_password && <p className="form-error">{errors.confirm_password}</p>}
                </div>

                {/* Submit — full width */}
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={submitting}
                  >
                    {submitting ? t('auth.register.submitting') : t('auth.register.submit')}
                  </button>
                </div>

              </div>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-4">
                {t('auth.register.haveAccount')}{' '}
                <Link
                  to="/login"
                  className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500"
                >
                  {t('auth.register.logIn')}
                </Link>
              </p>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
