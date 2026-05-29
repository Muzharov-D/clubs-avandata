// Группировка игроков по линиям. Используется в ClubOverview и PlayerDetail.

export const LINE_GROUPS = [
  { id: 'gk',  label: 'Вратари',     match: (p) => p.position === 'ВР' || /врат/i.test(p.positionFull || '') },
  { id: 'def', label: 'Защита',      match: (p) => /защ|ЛЗ|ПЗ|ЦЗ/i.test(p.position || p.positionFull || '') },
  { id: 'mid', label: 'Полузащита',  match: (p) => /пол|ЦП|ЦАП|ОП/i.test(p.position || p.positionFull || '') },
  { id: 'fwd', label: 'Нападение',   match: (p) => /нап|ЦН|ЛП|ПП|ПФ/i.test(p.position || p.positionFull || '') },
];

export function lineOf(player) {
  return LINE_GROUPS.find((g) => g.match(player)) || null;
}

export function leadersByLine(players) {
  if (!players?.length) return [];
  return LINE_GROUPS.map((g) => {
    const ps = players.filter(g.match);
    // Лидер — только среди реально играшних с положительным overall.
    // Иначе на линию защиты попадал случайный бенч с rating=null.
    const eligible = ps.filter((p) => Number(p.ratings?.overall ?? 0) > 0);
    const leader = eligible.sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0))[0];
    const ratings = eligible.map((p) => Number(p.ratings.overall));
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    return { group: g, leader, count: eligible.length, avg };
  }).filter((g) => g.leader);
}
