/**
 * Seed-скрипт для демо: создаёт 2 tenant'a (ФК Зенит и СШОР Зенит) с реальными
 * данными ЮФЛ U-15 (сезон 2026): команды U-15, игроки (сгенерированные имена),
 * прошедшие матчи из календаря ЮФЛ, standings, calendar.
 *
 * Идемпотентен: всё через UPSERT/ON CONFLICT.
 *
 * Запуск:
 *   cd backend && npx tsx src/scripts/seedZenit.ts
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { pool } from '../db/client.js';

// ============================================================================
// Tenants
// ============================================================================
const TENANTS = [
  {
    slug: 'zenit-fk',
    name: 'ФК Зенит',
    displayName: 'ФК Зенит',
    brand: {
      primary: '#001489',        // Zenit navy
      primaryHover: '#001270',
      secondary: '#0066CC',
      accent: '#1FB6FF',
      titleSuffix: 'ФК Зенит',
    },
    ourMatcher: 'Зенит',         // Внимание: НЕ "СШОР"
    ourMatcherExclude: 'СШОР',   // фильтр чтобы не путать с СШОР Зенит
  },
  {
    slug: 'zenit-sshor',
    name: 'СШОР Зенит',
    displayName: 'СШОР Зенит',
    brand: {
      primary: '#87CEEB',
      primaryHover: '#5FB0D7',
      secondary: '#1E40AF',
      accent: '#FFD700',
      titleSuffix: 'СШОР Зенит',
    },
    ourMatcher: 'СШОР Зенит',
  },
] as const;

// ============================================================================
// Команды (U-15)
// ============================================================================
const AGE_GROUP = '2011';   // ЮФЛ U-15 в сезоне 2026 → 2011 г.р.
const SEASON = '2025-2026';
const TOURNAMENT_NAME = 'ЮФЛ U-15';

const TEAMS_DEF: Record<string, { name: string; headCoach: string }> = {
  'zenit-fk': { name: 'ФК Зенит U-15', headCoach: 'А. Иванов' },
  'zenit-sshor': { name: 'СШОР Зенит U-15', headCoach: 'В. Петров' },
};

// Список других команд ЮФЛ U-15 (для opponent rows в calendar/standings)
const ALL_LEAGUE_TEAMS = [
  'Чертаново', 'ЦСКА', 'Урал', 'СШОР Зенит', 'Спартак',
  'Рубин', 'Ростов', 'Родина', 'МФА', 'Мастер-Сатурн',
  'Локомотив', 'Краснодар', 'Зенит', 'Динамо', 'Алмаз-Антей',
  'Акрон - Академия Коноплева',
];

// ============================================================================
// Игроки (сгенерированные русские имена, по 16 на команду)
// ============================================================================
const FIRST_NAMES = ['Александр', 'Иван', 'Дмитрий', 'Михаил', 'Никита', 'Артём', 'Максим', 'Кирилл', 'Даниил', 'Егор', 'Тимофей', 'Глеб', 'Лев', 'Марк', 'Степан', 'Илья'];
const LAST_NAMES_FK = ['Соколов', 'Морозов', 'Новиков', 'Волков', 'Зайцев', 'Павлов', 'Семёнов', 'Голубев', 'Виноградов', 'Богданов', 'Воробьёв', 'Фёдоров', 'Михайлов', 'Беляев', 'Тарасов', 'Белов'];
const LAST_NAMES_SSHOR = ['Кузнецов', 'Васильев', 'Петров', 'Сидоров', 'Алексеев', 'Григорьев', 'Степанов', 'Николаев', 'Андреев', 'Макаров', 'Захаров', 'Орлов', 'Романов', 'Воронин', 'Антонов', 'Попов'];
const POSITIONS = ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'CB', 'CM', 'LW', 'GK'];

function genPlayer(idx: number, tenantSlug: string, teamId: string) {
  const firstNames = FIRST_NAMES;
  const lastNames = tenantSlug === 'zenit-fk' ? LAST_NAMES_FK : LAST_NAMES_SSHOR;
  const last = lastNames[idx] ?? lastNames[0]!;
  const first = firstNames[idx] ?? firstNames[0]!;
  const pos = POSITIONS[idx] ?? 'CM';
  return {
    id: `manual-${tenantSlug}-p${String(idx + 1).padStart(2, '0')}`,
    tenantId: tenantSlug,
    teamId,
    fullName: `${first} ${last}`,
    firstName: first,
    lastName: last,
    number: idx + 1,
    position: pos,
  };
}

// ============================================================================
// Прошедшие матчи (из календаря ЮФЛ U-15, март 2026)
// ============================================================================
type PastMatch = {
  date: string;
  home: string;
  away: string;
  scoreHome: number;
  scoreAway: number;
  venue: string;
  round: string;
};

const PAST_MATCHES: PastMatch[] = [
  // 7 марта — Тур 1
  { date: '2026-03-07T10:00:00+03:00', home: 'Спартак',  away: 'СШОР Зенит', scoreHome: 2, scoreAway: 0, venue: '«Спартак» поле № 4', round: 'Тур 1' },
  { date: '2026-03-07T11:00:00+03:00', home: 'Зенит',     away: 'Динамо',      scoreHome: 1, scoreAway: 1, venue: '«Смена»',           round: 'Тур 1' },
  // 14 марта — Тур 2
  { date: '2026-03-14T09:00:00+03:00', home: 'Урал',     away: 'Зенит',       scoreHome: 1, scoreAway: 7, venue: 'Манеж «Урал»',      round: 'Тур 2' },
  { date: '2026-03-14T10:30:00+03:00', home: 'СШОР Зенит', away: 'МФА',         scoreHome: 3, scoreAway: 0, venue: 'СШОР «Зенит»',      round: 'Тур 2' },
  // 21 марта — Тур 3
  { date: '2026-03-21T10:30:00+03:00', home: 'СШОР Зенит', away: 'Алмаз-Антей', scoreHome: 0, scoreAway: 0, venue: 'СШОР «Зенит»',      round: 'Тур 3' },
  // 22 марта — Тур 3
  { date: '2026-03-22T11:00:00+03:00', home: 'Локомотив', away: 'Зенит',       scoreHome: 3, scoreAway: 3, venue: '«Сапсан Арена»',    round: 'Тур 3' },
];

// Прошедшие 4 апреля и 11 апреля — переводим в past со счетом (для истории)
const APRIL_PAST: PastMatch[] = [
  { date: '2026-04-04T00:00:00+03:00', home: 'Динамо',    away: 'СШОР Зенит', scoreHome: 2, scoreAway: 1, venue: 'УТБ «Новогорск-Динамо»', round: 'Тур 4' },
  { date: '2026-04-04T11:00:00+03:00', home: 'Зенит',     away: 'Ростов',     scoreHome: 4, scoreAway: 0, venue: '«Смена»',              round: 'Тур 4' },
  { date: '2026-04-11T10:00:00+03:00', home: 'Краснодар', away: 'Зенит',      scoreHome: 1, scoreAway: 2, venue: 'Академия «Краснодар»', round: 'Тур 5' },
  { date: '2026-04-11T10:30:00+03:00', home: 'СШОР Зенит', away: 'ЦСКА',       scoreHome: 0, scoreAway: 3, venue: 'СШОР «Зенит»',         round: 'Тур 5' },
  { date: '2026-05-16T00:00:00+03:00', home: 'Зенит',     away: 'СШОР Зенит', scoreHome: 2, scoreAway: 2, venue: '«Смена»',              round: 'Тур 8' },
];

// Будущие матчи (июнь-ноябрь 2026, today = 2026-05-28)
const UPCOMING_MATCHES: PastMatch[] = [
  // 6 июня — Тур 9
  { date: '2026-06-06T10:00:00+03:00', home: 'Зенит',     away: 'Локомотив',  scoreHome: NaN, scoreAway: NaN, venue: '«Смена»',              round: 'Тур 9' },
  { date: '2026-06-06T11:00:00+03:00', home: 'СШОР Зенит', away: 'Динамо',     scoreHome: NaN, scoreAway: NaN, venue: 'СШОР «Зенит»',         round: 'Тур 9' },
  // 13 июня — Тур 10
  { date: '2026-06-13T10:30:00+03:00', home: 'Ростов',    away: 'Зенит',      scoreHome: NaN, scoreAway: NaN, venue: '«Локомотив»',          round: 'Тур 10' },
  { date: '2026-06-13T11:00:00+03:00', home: 'Спартак',   away: 'СШОР Зенит', scoreHome: NaN, scoreAway: NaN, venue: '«Спартак» поле № 4',   round: 'Тур 10' },
  // 20 июня — Тур 11
  { date: '2026-06-20T11:00:00+03:00', home: 'Зенит',     away: 'Чертаново',  scoreHome: NaN, scoreAway: NaN, venue: '«Смена»',              round: 'Тур 11' },
  { date: '2026-06-20T10:00:00+03:00', home: 'СШОР Зенит', away: 'МФА',        scoreHome: NaN, scoreAway: NaN, venue: 'СШОР «Зенит»',         round: 'Тур 11' },
  // 27 июня — Дерби 2!
  { date: '2026-06-27T11:00:00+03:00', home: 'СШОР Зенит', away: 'Зенит',     scoreHome: NaN, scoreAway: NaN, venue: 'СШОР «Зенит»',         round: 'Тур 12 · ДЕРБИ' },
  // 4 июля — Тур 13
  { date: '2026-07-04T10:00:00+03:00', home: 'Зенит',     away: 'ЦСКА',       scoreHome: NaN, scoreAway: NaN, venue: '«Смена»',              round: 'Тур 13' },
  { date: '2026-07-04T11:00:00+03:00', home: 'СШОР Зенит', away: 'Краснодар',  scoreHome: NaN, scoreAway: NaN, venue: 'СШОР «Зенит»',         round: 'Тур 13' },
];

// ============================================================================
// Standings (вручную — на основе past matches Зенита и СШОР Зенита)
// ============================================================================
type StandingRow = {
  pos: number; team: string; games: number; wins: number; draws: number; losses: number;
  scored: number; missed: number; difference: number; points: number;
};

const STANDINGS_TABLE: StandingRow[] = [
  { pos: 1,  team: 'Динамо',                       games: 3, wins: 2, draws: 1, losses: 0, scored: 11, missed: 4,  difference:  7, points: 7 },
  { pos: 2,  team: 'Локомотив',                    games: 3, wins: 1, draws: 2, losses: 0, scored:  7, missed: 5,  difference:  2, points: 5 },
  { pos: 3,  team: 'Зенит',                        games: 3, wins: 1, draws: 2, losses: 0, scored: 11, missed: 5,  difference:  6, points: 5 },
  { pos: 4,  team: 'Рубин',                        games: 2, wins: 1, draws: 0, losses: 1, scored:  3, missed: 3,  difference:  0, points: 3 },
  { pos: 5,  team: 'Краснодар',                    games: 3, wins: 1, draws: 1, losses: 1, scored:  5, missed: 2,  difference:  3, points: 4 },
  { pos: 6,  team: 'Чертаново',                    games: 3, wins: 1, draws: 0, losses: 1, scored:  5, missed: 4,  difference:  1, points: 3 },
  { pos: 7,  team: 'СШОР Зенит',                   games: 3, wins: 1, draws: 1, losses: 1, scored:  3, missed: 2,  difference:  1, points: 4 },
  { pos: 8,  team: 'Спартак',                      games: 2, wins: 1, draws: 0, losses: 1, scored:  3, missed: 0,  difference:  3, points: 3 },
  { pos: 9,  team: 'Ростов',                       games: 3, wins: 1, draws: 0, losses: 2, scored:  3, missed: 5,  difference: -2, points: 3 },
  { pos: 10, team: 'Родина',                       games: 3, wins: 1, draws: 1, losses: 1, scored: 10, missed: 4,  difference:  6, points: 4 },
  { pos: 11, team: 'Алмаз-Антей',                  games: 3, wins: 0, draws: 2, losses: 1, scored:  3, missed: 6,  difference: -3, points: 2 },
  { pos: 12, team: 'Акрон - Академия Коноплева',   games: 3, wins: 1, draws: 1, losses: 1, scored:  3, missed: 5,  difference: -2, points: 4 },
  { pos: 13, team: 'ЦСКА',                         games: 2, wins: 1, draws: 0, losses: 1, scored:  2, missed: 3,  difference: -1, points: 3 },
  { pos: 14, team: 'МФА',                          games: 3, wins: 0, draws: 1, losses: 2, scored:  1, missed: 6,  difference: -5, points: 1 },
  { pos: 15, team: 'Мастер-Сатурн',                games: 3, wins: 0, draws: 0, losses: 3, scored:  0, missed: 8,  difference: -8, points: 0 },
  { pos: 16, team: 'Урал',                         games: 3, wins: 1, draws: 0, losses: 2, scored:  3, missed: 12, difference: -9, points: 3 },
];

// ============================================================================
// Helpers
// ============================================================================

async function upsertTenant(t: typeof TENANTS[number]) {
  const cfg = {
    season: SEASON,
    ourMatcher: t.ourMatcher,
    ourMatcherExclude: 'ourMatcherExclude' in t ? (t as { ourMatcherExclude: string }).ourMatcherExclude : null,
  };
  await pool.query(
    `INSERT INTO tenants (slug, name, display_name, status, brand, data_provider, provider_config, plan)
     VALUES ($1, $2, $3, 'active', $4::jsonb, 'manual', $5::jsonb, 'free')
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       display_name = EXCLUDED.display_name,
       brand = EXCLUDED.brand,
       data_provider = EXCLUDED.data_provider,
       provider_config = EXCLUDED.provider_config,
       updated_at = NOW()`,
    [t.slug, t.name, t.displayName, JSON.stringify(t.brand), JSON.stringify(cfg)],
  );
  console.log(`  tenant ${t.slug} upserted`);
}

async function upsertHeadCoach(tenantSlug: string, email: string, fullName: string, password: string) {
  const passwordHash = await argon2.hash(password);
  const userId = `u-${tenantSlug}-hc`;
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5, 'head_coach')
     ON CONFLICT (id) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       email = EXCLUDED.email`,
    [userId, tenantSlug, email, passwordHash, fullName],
  );
  console.log(`  head_coach ${email} / ${password} → ${userId}`);
}

async function upsertTeam(tenantSlug: string) {
  const teamId = `${tenantSlug}-2011`;
  const teamDef = TEAMS_DEF[tenantSlug];
  if (!teamDef) throw new Error(`No team def for ${tenantSlug}`);
  await pool.query(
    `INSERT INTO teams (id, tenant_id, name, age_group, age_label, year, head_coach, is_our_team, active)
     VALUES ($1, $2, $3, $4, 'U-15', 2011, $5, TRUE, TRUE)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, head_coach = EXCLUDED.head_coach`,
    [teamId, tenantSlug, teamDef.name, AGE_GROUP, teamDef.headCoach],
  );
  console.log(`  team ${teamId} (${teamDef.name})`);
  return teamId;
}

async function upsertPlayers(tenantSlug: string, teamId: string) {
  for (let i = 0; i < 16; i++) {
    const p = genPlayer(i, tenantSlug, teamId);
    await pool.query(
      `INSERT INTO players (id, tenant_id, team_id, full_name, first_name, last_name, number, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         number = EXCLUDED.number,
         position = EXCLUDED.position`,
      [p.id, p.tenantId, p.teamId, p.fullName, p.firstName, p.lastName, p.number, p.position],
    );
  }
  console.log(`  16 players upserted`);
}

async function upsertCalendarMatch(tenantSlug: string, m: PastMatch, ourMatcher: string, ourExclude: string | null) {
  const isOurMatch =
    (m.home === ourMatcher && !(ourExclude && m.away.includes(ourExclude))) ||
    (m.away === ourMatcher && !(ourExclude && m.home.includes(ourExclude))) ||
    (tenantSlug === 'zenit-fk' && (m.home === 'Зенит' || m.away === 'Зенит')) ||
    (tenantSlug === 'zenit-sshor' && (m.home === 'СШОР Зенит' || m.away === 'СШОР Зенит'));
  const extMatchId = `ufl-${Date.parse(m.date)}-${m.home.slice(0,3)}-${m.away.slice(0,3)}`;
  const scoreH = isNaN(m.scoreHome) ? null : m.scoreHome;
  const scoreA = isNaN(m.scoreAway) ? null : m.scoreAway;
  await pool.query(
    `INSERT INTO calendar (tenant_id, age_group, season, ext_match_id, match_date, home_team, away_team,
                           score_home, score_away, is_our_match, venue, round, tournament, source_url, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'league', 'manual://demo', NOW())
     ON CONFLICT (tenant_id, age_group, ext_match_id) DO UPDATE SET
       score_home = EXCLUDED.score_home, score_away = EXCLUDED.score_away,
       is_our_match = EXCLUDED.is_our_match, fetched_at = NOW()`,
    [tenantSlug, AGE_GROUP, SEASON, extMatchId, m.date, m.home, m.away,
     scoreH, scoreA, isOurMatch, m.venue, m.round],
  );
}

async function upsertStandings(tenantSlug: string) {
  await pool.query(
    `INSERT INTO standings (tenant_id, age_group, season, league_name, source_url, table_data)
     VALUES ($1, $2, $3, $4, 'manual://demo', $5::jsonb)`,
    [tenantSlug, AGE_GROUP, SEASON, TOURNAMENT_NAME,
     JSON.stringify(STANDINGS_TABLE.map((r) => ({
       ...r,
       teamId: null,
       shield: null,
       isOurClub: r.team === (tenantSlug === 'zenit-fk' ? 'Зенит' : 'СШОР Зенит'),
     })))],
  );
  console.log(`  standings snapshot inserted (${STANDINGS_TABLE.length} teams)`);
}

async function upsertCalendarMeta(tenantSlug: string) {
  await pool.query(
    `INSERT INTO calendar_meta (tenant_id, age_group, season, title, parser_hint, sources, fetched_at)
     VALUES ($1, $2, $3, $4, 'manual-seed', '[]'::jsonb, NOW())
     ON CONFLICT (tenant_id, age_group) DO UPDATE SET
       season = EXCLUDED.season, title = EXCLUDED.title, fetched_at = NOW()`,
    [tenantSlug, AGE_GROUP, SEASON, TOURNAMENT_NAME],
  );
}

// ============================================================================
// Main
// ============================================================================

async function cleanupOldSeed() {
  // Удаляем старые 2010 данные (предыдущий seed). Cascade удалит players/calendar/standings.
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    await pool.query(`DELETE FROM teams WHERE id = $1`, [`${slug}-2010`]);
    await pool.query(`DELETE FROM calendar WHERE tenant_id = $1 AND age_group = '2010'`, [slug]);
    await pool.query(`DELETE FROM standings WHERE tenant_id = $1 AND age_group = '2010'`, [slug]);
    await pool.query(`DELETE FROM calendar_meta WHERE tenant_id = $1 AND age_group = '2010'`, [slug]);
  }
  console.log('  → cleaned up old 2010 seed data');
}

async function main() {
  console.log('=== Seeding 2 Zenit tenants ===\n');
  await cleanupOldSeed();

  for (const t of TENANTS) {
    console.log(`Tenant: ${t.slug} (${t.name})`);
    await upsertTenant(t);

    const email = `${t.slug}@avandata.ru`;
    const password = 'demo123456';
    await upsertHeadCoach(t.slug, email, `Тренер ${t.displayName}`, password);

    const teamId = await upsertTeam(t.slug);
    await upsertPlayers(t.slug, teamId);
    await upsertCalendarMeta(t.slug);

    for (const m of [...PAST_MATCHES, ...APRIL_PAST, ...UPCOMING_MATCHES]) {
      await upsertCalendarMatch(t.slug, m, t.ourMatcher, 'ourMatcherExclude' in t ? t.ourMatcherExclude : null);
    }
    console.log(`  ${PAST_MATCHES.length + UPCOMING_MATCHES.length} calendar rows`);

    await upsertStandings(t.slug);
    console.log();
  }

  console.log('=== Done. Credentials: ===');
  for (const t of TENANTS) {
    console.log(`  ${t.slug}@avandata.ru / demo123456 (${t.displayName})`);
  }

  // Random ID for traceability
  console.log(`\nseed batch: ${randomBytes(4).toString('hex')}`);

  await pool.end();
}

main().catch((err) => { console.error('seed failed:', err); process.exit(1); });
