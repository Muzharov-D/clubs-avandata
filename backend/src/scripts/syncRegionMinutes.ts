import 'dotenv/config';
import { pool } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { logger } from '../shared/logger.js';
import {
  isFfspbConfigured, listStandings, listMatches, listTeamPlayers, getMatch,
} from '../services/ffspbApi.js';
import { regionMinutes } from '../db/schema/regionMinutes.js';
import type {
  RegionMinutesBuckets,
  RegionMinutesLeague,
  RegionMinutesPayload,
  RegionMinutesQuarter,
} from '../federation/regionMinutes.js';

/**
 * SYNC карты возможностей региона по игровому времени FFSPB → ОДИН ряд region_minutes.
 *
 * Запускать ЛОКАЛЬНО / где есть доступ к stat.ffspb.org (с Render IP-блок).
 * Живой обход тяжёлый: ~330 ростеров + детали КАЖДОГО матча с составами по 8 турнирам
 * Первенства (минуты каждого игрока из participatedPlayers), несколько минут. Делается
 * ~раз в месяц владельцем. Эндпоинт minutes ЧИТАЕТ последний снимок мгновенно (живой
 * FFSPB на запрос страницы НИКОГДА не дёргается).
 *
 * Алгоритм (порт из .tmp_ffspb_minutes.mjs, числа подтверждены — пул 2872 игрока:
 * не выходят 704/24.5%, погребённые<15% 967/33.7%, медиана ≈46%, Q4 медиана ≈36%):
 *  - реестр игроков из ростеров команд каждого турнира (Первенство 2009–2016);
 *  - минуты игрока в матче из participatedPlayers: bench==0 (старт) играет 0→replaceMin∥end,
 *    замена входит на replaceMin старта через replacedBy; team — ОБЪЕКТ (unwrap .['@id']);
 *  - игровое время% = минуты игрока ÷ суммарные командные минуты (по матчам с составами);
 *  - оцениваем только игроков, у чьих команд есть матчи с составами; пул по всем когортам.
 *
 * Запуск (нужен FFSPB_API_KEY + доступ к FFSPB):
 *   cd backend && npm run sync:region-minutes               # федерация ffspb, сезон 2026
 *   cd backend && npm run sync:region-minutes -- --dry-run  # пул+расчёт БЕЗ записи в БД
 *   cd backend && npx tsx src/scripts/syncRegionMinutes.ts --slug=ffspb --season=2026
 */

// ---- Турниры Первенства сезона 2026 (как в .tmp_ffspb_minutes.mjs) --------
const SEASON = '2026';
const FEDERATION_DEFAULT = 'ffspb';

interface Cohort { tid: number; year: number; label: string }
const COHORTS: Cohort[] = [
  { tid: 44322, year: 2009, label: 'до 18' },
  { tid: 44323, year: 2010, label: 'до 17' },
  { tid: 44324, year: 2011, label: 'до 16' },
  { tid: 44325, year: 2012, label: 'до 15' },
  { tid: 44327, year: 2013, label: 'до 14' },
  { tid: 44329, year: 2014, label: 'до 13' },
  { tid: 44330, year: 2015, label: 'до 12' },
  { tid: 44331, year: 2016, label: 'до 11' },
];

// ---- Лиги Первенства (только Высшая/Первая есть в этих данных) ------------
// Игровое время Первенства живёт только в лигах «Высшая» и «Первая» — других
// (Вторая/Третья/Четвёртая) в этом датасете НЕТ, не выдумываем. byLeague эмитим
// ровно по этим двум; игрок без распознанной лиги в byLeague НЕ попадает (но
// остаётся в региональном пуле).
const MINUTES_LEAGUES = ['Высшая', 'Первая'] as const;
type MinutesLeague = (typeof MINUTES_LEAGUES)[number];

/** Лига из имени группы standings; null, если не Высшая/Первая (в byLeague не идёт). */
function minutesLeagueOf(group: string | null | undefined): MinutesLeague | null {
  const g = (group ?? '').toLowerCase();
  if (/высш/.test(g)) return 'Высшая';
  if (/перв/.test(g)) return 'Первая';
  return null;
}

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

/** Медиана (1 знак для .5-середины), null на пустом. */
function median(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round(((s[m - 1]! + s[m]!) / 2) * 10) / 10;
}

