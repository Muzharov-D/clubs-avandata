/**
 * Read-only проверка результата backfillMatchOrientation.
 * Запуск: cd backend && npx tsx src/scripts/checkOrientation.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  const { rows } = await pool.query<{
    tenant_id: string;
    total: string;
    home: string;
    away: string;
    none: string;
  }>(
    `SELECT tenant_id,
            COUNT(*)                                                   AS total,
            COUNT(*) FILTER (WHERE home_team_id IS NOT NULL)           AS home,
            COUNT(*) FILTER (WHERE away_team_id IS NOT NULL)           AS away,
            COUNT(*) FILTER (WHERE home_team_id IS NULL
                              AND away_team_id IS NULL)                AS none
       FROM matches
      GROUP BY tenant_id
      ORDER BY tenant_id`,
  );
  console.table(rows);

  // Сверка: совпадает ли наша сторона с team_id (ожидаем true для всех заполненных)
  const { rows: mismatch } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM matches
      WHERE (home_team_id IS NOT NULL AND home_team_id <> team_id)
         OR (away_team_id IS NOT NULL AND away_team_id <> team_id)`,
  );
  console.log('Строк, где наша сторона != team_id (ожидаем 0):', mismatch[0]?.cnt);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
