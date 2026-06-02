/**
 * Бэкфилл битого командного xG в уже сохранённых матчах.
 *
 * Проблема: на части старых разборов парсер стр.1 (head-to-head) хватал строку
 * РЕЙТИНГОВ игроков (6–9) вместо xG → в team_summary_stats.{home,away}.expectedGoals
 * лежит неправдоподобное значение (>6). Фронт это уже прячет (MAX_PLAUSIBLE_TEAM_XG=6
 * в utils/analytics/xg.js + guard в MatchStatsBlock.jsx), но в БД остаётся мусор,
 * который течёт в агрегаты/аналитику. Чистим источник.
 *
 * Правило: expectedGoals > XG_MAX (детский футбол — xG почти всегда <3, валидный
 * диапазон 0..6) → null. Совпадает с парсер-guard XG_MAX=6.0 и фронт-константой.
 *
 * По умолчанию DRY-RUN (только печать). Применить: `--apply`.
 *   cd backend && npx tsx src/scripts/fixBrokenXg.ts            # план
 *   cd backend && npx tsx src/scripts/fixBrokenXg.ts --apply    # применить
 *
 * matches под FORCE RLS → нужен bypass на одном conn (см. mergePlayerDups.ts).
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

const APPLY = process.argv.includes('--apply');
const XG_MAX = 6.0;

interface SideStats { expectedGoals?: number | null; [k: string]: unknown }
interface SummaryStats { home?: SideStats; away?: SideStats; [k: string]: unknown }
interface MatchRow {
  id: string;
  tenant_id: string;
  home_team_name: string | null;
  away_team_name: string | null;
  team_summary_stats: SummaryStats | null;
}

function brokenXg(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > XG_MAX;
}

async function main() {
  const url = (process.env.DATABASE_URL || '').replace(/\/\/[^@]*@/, '//***@');
  console.log(`[${APPLY ? 'APPLY' : 'DRY-RUN'}] DB:`, url.slice(0, 70));

  const conn = await pool.connect();
  await conn.query('SET row_security = on');
  await conn.query("SELECT set_config('app.bypass_rls', 'on', false)");

  try {
    const { rows } = await conn.query<MatchRow>(
      `SELECT id, tenant_id, home_team_name, away_team_name, team_summary_stats
         FROM matches
        WHERE team_summary_stats IS NOT NULL
        ORDER BY tenant_id, id`,
    );

    let totalMatches = 0;
    let fixedMatches = 0;
    let fixedFields = 0;

    for (const m of rows) {
      const ss = m.team_summary_stats;
      if (!ss) continue;
      totalMatches += 1;

      const hVal = ss.home?.expectedGoals;
      const aVal = ss.away?.expectedGoals;
      const hBroken = brokenXg(hVal);
      const aBroken = brokenXg(aVal);
      if (!hBroken && !aBroken) continue;

      fixedMatches += 1;
      const label = `${m.tenant_id} ${m.id}  ${m.home_team_name ?? '?'} vs ${m.away_team_name ?? '?'}`;
      const parts: string[] = [];
      if (hBroken) { parts.push(`home.xG ${hVal} → null`); fixedFields += 1; }
      if (aBroken) { parts.push(`away.xG ${aVal} → null`); fixedFields += 1; }
      console.log(`  ${label}\n      ${parts.join(', ')}`);

      if (APPLY) {
        // Точечный set: только expectedGoals нужной стороны, остальное не трогаем.
        if (hBroken) {
          await conn.query(
            `UPDATE matches
                SET team_summary_stats = jsonb_set(team_summary_stats, '{home,expectedGoals}', 'null'::jsonb, false)
              WHERE id = $1`,
            [m.id],
          );
        }
        if (aBroken) {
          await conn.query(
            `UPDATE matches
                SET team_summary_stats = jsonb_set(team_summary_stats, '{away,expectedGoals}', 'null'::jsonb, false)
              WHERE id = $1`,
            [m.id],
          );
        }
      }
    }

    console.log(
      `\nИтог: матчей со stats ${totalMatches}, с битым xG ${fixedMatches}, ` +
        `полей ${fixedFields}${APPLY ? '' : '  (DRY-RUN, ничего не изменено)'}`,
    );
  } finally {
    try { await conn.query("SELECT set_config('app.bypass_rls', 'off', false)"); } catch { /* ignore */ }
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
