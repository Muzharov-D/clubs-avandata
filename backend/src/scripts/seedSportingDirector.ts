/**
 * Создать (или обновить) аккаунт СТАРШЕГО ТРЕНЕРА клуба.
 *
 *   npm run seed:sporting-director                          # legirus / director
 *   npm run seed:sporting-director -- --tenant=legirus --username=director \
 *                          --password="director 2026" --name="Старший тренер"
 *
 * Роль — head_coach: tenant-scoped, видит ВЕСЬ клуб (единый кабинет) и пишет по
 * любой команде. teamId = NULL (не привязан к одной команде). Логин по username + клуб.
 * (Прежняя роль sporting_director слита в head_coach — см. миграцию 0019.)
 *
 * users — tenant-scoped под RLS: нужен `SET app.bypass_rls = 'on'` на том же
 * соединении. Идемпотентно по (tenant_id, username). Читает DATABASE_URL из .env.
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { pool } from '../db/client.js';

function arg(name: string, fallback: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
}

async function main(): Promise<void> {
  const tenant = arg('tenant', 'legirus');
  const username = arg('username', 'director');
  const password = arg('password', 'director 2026');
  const fullName = arg('name', 'Старший тренер');
  const role = 'head_coach';

  if (password.length < 8) {
    console.error('Пароль должен быть не короче 8 символов');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);
  const c = await pool.connect();
  try {
    await c.query("SET app.bypass_rls = 'on'");

    const tenantRow = await c.query('SELECT slug FROM tenants WHERE slug = $1 LIMIT 1', [tenant]);
    if (!tenantRow.rows[0]) {
      console.error(`✗ Клуб (tenant) ${tenant} не найден.`);
      process.exit(1);
    }

    const existing = await c.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND username = $2 LIMIT 1',
      [tenant, username],
    );

    if (existing.rows[0]) {
      const id = existing.rows[0].id as string;
      await c.query(
        'UPDATE users SET password_hash = $1, full_name = $2, role = $3, team_id = NULL WHERE id = $4',
        [passwordHash, fullName, role, id],
      );
      console.log(`✓ Обновлён старший тренер: ${username} (id=${id}) · ${role} · tenant=${tenant}`);
    } else {
      const id = `u-${tenant}-hc-${randomBytes(3).toString('hex')}`;
      await c.query(
        `INSERT INTO users (id, tenant_id, username, password_hash, full_name, role, team_id)
         VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
        [id, tenant, username, passwordHash, fullName, role],
      );
      console.log(`✓ Создан старший тренер: ${username} (id=${id}) · ${role} · tenant=${tenant}`);
    }
    console.log(`  Логин: ${username}  ·  клуб: ${tenant}  ·  пароль: ${password}`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('seed:sporting-director failed:', err);
  process.exit(1);
});
