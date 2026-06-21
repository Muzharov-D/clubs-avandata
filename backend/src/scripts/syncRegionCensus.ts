import 'dotenv/config';
import { pool } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { logger } from '../shared/logger.js';
import { isFfspbConfigured, listStandings, listMatches, listTeamPlayers } from '../services/ffspbApi.js';
import { regionCensus } from '../db/schema/regionCensus.js';
import type {
  RegionPyramidLeague,
  RegionPyramidPayload,
  RegionPyramidTotals,
} from '../federation/regionCensus.js';

/**
 * SYNC переписи региона по «пирамиде лиг» FFSPB → ОДИН ряд region_census.
 *
 * Запускать ЛОКАЛЬНО / где есть доступ к stat.ffspb.org (с Render IP-блок).
 * Живой обход тяжёлый: ~330 ростеров + таблицы + матчи по 15 турнирам сезона 2026,
 * несколько минут. Делается ~раз в месяц владельцем. Эндпоинт region-map ЧИТАЕТ
 * последний снимок мгновенно (живой FFSPB на запрос страницы НИКОГДА не дёргается).
 *
 * Алгоритм (порт из .tmp_ffspb_byleague.mjs, числа подтверждены):
 *  - лига берётся из имени группы standings (Высшая…Четвёртая; «Группа X» → Прочие);
 *  - каждая команда → своя лига; игрок назначается в ВЫСШУЮ лигу, где встречается;
 *  - игроки дедуплятся по id глобально; клубы — по нормализованному имени;
 *  - квартал рождения из birthDate; перекос лиги = Q1÷Q4.
 *
 * Запуск (нужен FFSPB_API_KEY + доступ к FFSPB):
 *   cd backend && npm run sync:region-census            # федерация ffspb, сезон 2026
 *   cd backend && npm run sync:region-census -- --dry-run  # пул+расчёт БЕЗ записи в БД
 *   cd backend && npx tsx src/scripts/syncRegionCensus.ts --slug=ffspb --season=2026
 */

// ---- Турниры сезона 2026 (как в .tmp_ffspb_byleague.mjs) -----------------
const SEASON = '2026';
const FEDERATION_DEFAULT = 'ffspb';

interface TournSpec { tid: number; year: number; tier: 'Первенство' | 'Турнир' }
const TOURN: TournSpec[] = [
  { tid: 44322, year: 2009, tier: 'Первенство' }, { tid: 44323, year: 2010, tier: 'Первенство' },
  { tid: 44324, year: 2011, tier: 'Первенство' }, { tid: 44325, year: 2012, tier: 'Первенство' },
  { tid: 44327, year: 2013, tier: 'Первенство' }, { tid: 44329, year: 2014, tier: 'Первенство' },
  { tid: 44330, year: 2015, tier: 'Первенство' }, { tid: 44331, year: 2016, tier: 'Первенство' },
  { tid: 44333, year: 2010, tier: 'Турнир' }, { tid: 44334, year: 2011, tier: 'Турнир' },
  { tid: 44335, year: 2012, tier: 'Турнир' }, { tid: 44336, year: 2013, tier: 'Турнир' },
  { tid: 44337, year: 2014, tier: 'Турнир' }, { tid: 44338, year: 2015, tier: 'Турнир' },
  { tid: 44339, year: 2016, tier: 'Турнир' },
];

type League = 'Высшая' | 'Первая' | 'Вторая' | 'Третья' | 'Четвёртая' | 'Прочие группы';
const ORDER: League[] = ['Высшая', 'Первая', 'Вторая', 'Третья', 'Четвёртая', 'Прочие группы'];
const RANK: Record<League, number> = {
  'Высшая': 1, 'Первая': 2, 'Вторая': 3, 'Третья': 4, 'Четвёртая': 5, 'Прочие группы': 6,
};

// ---- Помощники (порт из .mjs) -------------------------------------------
function idOf(iri: unknown): string | null {
  if (iri == null) return null;
  return String(iri).match(/\d+$/)?.[0] ?? null;
}

function quarterOf(b: unknown): number | null {
  if (b == null) return null;
  const d = typeof b === 'number' ? new Date(b < 1e12 ? b * 1000 : b) : new Date(String(b));
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getUTCMonth() / 3) + 1;
}

