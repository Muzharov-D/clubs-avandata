/**
 * Прогноз стартового состава (Phase 5) — эвристика по сезонным данным.
 * Сигнал «регулярный игрок основы» = среднее число минут за матч + средний
 * рейтинг. Гарантируем наличие вратаря в старте. Это подсказка тренеру, не догма.
 */
const isGk = (p) => String(p.position || '').toUpperCase().startsWith('ВР');

function score(p) {
  return (p.minutesPerMatch || 0) + (p.avgOverall || 0) * 4;
}

export function predictLineup(seasonPlayers) {
  const ps = (seasonPlayers || []).filter((p) => (p.matches || 0) > 0);
  if (!ps.length) return { starters: [], bench: [] };
  const sorted = [...ps].sort((a, b) => score(b) - score(a));

  const starters = sorted.slice(0, 11);
  // Гарантируем вратаря: если в топ-11 его нет — подставляем лучшего ВР.
  if (!starters.some(isGk)) {
    const gk = sorted.find(isGk);
    if (gk) {
      starters.pop();
      starters.push(gk);
    }
  }
  const starterIds = new Set(starters.map((p) => p.id));
  const bench = sorted.filter((p) => !starterIds.has(p.id)).slice(0, 7);
  return { starters, bench };
}
