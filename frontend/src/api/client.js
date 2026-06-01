/**
 * Centralised Axios client for all API calls.
 *
 * Reads the API base URL from VITE_API_URL (set in .env). Attaches the
 * JWT access token from localStorage on every request. On 401 responses,
 * clears the stored token and redirects to /login.
 */
import axios from 'axios';

export const TOKEN_KEY = 'sales_app_token';
export const USER_KEY = 'sales_app_user';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

// ---- Request interceptor: attach JWT ----
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Response interceptor: handle 401 globally ----
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;

    // Token expired or missing kick to login (but don't loop on /auth/* itself)
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      // Only redirect if we're not already on a public auth page
      const path = window.location.pathname;
      const publicPaths = ['/login', '/register', '/forgot-password'];
      if (!publicPaths.some((p) => path.startsWith(p)) && !path.startsWith('/reset-password')) {
        // Use full reload to clear any in-memory React state
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

/*Helper to extract a friendly message from an axios error.*/
export function extractError(err, fallback = 'Something went wrong.') {
  if (!err) return fallback;
  if (err.response?.data?.error) return err.response.data.error;
  if (err.message === 'Network Error') {
    return 'Cannot reach the server. Please check your internet connection.';
  }
  return err.message || fallback;
}

//Helper to extract field-level validation errors from a 400 response. Returns an object like {email: 'Invalid email', password: 'Too short'} or {}.
 
export function extractFieldErrors(err) {
  return err?.response?.data?.fields || {};
}
