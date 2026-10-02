/**
 * Показатели (36 типов событий AvanData) относительно лиги — максимальная глубина, какую
 * дают наши данные. События всех команд когорты грузятся по командам (`/events?teamForTournamentId`)
 * и складываются в профили «за матч»: у игрока — действия на матч против игроков того же амплуа
 * в дивизионе (перцентиль и среднее), у команды — действия на матч против команд дивизиона.
 *
 * Тяжёлое (сотни страниц по когорте), поэтому: кэш в памяти на часы, сборка фоном по когортам
 * последовательно, вызывающий получает «ещё считается», пока когорта не готова.
 */
import { authedGet, getEventTypes, type AvEventType, type AvEvent } from '../services/avandataApi.js';
export type { CohortMetrics };
import { listTournaments, regionPlayers, cached, TTL, clubName, type RegionPlayer } from './avandataSource.js';
import { getMatches } from '../services/avandataApi.js';
import { normTeam } from './teamName.js';
import { classifyDivision, type DivisionKey } from './division.js';
import { lineOf, type HoldingXi } from './holdings.js';
import { logger } from '../shared/logger.js';
import { metricInfo, type MetricGroup } from './metricsGlossary.js';
import { positionGroup, normGroup, type PositionGroup } from './positionGroups.js';
import { eq } from 'drizzle-orm';
import { withBypassRLS } from '../db/tenantContext.js';
import { holdingCohortCache } from '../db/schema/holding.js';

type Line = HoldingXi['line'];
const METRICS_TTL = 6 * 60 * 60 * 1000;   // события меняются раз в неделю — держим 6 часов
const HIDDEN_TYPES = new Set(['playerEnter', 'replacement', 'swap']); // технические события

/** Показатель для интерфейса: название и описание — из глоссария; вес события остаётся на сервере (weight не отдаём). */
export interface MetricDef { id: string; title: string; short: string; description: string; category: MetricGroup; polarity: 1 | -1; weight: number }
export interface PlayerMetricRow {
  id: string; title: string; short: string; description: string; category: MetricGroup; polarity: 1 | -1;
  count: number; perMatch: number;
  /** Среднее «за матч» у игроков того же амплуа в дивизионе и в регионе (когорта). */
  lineAvgDiv: number | null; lineAvgRegion: number | null;
  /** Перцентиль в дивизионе среди амплуа: доля игроков с меньшим значением (0–100); для «минусовых» событий инвертирован. */
  pctileDiv: number | null; peersDiv: number;
}
export interface TeamMetricRow {
  id: string; title: string; short: string; description: string; category: MetricGroup; polarity: 1 | -1;
  perMatch: number; divAvg: number | null; rankDiv: number | null; sizeDiv: number;
}
export interface PlayerMetricsVsLeague { playerId: number; matches: number; line: Line | null; group: PositionGroup | null; division: string; rows: PlayerMetricRow[]; asOf: string }
export interface TeamMetricsVsLeague { teamKey: string; matches: number; division: string; rows: TeamMetricRow[]; asOf: string }

interface PlayerAgg { matches: Set<number>; counts: Map<string, number>; points: number; teamId: number }
/** Игрок в одном матче: события, очки (всего / атака / оборона), время первого и последнего действия. */
export interface PlayerMatch { counts: Map<string, number>; points: number; attack: number; defence: number; teamId: number; first: number; last: number }
/** Матч на видео: начало и конец игровых событий и перерыв (самая длинная пауза > 5 мин). */
export interface MatchSpan { start: number; end: number; gapA: number | null; gapB: number | null }
interface TeamAgg { matches: Set<number>; counts: Map<string, number>; name: string; division: string; divKey: DivisionKey | null }
interface CohortMetrics {
  year: number; asOf: string;
  players: Map<number, PlayerAgg>;
  teams: Map<number, TeamAgg>;
  /** Линия и дивизион игрока (по regionPlayers). */
  lineOfPlayer: Map<number, Line | null>;
  /** Группа позиции (с кем сравнивать): ЦЗ, крайние, опорные, атакующие ПЗ, края, ЦН, вратари. */
  groupOfPlayer: Map<number, PositionGroup | null>;
  divOfPlayer: Map<number, DivisionKey | null>;
  types: MetricDef[];
  /** Длина полного матча этого возраста, минуты (U14 — 60, U15–U16 — 70, U17–U18 — 80). */
  matchLen: number;
  /** По матчам: игрок → матч → его события; минуты на поле; границы матча. */
  byMatch: Map<number, Map<number, PlayerMatch>>;
  minutes: Map<number, Map<number, number>>;
  spans: Map<number, MatchSpan>;
}

