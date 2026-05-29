/**
 * Бэкфилл ориентации дом/гость для существующих матчей (задача #4).
 *
 * До этой правки home_team_id/away_team_id в matches не заполнялись — фронт
 * определял сторону по подстроке имени (includes), что переворачивало голы.
 * Скрипт проставляет наш team_id в нужную колонку, сравнивая имя нашей команды
 * (matches.team_id → teams.name) с home/away_team_name через resolveOurSide.
 *
 * Tenant-generic (в отличие от backfillMatchTeams.ts): идёт по всем матчам,
 * где обе id-колонки пусты. Идемпотентен — повторный запуск ничего не портит.
 *
 * Запуск: cd backend && npx tsx src/scripts/backfillMatchOrientation.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';
import { resolveOurSide } from '../shared/teamName.js';

async function main() {
  const { rows } = await pool.query<{
    id: string;
    tenant_id: string;
    team_id: string;
    our_name: string | null;
    home: string | null;
    away: string | null;
  }>(
    `SELECT m.id, m.tenant_id, m.team_id, t.name AS our_name,
            m.home_team_name AS home, m.away_team_name AS away
       FROM matches m
       JOIN teams t ON t.id = m.team_id
      WHERE m.home_team_id IS NULL AND m.away_team_id IS NULL`,
  );

  let home = 0;
  let away = 0;
  let undetermined = 0;
  for (const m of rows) {
    const side = resolveOurSide(m.our_name, m.home, m.away);
    if (!side) {
      undetermined++;
      console.warn(`  [skip] ${m.tenant_id}/${m.id}: "${m.our_name}" vs "${m.home}" / "${m.away}"`);
      continue;
    }
    const col = side === 'home' ? 'home_team_id' : 'away_team_id';
    await pool.query(`UPDATE matches SET ${col} = $1 WHERE id = $2 AND tenant_id = $3`, [
      m.team_id,
      m.id,
      m.tenant_id,
    ]);
    if (side === 'home') home++; else away++;
  }

  console.log(`[backfill-orientation] total=${rows.length} home=${home} away=${away} undetermined=${undetermined}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
