/**
 * Удаляет всех игроков ФК Зенит U-15 / СШОР Зенит U-15, которых НЕТ в
 * match_players (т.е. они не были в загруженном SportVisor отчёте).
 *
 * Перед удалением — диагностика: кто остаётся, кто уходит.
 *
 * Запуск: cd backend && npx tsx src/scripts/keepOnlyPdfPlayers.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    const keep = await pool.query<{ id: string; full_name: string; number: number | null; position: string | null }>(
      `SELECT DISTINCT p.id, p.full_name, p.number, p.position
         FROM players p
         JOIN match_players mp ON mp.player_id = p.id
        WHERE p.tenant_id = $1
        ORDER BY p.number NULLS LAST, p.full_name`,
      [slug],
    );
    const drop = await pool.query<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM players
        WHERE tenant_id = $1
          AND id NOT IN (SELECT DISTINCT player_id FROM match_players WHERE tenant_id = $1)
        ORDER BY full_name`,
      [slug],
    );

    console.log(`\n${slug}: оставляем ${keep.rowCount}, удаляем ${drop.rowCount}`);
    console.log('  KEEP (есть в отчёте):');
    for (const k of keep.rows) {
      console.log(`    #${k.number ?? '—'} ${k.position ?? ''}  ${k.full_name}  (id=${k.id})`);
    }
    console.log('  DROP (нет в отчёте, академики/мусор):');
    for (const d of drop.rows) console.log(`    ${d.full_name}  (id=${d.id})`);

    const r = await pool.query(
      `DELETE FROM players
        WHERE tenant_id = $1
          AND id NOT IN (SELECT DISTINCT player_id FROM match_players WHERE tenant_id = $1)`,
      [slug],
    );
    console.log(`  ✓ удалено ${r.rowCount}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