function normClub(n: string | null | undefined): string {
  return (n ?? '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\bфк\b/g, '')
    .replace(/\s*20\d{2}\b.*$/, '')
    .replace(/-спб|санкт-петербург/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function leagueOf(group: string | null | undefined): League {
  const g = (group ?? '').toLowerCase();
  if (/высш/.test(g)) return 'Высшая';
  if (/перв/.test(g)) return 'Первая';
  if (/втор/.test(g)) return 'Вторая';
  if (/трет/.test(g)) return 'Третья';
  if (/четв/.test(g)) return 'Четвёртая';
  return 'Прочие группы';
}

/** Ограниченный параллелизм (как pmap в .mjs): сбои элемента → null, не валят весь обход. */
async function pmap<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try { out[k] = await fn(items[k]!); } catch { out[k] = null; }
      }
    }),
  );
  return out;
}

// ---- Формы FFSPB (минимально-типизированы) -------------------------------
interface StandingsGroup {
  groupName?: string;
  teams?: Array<{ team?: { '@id'?: string; id?: number | string; name?: string }; teamName?: string }>;
}
interface RosterPlayer {
  '@id'?: string; id?: number | string;
  birthDate?: unknown; dateOfBirth?: unknown; birthday?: unknown;
}

// ---- Главный обход -------------------------------------------------------
async function buildPayload(): Promise<RegionPyramidPayload> {
  // 1) Команды с лигой по всем турнирам + матчи на тир.
  const teamLeague = new Map<string, { league: League; name: string }>();
  const tierMatches: RegionPyramidTotals['tierMatches'] = { 'Первенство': 0, 'Турнир': 0 };

  for (const t of TOURN) {
    try {
      const groups = (await listStandings(t.tid)) as StandingsGroup[];
      for (const g of groups) {
        const lg = leagueOf(g.groupName);
        for (const tm of g.teams ?? []) {
          const id = idOf(tm.team?.['@id']) ?? (tm.team?.id != null ? String(tm.team.id) : null);
          if (!id) continue;
          const name = (tm.teamName ?? tm.team?.name ?? '').trim();
          const prev = teamLeague.get(id);
          if (!prev || RANK[lg] < RANK[prev.league]) teamLeague.set(id, { league: lg, name });
        }
      }
    } catch (e) {
      logger.error({ tid: t.tid, err: e instanceof Error ? e.message : String(e) }, 'standings ERR');
    }
    try {
      tierMatches[t.tier] += ((await listMatches(t.tid)) as unknown[]).length;
    } catch (e) {
      logger.error({ tid: t.tid, err: e instanceof Error ? e.message : String(e) }, 'matches ERR');
    }
    logger.info({ tier: t.tier, year: t.year, tid: t.tid }, 'просканирован турнир');
  }

  // 2) Ростеры по уникальным командам → игроки с дедупом, назначаем в высшую лигу.
  const teams = [...teamLeague.entries()].map(([id, v]) => ({ id, ...v }));
  const player = new Map<string, { league: League; dob: unknown }>();
  const rosters = await pmap(teams, 6, async (tm) => ({
    tm,
    ps: (await listTeamPlayers(tm.id)) as RosterPlayer[],
  }));
  for (const r of rosters) {
    if (!r) continue;
    for (const p of r.ps) {
      const pid = idOf(p['@id']) ?? (p.id != null ? String(p.id) : null);
      if (!pid) continue;
      const dob = p.birthDate ?? p.dateOfBirth ?? p.birthday ?? null;
      const prev = player.get(pid);
      if (!prev || RANK[r.tm.league] < RANK[prev.league]) {
        player.set(pid, { league: r.tm.league, dob: dob ?? prev?.dob ?? null });
      }
    }
  }

  // 3) Агрегаты по лигам (дедуп).
  const byLeague: Record<League, { teams: number; clubs: Set<string>; players: number; q: { 1: number; 2: number; 3: number; 4: number; u: number } }> =
    Object.fromEntries(
      ORDER.map((lg) => [lg, { teams: 0, clubs: new Set<string>(), players: 0, q: { 1: 0, 2: 0, 3: 0, 4: 0, u: 0 } }]),
    ) as typeof byLeague;

  for (const tm of teams) { byLeague[tm.league].teams++; byLeague[tm.league].clubs.add(normClub(tm.name)); }
  const regionClubs = new Set<string>();
  for (const tm of teams) regionClubs.add(normClub(tm.name));

  const regionQ = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const { league, dob } of player.values()) {
    const b = byLeague[league];
    b.players++;
    const q = quarterOf(dob);
    if (q) { b.q[q as 1 | 2 | 3 | 4]++; regionQ[q as 1 | 2 | 3 | 4]++; }
    else b.q.u++;
  }

  const leagues: RegionPyramidLeague[] = ORDER
    .filter((lg) => byLeague[lg].teams > 0)
    .map((lg) => {
      const b = byLeague[lg];
      const known = b.q[1] + b.q[2] + b.q[3] + b.q[4];
      return {
        league: lg,
        teams: b.teams,
        clubs: b.clubs.size,
        players: b.players,
        q1pct: known ? Math.round((b.q[1] / known) * 1000) / 10 : 0,
        q2pct: known ? Math.round((b.q[2] / known) * 1000) / 10 : 0,
        q3pct: known ? Math.round((b.q[3] / known) * 1000) / 10 : 0,
        q4pct: known ? Math.round((b.q[4] / known) * 1000) / 10 : 0,
        skew: b.q[4] > 0 ? Math.round((b.q[1] / b.q[4]) * 100) / 100 : null,
      };
    });

  const knownR = regionQ[1] + regionQ[2] + regionQ[3] + regionQ[4];
  const totals: RegionPyramidTotals = {
    playersDistinct: player.size,
    teamsTotal: teams.length,
    clubsDistinct: regionClubs.size,
    matches: tierMatches['Первенство'] + tierMatches['Турнир'],
    tierMatches,
    q: regionQ,
    q1pct: knownR ? Math.round((regionQ[1] / knownR) * 1000) / 10 : 0,
    q4pct: knownR ? Math.round((regionQ[4] / knownR) * 1000) / 10 : 0,
  };

  return { season: SEASON, leagues, totals };
}