const cohorts = new Map<number, CohortMetrics>();
const building = new Map<number, Promise<CohortMetrics>>();
let chain: Promise<unknown> = Promise.resolve();

async function eventTypes(): Promise<MetricDef[]> {
  const raw = await cached('eventTypes', TTL, getEventTypes) as AvEventType[];
  // Только события из глоссария: технические и неизвестные в интерфейс не попадают.
  return raw.flatMap((t) => {
    const g = metricInfo(t.id);
    return g ? [{ id: t.id, title: g.name, short: g.short, description: g.description, category: g.group, polarity: g.polarity, weight: Math.abs(t.points) || 1 }] : [];
  });
}

/** Все события команды-в-турнире (страницами по 100). */
type RawEvent = AvEvent & { timeSecond?: number | null; secondPlayerId?: number | null };

/** Длина полного матча по году рождения (сезон 2026: 2013 = U14). Как в Легирусе (per90.js). */
export function matchLenOf(year: number, seasonYear = 2026): number {
  const u = seasonYear + 1 - year;
  if (u >= 17) return 80;
  if (u >= 15) return 70;
  return 60;
}

/**
 * Минуты игрока в матче по событиям AvanData. Замена: mainPlayerId уходит, secondPlayerId
 * выходит, с точной секундой видео. Время считаем по «игровым» секундам — без перерыва
 * (самая длинная пауза между событиями матча дольше 5 минут) — и переводим в минуты
 * полного матча своего возраста. Если замена не размечена, но игрок пропал из событий
 * в первой половине (или появился во второй), обрезаем по его первому/последнему действию.
 */
function computeMinutes(span: MatchSpan, sub: { on?: number; off?: number } | undefined, pm: PlayerMatch, L: number, isGk: boolean): number {
  const live = (a: number, b: number) => {
    if (b <= a) return 0;
    let d = b - a;
    if (span.gapA != null && span.gapB != null) d -= Math.max(0, Math.min(b, span.gapB) - Math.max(a, span.gapA));
    return Math.max(0, d);
  };
  const total = live(span.start, span.end);
  if (total <= 0) return L;
  const mid = span.start + (span.end - span.start) / 2;
  let on = sub?.on ?? span.start;
  let off = sub?.off ?? span.end;
  if (!isGk && sub?.on == null && pm.first > mid) on = Math.max(span.start, pm.first - 120);
  if (!isGk && sub?.off == null && pm.last < mid && pm.last < span.start + (span.end - span.start) * 0.4) off = Math.min(span.end, pm.last + 120);
  return Math.round((live(on, off) / total) * L * 10) / 10;
}

async function teamEvents(tftId: number): Promise<AvEvent[]> {
  const out: AvEvent[] = [];
  for (let page = 1; page <= 60; page++) {
    const d = await authedGet<{ data?: AvEvent[]; meta?: { totalPages?: number } }>(`/events?teamForTournamentId=${tftId}&limit=100&page=${page}`);
    out.push(...(d.data ?? []));
    if (!d.meta?.totalPages || page >= d.meta.totalPages) break;
  }
  return out;
}

