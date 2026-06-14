/**
 * Сид федерации ФФСПб — создаёт федерацию `ffspb` и членство (tier='full') всех
 * клубов с dataProvider='ffspb'. Идемпотентно (ON CONFLICT DO NOTHING) —
 * повторный прогон не дублирует и не трогает существующее. FR27.
 *
 * Usage:
 *   npm run seed:federation
 *
 * Reads DATABASE_URL from backend/.env. federations/federation_tenants — под
 * bypass-only RLS, поэтому идём через withBypassRLS (ставит app.bypass_rls='on').
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { pool } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { federations } from '../db/schema/federations.js';
import { federationTenants } from '../db/schema/federationTenants.js';
import { tenants } from '../db/schema/tenants.js';

const FED_SLUG = 'ffspb';

async function main() {
  await withBypassRLS(async (tx) => {
    // 1. Федерация ffspb (идемпотентно).
    await tx
      .insert(federations)
      .values({
        slug: FED_SLUG,
        name: 'Федерация футбола Санкт-Петербурга',
        region: 'Санкт-Петербург',
        parentBody: 'МРО Северо-Запад',
      })
      .onConflictDoNothing({ target: federations.slug });

    // 2. Членство: все клубы с dataProvider='ffspb' → tier='full'.
    const ffspbClubs = await tx
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.dataProvider, 'ffspb'));

    let added = 0;
    for (const club of ffspbClubs) {
      const res = await tx
        .insert(federationTenants)
        .values({ federationSlug: FED_SLUG, tenantSlug: club.slug, tier: 'full' })
        .onConflictDoNothing({
          target: [federationTenants.federationSlug, federationTenants.tenantSlug],
        })
        .returning({ tenantSlug: federationTenants.tenantSlug });
      if (res.length > 0) added++;
    }
    console.log(
      `✓ Федерация ${FED_SLUG}: ${ffspbClubs.length} ffspb-клубов, добавлено ${added} новых членов`,
    );
  });

  await pool.end();
}

main().catch((err) => {
  console.error('seed:federation failed:', err);
  process.exit(1);
});
