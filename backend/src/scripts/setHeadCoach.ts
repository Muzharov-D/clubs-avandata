/**
 * Проставить главного тренера команде (teams.head_coach).
 *
 * teams под RLS — в скрипте нужен `app.bypass_rls = 'on'` на ТОМ ЖЕ
 * соединении (см. правило postgres-force-rls-script-access), иначе UPDATE
 * затронет 0 строк.
 *
 *   npx tsx src/scripts/setHeadCoach.ts                          # список команд
 *   npx tsx src/scripts/setHeadCoach.ts --team=<id>              # план (dry-run)
 *   npx tsx src/scripts/setHeadCoach.ts --team=<id> --apply      # применить
 *
 * Имя тренера передаётся через --coach="..." (по умолчанию — Ефимцев П.А.).
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

const APPLY = process.argv.includes('--apply');
const TEAM = process.argv.find((a) => a.startsWith('--team='))?.split('=')[1];
const COACH = process.argv.find((a) => a.startsWith('--coach='))?.split('=')[1]
  ?? 'Ефимцев Павел Александрович';

async function main(): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("SET app.bypass_rls = 'on'");
    const { rows } = await c.query(
      'SELECT id, name, age_group AS "ageGroup", head_coach AS "headCoach" FROM teams ORDER BY id',
    );
    console.table(rows);
    if (!TEAM) {
      console.log('\nУкажи команду: --team=<id> [--apply] (имя: --coach="...")');
      return;
    }
    if (!APPLY) {
      console.log(`\nDRY-RUN: команде ${TEAM} был бы проставлен head_coach = "${COACH}"`);
      return;
    }
    const res = await c.query('UPDATE teams SET head_coach = $1 WHERE id = $2', [COACH, TEAM]);
    console.log(`\nОбновлено строк: ${res.rowCount} → ${TEAM}.head_coach = "${COACH}"`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
