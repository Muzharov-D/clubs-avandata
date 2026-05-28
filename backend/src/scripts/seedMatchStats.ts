/**
 * Засидливает 1 завершённый матч с полной SportVisor-аналитикой
 * для ФК Зенит → MatchDetail и ClubOverview покажут реальные ratings/stats.
 *
 * Матч: Локомотив 3 — 3 Зенит (22 марта 2026)
 * 11 игроков ФК Зенит с ratings, stats, splits.
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

const TENANT = 'zenit-fk';
const TEAM_ID = 'zenit-fk-2011';
const MATCH_ID = 'manual-zenit-fk-lok-2026-03-22';
const EXT_MATCH_ID = 'ufl-1742630400000-Лок-Зен';
const SEASON = '2025-2026';

const TEAM_SUMMARY_STATS = {
  possession: { value: 52 },
  shotsTotal: { value: 14 },
  shotsOnTarget: { value: 7 },
  xG: { value: 2.4 },
  passes: { value: 412 },
  passAccuracy: { pct: 84 },
  duelsWon: { pct: 53 },
  tackles: { value: 18 },
  interceptions: { value: 11 },
  fouls: { value: 8 },
  totalDistance: { value: 109480 },
};
const TEAM_AVG_RATINGS = {
  overall: 7.4, attacking: 7.6, creativity: 7.2,
  defending: 7.1, fitness: 7.8, passing: 7.5,
};

const STARTERS = [
  { num: 1,  pos: 'GK',  rating: 7.5, goals: 0, assists: 0, distance: 6420 },
  { num: 2,  pos: 'RB',  rating: 7.2, goals: 0, assists: 0, distance: 11200 },
  { num: 3,  pos: 'CB',  rating: 7.4, goals: 0, assists: 0, distance: 10180 },
  { num: 4,  pos: 'CB',  rating: 7.1, goals: 0, assists: 0, distance: 10090 },
  { num: 5,  pos: 'LB',  rating: 7.6, goals: 0, assists: 1, distance: 11380 },
  { num: 6,  pos: 'CDM', rating: 7.8, goals: 0, assists: 0, distance: 12010 },
  { num: 7,  pos: 'CM',  rating: 8.2, goals: 1, assists: 1, distance: 11890 },
  { num: 8,  pos: 'CM',  rating: 7.5, goals: 0, assists: 0, distance: 11650 },
  { num: 9,  pos: 'ST',  rating: 8.6, goals: 2, assists: 0, distance:  9870 },
  { num: 10, pos: 'CAM', rating: 8.0, goals: 0, assists: 1, distance: 10450 },
  { num: 11, pos: 'LW',  rating: 7.3, goals: 0, assists: 0, distance: 10320 },
];

function ratings(base: number) {
  const noise = () => +(Math.random() * 0.6 - 0.3).toFixed(2);
  return {
    overall: base,
    attacking: +(base + noise()).toFixed(2),
    defending: +(base + noise()).toFixed(2),
    passing:   +(base + noise()).toFixed(2),
    creativity:+(base + noise()).toFixed(2),
    fitness:   +(base + noise()).toFixed(2),
  };
}
function stats(s: typeof STARTERS[number]) {
  return {
    attack1: { xG: +(s.goals * 0.7 + Math.random() * 0.5).toFixed(2),
               xA: +(s.assists * 0.6 + Math.random() * 0.3).toFixed(2),
               assist: s.assists },
    attack4: { goal: s.goals },
    fitness: { totalDistance: s.distance, sprints: Math.round(15 + Math.random() * 10) },
    passing: { passes: Math.round(25 + Math.random() * 30), accuracy: +(80 + Math.random() * 12).toFixed(1) },
    defence1:{ tackle: Math.round(Math.random() * 5), interception: Math.round(Math.random() * 4) },
  };
}
function splits() {
  // first/second/match — random plausible values
  const r = () => +(6 + Math.random() * 2).toFixed(2);
  return {
    rating: { first: r(), second: r(), match: r() },
    distance: { first: 5000 + Math.round(Math.random() * 1200), second: 5000 + Math.round(Math.random() * 1200), match: 0 },
  };
}

async function main() {
  console.log(`=== Seeding match stats for ${TENANT} (${MATCH_ID}) ===`);

  await pool.query(
    `INSERT INTO matches (
       id, tenant_id, team_id, ext_match_id,
       home_team_name, away_team_name, match_date, season, tournament,
       score_home, score_away, team_summary_stats, team_avg_ratings, meta
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'league', $9, $10, $11::jsonb, $12::jsonb, '{}')
     ON CONFLICT (id) DO UPDATE SET
       team_summary_stats = EXCLUDED.team_summary_stats,
       team_avg_ratings = EXCLUDED.team_avg_ratings,
       score_home = EXCLUDED.score_home, score_away = EXCLUDED.score_away`,
    [
      MATCH_ID, TENANT, TEAM_ID, EXT_MATCH_ID,
      'Локомотив', 'Зенит', '2026-03-22T11:00:00+03:00', SEASON,
      3, 3,
      JSON.stringify(TEAM_SUMMARY_STATS), JSON.stringify(TEAM_AVG_RATINGS),
    ],
  );
  console.log('  ✓ match row');

  for (let i = 0; i < STARTERS.length; i++) {
    const s = STARTERS[i]!;
    const playerId = `manual-${TENANT}-p${String(i + 1).padStart(2, '0')}`;
    await pool.query(
      `INSERT INTO match_players (match_id, player_id, tenant_id, number, position, minutes,
                                  ratings, stats, splits, radar, maps)
       VALUES ($1, $2, $3, $4, $5, 90, $6::jsonb, $7::jsonb, $8::jsonb, NULL, NULL)
       ON CONFLICT (match_id, player_id) DO UPDATE SET
         ratings = EXCLUDED.ratings, stats = EXCLUDED.stats, splits = EXCLUDED.splits`,
      [MATCH_ID, playerId, TENANT, s.num, s.pos,
       JSON.stringify(ratings(s.rating)),
       JSON.stringify(stats(s)),
       JSON.stringify(splits())],
    );
  }
  console.log(`  ✓ ${STARTERS.length} player rows with ratings/stats/splits`);

  await pool.end();
  console.log('\n=== Done. MatchDetail запрос: /api/v1/data/match/' + MATCH_ID + ' ===');
}

main().catch((e) => { console.error(e); process.exit(1); });
