import { useState } from 'react';
import { User, Lock } from 'lucide-react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';
import PasswordInput from '../components/PasswordInput';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  // Profile form
  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
    business_name: user?.business_name || '',
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [pwd, setPwd] = useState({
    current_password: '',
    new_password: '',
    confirm_new_password: '',
  });
  const [pwdErrors, setPwdErrors] = useState({});
  const [savingPwd, setSavingPwd] = useState(false);

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    try {
      const { data } = await authApi.updateProfile(profile);
      toast.success(data.message);
      await refreshUser();
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setProfileErrors(fields);
      } else {
        toast.error(extractError(err, 'Could not update profile.'));
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePwdSubmit(e) {
    e.preventDefault();
    setSavingPwd(true);
    setPwdErrors({});

    if (pwd.new_password !== pwd.confirm_new_password) {
      setPwdErrors({ confirm_new_password: 'Passwords must match.' });
      setSavingPwd(false);
      return;
    }

    try {
      const { data } = await authApi.changePassword(pwd);
      toast.success(data.message);
      setPwd({ current_password: '', new_password: '', confirm_new_password: '' });
    } catch (err) {
      const fields = extractFieldErrors(err);
      if (Object.keys(fields).length > 0) {
        setPwdErrors(fields);
      } else {
        toast.error(extractError(err, 'Could not change password.'));
      }
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
      {/* Profile section */}
      <form onSubmit={handleProfileSubmit} className="card">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <User size={18} />
          Personal Information
        </h3>

        <div className="space-y-4">
          <div>
            <label className="form-label">Email Address</label>
            <input
              type="email"
              value={user?.email || ''}
              className="form-input bg-slate-100 dark:bg-slate-700 cursor-not-allowed"
              disabled
            />
            <p className="form-help">Email cannot be changed.</p>
          </div>

          <div>
            <label className="form-label">Full Name</label>
            <input
              type="text" required
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              className={`form-input ${profileErrors.full_name ? 'error' : ''}`}
            />
            {profileErrors.full_name && <p className="form-error">{profileErrors.full_name}</p>}
          </div>

          {user?.role === 'admin' && (
            <div>
              <label className="form-label">Business Name</label>
              <input
                type="text"
                value={profile.business_name}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                className={`form-input ${profileErrors.business_name ? 'error' : ''}`}
              />
              {profileErrors.business_name && <p className="form-error">{profileErrors.business_name}</p>}
            </div>
          )}

          <div>
            <label className="form-label">Role</label>
            <input
              type="text"
              value={user?.role === 'admin' ? 'Business Owner' : 'Cashier'}
              className="form-input bg-slate-100 dark:bg-slate-700 cursor-not-allowed"
              disabled
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Update Profile'}
          </button>
        </div>
      </form>

      {/* Password section */}
      <form onSubmit={handlePwdSubmit} className="card">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Lock size={18} />
          Change Password
        </h3>

        <div className="space-y-4">
          <div>
            <label className="form-label">Current Password</label>
            <PasswordInput
              required
              autoComplete="current-password"
              value={pwd.current_password}
              onChange={(e) => setPwd({ ...pwd, current_password: e.target.value })}
              error={!!pwdErrors.current_password}
            />
            {pwdErrors.current_password && <p className="form-error">{pwdErrors.current_password}</p>}
          </div>

          <div>
            <label className="form-label">New Password</label>
            <PasswordInput
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={pwd.new_password}
              onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
              error={!!pwdErrors.new_password}
            />
            {pwdErrors.new_password && <p className="form-error">{pwdErrors.new_password}</p>}
          </div>

          <div>
            <label className="form-label">Confirm New Password</label>
            <PasswordInput
              required
              autoComplete="new-password"
              value={pwd.confirm_new_password}
              onChange={(e) => setPwd({ ...pwd, confirm_new_password: e.target.value })}
              error={!!pwdErrors.confirm_new_password}
            />
            {pwdErrors.confirm_new_password && <p className="form-error">{pwdErrors.confirm_new_password}</p>}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={savingPwd}>
            {savingPwd ? 'Updating...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
