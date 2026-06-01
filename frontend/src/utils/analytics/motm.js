/**
 * Impact-взвешенный «Игрок матча». Сырой overall ставит защитника 7.9 выше
 * автора хет-трика 7.8. Здесь рейтинг дополняется реальным вкладом: голы,
 * ассисты, ключевые передачи, добавленная угроза (xT-прокси), реализация (G−xG).
 */
import { M, played } from './metrics';
import { playerThreat } from './progression';
import { playerXgModel } from './xg';

/**
 * Возвращает ранжированный список { player, score, breakdown } и лидера.
 * teamActualXg — командный xG нашей стороны (для бонуса за реализацию).
 */
export function rankImpact(players, teamActualXg) {
  const squad = (players || []).filter((p) => played(p) && Number(p?.ratings?.overall ?? 0) > 0);
  if (!squad.length) return { ranked: [], best: null };
  const xgMap = playerXgModel(squad, teamActualXg);

  const ranked = squad
    .map((p) => {
      const rating = Number(p.ratings?.overall ?? 0);
      const goals = M.goals(p);
      const assists = M.assists(p);
      const keyPass = M.keyPass(p);
      const threat = playerThreat(p);
      const xg = xgMap.get(p.id)?.xg ?? 0;
      const finishing = Math.max(0, goals - xg); // бонус только за перевыполнение
      const breakdown = {
        rating: rating * 1.0,
        goals: goals * 1.4,
        assists: assists * 0.9,
        keyPass: keyPass * 0.18,
        threat: threat * 2.2,
        finishing: finishing * 0.8,
      };
      const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
      return { player: p, score, breakdown, parts: { goals, assists, keyPass, threat, xg } };
    })
    .sort((a, b) => b.score - a.score);

  return { ranked, best: ranked[0] || null };
}
