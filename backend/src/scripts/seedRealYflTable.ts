/**
 * Перетирает standings для обоих tenant'ов реальной таблицей ЮФЛ U-15
 * («Групповой этап», 11 туров) и засевает события 10 тура в calendar.events_data.
 *
 * Источник: https://yflrussia.ru/tournament/1060908/tables — Групповой этап.
 *           https://yflrussia.ru/match/5483466 — протокол матча.
 *
 * Турнир ОДИН для обоих клубов: Зенит #1, СШОР Зенит #13.
 *
 * Запуск: cd backend && npx tsx src/scripts/seedRealYflTable.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

// Реальная таблица ЮФЛ U-15, Групповой этап, 11 туров сыграно.
// Колонки: pos / team / games(И) / wins(В) / draws(Н) / losses(П) / scored / missed / points(О)
type Row = { pos: number; team: string; games: number; wins: number; draws: number;
             losses: number; scored: number; missed: number; points: number };

const TABLE: Row[] = [
  { pos: 1,  team: 'Зенит',                        games: 11, wins: 9, draws: 2, losses: 0, scored: 38, missed: 11, points: 29 },
  { pos: 2,  team: 'Динамо',                       games: 11, wins: 9, draws: 1, losses: 1, scored: 39, missed: 10, points: 28 },
  { pos: 3,  team: 'Родина',                       games: 11, wins: 6, draws: 4, losses: 1, scored: 23, missed: 15, points: 22 },
  { pos: 4,  team: 'Спартак',                      games: 11, wins: 7, draws: 1, losses: 3, scored: 19, missed: 9,  points: 22 },
  { pos: 5,  team: 'Краснодар',                    games: 11, wins: 5, draws: 4, losses: 2, scored: 22, missed: 10, points: 19 },
  { pos: 6,  team: 'Локомотив',                    games: 11, wins: 5, draws: 3, losses: 3, scored: 33, missed: 23, points: 18 },
  { pos: 7,  team: 'Рубин',                        games: 11, wins: 5, draws: 2, losses: 4, scored: 18, missed: 11, points: 17 },
  { pos: 8,  team: 'Чертаново',                    games: 11, wins: 5, draws: 1, losses: 5, scored: 22, missed: 23, points: 16 },
  { pos: 9,  team: 'Ростов',                       games: 11, wins: 5, draws: 0, losses: 6, scored: 15, missed: 17, points: 15 },
  { pos: 10, team: 'ЦСКА',                         games: 11, wins: 4, draws: 2, losses: 5, scored: 13, missed: 14, points: 14 },
  { pos: 11, team: 'Акрон - Академия Коноплева',   games: 11, wins: 3, draws: 4, losses: 4, scored: 15, missed: 17, points: 13 },
  { pos: 12, team: 'Алмаз-Антей',                  games: 11, wins: 3, draws: 3, losses: 5, scored: 16, missed: 23, points: 12 },
  { pos: 13, team: 'СШОР Зенит',                   games: 11, wins: 3, draws: 2, losses: 6, scored: 11, missed: 17, points: 11 },
  { pos: 14, team: 'МФА',                          games: 11, wins: 2, draws: 1, losses: 8, scored: 8,  missed: 37, points: 7  },
  { pos: 15, team: 'Мастер-Сатурн',                games: 11, wins: 1, draws: 0, losses: 10, scored: 7, missed: 29, points: 3 },
  { pos: 16, team: 'Урал',                         games: 11, wins: 1, draws: 0, losses: 10, scored: 9, missed: 42, points: 3 },
];

// 4 гола 10 тура Зенит 4:0 СШОР Зенит (yflrussia.ru/match/5483466)
const MATCH10_EVENTS = [
  { minute: 7,  type: 'goal', player: 'Лисов Владислав',  assist: 'Храбрый Илья', team: 'home' },
  { minute: 40, type: 'goal', player: 'Зайцев Никита',                              team: 'home' },
  { minute: 48, type: 'goal', player: 'Лисов Владислав',  assist: 'Зайцев Никита', team: 'home' },
  { minute: 80, type: 'goal', player: 'Храбрый Илья',                               team: 'home' },
];

async function main() {
  // 1) standings для обоих tenant'ов (один турнир, разный isOurClub флаг)
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    const ourTeam = slug === 'zenit-fk' ? 'Зенит' : 'СШОР Зенит';
    const rows = TABLE.map((r) => ({
      pos: r.pos,
      team: r.team,
      games: r.games,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      scored: r.scored,
      missed: r.missed,
      points: r.points,
      isOurClub: r.team === ourTeam,
    }));
    // Wipe старые standings этого tenant'а, чтобы /data/standings DISTINCT ON
    // (age_group) не подтянул устаревшую запись.
    await pool.query(`DELETE FROM standings WHERE tenant_id = $1 AND age_group = $2`, [slug, '2011']);
    await pool.query(
      `INSERT INTO standings (tenant_id, age_group, season, league_name, source_url, table_data)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        slug, '2011', '2025-2026',
        'ЮФЛ U-15 · Групповой этап',
        'https://yflrussia.ru/tournament/1060908/tables',
        JSON.stringify(rows),
      ],
    );
    const ourPos = TABLE.find((r) => r.team === ourTeam)?.pos;
    console.log(`${slug}: реальная таблица 16 клубов, ${ourTeam} на ${ourPos} месте.`);
  }

  // 2) Events 10 тура в calendar.events_data — для обоих tenant'ов (это один и тот же матч).
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    const upd = await pool.query(
      `UPDATE calendar SET events_data = $1::jsonb, events_fetched_at = NOW(),
                            source_url = 'https://yflrussia.ru/match/5483466'
         WHERE tenant_id = $2 AND age_group = '2011'
           AND home_team = 'Зенит' AND away_team = 'СШОР Зенит'
           AND match_date::date = '2026-05-17'::date`,
      [JSON.stringify({ events: MATCH10_EVENTS }), slug],
    );
    console.log(`${slug}: events 10 тура — ${upd.rowCount} строка обновлена (4 гола).`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