async function buildCohort(seasonId: number, year: number): Promise<CohortMetrics> {
  const refs = (await listTournaments(seasonId)).filter((r) => r.ageFrom === year);
  // Команды когорты — из списков матчей (там же teamForTournamentId = id стороны).
  const teams = new Map<number, TeamAgg>();
  for (const ref of refs) {
    for (let tour = 1; tour <= Math.max(1, ref.lastPlayedTour) + 2; tour++) {
      let ms;
      try { ms = await cached(`avmatches:${ref.tournamentId}:${ref.divisionId}:${tour}`, TTL, () => getMatches(ref.tournamentId, ref.divisionId, tour)); } catch { continue; }
      for (const m of ms) for (const side of [m.ownTeam, m.guestTeam]) {
        if (side.id == null || teams.has(side.id)) continue;
        teams.set(side.id, { matches: new Set(), counts: new Map(), name: side.title, division: ref.divisionTitle, divKey: classifyDivision(ref.divisionTitle) });
      }
    }
  }
  const players = new Map<number, PlayerAgg>();
  const rawTypes = await cached('eventTypes', TTL, getEventTypes) as AvEventType[];
  const catOf = new Map(rawTypes.map((t) => [t.id, t.eventTypeCategoryId ?? 'other']));
  const byMatch = new Map<number, Map<number, PlayerMatch>>();
  const times = new Map<number, number[]>();
  const subs = new Map<number, Map<number, { on?: number; off?: number }>>();
  for (const [tftId, team] of teams) {
    let events: AvEvent[] = [];
    try { events = await teamEvents(tftId); } catch (e) { logger.warn({ err: String(e), tftId, year }, '[metrics] события команды не загрузились'); }
    for (const ev of events as RawEvent[]) {
      const t = ev.timeSecond;
      if (t == null) continue;
      (times.get(ev.matchId) ?? times.set(ev.matchId, []).get(ev.matchId)!).push(t);
      if (ev.eventTypeId === 'replacement') {
        const m = subs.get(ev.matchId) ?? subs.set(ev.matchId, new Map()).get(ev.matchId)!;
        if (ev.mainPlayerId != null) { const x = m.get(ev.mainPlayerId) ?? {}; x.off = Math.min(x.off ?? Infinity, t); m.set(ev.mainPlayerId, x); }
        if (ev.secondPlayerId != null) { const x = m.get(ev.secondPlayerId) ?? {}; x.on = Math.min(x.on ?? Infinity, t); m.set(ev.secondPlayerId, x); }
        continue;
      }
      if (ev.mainPlayerId == null || HIDDEN_TYPES.has(ev.eventTypeId)) continue;
      const pmMap = byMatch.get(ev.mainPlayerId) ?? byMatch.set(ev.mainPlayerId, new Map()).get(ev.mainPlayerId)!;
      const pm = pmMap.get(ev.matchId) ?? pmMap.set(ev.matchId, { counts: new Map(), points: 0, attack: 0, defence: 0, teamId: tftId, first: t, last: t }).get(ev.matchId)!;
      pm.counts.set(ev.eventTypeId, (pm.counts.get(ev.eventTypeId) ?? 0) + 1);
      const pts = ev.points ?? 0;
      pm.points += pts;
      if (catOf.get(ev.eventTypeId) === 'attack') pm.attack += pts; else pm.defence += pts;
      pm.first = Math.min(pm.first, t); pm.last = Math.max(pm.last, t);
    }
    for (const e of events) {
      team.matches.add(e.matchId);
      team.counts.set(e.eventTypeId, (team.counts.get(e.eventTypeId) ?? 0) + 1);
      if (e.mainPlayerId == null) continue;
      const p = players.get(e.mainPlayerId) ?? players.set(e.mainPlayerId, { matches: new Set(), counts: new Map(), points: 0, teamId: tftId }).get(e.mainPlayerId)!;
      p.matches.add(e.matchId); p.points += e.points ?? 0;
      p.counts.set(e.eventTypeId, (p.counts.get(e.eventTypeId) ?? 0) + 1);
    }
  }
  const pool = await regionPlayers(seasonId, year);
  const lineOfPlayer = new Map<number, Line | null>(); const divOfPlayer = new Map<number, DivisionKey | null>();
  const divByClub = new Map<string, DivisionKey | null>();
  for (const t of teams.values()) divByClub.set(normTeam(clubName(t.name)), t.divKey);
  const groupOfPlayer = new Map<number, PositionGroup | null>();
  for (const p of pool) { lineOfPlayer.set(p.id, lineOf(p.position)); groupOfPlayer.set(p.id, positionGroup(p.position)); divOfPlayer.set(p.id, divByClub.get(normTeam(clubName(p.club))) ?? null); }
  const types = await eventTypes();
  // Границы матчей и минуты игроков.
  const spans = new Map<number, MatchSpan>();
  for (const [mid, ts] of times) {
    ts.sort((a, b) => a - b);
    let gapA: number | null = null, gapB: number | null = null, best = 300;
    for (let i = 1; i < ts.length; i++) if (ts[i]! - ts[i - 1]! > best) { best = ts[i]! - ts[i - 1]!; gapA = ts[i - 1]!; gapB = ts[i]!; }
    spans.set(mid, { start: ts[0]!, end: ts[ts.length - 1]!, gapA, gapB });
  }
  const matchLen = matchLenOf(year);
  const minutes = new Map<number, Map<number, number>>();
  for (const [pid, pmMap] of byMatch) {
    const isGk = lineOfPlayer.get(pid) === 'GK';
    const out = new Map<number, number>();
    for (const [mid, pm] of pmMap) {
      const span = spans.get(mid);
      out.set(mid, span ? computeMinutes(span, subs.get(mid)?.get(pid), pm, matchLen, isGk) : matchLen);
    }
    minutes.set(pid, out);
  }
  logger.info({ year, teams: teams.size, players: players.size }, '[metrics] когорта собрана');
  return { year, asOf: new Date().toISOString(), players, teams, lineOfPlayer, groupOfPlayer, divOfPlayer, types, matchLen, byMatch, minutes, spans };
}

