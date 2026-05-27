/**
 * Create initial platform_admin user.
 *
 * Usage:
 *   npm run seed:admin -- <email> "<full name>" <password>
 *
 * Example:
 *   npm run seed:admin -- admin@avandata.ru "Дмитрий Мужаров" mySecret123
 *
 * Reads DATABASE_URL from backend/.env (use Render external PG URL).
 * Idempotent: если admin с таким email уже есть — обновляет пароль и имя.
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { users } from '../db/schema/users.js';

async function main() {
  const [, , email, fullName, password] = process.argv;
  if (!email || !fullName || !password) {
    console.error('Usage: npm run seed:admin -- <email> "<full name>" <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.tenantId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({ passwordHash, fullName })
      .where(eq(users.id, existing[0].id));
    console.log(`✓ Updated existing platform_admin: ${email} (id=${existing[0].id})`);
  } else {
    const id = `u-pa-${randomBytes(4).toString('hex')}`;
    await db.insert(users).values({
      id,
      tenantId: null,
      email,
      passwordHash,
      fullName,
      role: 'platform_admin',
    });
    console.log(`✓ Created platform_admin: ${email} (id=${id})`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('seed:admin failed:', err);
  process.exit(1);
});
