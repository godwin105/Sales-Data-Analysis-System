/**
 * AuthContext — global auth state for the React app.
 *
 * On mount, hydrates from localStorage if a token exists, then verifies
 * the token by calling /api/auth/me. If verification fails, clears storage.
 *
 * Exposes:
 *   - user: the User object or null
 *   - isAuthenticated: boolean
 *   - isLoading: boolean (during initial token check)
 *   - login(email, password): logs in, stores token, sets user
 *   - register(payload): registers a new business owner (does NOT auto-login)
 *   - logout(): clears token and user
 *   - refreshUser(): re-fetches /api/auth/me (after profile updates)
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/auth';
import { TOKEN_KEY, USER_KEY } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // ---- Hydrate from localStorage on mount ----
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Optimistically use cached user, but verify with the server
    const cachedRaw = localStorage.getItem(USER_KEY);
    if (cachedRaw) {
      try {
        setUser(JSON.parse(cachedRaw));
      } catch {
        // ignore corrupt cache
      }
    }

    // Verify token validity
    authApi
      .me()
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      })
      .catch(() => {
        // Token invalid — clear out
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // ---- Actions ----
  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login({ email, password });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    // Does not log in — user is redirected to /login after success
    return await authApi.register(payload);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // best-effort; client-side cleanup is what matters
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await authApi.me();
    setUser(data.user);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  }, []);

  const value = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isCashier: user?.role === 'cashier',
    isLoading,
    login,
    register,
    logout,
    refreshUser,
    setUser, // for after profile updates
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
