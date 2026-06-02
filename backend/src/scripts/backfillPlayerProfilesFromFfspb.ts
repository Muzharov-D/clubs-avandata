/**
 * Бэкфилл профиля игроков (position / position_full / birth_date) из ростеров
 * FFSPB для ВСЕХ тенантов. Заполняет только NULL-поля, сопоставляя игроков по
 * нормализованному имени с ростером команды (как фото-бэкфилл).
 *
 * Зачем: у части игроков FFSPB пустые позиция и дата рождения → карточка
 * «Информация об игроке» на вкладке «Сезон» профиля показывает только
 * имя/команду/номер, а авто-биография даёт фолбэк «— игрок». Источник позиции/ДР
 * — тот же ростер FFSPB, что и для фото.
 *
 * Само-проверка: печатает rosterSize / withPos / withDob / filled по тенанту.
 * Если withPos=0 или withDob=0 — авто-детект не нашёл поле в ответе FFSPB:
 * смотрим sampleKeys + sampleValues (реальные поля/значения игрока) и правим
 * extractPositionFull / extractBirthDate в services/playerPhotoService.ts,
 * затем перезапускаем.
 *
 * Запуск (нужны FFSPB_API_KEY + DATABASE_URL в env):
 *   cd backend && npx tsx src/scripts/backfillPlayerProfilesFromFfspb.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';
import { withTenant } from '../db/tenantContext.js';
import { enrichTenantProfiles } from '../services/playerPhotoService.js';
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

      // Сколько игроков с пустыми полями ДО (для наглядности эффекта).
      const { rows: before } = await conn.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM players
          WHERE tenant_id = $1 AND (position IS NULL OR position_full IS NULL OR birth_date IS NULL)`,
        [slug],
      );

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

      const res = await enrichTenantProfiles(conn, slug, [...extIds]);
      console.log(
        `[${slug}] было пусто=${before[0]?.n ?? '?'} extIds=${extIds.size} roster=${res.rosterSize} ` +
        `withPos=${res.withPos} withDob=${res.withDob} → filledPos=${res.filledPos} filledDob=${res.filledDob}`,
      );
      if ((res.withPos === 0 || res.withDob === 0) && res.sampleKeys.length) {
        console.log(`  ⚠ авто-детект неполный. Поля игрока FFSPB: ${JSON.stringify(res.sampleKeys)}`);
        console.log(`  ⚠ кандидаты позиции/ДР в ответе: ${JSON.stringify(res.sampleValues)}`);
      }

      // Сколько осталось пустых ПОСЛЕ (по требованию задачи — сверить остаток).
      const { rows: after } = await conn.query<{ n: string; noPos: string; noDob: string }>(
        `SELECT count(*)::text AS n,
                count(*) FILTER (WHERE position_full IS NULL)::text AS "noPos",
                count(*) FILTER (WHERE birth_date IS NULL)::text AS "noDob"
           FROM players WHERE tenant_id = $1`,
        [slug],
      );
      console.log(`  осталось без позиции: ${after[0]?.noPos ?? '?'}, без ДР: ${after[0]?.noDob ?? '?'} (из всех игроков тенанта)`);
    });
  }

  await pool.end();
  console.log('Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
