/**
 * Бэкфилл фото игроков из ростеров FFSPB для ВСЕХ тенантов (не только Зенит).
 *
 * Заполняет players.photo_url (только там, где NULL), сопоставляя игроков
 * по нормализованному имени с ростером команды из FFSPB API. Наши ext-id команд
 * берём из календаря (is_our_match), определяя нашу сторону по имени команды.
 *
 * Само-проверка: печатает rosterSize / withPhoto / filled / sampleKeys по каждому
 * тенанту. Если withPhoto=0 — авто-детект не нашёл поле фото в ответе FFSPB:
 * смотрим sampleKeys (реальные поля игрока) и правим extractPhoto в
 * services/playerPhotoService.ts, затем перезапускаем.
 *
 * Запуск (нужны FFSPB_API_KEY + DATABASE_URL в env — есть на Render):
 *   cd backend && npx tsx src/scripts/backfillPhotosFromFfspb.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';
import { withTenant } from '../db/tenantContext.js';
import { enrichTenantPhotos } from '../services/playerPhotoService.js';
import { normalizeTeamName } from '../shared/teamName.js';

function looseMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

async function main(): Promise<void> {
  const { rows: tenants } = await pool.query<{ slug: string }>(`SELECT slug FROM tenants`);
  console.log(`Тенантов: ${tenants.length}`);

  for (const { slug } of tenants) {
    // Запросы — внутри withTenant: на Render роль без BYPASSRLS, RLS прячет
    // teams/players без app.tenant_id (raw pool отдавал 0 строк).
    await withTenant(slug, async (_tx, conn) => {
      const { rows: teams } = await conn.query(
        `SELECT name FROM teams WHERE tenant_id = $1`,
        [slug],
      );
      const ourNames = teams.map((t) => normalizeTeamName(t.name as string | null)).filter(Boolean);
      if (!ourNames.length) {
        console.log(`[${slug}] нет команд — пропуск`);
        return;
      }

      const { rows: cal } = await conn.query(
        `SELECT home_team AS "home", away_team AS "away",
                ext_home_team_id AS "extHome", ext_away_team_id AS "extAway"
           FROM calendar WHERE tenant_id = $1 AND is_our_match = TRUE`,
        [slug],
      );

      const extIds = new Set<string>();
      for (const r of cal) {
        const h = normalizeTeamName(r.home as string | null);
        const a = normalizeTeamName(r.away as string | null);
        const ourHome = ourNames.some((n) => looseMatch(h, n));
        const ourAway = ourNames.some((n) => looseMatch(a, n));
        if (ourHome && r.extHome) extIds.add(String(r.extHome));
        else if (ourAway && r.extAway) extIds.add(String(r.extAway));
      }
      if (!extIds.size) {
        console.log(`[${slug}] нет ext-id наших команд в календаре — пропуск`);
        return;
      }

      const res = await enrichTenantPhotos(conn, slug, [...extIds]);
      console.log(
        `[${slug}] extIds=${extIds.size} roster=${res.rosterSize} withPhoto=${res.withPhoto} filled=${res.filled}`,
      );
      if (res.withPhoto === 0 && res.sampleKeys.length) {
        console.log(`  ⚠ авто-детект не нашёл фото. Поля игрока FFSPB: ${JSON.stringify(res.sampleKeys)}`);
      }
    });
  }

  await pool.end();
  console.log('Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
