/**
 * Бэкфилл: подставляет home/away_team_name из ближайшей calendar-фикстуры
 * (is_our_match=TRUE) для матчей, у которых имена команд пустые/NULL.
 *
 * Запуск: cd backend && npx tsx src/scripts/backfillMatchTeams.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    const { rows: cal } = await pool.query<{ home_team: string; away_team: string; match_date: string }>(
      `SELECT home_team, away_team, match_date
         FROM calendar
        WHERE tenant_id = $1 AND is_our_match = TRUE
        ORDER BY match_date DESC NULLS LAST LIMIT 1`,
      [slug],
    );
    if (!cal[0]) { console.log(slug, '— no fixture'); continue; }

    const before = await pool.query<{ id: string; h: string | null; a: string | null }>(
      `SELECT id, home_team_name AS h, away_team_name AS a FROM matches WHERE tenant_id = $1`,
      [slug],
    );
    console.log(slug, 'matches before:', before.rows);

    const upd = await pool.query(
      `UPDATE matches
         SET home_team_name = $1,
             away_team_name = $2,
             match_date     = COALESCE(match_date, $3)
       WHERE tenant_id = $4
         AND (home_team_name IS NULL OR home_team_name = ''
              OR away_team_name IS NULL OR away_team_name = ''
              OR home_team_name = 'Команда' OR away_team_name = 'Соперник')`,
      [cal[0].home_team, cal[0].away_team, cal[0].match_date, slug],
    );
    console.log(slug, '— fixed:', upd.rowCount, '→', cal[0].home_team, 'vs', cal[0].away_team);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
