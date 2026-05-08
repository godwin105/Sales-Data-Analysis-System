import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Building2, User } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    business_name: '',
    full_name: '',
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
      setErrors({ confirm_password: 'Passwords must match.' });
      return;
    }

    setSubmitting(true);
    try {
      await register(form);
      toast.success('Account created — please log in.');
      navigate('/login', { replace: true });
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
      } else {
        setPageError(extractError(err, 'Registration failed.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="p-7">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
          Create your account
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Register your business in under a minute
        </p>

        {pageError && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-900/30 dark:border-red-800 dark:text-red-200">
            {pageError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="form-label">Business Name</label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Duka la Amina"
                value={form.business_name}
                onChange={(e) => update('business_name', e.target.value)}
                className={`form-input pl-10 ${errors.business_name ? 'error' : ''}`}
                required
              />
            </div>
            {errors.business_name && <p className="form-error">{errors.business_name}</p>}
          </div>

          <div>
            <label className="form-label">Full Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Amina Juma"
                value={form.full_name}
                onChange={(e) => update('full_name', e.target.value)}
                className={`form-input pl-10 ${errors.full_name ? 'error' : ''}`}
                required
              />
            </div>
            {errors.full_name && <p className="form-error">{errors.full_name}</p>}
          </div>

          <div>
            <label className="form-label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                autoComplete="email"
                placeholder="amina@duka.co.tz"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className={`form-input pl-10 ${errors.email ? 'error' : ''}`}
                required
              />
            </div>
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>

          <div>
            <label className="form-label">Password</label>
            <PasswordInput
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              error={!!errors.password}
              required
            />
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>

          <div>
            <label className="form-label">Confirm Password</label>
            <PasswordInput
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={form.confirm_password}
              onChange={(e) => update('confirm_password', e.target.value)}
              error={!!errors.confirm_password}
              required
            />
            {errors.confirm_password && <p className="form-error">{errors.confirm_password}</p>}
          </div>

          <button
            type="submit"
            className="btn-primary w-full mt-2"
            disabled={submitting}
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-500"
          >
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
