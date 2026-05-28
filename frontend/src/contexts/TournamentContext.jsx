import { createContext, useContext, useState, useEffect } from 'react';

// Какой турнир сейчас «в фокусе» — Лига или Кубок.
// Влияет на:
//   — таблицу/сетку на /club
//   — фильтрацию списка матчей на /matches
//   — топы игроков сезона (агрегаты считаются только по выбранному турниру)

const Ctx = createContext(null);
const STORAGE_KEY = 'avandata.tournament';
const LEGACY_STORAGE_KEY = 'legirus.tournament';

// Миграция со старого ключа (без потери выбора турнира между релизами).
try {
  if (typeof localStorage !== 'undefined') {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  }
} catch (_) {}

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
