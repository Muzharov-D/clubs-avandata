import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchTeams } from '../services/api';

const TeamCtx = createContext(null);
const STORAGE_KEY = 'legirus.selectedTeamId';

export function TeamProvider({ children }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setTeams([]);
      setSelectedTeamId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTeams()
      .then(({ teams: t }) => {
        if (cancelled) return;
        const list = Array.isArray(t) ? t : [];
        setTeams(list);

        // team_coach / player — жёстко свою команду; head_coach — последняя
        // выбранная (если ещё активна) или первая активная.
        let initial;
        if (user.teamId) {
          initial = user.teamId;
        } else {
          const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
          const validStored = list.find((x) => x.id === stored && x.active);
          initial = validStored?.id || list.find((x) => x.active)?.id || list[0]?.id || null;
        }
        setSelectedTeamId(initial);
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  function select(teamId) {
    setSelectedTeamId(teamId);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, teamId);
    }
  }

  const value = {
    teams,
    selectedTeam: teams.find((t) => t.id === selectedTeamId) || null,
    selectedTeamId,
    select,
    loading,
    error,
  };

  return <TeamCtx.Provider value={value}>{children}</TeamCtx.Provider>;
}

export function useTeam() {
  const ctx = useContext(TeamCtx);
  if (!ctx) throw new Error('useTeam должен использоваться внутри TeamProvider');
  return ctx;
}
