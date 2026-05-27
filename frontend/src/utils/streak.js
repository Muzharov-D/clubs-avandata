// Подсчёт серии (streak) команды по последним прошедшим матчам.
// Принимает массив matches (поля: isOurMatch, isPast, home, away, score.{home,away})
// Возвращает: { type: 'W'|'L'|'D'|null, count: number, recent: ['W','L','D',...] последние 5 }

import { isLegirus } from './legirus';

export function computeStreak(matches) {
  if (!Array.isArray(matches)) return { type: null, count: 0, recent: [] };

  // Только наши прошедшие сыгранные матчи, по убыванию даты
  const ourPlayed = matches
    .filter((m) => m.isOurMatch && m.isPast && m.score && typeof m.score.home === 'number')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (ourPlayed.length === 0) return { type: null, count: 0, recent: [] };

  function resultOf(m) {
    const homeIsUs = isLegirus(m.home);
    const ourGoals = homeIsUs ? m.score.home : m.score.away;
    const themGoals = homeIsUs ? m.score.away : m.score.home;
    if (ourGoals > themGoals) return 'W';
    if (ourGoals < themGoals) return 'L';
    return 'D';
  }

  const recent = ourPlayed.slice(0, 5).map(resultOf);

  // Подсчёт текущей серии — берём результат последнего матча и считаем сколько таких подряд
  const headType = resultOf(ourPlayed[0]);
  let count = 0;
  for (const m of ourPlayed) {
    if (resultOf(m) === headType) count++;
    else break;
  }

  return { type: headType, count, recent };
}
