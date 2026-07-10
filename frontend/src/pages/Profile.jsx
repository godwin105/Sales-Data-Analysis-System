import { useEffect, useState } from 'react';
import { Camera, User, Lock, Smartphone, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractError, extractFieldErrors } from '../api/client';
import { initials } from '../utils/format';
import { assetUrl } from '../utils/media';
import PasswordInput from '../components/PasswordInput';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [profile, setProfile] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    business_name: user?.business_name || '',
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);

  const [pwd, setPwd] = useState({
    current_password: '',
    new_password: '',
    confirm_new_password: '',
  });
  const [pwdErrors, setPwdErrors] = useState({});
  const [savingPwd, setSavingPwd] = useState(false);

  // ── ClickPesa payment settings (admin only) ──────────────────────────────
  const [cpCreds, setCpCreds] = useState({ clickpesa_client_id: '', clickpesa_api_key: '' });
  const [cpConfigured, setCpConfigured] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingCp, setSavingCp] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    authApi.getPaymentSettings()
      .then(({ data }) => {
        setCpConfigured(data.has_clickpesa_configured);
        setCpCreds((prev) => ({ ...prev, clickpesa_client_id: data.clickpesa_client_id || '' }));
      })
      .catch(() => {});
  }, [user?.role]);

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
        toast.error(extractError(err, t('profile.errorUpdate')));
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePictureChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingPicture(true);
    try {
      await authApi.uploadProfileImage(file);
      toast.success(t('profile.pictureUpdated'));
      await refreshUser();
    } catch (err) {
      toast.error(extractError(err, t('profile.errorPicture')));
    } finally {
      setUploadingPicture(false);
    }
  }

  async function handlePwdSubmit(e) {
    e.preventDefault();
    setSavingPwd(true);
    setPwdErrors({});

    if (pwd.new_password !== pwd.confirm_new_password) {
      setPwdErrors({ confirm_new_password: t('profile.errorMatch') });
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
        toast.error(extractError(err, t('profile.errorPassword')));
      }
    } finally {
      setSavingPwd(false);
    }
  }

  async function saveCpCreds(payload) {
    setSavingCp(true);
    try {
      const { data } = await authApi.savePaymentSettings(payload);
      toast.success(data.message);
      setCpConfigured(data.has_clickpesa_configured);
      if (!data.has_clickpesa_configured) {
        setCpCreds({ clickpesa_client_id: '', clickpesa_api_key: '' });
      } else {
        setCpCreds((prev) => ({ ...prev, clickpesa_api_key: '' }));
      }
    } catch (err) {
      toast.error(extractError(err, t('profile.errorSavePayment')));
    } finally {
      setSavingCp(false);
    }
  }

  function handleCpSubmit(e) {
    e.preventDefault();
    const id  = cpCreds.clickpesa_client_id.trim();
    const key = cpCreds.clickpesa_api_key.trim();
    if (!id && !key) {
      toast.error(t('profile.enterCredentials'));
      return;
    }
    if (!id || !key) {
      toast.error(t('profile.bothCredentialsRequired'));
      return;
    }
    saveCpCreds({ clickpesa_client_id: id, clickpesa_api_key: key });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
      <form onSubmit={handleProfileSubmit} className="card">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <User size={18} />
          {t('profile.personalInfo')}
        </h3>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-xl flex items-center justify-center shadow-sm flex-shrink-0">
              {user?.profile_image_url ? (
                <img
                  src={assetUrl(user.profile_image_url)}
                  alt={t('profile.profilePicture')}
                  className="w-full h-full object-cover"
                />
              ) : (
                initials(user?.full_name)
              )}
            </div>
            <div>
              <label className="form-label">{t('profile.profilePicture')}</label>
              <label className="btn-secondary inline-flex cursor-pointer">
                <Camera size={16} />
                {uploadingPicture ? t('profile.uploadingPicture') : t('profile.uploadPicture')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePictureChange}
                  className="hidden"
                  disabled={uploadingPicture}
                />
              </label>
              <p className="form-help mt-1">{t('profile.pictureHelp')}</p>
            </div>
          </div>

          <div>
            <label className="form-label">{t('profile.emailAddress')}</label>
            <input
              type="email"
              value={user?.email || ''}
              className="form-input bg-slate-100 dark:bg-slate-700 cursor-not-allowed"
              disabled
            />
            <p className="form-help">{t('profile.emailHelp')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('profile.firstName')}</label>
              <input
                type="text" required
                value={profile.first_name}
                onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                className={`form-input ${profileErrors.first_name ? 'error' : ''}`}
              />
              {profileErrors.first_name && <p className="form-error">{profileErrors.first_name}</p>}
            </div>
            <div>
              <label className="form-label">{t('profile.lastName')}</label>
              <input
                type="text" required
                value={profile.last_name}
                onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                className={`form-input ${profileErrors.last_name ? 'error' : ''}`}
              />
              {profileErrors.last_name && <p className="form-error">{profileErrors.last_name}</p>}
            </div>
          </div>

          {user?.role === 'admin' && (
            <div>
              <label className="form-label">{t('profile.businessName')}</label>
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
            <label className="form-label">{t('profile.role')}</label>
            <input
              type="text"
              value={user?.role === 'admin' ? t('role.admin') : t('role.cashier')}
              className="form-input bg-slate-100 dark:bg-slate-700 cursor-not-allowed"
              disabled
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={savingProfile}>
            {savingProfile ? t('profile.saving') : t('profile.updateProfile')}
          </button>
        </div>
      </form>

      <form onSubmit={handlePwdSubmit} className="card">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Lock size={18} />
          {t('profile.changePassword')}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="form-label">{t('profile.currentPassword')}</label>
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
            <label className="form-label">{t('profile.newPassword')}</label>
            <PasswordInput
              required
              autoComplete="new-password"
              placeholder={t('profile.passwordPlaceholder')}
              value={pwd.new_password}
              onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
              error={!!pwdErrors.new_password}
            />
            {pwdErrors.new_password && <p className="form-error">{pwdErrors.new_password}</p>}
          </div>

          <div>
            <label className="form-label">{t('profile.confirmNewPassword')}</label>
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
            {savingPwd ? t('profile.updating') : t('profile.submitPassword')}
          </button>
        </div>
      </form>

      {user?.role === 'admin' && (
        <form onSubmit={handleCpSubmit} className="card lg:col-span-2">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
            <Smartphone size={18} />
            {t('profile.mobilePaymentSettings')}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {t('profile.mobilePaymentHelp')}
          </p>

          {cpConfigured && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              {t('profile.clickpesaConfigured')}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="form-label">{t('profile.clickpesaClientId')}</label>
              <input
                type="text"
                value={cpCreds.clickpesa_client_id}
                onChange={(e) => setCpCreds({ ...cpCreds, clickpesa_client_id: e.target.value })}
                className="form-input font-mono text-sm"
                placeholder={t('profile.clickpesaClientIdPlaceholder')}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="form-label">{t('profile.clickpesaApiKey')}</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={cpCreds.clickpesa_api_key}
                  onChange={(e) => setCpCreds({ ...cpCreds, clickpesa_api_key: e.target.value })}
                  className="form-input font-mono text-sm pr-10"
                  placeholder={cpConfigured ? t('profile.clickpesaApiKeyPlaceholder') : t('profile.clickpesaApiKeyNewPlaceholder')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="form-help mt-1">
                {t('profile.clickpesaKeysHelp')}
              </p>
            </div>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex-1" disabled={savingCp}>
                {savingCp ? t('profile.savingPaymentSettings') : t('profile.savePaymentSettings')}
              </button>
              {cpConfigured && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingCp}
                  onClick={() => saveCpCreds({ clickpesa_client_id: '', clickpesa_api_key: '' })}
                >
                  {t('profile.clearSettings')}
                </button>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
