import 'dotenv/config';
import { pool } from '../db/client.js';
async function main() {
  const slugs = ['zenit-fk', 'zenit-sshor'];
  for (const s of slugs) {
    const m  = await pool.query("DELETE FROM matches WHERE tenant_id=$1", [s]);
    const p  = await pool.query("DELETE FROM players WHERE tenant_id=$1", [s]);
    const c  = await pool.query("DELETE FROM calendar WHERE tenant_id=$1", [s]);
    const st = await pool.query("DELETE FROM standings WHERE tenant_id=$1", [s]);
    const cm = await pool.query("DELETE FROM calendar_meta WHERE tenant_id=$1", [s]);
    console.log(`${s}: -${m.rowCount} matches, -${p.rowCount} players, -${c.rowCount} cal, -${st.rowCount} stand, -${cm.rowCount} meta`);
  }
  const t = await pool.query("SELECT id, name, tenant_id FROM teams WHERE tenant_id = ANY($1)", [slugs]);
  console.log('teams kept:', t.rows);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
