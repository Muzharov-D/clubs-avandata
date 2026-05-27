import { createContext, useContext, useState, useEffect } from 'react';

// Какой турнир сейчас «в фокусе» — Лига или Кубок.
// Влияет на:
//   — таблицу/сетку на /club
//   — фильтрацию списка матчей на /matches
//   — топы игроков сезона (агрегаты считаются только по выбранному турниру)

const Ctx = createContext(null);
const STORAGE_KEY = 'legirus.tournament';

export function TournamentProvider({ children }) {
  const [tournament, setTournamentState] = useState(() => {
    if (typeof localStorage === 'undefined') return 'league';
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'cup' || stored === 'league' ? stored : 'league';
  });

  function setTournament(value) {
    if (value !== 'league' && value !== 'cup') return;
    setTournamentState(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value);
    }
  }

  return (
    <Ctx.Provider value={{ tournament, setTournament }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTournament() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTournament должен использоваться внутри TournamentProvider');
  return ctx;
}
