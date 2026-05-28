import 'dotenv/config';
import { pool } from '../db/client.js';
async function main() {
  const r = await pool.query("DELETE FROM matches WHERE id='sv-zenit-fk-mpprbioh-f85ce4'");
  console.log('rows deleted:', r.rowCount);
  const rest = await pool.query("SELECT id FROM matches WHERE tenant_id='zenit-fk'");
  console.log('remaining:', rest.rows);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
