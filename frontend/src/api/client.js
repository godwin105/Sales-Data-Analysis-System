import axios from 'axios';

export const TOKEN_KEY = 'sales_app_token';
export const USER_KEY = 'sales_app_user';

function getApiBaseURL() {
  const configured = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  try {
    const apiUrl = new URL(configured);
    const isLocalApiHost = ['localhost', '127.0.0.1', '::1'].includes(apiUrl.hostname);

    if (import.meta.env.DEV && isLocalApiHost) {
      return '';
    }
  } catch {
    // Fall through to the configured value if it is not an absolute URL.
  }

  return configured.replace(/\/$/, '');
}

export const API_BASE_URL = getApiBaseURL();

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // 60s timeout — Render free tier can take ~30-50s to wake from sleep
  timeout: 60000,
});


api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});


api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;

   
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
     
      const path = window.location.pathname;
      const publicPaths = ['/login', '/register', '/forgot-password'];
      if (!publicPaths.some((p) => path.startsWith(p)) && !path.startsWith('/reset-password')) {
        
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);


export function extractError(err, fallback = 'Something went wrong.') {
  if (!err) return fallback;
  if (err.response?.data?.error) return err.response.data.error;
  if (err.message === 'Network Error' || err.code === 'ECONNABORTED') {
    return 'Server is starting up — please wait a moment and try again.';
  }
  return err.message || fallback;
}


 
export function extractFieldErrors(err) {
  return err?.response?.data?.fields || {};
}