/** Метрики когорты из кэша; если нет — ставим сборку в очередь (по одной когорте) и возвращаем null. */
// ─── Кэш в БД: мгновенный старт после деплоя ────────────────────────────────
type Ser = Record<string, unknown>;
const mapToArr = <K, V>(m: Map<K, V>, f: (v: V) => unknown = (v) => v) => [...m.entries()].map(([k, v]) => [k, f(v)]);
function serialize(c: CohortMetrics): Ser {
  return {
    year: c.year, asOf: c.asOf, matchLen: c.matchLen, types: c.types,
    players: mapToArr(c.players, (p) => ({ ...p, matches: [...p.matches], counts: mapToArr(p.counts) })),
    teams: mapToArr(c.teams, (t) => ({ ...t, matches: [...t.matches], counts: mapToArr(t.counts) })),
    lineOfPlayer: mapToArr(c.lineOfPlayer), groupOfPlayer: mapToArr(c.groupOfPlayer), divOfPlayer: mapToArr(c.divOfPlayer),
    byMatch: mapToArr(c.byMatch, (m) => mapToArr(m, (pm) => ({ ...pm, counts: mapToArr(pm.counts) }))),
    minutes: mapToArr(c.minutes, (m) => mapToArr(m)),
    spans: mapToArr(c.spans),
  };
}
function deserialize(o: Ser): CohortMetrics {
  type KV<V> = Array<[number, V]>;
  const counts = (x: Array<[string, number]>) => new Map(x);
  return {
    year: o.year as number, asOf: o.asOf as string, matchLen: o.matchLen as number, types: o.types as MetricDef[],
    players: new Map((o.players as KV<PlayerAgg & { matches: number[]; counts: Array<[string, number]> }>).map(([k, v]) => [k, { ...v, matches: new Set(v.matches), counts: counts(v.counts) }])),
    teams: new Map((o.teams as KV<TeamAgg & { matches: number[]; counts: Array<[string, number]> }>).map(([k, v]) => [k, { ...v, matches: new Set(v.matches), counts: counts(v.counts) }])),
    lineOfPlayer: new Map(o.lineOfPlayer as KV<Line | null>), groupOfPlayer: new Map(((o.groupOfPlayer ?? []) as KV<string | null>).map(([k, g]) => [k, normGroup(g)] as [number, PositionGroup | null])), divOfPlayer: new Map(o.divOfPlayer as KV<DivisionKey | null>),
    byMatch: new Map((o.byMatch as KV<KV<PlayerMatch & { counts: Array<[string, number]> }>>).map(([k, v]) => [k, new Map(v.map(([mk, pm]) => [mk, { ...pm, counts: counts(pm.counts) }]))])),
    minutes: new Map((o.minutes as KV<KV<number>>).map(([k, v]) => [k, new Map(v)])),
    spans: new Map(o.spans as KV<MatchSpan>),
  };
}
async function saveCohort(seasonId: number, c: CohortMetrics): Promise<void> {
  try {
    await withBypassRLS((tx) => tx.insert(holdingCohortCache).values({ season: seasonId, birthYear: c.year, payload: serialize(c), builtAt: new Date(c.asOf) })
      .onConflictDoUpdate({ target: [holdingCohortCache.season, holdingCohortCache.birthYear], set: { payload: serialize(c), builtAt: new Date(c.asOf) } }));
  } catch (e) { logger.warn({ err: String(e), year: c.year }, '[metrics] кэш когорты не сохранён'); }
}
/** Поднять последние сборки когорт из БД (на старте сервера) — до фоновой пересборки. */
export async function restoreCohorts(seasonId: number): Promise<number> {
  try {
    const rows = await withBypassRLS((tx) => tx.select().from(holdingCohortCache).where(eq(holdingCohortCache.season, seasonId)));
    // Сборки старого формата (без групп позиций) не поднимаем — пересоберутся фоном.
    for (const r of rows) if (!cohorts.has(r.birthYear) && (r.payload as Ser).groupOfPlayer) cohorts.set(r.birthYear, deserialize(r.payload as Ser));
    logger.info({ seasonId, cohorts: rows.length }, '[metrics] когорты подняты из кэша');
    return rows.length;
  } catch (e) { logger.warn({ err: String(e) }, '[metrics] кэш когорт недоступен'); return 0; }
}

