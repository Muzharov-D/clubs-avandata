/**
 * Cleanup seed-mock данные. Оставляет только то, что реально загружено через PDF/Excel.
 *
 * Удаляет:
 *  - matches с pdf_source = 'manual://demo' (сидовый mock SportVisor)
 *  - players с id LIKE 'manual-%' (сгенерированные Соколов/Морозов etc.)
 *  - calendar с source_url = 'manual://demo' (сидовые матчи)
 *  - standings с source_url = 'manual://demo' (сидовая таблица)
 *
 * Оставляет:
 *  - players с id LIKE 'sv-%' (из Excel upload — реальные имена)
 *  - matches с id LIKE 'sv-%' (загруженные через /upload-pdf)
 *  - match_players (cascade — не трогаем)
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  console.log('=== cleanup seed-mock data ===\n');

  // Сначала покажем что есть
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    const { rows: m }  = await pool.query<{ count: string }>('SELECT count(*) FROM matches WHERE tenant_id=$1', [slug]);
    const { rows: p }  = await pool.query<{ count: string }>('SELECT count(*) FROM players WHERE tenant_id=$1', [slug]);
    const { rows: c }  = await pool.query<{ count: string }>('SELECT count(*) FROM calendar WHERE tenant_id=$1', [slug]);
    const { rows: s }  = await pool.query<{ count: string }>('SELECT count(*) FROM standings WHERE tenant_id=$1', [slug]);
    console.log(`${slug}: matches=${m[0]?.count}, players=${p[0]?.count}, calendar=${c[0]?.count}, standings=${s[0]?.count}`);
  }
  console.log();

  // Cleanup
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    // Mock SportVisor matches (manual-*) — cascade match_players
    const mDel = await pool.query(
      `DELETE FROM matches WHERE tenant_id=$1 AND id LIKE 'manual-%'`, [slug],
    );
    // Generated seed players (manual-*) — но только если они не в match_players
    // (если есть в match_players загруженного матча — оставить)
    const pDel = await pool.query(
      `DELETE FROM players
        WHERE tenant_id=$1
          AND id LIKE 'manual-%'
          AND id NOT IN (SELECT DISTINCT player_id FROM match_players WHERE tenant_id=$1)`,
      [slug],
    );
    const cDel = await pool.query(
      `DELETE FROM calendar WHERE tenant_id=$1 AND source_url='manual://demo'`, [slug],
    );
    const sDel = await pool.query(
      `DELETE FROM standings WHERE tenant_id=$1 AND source_url='manual://demo'`, [slug],
    );
    const cmDel = await pool.query(
      `DELETE FROM calendar_meta WHERE tenant_id=$1`, [slug],
    );

    console.log(`${slug}: -${mDel.rowCount} matches, -${pDel.rowCount} players, -${cDel.rowCount} calendar, -${sDel.rowCount} standings, -${cmDel.rowCount} calendar_meta`);
  }
  console.log();

  // After
  console.log('=== after cleanup ===');
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    const { rows: m }  = await pool.query<{ count: string }>('SELECT count(*) FROM matches WHERE tenant_id=$1', [slug]);
    const { rows: p }  = await pool.query<{ count: string }>('SELECT count(*) FROM players WHERE tenant_id=$1', [slug]);
    const { rows: c }  = await pool.query<{ count: string }>('SELECT count(*) FROM calendar WHERE tenant_id=$1', [slug]);
    const { rows: s }  = await pool.query<{ count: string }>('SELECT count(*) FROM standings WHERE tenant_id=$1', [slug]);
    console.log(`${slug}: matches=${m[0]?.count}, players=${p[0]?.count}, calendar=${c[0]?.count}, standings=${s[0]?.count}`);
    const { rows: detail } = await pool.query(
      `SELECT id, home_team_name, away_team_name, score_home, score_away, match_date
         FROM matches WHERE tenant_id=$1 ORDER BY match_date DESC NULLS LAST`,
      [slug],
    );
    for (const r of detail) {
      console.log(`  ${r.id}: ${r.home_team_name} ${r.score_home}:${r.score_away} ${r.away_team_name}`);
    }
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
