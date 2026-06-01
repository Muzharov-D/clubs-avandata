/**
 * Локальная заливка календаря Легируса из FFSPB (stat.ffspb.org) напрямую в БД.
 *
 * Зачем локально: с Render латентность до FFSPB + пагинация раздували время за
 * таймаут; с локальной машины FFSPB отдаёт турнир за ~4с/страницу (252 матча =
 * 3 страницы). Скрипт переиспользует syncTenantCalendarTournament — ту же логику,
 * что и admin /sync и cron, поэтому UPSERT идемпотентен по (tenant, age, ext_match_id).
 *
 * Запуск (ключ FFSPB передаём в env, он НЕ в .env):
 *   cd backend && FFSPB_API_KEY='...' npx tsx src/scripts/seedLegirusCalendar.ts
 *   # опц. только один возраст: ... seedLegirusCalendar.ts 2010
 */
import 'dotenv/config';
import { syncTenantCalendarTournament } from '../services/calendarService.js';
import { syncTenantStandings } from '../services/standingsService.js';
import { pool } from '../db/client.js';

const SLUG = 'legirus';
const SEASON = '2025-2026';
const OUR_MATCHER = 'Легирус';

// ID турниров Наградиона/FFSPB по возрастам (из provider_config Легируса).
const TOURNAMENTS: Record<string, { leagueId?: string; cupId?: string }> = {
  '2010': { leagueId: '44333', cupId: '44345' },
  '2011': { leagueId: '44334', cupId: '44346' },
  '2012': { leagueId: '44335', cupId: '44347' },
  '2013': { leagueId: '44336', cupId: '44348' },
  '2014': { leagueId: '44337' },
  '2015': { leagueId: '44338' },
  '2016': { leagueId: '44339' },
};

async function main() {
  const onlyAge = process.argv[2];
  const ages = onlyAge ? [onlyAge] : Object.keys(TOURNAMENTS);
  console.log(`=== seed Legirus calendar (FFSPB) — ages: ${ages.join(', ')} ===\n`);

  for (const age of ages) {
    const tids = TOURNAMENTS[age];
    if (!tids) { console.log(`[${age}] нет конфигурации турниров — пропуск`); continue; }

    if (tids.leagueId) {
      const r = await syncTenantCalendarTournament({
        tenantSlug: SLUG, ageGroup: age, season: SEASON,
        tournamentId: tids.leagueId, tournament: 'league', ourMatcher: OUR_MATCHER,
      });
      console.log(`[${age}] league ${tids.leagueId}: ${r.ok ? `OK, ${r.count} матчей` : `FAIL — ${r.error}`}`);
    }
    if (tids.cupId) {
      const r = await syncTenantCalendarTournament({
        tenantSlug: SLUG, ageGroup: age, season: SEASON,
        tournamentId: tids.cupId, tournament: 'cup', ourMatcher: OUR_MATCHER,
      });
      console.log(`[${age}] cup ${tids.cupId}: ${r.ok ? `OK, ${r.count} матчей` : `FAIL — ${r.error}`}`);
    }
    // standings — best-effort (часто медленный /api/standings).
    if (tids.leagueId) {
      try {
        const r = await syncTenantStandings({
          tenantSlug: SLUG, ageGroup: age, tournamentId: tids.leagueId,
          season: SEASON, ourMatcher: OUR_MATCHER,
        });
        console.log(`[${age}] standings: ${r.ok ? 'OK' : `skip — ${r.error}`}`);
      } catch (e) {
        console.log(`[${age}] standings: skip — ${(e as Error).message}`);
      }
    }
  }

  console.log('\n=== Done ===');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
