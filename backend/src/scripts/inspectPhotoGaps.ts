/**
 * READ-ONLY. Диагностика «у части игроков нет фото».
 *
 * Для каждой нашей команды:
 *  1) считает с фото / без;
 *  2) тянет ростер FFSPB (нужен FFSPB_API_KEY) и для КАЖДОГО игрока без фото
 *     печатает: есть ли его фамилия в ростере и какой photoUrl сматчился бы.
 *
 * Так сразу видно корень: фамилии НЕТ в ростере (дыра в данных FFSPB) ИЛИ
 * фамилия ЕСТЬ, но resolvePhoto не сматчил (баг сопоставления имён).
 *
 * Запуск: cd backend && FFSPB_API_KEY=<key> npx tsx src/scripts/inspectPhotoGaps.ts
 * (без ключа отработает только п.1 — список без фото.)
 */
import 'dotenv/config';
import { pool } from '../db/client.js';
import { withTenant } from '../db/tenantContext.js';
import { buildTeamPhotoIndex, resolvePhoto, playerNameKey } from '../services/playerPhotoService.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || '';
  console.log('DB host:', url.replace(/\/\/[^@]*@/, '//***@').slice(0, 70));
  console.log('FFSPB_API_KEY:', process.env.FFSPB_API_KEY ? 'есть' : 'НЕТ (roster-проверка пропущена)', '\n');

  const { rows: tenants } = await pool.query<{ slug: string }>(`SELECT slug FROM tenants`);

  for (const { slug } of tenants) {
    await withTenant(slug, async (_tx, conn) => {
      const { rows: teams } = await conn.query<{ id: string; ageGroup: string | null }>(
        `SELECT id, age_group AS "ageGroup" FROM teams WHERE tenant_id = $1`,
        [slug],
      );

      for (const team of teams) {
        const { rows: players } = await conn.query<{
          full_name: string; number: number | null; photo_url: string | null;
        }>(
          `SELECT full_name, number, photo_url FROM players
             WHERE tenant_id = $1 AND team_id = $2 ORDER BY number NULLS LAST, full_name`,
          [slug, team.id],
        );
        if (!players.length) continue;

        const without = players.filter((p) => !p.photo_url);
        console.log(`── ${slug} / ${team.id} — всего ${players.length}, без фото ${without.length}`);
        if (!without.length) { console.log(''); continue; }

        // Ext-id нашей команды этого возраста (как в upload/calendar).
        const { rows: ext } = await conn.query<{ extId: string }>(
          `SELECT ext_id AS "extId" FROM (
             SELECT ext_home_team_id AS ext_id FROM calendar
               WHERE tenant_id=$1 AND is_our_match=TRUE AND age_group=$2
             UNION ALL
             SELECT ext_away_team_id AS ext_id FROM calendar
               WHERE tenant_id=$1 AND is_our_match=TRUE AND age_group=$2
           ) t WHERE ext_id IS NOT NULL GROUP BY ext_id ORDER BY COUNT(*) DESC LIMIT 1`,
          [slug, team.ageGroup],
        );
        const ourExtId = ext[0]?.extId;

        let index: Awaited<ReturnType<typeof buildTeamPhotoIndex>> | null = null;
        if (ourExtId && process.env.FFSPB_API_KEY) {
          index = await buildTeamPhotoIndex(ourExtId);
          console.log(`   ростер FFSPB extId=${ourExtId}: игроков=${index.rosterSize}`);
        } else {
          console.log(`   ростер не запрошен (extId=${ourExtId ?? '—'})`);
        }

        for (const p of without) {
          let note = '';
          if (index) {
            const hit = resolvePhoto(p.full_name, index);
            const inByName = index.byName.has(playerNameKey(p.full_name));
            note = hit?.photoUrl
              ? `→ СМАТЧИЛОСЬ БЫ: ${hit.photoUrl}  (баг: фото есть, но не залито)`
              : inByName
                ? '→ имя в ростере, но photoUrl пуст'
                : '→ НЕТ в ростере FFSPB (дыра в данных)';
          }
          console.log(`     #${p.number ?? '—'} "${p.full_name}"  ${note}`);
        }
        console.log('');
      }
    });
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
