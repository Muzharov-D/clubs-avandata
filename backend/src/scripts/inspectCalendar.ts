/** READ-ONLY. Что лежит в calendar по тенантам/возрастам. */
import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  const conn = await pool.connect();
  await conn.query('SET row_security = on');
  await conn.query("SELECT set_config('app.bypass_rls', 'on', false)");

  const agg = await conn.query(
    `SELECT tenant_id, age_group, season, tournament,
            COUNT(*)::int AS n,
            SUM((is_our_match)::int)::int AS ours,
            SUM((score_home IS NOT NULL)::int)::int AS played
       FROM calendar
      GROUP BY tenant_id, age_group, season, tournament
      ORDER BY tenant_id, age_group, tournament`,
  );
  console.log('── calendar по (tenant, age, season, tournament) ──');
  for (const r of agg.rows) {
    console.log(`  ${r.tenant_id} | age=${r.age_group} | ${r.season ?? '—'} | ${r.tournament ?? '—'} | всего=${r.n} наших=${r.ours} сыграно=${r.played}`);
  }
  const total = await conn.query('SELECT COUNT(*)::int AS n FROM calendar');
  console.log(`\nВсего строк calendar: ${total.rows[0].n}`);

  const upcoming = await conn.query(
    `SELECT tenant_id, age_group,
            SUM((is_our_match AND score_home IS NULL AND match_date >= now())::int)::int AS upcoming_ours,
            MAX(match_date) FILTER (WHERE is_our_match) AS last_our_date,
            MIN(match_date) FILTER (WHERE is_our_match AND match_date >= now()) AS next_our_date
       FROM calendar
      GROUP BY tenant_id, age_group ORDER BY tenant_id, age_group`,
  );
  console.log('\n── предстоящие НАШИ матчи ──');
  for (const r of upcoming.rows) {
    console.log(`  ${r.tenant_id} age=${r.age_group}: предстоит=${r.upcoming_ours} | ближайший=${r.next_our_date ?? '—'} | последний(всего)=${r.last_our_date ?? '—'}`);
  }

  const teams = await conn.query(
    `SELECT id, tenant_id, age_group, active FROM teams ORDER BY tenant_id, age_group`,
  );
  console.log('\n── teams ──');
  for (const t of teams.rows) console.log(`  ${t.id} | tenant=${t.tenant_id} | age=${t.age_group} | active=${t.active}`);

  try { await conn.query("SELECT set_config('app.bypass_rls', 'off', false)"); } catch { /* ignore */ }
  conn.release();
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
