import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, business, setUnauthorizedHandler, token } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const logoutLocal = useCallback(() => {
    token.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(logoutLocal);
    if (!token.get()) {
      setReady(true);
      return;
    }
    api.get('/auth/me')
      .then((res) => setUser(res.user || res.data || res))
      // only a real "not signed in" clears the session — not a busy/slow engine
      .catch((err) => {
        if (err.status === 401) token.clear();
        // the business this computer last used was removed: go back to the first one
        if (err.status === 404 && business.get() !== 1) { business.set(1); window.location.reload(); }
      })
      .finally(() => setReady(true));
  }, [logoutLocal]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    token.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* token may already be gone */ }
    token.clearAll();
    logoutLocal();
  }, [logoutLocal]);

  const value = useMemo(() => {
    const perms = new Set(user?.permissions || []);
    return {
      user,
      ready,
      login,
      logout,
      setUser,
      can: (p) => (Array.isArray(p) ? p.some((x) => perms.has(x)) : perms.has(p)),
      isAdmin: user?.role === 'Admin',
    };
  }, [user, ready, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