export function cohortMetrics(seasonId: number, year: number): CohortMetrics | null {
  const c = cohorts.get(year);
  if (c && Date.now() - Date.parse(c.asOf) < METRICS_TTL) return c;
  if (!building.has(year)) {
    const job = chain.then(() => buildCohort(seasonId, year)).then((res) => {
      // Сбой AvanData посреди сборки даёт полупустую когорту (туры и события пропускаются молча).
      // Такой не затираем прежнюю — иначе индексы года пропадают до следующей пересборки.
      const prev = cohorts.get(year);
      if (prev && res.players.size < prev.players.size * 0.7) {
        logger.warn({ year, was: prev.players.size, now: res.players.size }, '[metrics] когорта собралась неполной — оставляем прежнюю');
        return prev;
      }
      cohorts.set(year, res); void saveCohort(seasonId, res); return res;
    }).finally(() => building.delete(year));
    chain = job.catch(() => undefined);
    building.set(year, job);
    job.catch((e: unknown) => logger.warn({ err: String(e), year }, '[metrics] сборка когорты упала'));
  }
  return c ?? null; // протухшая — отдаём, свежая доедет фоном
}

/** Прогрев когорт (в порядке приоритета) — вызывается из прогрева холдингов. */
export function warmCohortMetrics(seasonId: number, years: number[]): void {
  for (const y of years) cohortMetrics(seasonId, y);
}

const perMatch = (n: number, matches: number) => (matches ? Math.round((n / matches) * 100) / 100 : 0);
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const MIN_PEER_MATCHES = 2;

