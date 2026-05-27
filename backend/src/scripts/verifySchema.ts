import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  const expected = [
    'tenants','users','refresh_tokens',
    'teams','players','matches','match_players',
    'calendar','calendar_meta','standings','cup_brackets',
    'trainings','training_attendance','training_templates',
    'match_callups','push_subscriptions',
    'notif_log','notif_deferred','notif_recipient_log',
    '_migrations',
  ];

  const { rows: tables } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  const existing = new Set(tables.map((r) => r.tablename));

  console.log('=== Tables ===');
  for (const t of expected) {
    const mark = existing.has(t) ? '✓' : '✗';
    console.log(`  ${mark} ${t}`);
  }
  const extra = [...existing].filter((t) => !expected.includes(t));
  if (extra.length > 0) console.log('  extra:', extra.join(', '));

  const { rows: rls } = await pool.query<{ tablename: string; rls: boolean }>(
    `SELECT c.relname AS tablename, c.relrowsecurity AS rls
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = true
       ORDER BY c.relname`,
  );
  console.log('\n=== RLS enabled ===');
  for (const r of rls) console.log(`  ✓ ${r.tablename}`);

  const { rows: policies } = await pool.query<{ tablename: string; policyname: string }>(
    `SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY tablename`,
  );
  console.log(`\n=== RLS policies: ${policies.length} ===`);
  const byTable = new Map<string, string[]>();
  for (const p of policies) {
    if (!byTable.has(p.tablename)) byTable.set(p.tablename, []);
    byTable.get(p.tablename)!.push(p.policyname);
  }
  for (const [tbl, pols] of byTable) console.log(`  ${tbl}: ${pols.join(', ')}`);

  await pool.end();
}

main().catch((err) => {
  console.error('verify failed:', err);
  process.exit(1);
});
