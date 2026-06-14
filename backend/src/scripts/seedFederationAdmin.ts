/**
 * Создать пользователя federation_admin (региональный регулятор, read-only).
 *
 * Usage:
 *   npm run seed:federation-admin -- <email> "<full name>" <password> <federationSlug>
 * Example:
 *   npm run seed:federation-admin -- fed@ffspb.ru "ФФСПб" secret123 ffspb
 *
 * Идемпотентно: если юзер с таким email (без тенанта) есть — обновляет.
 * Требует, чтобы федерация уже была заведена (npm run seed:federation).
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { federations } from '../db/schema/federations.js';
import { withBypassRLS } from '../db/tenantContext.js';

async function main() {
  const [, , email, fullName, password, federationSlug] = process.argv;
  if (!email || !fullName || !password || !federationSlug) {
    console.error('Usage: npm run seed:federation-admin -- <email> "<full name>" <password> <federationSlug>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  // federations под bypass-only RLS — читаем через withBypassRLS.
  const fed = await withBypassRLS((tx) =>
    tx.select({ slug: federations.slug }).from(federations).where(eq(federations.slug, federationSlug)).limit(1),
  );
  if (fed.length === 0) {
    console.error(`Федерация '${federationSlug}' не найдена. Сначала: npm run seed:federation`);
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
      .set({ passwordHash, fullName, role: 'federation_admin', federationSlug, tenantId: null })
      .where(eq(users.id, existing[0].id));
    console.log(`✓ Updated federation_admin: ${email} → ${federationSlug} (id=${existing[0].id})`);
  } else {
    const id = `u-fed-${federationSlug}-${randomBytes(4).toString('hex')}`;
    await db.insert(users).values({
      id,
      tenantId: null,
      email,
      passwordHash,
      fullName,
      role: 'federation_admin',
      federationSlug,
    });
    console.log(`✓ Created federation_admin: ${email} → ${federationSlug} (id=${id})`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('seed:federation-admin failed:', err);
  process.exit(1);
});
