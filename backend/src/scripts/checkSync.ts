import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  // tenants status
  const tenants = await pool.query<{ slug: string; data_provider: string; status: string; provider_config: unknown }>(
    `SELECT slug, data_provider, status, provider_config FROM tenants`,
  );
  console.log('=== tenants ===');
  for (const t of tenants.rows) {
    console.log(`  ${t.slug} (${t.data_provider}, ${t.status})`);
    console.log(`    config:`, JSON.stringify(t.provider_config, null, 2).split('\n').slice(0, 12).join('\n    '));
  }

  // standings snapshots
  const standings = await pool.query<{ tenant_id: string; age_group: string; teams: number; fetched_at: Date }>(
    `SELECT tenant_id, age_group, jsonb_array_length(table_data) AS teams, fetched_at
       FROM standings ORDER BY fetched_at DESC LIMIT 20`,
  );
  console.log(`\n=== standings (last ${standings.rowCount}) ===`);
  for (const r of standings.rows) {
    console.log(`  ${r.tenant_id}/${r.age_group}: ${r.teams} teams @ ${r.fetched_at.toISOString()}`);
  }

  // calendar
  const cal = await pool.query<{ tenant_id: string; age_group: string; count: string; last: Date | null }>(
    `SELECT tenant_id, age_group, COUNT(*) AS count, MAX(fetched_at) AS last
       FROM calendar GROUP BY tenant_id, age_group ORDER BY age_group`,
  );
  console.log(`\n=== calendar ===`);
  for (const r of cal.rows) {
    console.log(`  ${r.tenant_id}/${r.age_group}: ${r.count} matches @ ${r.last?.toISOString() ?? '-'}`);
  }

  // sample 3 matches
  const sample = await pool.query<{ home_team: string; away_team: string; score_home: number | null; score_away: number | null; tournament: string }>(
    `SELECT home_team, away_team, score_home, score_away, tournament
       FROM calendar WHERE tenant_id='legirus' ORDER BY match_date DESC LIMIT 5`,
  );
  console.log(`\n=== latest 5 matches in legirus ===`);
  for (const m of sample.rows) {
    const score = m.score_home != null ? `${m.score_home}:${m.score_away}` : 'TBD';
    console.log(`  [${m.tournament}] ${m.home_team} ${score} ${m.away_team}`);
  }

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
