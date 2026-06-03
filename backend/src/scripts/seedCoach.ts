/**
 * Создать (или обновить) аккаунт тренера для существующего клуба.
 *
 *   npm run seed:coach                         # значения по умолчанию (legirus 2010)
 *   npm run seed:coach -- --username=coach2010 --password="legirus 2010" \
 *                          --tenant=legirus --team=legirus-2010 --name="Тренер 2010"
 *
 * Роль — head_coach (видит весь клуб, кнопка «Загрузить отчёт Sportvisor»
 * показывается для head_coach/team_coach). Логин по username (email не нужен).
 *
 * users — tenant-scoped под RLS: нужен `SET app.bypass_rls = 'on'` на ТОМ ЖЕ
 * соединении (правило postgres-force-rls-script-access), иначе INSERT/SELECT
 * затронет 0 строк. Идемпотентно по (tenant_id, username): повторный запуск
 * обновляет пароль/имя/команду, а не плодит дубли.
 *
 * Читает DATABASE_URL из backend/.env.
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
  const team = arg('team', 'legirus-2010');
  const username = arg('username', 'coach2010');
  const password = arg('password', 'legirus 2010');
  const fullName = arg('name', 'Тренер Легирус 2010');
  const role = 'head_coach';

  if (password.length < 8) {
    console.error('Пароль должен быть не короче 8 символов');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);
  const c = await pool.connect();
  try {
    await c.query("SET app.bypass_rls = 'on'");

    // Команда должна существовать (FK у нас мягкий — team_id просто text, но
    // проверим явно, чтобы тренер не указывал на несуществующую команду).
    const teamRow = await c.query('SELECT id FROM teams WHERE id = $1 LIMIT 1', [team]);
    if (!teamRow.rows[0]) {
      console.warn(`⚠ Команда ${team} не найдена — team_id всё равно проставлю, но проверь id.`);
    }

    const existing = await c.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND username = $2 LIMIT 1',
      [tenant, username],
    );

    if (existing.rows[0]) {
      const id = existing.rows[0].id;
      await c.query(
        'UPDATE users SET password_hash = $1, full_name = $2, role = $3, team_id = $4 WHERE id = $5',
        [passwordHash, fullName, role, team, id],
      );
      console.log(`✓ Обновлён тренер: ${username} (id=${id}) · ${role} · team=${team}`);
    } else {
      const id = `u-${tenant}-hc-${randomBytes(3).toString('hex')}`;
      await c.query(
        `INSERT INTO users (id, tenant_id, username, password_hash, full_name, role, team_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, tenant, username, passwordHash, fullName, role, team],
      );
      console.log(`✓ Создан тренер: ${username} (id=${id}) · ${role} · tenant=${tenant} · team=${team}`);
    }
    console.log(`  Логин: ${username}  ·  пароль: ${password}`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('seed:coach failed:', err);
  process.exit(1);
});
