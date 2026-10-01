/**
 * Создать пользователя holding_admin (руководство холдинга, кабинет /holding).
 *
 * Usage:
 *   npm run seed:holding-admin -- <email> "<full name>" <password> <holdingSlug>
 * Example:
 *   npm run seed:holding-admin -- dinamo@avandata.ru "Динамо СПб" secret123 dinamo-spb
 *
 * Идемпотентно: если юзер с таким email (без тенанта) есть — обновляет пароль/роль/холдинг.
 * Холдинг должен быть описан в backend/src/federation/holdings.ts (HOLDINGS).
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { findHolding } from '../federation/holdings.js';

async function main() {
  const [, , email, fullName, password, holdingSlug] = process.argv;
  if (!email || !fullName || !password || !holdingSlug) {
    console.error('Usage: npm run seed:holding-admin -- <email> "<full name>" <password> <holdingSlug>');
    process.exit(1);
  }
  if (password.length < 8) { console.error('Password must be at least 8 characters'); process.exit(1); }
  if (!findHolding(holdingSlug)) { console.error(`Холдинг '${holdingSlug}' не описан в federation/holdings.ts`); process.exit(1); }

  const passwordHash = await argon2.hash(password);
  const existing = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), isNull(users.tenantId))).limit(1);
  if (existing[0]) {
    await db.update(users).set({ passwordHash, fullName, role: 'holding_admin', holdingSlug, federationSlug: null, tenantId: null }).where(eq(users.id, existing[0].id));
    console.log(`✓ Updated holding_admin: ${email} → ${holdingSlug} (id=${existing[0].id})`);
  } else {
    const id = `u-hold-${holdingSlug}-${randomBytes(4).toString('hex')}`;
    await db.insert(users).values({ id, tenantId: null, email, passwordHash, fullName, role: 'holding_admin', holdingSlug });
    console.log(`✓ Created holding_admin: ${email} → ${holdingSlug} (id=${id})`);
  }
  await pool.end();
}

main().catch((err) => { console.error('seed:holding-admin failed:', err); process.exit(1); });
