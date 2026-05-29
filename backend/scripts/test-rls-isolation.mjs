/**
 * CI-тест изоляции тенантов через RLS (Phase: RLS hardening).
 *
 * Доказывает, что политика tenant_isolation (миграция 0007) реально режет чужие
 * строки. CI-роль `postgres` — superuser и обходит RLS, поэтому тест создаёт
 * ОТДЕЛЬНУЮ непривилегированную роль `rls_app` (как «обычный» app-пользователь,
 * на которого RLS действует) и проверяет от её имени:
 *   1. app.tenant_id='a' → видны только строки тенанта A;
 *   2. app.tenant_id='b' → только B;
 *   3. без контекста (fail-closed) → 0 строк;
 *   4. app.bypass_rls='on' → видно всё (админ/cron).
 *
 * Запуск (CI): build → db:migrate → node scripts/test-rls-isolation.mjs
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required'); process.exit(1); }

const APP_ROLE = 'rls_app';
const APP_PW = 'rls_app_pw';
const failures = [];
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name}`); failures.push(name); }
}

const admin = new pg.Pool({ connectionString: url });

// строка подключения для непривилегированной роли
const appUrl = new URL(url);
appUrl.username = APP_ROLE;
appUrl.password = APP_PW;

try {
  // ── seed: 2 тенанта с командой и игроком каждый ──
  await admin.query(`DELETE FROM tenants WHERE slug IN ('rlsa','rlsb')`);
  await admin.query(`INSERT INTO tenants (slug, name, display_name) VALUES
    ('rlsa','RLS A','RLS A'), ('rlsb','RLS B','RLS B')`);
  await admin.query(`INSERT INTO teams (id, tenant_id, name, age_group) VALUES
    ('rlsa-t','rlsa','Team A','2010'), ('rlsb-t','rlsb','Team B','2010')`);
  await admin.query(`INSERT INTO players (id, tenant_id, team_id, full_name) VALUES
    ('rlsa-p','rlsa','rlsa-t','A One'), ('rlsb-p','rlsb','rlsb-t','B One')`);

  // ── создаём непривилегированную роль и выдаём права ──
  await admin.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${APP_ROLE}') THEN
      CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}' NOSUPERUSER;
    END IF; END $$;`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);

  // ── проверки от имени rls_app (на неё RLS действует) ──
  const appPool = new pg.Pool({ connectionString: appUrl.toString() });
  const c = await appPool.connect();
  try {
    const players = async () => (await c.query(`SELECT id FROM players ORDER BY id`)).rows.map((r) => r.id);
    const teams = async () => (await c.query(`SELECT id FROM teams ORDER BY id`)).rows.map((r) => r.id);

    await c.query(`SELECT set_config('app.bypass_rls','off',false)`);

    await c.query(`SELECT set_config('app.tenant_id','rlsa',false)`);
    const a = await players();
    check('tenant A видит только своего игрока', a.length === 1 && a[0] === 'rlsa-p');
    check('tenant A видит только свою команду', (await teams()).join() === 'rlsa-t');

    await c.query(`SELECT set_config('app.tenant_id','rlsb',false)`);
    const b = await players();
    check('tenant B видит только своего игрока', b.length === 1 && b[0] === 'rlsb-p');

    await c.query(`SELECT set_config('app.tenant_id','',false)`);
    check('без контекста — 0 строк (fail-closed)', (await players()).length === 0);

    await c.query(`SELECT set_config('app.bypass_rls','on',false)`);
    check('bypass=on видит обоих (админ/cron)', (await players()).length >= 2);
  } finally {
    c.release();
    await appPool.end();
  }

  // ── cleanup ──
  await admin.query(`DELETE FROM tenants WHERE slug IN ('rlsa','rlsb')`);
} catch (e) {
  console.error('RLS isolation test crashed:', e.message);
  failures.push('test execution');
} finally {
  await admin.end();
}

if (failures.length) {
  console.error(`\n❌ RLS isolation failed: ${failures.length} check(s).`);
  process.exit(1);
}
console.log('\n✓ RLS tenant isolation verified');
