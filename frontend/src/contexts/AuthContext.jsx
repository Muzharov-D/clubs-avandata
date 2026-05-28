import { createContext, useContext, useEffect, useState } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout, getToken } from '../services/api';
import { applyTheme, resetTheme } from '../tenant/applyTheme';
import { setClubHints, clearClubHints } from '../utils/legirus';

const AuthCtx = createContext(null);

const COACH_ROLES = new Set(['head_coach', 'team_coach', 'coach']);

const TENANT_KEY = 'avandata.auth.tenant';

function storedTenant() {
  try {
    const raw = localStorage.getItem(TENANT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveTenant(t) {
  try {
    if (t) localStorage.setItem(TENANT_KEY, JSON.stringify(t));
    else   localStorage.removeItem(TENANT_KEY);
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(storedTenant());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    fetchMe()
      .then((res) => {
        setUser(res.user);
        if (res.tenant !== undefined) {
          setTenant(res.tenant);
          saveTenant(res.tenant);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Применяем брендинг тенанта (CSS-переменные + favicon + title)
  // + регистрируем имена «нашего» клуба для isOurClub() во всех компонентах
  useEffect(() => {
    if (tenant?.brand) applyTheme(tenant.brand, tenant.slug);
    else resetTheme();

    if (tenant) {
      const names = [tenant.displayName, tenant.name].filter(Boolean);
      setClubHints(names);
    } else {
      clearClubHints();
    }
  }, [tenant]);

  const isCoach = user ? COACH_ROLES.has(user.role) : false;
  const isPlayer = user?.role === 'player';
  const isHeadCoach = user?.role === 'head_coach';
  const isTeamCoach = user?.role === 'team_coach';

  const value = {
    user,
    tenant,
    loading,
    isAuthenticated: !!user,
    isCoach,
    isPlayer,
    isHeadCoach,
    isTeamCoach,
    canSeePlayer: (playerId) =>
      (user ? COACH_ROLES.has(user.role) : false) ||
      (user?.role === 'player' && user.playerId === playerId),
    login: async (u, p) => {
      const { user: usr, tenant: t } = await apiLogin(u, p);
      setUser(usr);
      setTenant(t ?? null);
      saveTenant(t ?? null);
      return usr;
    },
    logout: () => { apiLogout(); saveTenant(null); setUser(null); setTenant(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
