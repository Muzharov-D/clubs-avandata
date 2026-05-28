import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  const r = await pool.query<{ current_user: string; bypassrls: boolean; superuser: boolean }>(
    `SELECT current_user, r.rolbypassrls AS bypassrls, r.rolsuper AS superuser
       FROM pg_roles r WHERE r.rolname = current_user`,
  );
  console.log(r.rows[0]);

  // Try grant
  try {
    await pool.query(`ALTER ROLE current_user BYPASSRLS`);
    console.log('✓ BYPASSRLS granted');
    const r2 = await pool.query<{ bypassrls: boolean }>(
      `SELECT rolbypassrls AS bypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    console.log('after grant:', r2.rows[0]);
  } catch (e) {
    console.log('✗ Cannot grant BYPASSRLS:', e instanceof Error ? e.message : e);
  }

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
