import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchMe, login as apiLogin, loginByLink as apiLoginByLink, logout as apiLogout, getToken } from '../services/api';
import { applyTheme, resetTheme } from '../tenant/applyTheme';
import { setClubHints, clearClubHints, setOurLogo, clearOurLogo } from '../utils/legirus';

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
  const [federation, setFederation] = useState(null);
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
        if (res.federation !== undefined) setFederation(res.federation);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Тихо перечитать профиль/тенант (тариф, бренд) без перезагрузки страницы.
  // Не трогаем loading и не сбрасываем user при разовой ошибке — это фоновый рефетч.
  const refreshTenant = useCallback(() => {
    if (!getToken()) return;
    fetchMe()
      .then((res) => {
        setUser(res.user);
        if (res.tenant !== undefined) {
          setTenant(res.tenant);
          saveTenant(res.tenant);
        }
        if (res.federation !== undefined) setFederation(res.federation);
      })
      .catch(() => {});
  }, []);

  // Авто-рефетч тарифа/бренда без F5: когда вкладка снова в фокусе (например,
  // platform_admin переключил тариф клуба в другой вкладке).
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') refreshTenant(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshTenant]);

  // Применяем брендинг тенанта (CSS-переменные + favicon + title)
  // + регистрируем имена «нашего» клуба для isOurClub() во всех компонентах
  useEffect(() => {
    if (tenant?.brand) applyTheme(tenant.brand, tenant.slug);
    else resetTheme();

    if (tenant) {
      const names = [tenant.displayName, tenant.name].filter(Boolean);
      setClubHints(names);
      setOurLogo(tenant.brand?.logoUrl);
    } else {
      clearClubHints();
      clearOurLogo();
    }
  }, [tenant]);

  // Роль sporting_director слита со старшим тренером (миграция 0019). Старый JWT
  // (≤15 мин) ещё может нести sporting_director до рефреша /me — трактуем его как
  // старшего тренера, чтобы единый кабинет не ломался в это окно.
  const isLegacyDirector = user?.role === 'sporting_director';
  const isCoach = user ? (COACH_ROLES.has(user.role) || isLegacyDirector) : false;
  const isPlayer = user?.role === 'player';
  const isHeadCoach = user?.role === 'head_coach' || isLegacyDirector;
  const isTeamCoach = user?.role === 'team_coach';
  const isDirector = false; // deprecated: роль слита со старшим тренером

  const value = {
    user,
    tenant,
    federation,
    loading,
    refreshTenant,
    isAuthenticated: !!user,
    isCoach,
    isPlayer,
    isHeadCoach,
    isTeamCoach,
    isDirector,
    canSeePlayer: (playerId) =>
      (user ? COACH_ROLES.has(user.role) : false) ||
      (user?.role === 'player' && user.playerId === playerId),
    login: async (u, p) => {
      const { user: usr, tenant: t, federation: f } = await apiLogin(u, p);
      setUser(usr);
      setTenant(t ?? null);
      saveTenant(t ?? null);
      setFederation(f ?? null);
      return usr;
    },
    // Вход игрока по личной ссылке — состояние ставим тем же путём, что и обычный
    // вход: разница только в двери, дальше кабинет один и тот же.
    loginByLink: async (token) => {
      const { user: usr, tenant: t, federation: f } = await apiLoginByLink(token);
      setUser(usr);
      setTenant(t ?? null);
      saveTenant(t ?? null);
      setFederation(f ?? null);
      return usr;
    },
    logout: () => { apiLogout(); saveTenant(null); setUser(null); setTenant(null); setFederation(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
