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
import { listTournaments, regionPlayers, cached, TTL, clubName, type RegionPlayer } from './avandataSource.js';
import { getMatches } from '../services/avandataApi.js';
import { normTeam } from './teamName.js';
import { classifyDivision, type DivisionKey } from './division.js';
import { lineOf, type HoldingXi } from './holdings.js';
import { logger } from '../shared/logger.js';

type Line = HoldingXi['line'];
const METRICS_TTL = 6 * 60 * 60 * 1000;   // события меняются раз в неделю — держим 6 часов
const HIDDEN_TYPES = new Set(['playerEnter', 'replacement', 'swap']); // технические события

export interface MetricDef { id: string; title: string; short: string; category: string; points: number }
export interface PlayerMetricRow {
  id: string; title: string; short: string; category: string; points: number;
  count: number; perMatch: number;
  /** Среднее «за матч» у игроков того же амплуа в дивизионе и в регионе (когорта). */
  lineAvgDiv: number | null; lineAvgRegion: number | null;
  /** Перцентиль в дивизионе среди амплуа: доля игроков с меньшим значением (0–100); для «минусовых» событий инвертирован. */
  pctileDiv: number | null; peersDiv: number;
}
export interface TeamMetricRow {
  id: string; title: string; short: string; category: string; points: number;
  perMatch: number; divAvg: number | null; rankDiv: number | null; sizeDiv: number;
}
export interface PlayerMetricsVsLeague { playerId: number; matches: number; line: Line | null; division: string; rows: PlayerMetricRow[]; asOf: string }
export interface TeamMetricsVsLeague { teamKey: string; matches: number; division: string; rows: TeamMetricRow[]; asOf: string }

interface PlayerAgg { matches: Set<number>; counts: Map<string, number>; points: number; teamId: number }
interface TeamAgg { matches: Set<number>; counts: Map<string, number>; name: string; division: string; divKey: DivisionKey | null }
interface CohortMetrics {
  year: number; asOf: string;
  players: Map<number, PlayerAgg>;
  teams: Map<number, TeamAgg>;
  /** Линия и дивизион игрока (по regionPlayers). */
  lineOfPlayer: Map<number, Line | null>;
  divOfPlayer: Map<number, DivisionKey | null>;
  types: MetricDef[];
}

const cohorts = new Map<number, CohortMetrics>();
const building = new Map<number, Promise<CohortMetrics>>();
let chain: Promise<unknown> = Promise.resolve();

async function eventTypes(): Promise<MetricDef[]> {
  const raw = await cached('eventTypes', TTL, getEventTypes) as AvEventType[];
  return raw.filter((t) => !HIDDEN_TYPES.has(t.id)).map((t) => ({ id: t.id, title: t.title, short: t.shortTitle ?? t.id, category: t.eventTypeCategoryId ?? 'other', points: t.points }));
}

/** Все события команды-в-турнире (страницами по 100). */
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
  for (const [tftId, team] of teams) {
    let events: AvEvent[] = [];
    try { events = await teamEvents(tftId); } catch (e) { logger.warn({ err: String(e), tftId, year }, '[metrics] события команды не загрузились'); }
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
  for (const p of pool) { lineOfPlayer.set(p.id, lineOf(p.position)); divOfPlayer.set(p.id, divByClub.get(normTeam(clubName(p.club))) ?? null); }
  const types = await eventTypes();
  logger.info({ year, teams: teams.size, players: players.size }, '[metrics] когорта собрана');
  return { year, asOf: new Date().toISOString(), players, teams, lineOfPlayer, divOfPlayer, types };
}

/** Метрики когорты из кэша; если нет — ставим сборку в очередь (по одной когорте) и возвращаем null. */
export function cohortMetrics(seasonId: number, year: number): CohortMetrics | null {
  const c = cohorts.get(year);
  if (c && Date.now() - Date.parse(c.asOf) < METRICS_TTL) return c;
  if (!building.has(year)) {
    const job = chain.then(() => buildCohort(seasonId, year)).then((res) => { cohorts.set(year, res); return res; }).finally(() => building.delete(year));
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
  if (!mine.length) return { playerId: playerIds[0]!, matches: 0, line: null, division: '—', rows: [], asOf: c.asOf };
  const matches = new Set(mine.flatMap((m) => [...m.matches])).size;
  const counts = new Map<string, number>();
  for (const m of mine) for (const [k, v] of m.counts) counts.set(k, (counts.get(k) ?? 0) + v);
  const line = playerIds.map((id) => c.lineOfPlayer.get(id)).find((l) => l != null) ?? null;
  const div = playerIds.map((id) => c.divOfPlayer.get(id)).find((d) => d != null) ?? null;
  const team = c.teams.get(mine[0]!.teamId);
  // Пул сверстников того же амплуа: в дивизионе и в регионе (не меньше 2 матчей).
  const peers = [...c.players.entries()].filter(([id, p]) => !playerIds.includes(id) && p.matches.size >= MIN_PEER_MATCHES && c.lineOfPlayer.get(id) === line);
  const peersDiv = peers.filter(([id]) => c.divOfPlayer.get(id) === div);
  const rows: PlayerMetricRow[] = c.types.map((t) => {
    const mineRate = perMatch(counts.get(t.id) ?? 0, matches);
    const divRates = peersDiv.map(([, p]) => perMatch(p.counts.get(t.id) ?? 0, p.matches.size));
    const regRates = peers.map(([, p]) => perMatch(p.counts.get(t.id) ?? 0, p.matches.size));
    const negative = t.points < 0; // «минусовые» события: меньше = лучше
    const below = divRates.filter((r) => (negative ? r > mineRate : r < mineRate)).length;
    return {
      id: t.id, title: t.title, short: t.short, category: t.category, points: t.points,
      count: counts.get(t.id) ?? 0, perMatch: mineRate,
      lineAvgDiv: mean(divRates), lineAvgRegion: mean(regRates),
      pctileDiv: divRates.length >= 5 ? Math.round((below / divRates.length) * 100) : null, peersDiv: divRates.length,
    };
  }).filter((r) => r.count > 0 || (r.lineAvgDiv ?? 0) > 0)
    .sort((a, b) => Math.abs(b.points) * b.perMatch - Math.abs(a.points) * a.perMatch);
  return { playerId: playerIds[0]!, matches, line, division: team?.division ?? '—', rows, asOf: c.asOf };
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
    const negative = t.points < 0;
    const sorted = rates.slice().sort((a, b) => (negative ? a.r - b.r : b.r - a.r));
    const rank = sorted.findIndex((s) => s.x === team);
    return { id: t.id, title: t.title, short: t.short, category: t.category, points: t.points, perMatch: mine, divAvg: mean(rates.map((s) => s.r)), rankDiv: rank >= 0 ? rank + 1 : null, sizeDiv: rates.length };
  }).filter((r) => r.perMatch > 0 || (r.divAvg ?? 0) > 0)
    .sort((a, b) => Math.abs(b.points) * b.perMatch - Math.abs(a.points) * a.perMatch);
  return { teamKey: clubKey, matches: team.matches.size, division: team.division, rows, asOf: c.asOf };
}
