import { api } from './client';

function multipartConfig() {
  return { headers: { 'Content-Type': 'multipart/form-data' } };
}

export const authApi = {
  register: (data) => api.post('/api/auth/register', data),
  login: (data) => api.post('/api/auth/login', data),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
  updateProfile: (data) => api.put('/api/auth/me', data),
  uploadProfileImage: (file) => {
    const form = new FormData();
    form.append('profile_image', file);
    return api.post('/api/auth/me/profile-image', form, multipartConfig());
  },
  changePassword: (data) => api.put('/api/auth/me/password', data),

  // Staff management
  listStaff: () => api.get('/api/auth/staff'),
  addCashier: (data) => api.post('/api/auth/staff', data),
  removeCashier: (cashierId) => api.delete(`/api/auth/staff/${cashierId}`),
  resetCashierPassword: (cashierId, data) =>
    api.post(`/api/auth/staff/${cashierId}/reset-password`, data),

  // Forgot/reset password
  forgotPassword: (data) => api.post('/api/auth/forgot-password', data),
  verifyResetToken: (token) => api.get(`/api/auth/reset-password/${token}`),
  submitResetPassword: (token, data) =>
    api.post(`/api/auth/reset-password/${token}`, data),

  // Email verification
  verifyEmail: (token) => api.get(`/api/auth/verify-email/${token}`),
  resendVerification: (data) => api.post('/api/auth/resend-verification', data),
};