// ---- Формы FFSPB (минимально-типизированы) -------------------------------
interface StandingsGroup {
  groupName?: string;
  teams?: Array<{ team?: { '@id'?: string; id?: number | string } }>;
}
interface RosterPlayer {
  '@id'?: string; id?: number | string;
  birthDate?: unknown; dateOfBirth?: unknown; birthday?: unknown;
}
interface MatchListItem { id?: number | string; '@id'?: string; done?: boolean; resultHost?: unknown }
interface ParticipatedPlayer {
  '@id'?: string;
  bench?: number | string;
  replaceMin?: number | string | null;
  replacedBy?: string | number | null;
  request?: { '@id'?: string } | string | null;
  team?: { '@id'?: string } | string | null;
}
interface MatchDetail {
  participatedPlayers?: ParticipatedPlayer[];
  length?: number | null;
  host?: { '@id'?: string; id?: number | string };
  guest?: { '@id'?: string; id?: number | string };
}

/** Минуты игроков в одном матче из participatedPlayers (выверенный алгоритм из .mjs). */
function matchMinutes(pp: ParticipatedPlayer[], lengthSec: number | null | undefined): {
  Lmin: number;
  res: Array<{ pid: string; team: string | null; minutes: number }>;
} {
  const Lmin = lengthSec && lengthSec > 0 ? lengthSec / 60 : 70;
  const norm = (rm: number | string | null | undefined): number | null =>
    rm == null ? null : Number(rm) > 130 ? Number(rm) / 60 : Number(rm);
  const onMin = new Map<string, number>();
  const offMin = new Map<string, number>();
  for (const p of pp) {
    const id = p['@id'];
    if (id == null) continue;
    if (Number(p.bench) === 0) onMin.set(id, 0);
    const rm = norm(p.replaceMin);
    if (p.replacedBy != null && rm != null) {
      onMin.set(String(p.replacedBy), rm);
      offMin.set(id, rm);
    }
  }
  const res: Array<{ pid: string; team: string | null; minutes: number }> = [];
  for (const p of pp) {
    const id = p['@id'];
    if (id == null) continue;
    const reqIri = typeof p.request === 'object' && p.request != null ? p.request['@id'] : p.request;
    const pid = idOf(reqIri);
    // team — ОБЪЕКТ: unwrap .['@id'] (gotcha из .mjs).
    const teamIri = typeof p.team === 'object' && p.team != null ? p.team['@id'] : p.team;
    const team = idOf(teamIri);
    const on = onMin.get(id);
    let minutes = 0;
    if (on != null) {
      const off = offMin.get(id) ?? Lmin;
      minutes = Math.max(0, Math.min(Lmin, off) - on);
    }
    if (pid) res.push({ pid, team, minutes });
  }
  return { Lmin, res };
}

/** Один оценённый игрок пула: игровое время% + квартал рождения + появление + лига. */
interface PoolRow { pct: number; q: number | null; played: boolean; league: MinutesLeague | null }

