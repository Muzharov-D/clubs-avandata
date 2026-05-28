/**
 * Diag: показывает все matches и счёт.
 * Запуск: cd backend && npx tsx src/scripts/peekMatch.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  const r = await pool.query(
    `SELECT id, tenant_id, home_team_name AS h, away_team_name AS a,
            score_home AS sh, score_away AS sa, match_date AS d, uploaded_at
       FROM matches ORDER BY uploaded_at DESC NULLS LAST`,
  );
  console.log('matches:');
  for (const m of r.rows) {
    console.log(`  ${m.tenant_id}: ${m.h} ${m.sh}:${m.sa} ${m.a}  (date=${m.d}, uploaded=${m.uploaded_at})`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
