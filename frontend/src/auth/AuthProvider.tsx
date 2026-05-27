import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '../api/client';
import type { LoginRequest, LoginResponse, User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (req: LoginRequest) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'auth.user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try /auth/me on mount — refreshes if access token expired.
    api<{ user: User }>('/auth/me')
      .then((d) => {
        // /auth/me returns AccessTokenPayload, не полный User.
        // На initial mount достаточно localStorage; здесь только подтверждаем live-сессию.
        if (!user && d.user) {
          // Should not happen — no access token = 401 = redirect to login.
        }
      })
      .catch(() => {
        setUser(null);
        localStorage.removeItem(USER_KEY);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (req: LoginRequest): Promise<User> => {
    const res = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: req,
      auth: false,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', auth: false });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