// ---- Главный обход -------------------------------------------------------
async function buildPayload(): Promise<RegionMinutesPayload> {
  const pool: PoolRow[] = [];

  for (const c of COHORTS) {
    const t0 = Date.now();

    // 1) команды турнира из standings (+ лига команды из имени группы).
    let teams: number[] = [];
    const teamLeague = new Map<number, MinutesLeague | null>();
    try {
      const groups = (await listStandings(c.tid)) as StandingsGroup[];
      for (const g of groups) {
        const lg = minutesLeagueOf(g.groupName);
        for (const tm of g.teams ?? []) {
          const id = idOf(tm.team?.['@id']) ?? (tm.team?.id != null ? String(tm.team.id) : null);
          if (id) { teams.push(Number(id)); teamLeague.set(Number(id), lg); }
        }
      }
    } catch (e) {
      logger.error({ year: c.year, err: e instanceof Error ? e.message : String(e) }, 'standings ERR');
    }
    teams = [...new Set(teams)];

    // 2) ростеры → реестр игроков + DOB + клуб (команда) + лига (через команду).
    const dob = new Map<string, unknown>();
    const pteam = new Map<string, number>();
    const pleague = new Map<string, MinutesLeague | null>();
    const registry = new Set<string>();
    const rosters = await pmap(teams, 6, async (tid) => ({
      tid,
      ps: (await listTeamPlayers(tid)) as RosterPlayer[],
    }));
    for (const r of rosters) {
      if (!r) continue;
      for (const p of r.ps) {
        const pid = idOf(p['@id']) ?? (p.id != null ? String(p.id) : null);
        if (!pid) continue;
        registry.add(pid);
        pteam.set(pid, r.tid);
        pleague.set(pid, teamLeague.get(r.tid) ?? null);
        dob.set(pid, p.birthDate ?? p.dateOfBirth ?? p.birthday ?? null);
      }
    }

    // 3) сыгранные матчи → детали с составами → минуты + командная доступность.
    let matchList: MatchListItem[] = [];
    try {
      matchList = (await listMatches(c.tid)) as MatchListItem[];
    } catch (e) {
      logger.error({ year: c.year, err: e instanceof Error ? e.message : String(e) }, 'matches ERR');
    }
    const played = matchList.filter((m) => m.done === true || m.resultHost != null);
    const minutes = new Map<string, number>();
    const apps = new Map<string, number>();
    const teamAvail = new Map<string, number>();
    let withLineups = 0;
    const details = await pmap(played, 8, async (m) => {
      const id = m.id ?? idOf(m['@id']);
      try { return (await getMatch(id!)) as MatchDetail; } catch { return null; }
    });
    for (const d of details) {
      if (!d) continue;
      const pp = d.participatedPlayers ?? [];
      if (!pp.length) continue;
      withLineups++;
      const { Lmin, res } = matchMinutes(pp, d.length);
      for (const r of res) {
        minutes.set(r.pid, (minutes.get(r.pid) ?? 0) + r.minutes);
        if (r.minutes > 0) apps.set(r.pid, (apps.get(r.pid) ?? 0) + 1);
      }
      // Командная доступность: длина матча добавляется хозяину и гостю (по разу за матч).
      const hid = idOf(d.host?.['@id']) ?? (d.host?.id != null ? String(d.host.id) : null);
      const gid = idOf(d.guest?.['@id']) ?? (d.guest?.id != null ? String(d.guest.id) : null);
      if (hid) teamAvail.set(hid, (teamAvail.get(hid) ?? 0) + Lmin);
      if (gid) teamAvail.set(gid, (teamAvail.get(gid) ?? 0) + Lmin);
    }

    // 4) классификация по реестру → пул.
    let evaluated = 0;
    for (const pid of registry) {
      const tid = pteam.get(pid);
      const avail = teamAvail.get(String(tid)) ?? 0;
      if (avail <= 0) continue; // у команды нет матчей с составами → не оцениваем
      evaluated++;
      const mins = minutes.get(pid) ?? 0;
      const pct = Math.round((mins / avail) * 1000) / 10;
      const q = quarterOf(dob.get(pid));
      pool.push({ pct, q, played: (apps.get(pid) ?? 0) > 0, league: pleague.get(pid) ?? null });
    }

    logger.info(
      { year: c.year, label: c.label, registry: registry.size, withLineups, played: played.length, evaluated },
      `[${c.year}] ${c.label}: реестр ${registry.size} · составы ${withLineups}/${played.length} · оценено ${evaluated} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }

  // ---- Пул по всем когортам ------------------------------------------------
  const region = aggregatePool(pool);

  const byQuarter: RegionMinutesQuarter[] = [1, 2, 3, 4].map((q) => {
    const rows = pool.filter((p) => p.q === q);
    const buried = rows.filter((p) => p.pct < 15).length;
    return {
      q,
      medianTime: median(rows.map((p) => p.pct)) ?? 0,
      buriedPct: rows.length ? Math.round((buried / rows.length) * 1000) / 10 : 0,
    };
  });

  // По лигам Первенства — РОВНО Высшая и Первая (других в данных нет). Та же форма
  // агрегата; берём только игроков с распознанной лигой (resolvable-only) — игрок без
  // лиги не выдумывается, поэтому Σ evaluated по лигам ≤ региональному evaluated.
  const byLeague: RegionMinutesLeague[] = MINUTES_LEAGUES
    .map((lg) => ({ league: lg as string, ...aggregatePool(pool.filter((p) => p.league === lg)) }))
    .filter((l) => l.evaluated > 0);

  return {
    season: SEASON,
    ...region,
    byQuarter,
    byLeague,
  };
}

/**
 * Региональный/лиговой агрегат игрового времени из набора оценённых игроков.
 * Та же форма для региона и для каждой лиги (evaluated, neverPlayed%, buried<15%%,
 * медиана, бакеты). Проценты — от evaluated этого набора (1 знак).
 */
function aggregatePool(rows: PoolRow[]): {
  evaluated: number;
  neverPlayed: number;
  neverPlayedPct: number;
  buried15: number;
  buried15Pct: number;
  medianTime: number;
  buckets: RegionMinutesBuckets;
} {
  const evaluated = rows.length;
  const neverPlayed = rows.filter((p) => !p.played).length;
  const buried15 = rows.filter((p) => p.pct < 15).length;
  const pct1 = (n: number): number => (evaluated ? Math.round((n / evaluated) * 1000) / 10 : 0);

  const buckets: RegionMinutesBuckets = {
    zero: pct1(rows.filter((p) => p.pct <= 0).length),
    b0_15: pct1(rows.filter((p) => p.pct > 0 && p.pct < 15).length),
    b15_30: pct1(rows.filter((p) => p.pct >= 15 && p.pct < 30).length),
    b30_50: pct1(rows.filter((p) => p.pct >= 30 && p.pct < 50).length),
    over50: pct1(rows.filter((p) => p.pct >= 50).length),
  };

  return {
    evaluated,
    neverPlayed,
    neverPlayedPct: pct1(neverPlayed),
    buried15,
    buried15Pct: pct1(buried15),
    medianTime: median(rows.map((p) => p.pct)) ?? 0,
    buckets,
  };
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

  logger.info({ federationSlug, season }, '=== карта возможностей региона по игровому времени FFSPB ===');

  const dryRun = process.argv.includes('--dry-run');
  const payload = await buildPayload();

  // INSERT-only история — один ряд на запуск (region_minutes, bypass-RLS).
  // --dry-run: полный пул FFSPB + расчёт, но БЕЗ записи в БД — проверка пула и чисел
  // без прод-записи (БД не трогается вообще).
  if (dryRun) {
    logger.warn('DRY-RUN: запись в region_minutes пропущена');
  } else {
    await withBypassRLS((tx) =>
      tx.insert(regionMinutes).values({ federationSlug, season, payload }),
    );
  }

  // Концизная сводка пула.
  const b = payload.buckets;
  logger.info(
    { evaluated: payload.evaluated, neverPlayed: payload.neverPlayed, buried15: payload.buried15, medianTime: payload.medianTime },
    `ПУЛ: оценено ${payload.evaluated} · не выходят ${payload.neverPlayed} (${payload.neverPlayedPct}%) · погребённые<15% ${payload.buried15} (${payload.buried15Pct}%) · медиана ${payload.medianTime}%`,
  );
  logger.info(
    { zero: b.zero, b0_15: b.b0_15, b15_30: b.b15_30, b30_50: b.b30_50, over50: b.over50 },
    `БАКЕТЫ: 0% ${b.zero} · 0–15 ${b.b0_15} · 15–30 ${b.b15_30} · 30–50 ${b.b30_50} · ≥50 ${b.over50}`,
  );
  for (const q of payload.byQuarter) {
    logger.info({ q: q.q, medianTime: q.medianTime, buriedPct: q.buriedPct }, `Q${q.q}: медиана ${q.medianTime}% · погребённые ${q.buriedPct}%`);
  }
  for (const l of payload.byLeague ?? []) {
    logger.info(
      { league: l.league, evaluated: l.evaluated, neverPlayedPct: l.neverPlayedPct, buried15Pct: l.buried15Pct, medianTime: l.medianTime, over50: l.buckets.over50 },
      `ЛИГА ${l.league}: оценено ${l.evaluated} · не выходят ${l.neverPlayedPct}% · погребённые<15% ${l.buried15Pct}% · медиана ${l.medianTime}% · ≥50% ${l.buckets.over50}%`,
    );
  }
  logger.info({ federationSlug, season, dryRun }, dryRun ? '✓ DRY-RUN завершён (без записи)' : '✓ снимок region_minutes записан');

  await pool.end();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'syncRegionMinutes упал');
  process.exit(1);
});