// ---- CLI -----------------------------------------------------------------
function arg(name: string): string | undefined {
  const pre = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pre));
  return hit ? hit.slice(pre.length) : undefined;
}

async function main() {
  if (!isFfspbConfigured()) { logger.error('FFSPB_API_KEY не задан в .env'); process.exit(1); }
  const federationSlug = arg('slug') ?? FEDERATION_DEFAULT;
  const season = Number(arg('season')) || Number(SEASON);

  logger.info({ federationSlug, season }, '=== перепись региона по пирамиде лиг FFSPB ===');

  const dryRun = process.argv.includes('--dry-run');
  const payload = await buildPayload();

  // INSERT-only история — один ряд на запуск (region_census, bypass-RLS).
  // --dry-run: полный пул FFSPB + расчёт, но БЕЗ записи в БД — проверка пула и чисел
  // без прод-записи (БД не трогается вообще).
  if (dryRun) {
    logger.warn('DRY-RUN: запись в region_census пропущена');
  } else {
    await withBypassRLS((tx) =>
      tx.insert(regionCensus).values({ federationSlug, season, payload }),
    );
  }

  // Концизный лог per-league + регион.
  logger.info('=== ПО ЛИГАМ (дедуп) ===');
  for (const l of payload.leagues) {
    logger.info(
      { league: l.league, teams: l.teams, clubs: l.clubs, players: l.players, q4pct: l.q4pct, skew: l.skew },
      `${l.league}: команд ${l.teams} · клубов ${l.clubs} · игроков ${l.players} · Q4 ${l.q4pct}% · перекос ${l.skew ?? '—'}×`,
    );
  }
  const t = payload.totals;
  logger.info(
    { playersDistinct: t.playersDistinct, teamsTotal: t.teamsTotal, clubsDistinct: t.clubsDistinct, matches: t.matches },
    `РЕГИОН (дедуп): игроков ${t.playersDistinct} · команд ${t.teamsTotal} · клубов ${t.clubsDistinct} · матчей ${t.matches} | Q1 ${t.q1pct}% Q4 ${t.q4pct}%`,
  );
  logger.info({ federationSlug, season, dryRun }, dryRun ? '✓ DRY-RUN завершён (без записи)' : '✓ снимок region_census записан');

  await pool.end();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'syncRegionCensus упал');
  process.exit(1);
});
