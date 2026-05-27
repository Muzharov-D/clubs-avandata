import { createContext, useContext, useEffect, useState } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout, getToken } from '../services/api';

const AuthCtx = createContext(null);

const COACH_ROLES = new Set(['head_coach', 'team_coach', 'coach']);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    fetchMe()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const isCoach = user ? COACH_ROLES.has(user.role) : false;
  const isPlayer = user?.role === 'player';
  const isHeadCoach = user?.role === 'head_coach';
  const isTeamCoach = user?.role === 'team_coach';

  const value = {
    user,
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
      const usr = await apiLogin(u, p);
      setUser(usr);
      return usr;
    },
    logout: () => { apiLogout(); setUser(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
