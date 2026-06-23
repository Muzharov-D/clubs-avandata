import 'dotenv/config';
import { pool } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { logger } from '../shared/logger.js';
import { isFfspbConfigured, listStandings, listMatches, listTeamPlayers } from '../services/ffspbApi.js';
import { regionCensus } from '../db/schema/regionCensus.js';
import type {
  RegionAgeCohort,
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
  // КОНСЕРВАТИВНАЯ нормализация имени клуба: схлопывает фарм-/филиал-команды ОДНОГО клуба
  // в один клуб, но НИКОГДА не сливает два разных клуба. Снимаем только однозначные
  // суффиксы дубль-составов и географических филиалов; базовое имя клуба не трогаем.
  // ВАЖНО: после этого per-league счётчики клубов ЗАКОННО суммируются БОЛЬШЕ, чем тотал
  // региона (один клуб выставляет команды в несколько лиг) — это корректная семантика
  // регулятора, НЕ баг; не пытаться свести суммы.
  let s = (n ?? '')
    .toLowerCase()
    .replace(/["'«»]/g, '')
    // Скобочная приписка-программа «(Олимпийские надежды)» — не имя клуба (как в normTeam):
    // иначе «Звезда (Олимпийские надежды)» ≠ «ФК Звезда 2012» → клуб двоился в счёте.
    .replace(/\([^)]*\)/g, ' ')
    // JS `\b` — только ASCII, для кириллицы no-op (старое `\bфк\b` не срабатывало →
    // «ФК Зенит» ≠ «Зенит», счёт клубов раздувался). Снимаем тип-токены клуба как
    // отдельные слова (по краю/пробелу), а не подстроки: фикс корня «кривого счёта».
    .replace(/(?:^|\s)(?:фк|ооо|ао)(?=\s|$)/gu, ' ')
    .replace(/\s*20\d{2}\b.*$/, '')
    .replace(/-спб|санкт-петербург/g, '')
    // Дефис↔пробел (как в normTeam): «Алмаз-Антей» = «Алмаз Антей», «Кировец-Восхождение» =
    // «Кировец Восхождение». ПОСЛЕ снятия «-спб»/«санкт-петербург» (им нужен дефис).
    .replace(/[-–—]/g, ' ');
  // Снимаем хвостовые суффиксы итеративно (имя может нести и индекс, и филиал):
  //  - индекс дубль-состава: «-2…-5» / «-II…-V» (римские) на конце;
  //  - географический филиал: «-север/центр/юг/восток/запад» (и через дефис, и словом);
  //  - залётный 2-значный суффикс вроде «-84».
  // Якорим на конце строки и только после дефиса/пробела — «-2» отрезаем, но «зенит-2009»
  // уже срезан годом выше, а «динамо» / «спартак-2» → «спартак». Один разряд («-2»), не
  // «-22», чтобы не задеть номерные имена; 2-значный хвост ловим отдельным правилом «-84».
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(/[\s-](?:[2-5]|i{2,3}|iv|v)$/u, '')
      .replace(/[\s-](?:север|центр|юг|восток|запад)$/u, '')
      .replace(/[\s-]\d{2}$/u, '');
  } while (s !== prev);
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Самопроверка normClub перед тяжёлым обходом. Защищаем корень «кривого счёта клубов»:
 * «ФК» снимается как ОТДЕЛЬНЫЙ токен (префикс/суффикс), но НЕ как подстрока внутри слова.
 * Старое `\bфк\b` было no-op (JS `\b` — только ASCII, кириллицу не знает) → счёт клубов
 * раздувался. Если правило normClub когда-нибудь регрессирует, валимся ДО обхода FFSPB.
 */
function assertNormClub(): void {
  const cases: Array<[string, string]> = [
    ['ФК Зенит', 'зенит'],   // префикс «ФК» снимается
    ['Зенит ФК', 'зенит'],   // суффикс «ФК» снимается
    ['Зенитфк', 'зенитфк'],  // НЕ отдельный токен — «фк» остаётся (не режем подстроку)
    // Дефис↔пробел: один клуб не должен расщепляться на 2 ключа (раздувало счёт КЛУБЫ).
    ['Алмаз-Антей', 'алмаз антей'],
    ['Алмаз Антей 2012', 'алмаз антей'],
    ['СШ Кировец-Восхождение', 'сш кировец восхождение'],
    ['СШ Кировец Восхождение', 'сш кировец восхождение'],
    ['Московская застава - Кристалл', 'московская застава кристалл'],
    ['Московская застава-Кристалл 2012', 'московская застава кристалл'],
    // Скобочная программа снимается (= без неё).
    ['Звезда (Олимпийские надежды)', 'звезда'],
    ['ФК Звезда 2012', 'звезда'],
    // СШ/СШОР НЕ схлопываем с базовым клубом — разные школы.
    ['СШОР Зенит', 'сшор зенит'],
  ];
  for (const [input, expected] of cases) {
    const got = normClub(input);
    if (got !== expected) {
      throw new Error(
        `normClub самопроверка провалена: normClub(${JSON.stringify(input)}) = ` +
        `${JSON.stringify(got)}, ожидалось ${JSON.stringify(expected)}`,
      );
    }
  }
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
interface MatchListItem {
  id?: number | string; '@id'?: string;
  host?: { '@id'?: string; id?: number | string } | string | null;
  guest?: { '@id'?: string; id?: number | string } | string | null;
}

// ---- Главный обход -------------------------------------------------------
async function buildPayload(): Promise<RegionPyramidPayload> {
  // 1) Команды с лигой по всем турнирам + матчи на тир.
  const teamLeague = new Map<string, { league: League; name: string; year: number }>();
  const tierMatches: RegionPyramidTotals['tierMatches'] = { 'Первенство': 0, 'Турнир': 0 };
  // Сырые матчи всех турниров (id + команды) — лигу резолвим ВТОРЫМ проходом, когда
  // teamLeague финализирован (лига команды могла подняться в более позднем турнире).
  const matchRows: Array<{ mid: string; host: string | null; guest: string | null }> = [];
  const teamIdOf = (t: { '@id'?: string; id?: number | string } | string | null | undefined): string | null => {
    if (t == null) return null;
    if (typeof t === 'string') return idOf(t);
    return idOf(t['@id']) ?? (t.id != null ? String(t.id) : null);
  };

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
          // Когорта (год рождения) команды берётся из турнира; при апгрейде лиги год тоже освежаем.
          if (!prev || RANK[lg] < RANK[prev.league]) teamLeague.set(id, { league: lg, name, year: t.year });
        }
      }
    } catch (e) {
      logger.error({ tid: t.tid, err: e instanceof Error ? e.message : String(e) }, 'standings ERR');
    }
    try {
      const matches = (await listMatches(t.tid)) as MatchListItem[];
      tierMatches[t.tier] += matches.length;
      for (const m of matches) {
        const mid = idOf(m['@id']) ?? (m.id != null ? String(m.id) : null);
        if (!mid) continue;
        matchRows.push({ mid, host: teamIdOf(m.host), guest: teamIdOf(m.guest) });
      }
    } catch (e) {
      logger.error({ tid: t.tid, err: e instanceof Error ? e.message : String(e) }, 'matches ERR');
    }
    logger.info({ tier: t.tier, year: t.year, tid: t.tid }, 'просканирован турнир');
  }

  // 2) Ростеры по уникальным командам → игроки с дедупом, назначаем в высшую лигу.
  const teams = [...teamLeague.entries()].map(([id, v]) => ({ id, ...v }));
  const player = new Map<string, { league: League; dob: unknown; year: number }>();
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
      // Игрок назначается в ВЫСШУЮ лигу появления; когорта (год) берётся из той же команды.
      if (!prev || RANK[r.tm.league] < RANK[prev.league]) {
        player.set(pid, { league: r.tm.league, dob: dob ?? prev?.dob ?? null, year: r.tm.year });
      }
    }
  }

  // 3) Агрегаты по лигам (дедуп).
  const byLeague: Record<League, { teams: number; clubs: Set<string>; players: number; matches: Set<string>; q: { 1: number; 2: number; 3: number; 4: number; u: number } }> =
    Object.fromEntries(
      ORDER.map((lg) => [lg, { teams: 0, clubs: new Set<string>(), players: 0, matches: new Set<string>(), q: { 1: 0, 2: 0, 3: 0, 4: 0, u: 0 } }]),
    ) as typeof byLeague;

  for (const tm of teams) { byLeague[tm.league].teams++; byLeague[tm.league].clubs.add(normClub(tm.name)); }
  const regionClubs = new Set<string>();
  for (const tm of teams) regionClubs.add(normClub(tm.name));

  // Матчи по лигам: лига матча = лига его команд (host, затем guest) из финального
  // teamLeague. Матч без распознанной команды (нет в standings) в per-league НЕ
  // попадает (не выдумываем лигу), но он уже посчитан в tierMatches/totals.matches.
  // Set по mid дедуплит, если матч пришёл в нескольких турнирах.
  for (const m of matchRows) {
    const lg = (m.host && teamLeague.get(m.host)?.league) || (m.guest && teamLeague.get(m.guest)?.league);
    if (lg) byLeague[lg].matches.add(m.mid);
  }

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
        matches: b.matches.size,
        q1pct: known ? Math.round((b.q[1] / known) * 1000) / 10 : 0,
        q2pct: known ? Math.round((b.q[2] / known) * 1000) / 10 : 0,
        q3pct: known ? Math.round((b.q[3] / known) * 1000) / 10 : 0,
        q4pct: known ? Math.round((b.q[4] / known) * 1000) / 10 : 0,
        skew: b.q[4] > 0 ? Math.round((b.q[1] / b.q[4]) * 100) / 100 : null,
      };
    });

  // Диагностика счёта КЛУБЫ: печатаем УНИКАЛЬНЫЕ normClub-ключи по каждой лиге. Если счёт
  // расходится с ожиданием (Высшая 8, Первая 8), в логе сразу видно, какой клуб расщепился
  // на 2 ключа (вариант имени) — чинить точечно в normClub, а не гадать.
  for (const lg of ORDER) {
    const keys = [...byLeague[lg].clubs].sort();
    if (keys.length > 0) logger.info({ league: lg, count: keys.length, clubs: keys }, `[census] ${lg}: клубов ${keys.length} → ${keys.join(', ')}`);
  }

  // 3b) Перекос даты рождения по когортам Первенства (= лиги Высшая+Первая),
  // сгруппированный по году рождения. Тот же дедуп-снимок игроков, нового пула нет.
  const PERVENSTVO: League[] = ['Высшая', 'Первая'];
  const cohort = new Map<number, { players: number; q: { 1: number; 2: number; 3: number; 4: number } }>();
  for (const { league, dob, year } of player.values()) {
    if (!PERVENSTVO.includes(league)) continue;
    let c = cohort.get(year);
    if (!c) { c = { players: 0, q: { 1: 0, 2: 0, 3: 0, 4: 0 } }; cohort.set(year, c); }
    c.players++;
    const q = quarterOf(dob);
    if (q) c.q[q as 1 | 2 | 3 | 4]++;
  }
  const ageEffect: RegionAgeCohort[] = [];
  for (let year = 2009; year <= 2016; year++) {
    const c = cohort.get(year);
    if (!c) continue;
    const known = c.q[1] + c.q[2] + c.q[3] + c.q[4];
    ageEffect.push({
      year,
      players: c.players,
      q1pct: known ? Math.round((c.q[1] / known) * 1000) / 10 : 0,
      q4pct: known ? Math.round((c.q[4] / known) * 1000) / 10 : 0,
      skew: c.q[4] > 0 ? Math.round((c.q[1] / c.q[4]) * 100) / 100 : null,
    });
  }

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

  return { season: SEASON, leagues, totals, ageEffect };
}

// ---- CLI -----------------------------------------------------------------
function arg(name: string): string | undefined {
  const pre = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pre));
  return hit ? hit.slice(pre.length) : undefined;
}

async function main() {
  assertNormClub(); // fail-fast: ловим регрессию дедупа клубов ДО многоминутного обхода FFSPB
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
      { league: l.league, teams: l.teams, clubs: l.clubs, players: l.players, matches: l.matches, q4pct: l.q4pct, skew: l.skew },
      `${l.league}: команд ${l.teams} · клубов ${l.clubs} · игроков ${l.players} · матчей ${l.matches} · Q4 ${l.q4pct}% · перекос ${l.skew ?? '—'}×`,
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