/** Показатели игрока против амплуа в его дивизионе (и регионе). null — когорта ещё считается. */
export function playerMetricsVsLeague(seasonId: number, year: number, playerIds: number[]): PlayerMetricsVsLeague | null {
  const c = cohortMetrics(seasonId, year);
  if (!c) return null;
  // Один ребёнок = несколько регистраций: складываем.
  const mine = playerIds.map((id) => c.players.get(id)).filter((x): x is PlayerAgg => !!x);
  if (!mine.length) return { playerId: playerIds[0]!, matches: 0, line: null, group: null, division: '—', rows: [], asOf: c.asOf };
  const matches = new Set(mine.flatMap((m) => [...m.matches])).size;
  const counts = new Map<string, number>();
  for (const m of mine) for (const [k, v] of m.counts) counts.set(k, (counts.get(k) ?? 0) + v);
  const line = playerIds.map((id) => c.lineOfPlayer.get(id)).find((l) => l != null) ?? null;
  const group = playerIds.map((id) => c.groupOfPlayer.get(id)).find((g) => g != null) ?? null;
  const div = playerIds.map((id) => c.divOfPlayer.get(id)).find((d) => d != null) ?? null;
  const team = c.teams.get(mine[0]!.teamId);
  // Пул сверстников того же амплуа: в дивизионе и в регионе (не меньше 2 матчей).
  // Сверстники той же группы позиций (опорный — с опорными, а не со всей полузащитой).
  const peers = [...c.players.entries()].filter(([id, p]) => !playerIds.includes(id) && p.matches.size >= MIN_PEER_MATCHES && (group ? c.groupOfPlayer.get(id) === group : c.lineOfPlayer.get(id) === line));
  const peersDiv = peers.filter(([id]) => c.divOfPlayer.get(id) === div);
  const rows: PlayerMetricRow[] = c.types.map((t) => {
    const mineRate = perMatch(counts.get(t.id) ?? 0, matches);
    const divRates = peersDiv.map(([, p]) => perMatch(p.counts.get(t.id) ?? 0, p.matches.size));
    const regRates = peers.map(([, p]) => perMatch(p.counts.get(t.id) ?? 0, p.matches.size));
    const negative = t.polarity < 0; // «минусовые» события: меньше = лучше
    // Равные значения делят место пополам: «0 блоков» среди амплуа, где почти у всех 0, —
    // это середина, а не «хуже всех».
    const below = divRates.filter((r) => (negative ? r > mineRate : r < mineRate)).length + divRates.filter((r) => r === mineRate).length / 2;
    return {
      id: t.id, title: t.title, short: t.short, description: t.description, category: t.category, polarity: t.polarity, weight: t.weight,
      count: counts.get(t.id) ?? 0, perMatch: mineRate,
      lineAvgDiv: mean(divRates), lineAvgRegion: mean(regRates),
      pctileDiv: divRates.length >= 5 ? Math.round((below / divRates.length) * 100) : null, peersDiv: divRates.length,
    };
  }).filter((r) => r.count > 0 || (r.lineAvgDiv ?? 0) > 0)
    .sort((a, b) => b.weight * b.perMatch - a.weight * a.perMatch)
    .map(({ weight: _w, ...r }) => r);
  return { playerId: playerIds[0]!, matches, line, group, division: team?.division ?? '—', rows, asOf: c.asOf };
}

/** Показатели команды за матч против команд её дивизиона. null — когорта ещё считается. */
export function teamMetricsVsLeague(seasonId: number, year: number, clubKey: string): TeamMetricsVsLeague | null {
  const c = cohortMetrics(seasonId, year);
  if (!c) return null;
  const entry = [...c.teams.entries()].find(([, t]) => normTeam(clubName(t.name)) === clubKey);
  if (!entry) return { teamKey: clubKey, matches: 0, division: '—', rows: [], asOf: c.asOf };
  const [, team] = entry;
  const divTeams = [...c.teams.values()].filter((t) => t.divKey === team.divKey && t.matches.size >= 2);
  const rows: TeamMetricRow[] = c.types.map((t) => {
    const mine = perMatch(team.counts.get(t.id) ?? 0, team.matches.size);
    const rates = divTeams.map((x) => ({ x, r: perMatch(x.counts.get(t.id) ?? 0, x.matches.size) }));
    const negative = t.polarity < 0;
    const sorted = rates.slice().sort((a, b) => (negative ? a.r - b.r : b.r - a.r));
    const rank = sorted.findIndex((s) => s.x === team);
    return { id: t.id, title: t.title, short: t.short, description: t.description, category: t.category, polarity: t.polarity, weight: t.weight, perMatch: mine, divAvg: mean(rates.map((s) => s.r)), rankDiv: rank >= 0 ? rank + 1 : null, sizeDiv: rates.length };
  }).filter((r) => r.perMatch > 0 || (r.divAvg ?? 0) > 0)
    .sort((a, b) => b.weight * b.perMatch - a.weight * a.perMatch)
    .map(({ weight: _w, ...r }) => r);
  return { teamKey: clubKey, matches: team.matches.size, division: team.division, rows, asOf: c.asOf };
}
