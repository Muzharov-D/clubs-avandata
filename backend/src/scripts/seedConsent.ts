/**
 * Согласие 152-ФЗ — выставляет players.data_consent=true для клуба (по умолчанию
 * legirus). Флаг открывает ИМЯ ребёнка федерации (FR17/FR19), поэтому применять
 * ТОЛЬКО когда согласие реально получено. Идемпотентно (повторный прогон безопасен).
 *
 * Usage:
 *   npm run seed:consent              # legirus
 *   npm run seed:consent -- <slug>    # другой клуб
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { pool } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { players } from '../db/schema/players.js';

const TENANT = process.argv[2] ?? 'legirus';

async function main() {
  await withBypassRLS(async (tx) => {
    const res = await tx
      .update(players)
      .set({ dataConsent: true })
      .where(eq(players.tenantId, TENANT))
      .returning({ id: players.id });
    console.log(`✓ Согласие 152-ФЗ: клуб ${TENANT} — отмечено ${res.length} игроков`);
  });
  await pool.end();
}

main().catch((err) => {
  console.error('seed:consent failed:', err);
  process.exit(1);
});
