/**
 * AvandataSource — прокси-слой над «нашей» базой разборов (back.avandata.ru).
 * Кабинет читает РЕАЛЬНОЕ Первенство СПб вживую, без копирования в нашу БД
 * (см. docs/AVANDATA_API_MAP.md). Короткий in-memory кэш. Только чтение по ключу.
 *
 * Детект разобранного: НЕ по сломанному tourStatistics.analyzedMatches (он врёт),
 * а по факту — getPlayersByRole возвращает игроков на разобранных турах.
 */
import {
  isAvandataConfigured, getSeasons, getTeamsList, getTourStatistics, getPlayersByRole,
  getFfspbStatistics, getClubRatingsOverview, getPlayerDetail, getPlayerEvents, getEventTypes,
  type AvSeason, type AvStatTeam, type AvRatingTeam, type AvEventType,
} from '../services/avandataApi.js';

export { isAvandataConfigured };

const cache = new Map<string, { at: number; val: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.val as T;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}
const TTL = 10 * 60 * 1000;
/** Параллельный map с ограничением одновременности (щадим API). */
async function pmap<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx] as T); }
  }));
  return out;
}

async function season(seasonId: number): Promise<AvSeason> {
  const seasons = await cached('seasons', TTL, getSeasons);
  const s = seasons.find((x) => x.id === seasonId);
  if (!s) throw new Error(`Сезон ${seasonId} не найден`);
  return s;
}

// ─── Каталог турниров ────────────────────────────────────────────────────────
export interface TournamentRef {
  key: string; tournamentId: number; divisionId: number;
  title: string; fullTitle: string; category: string; ageFrom: number; ageTo: number;
  divisionTitle: string; lastPlayedTour: number;
}
export async function listTournaments(seasonId: number): Promise<TournamentRef[]> {
  const s = await season(seasonId);
  const out: TournamentRef[] = [];
  for (const t of s.tournaments) for (const d of t.divisions) {
    out.push({
      key: `${t.id}:${d.id}`, tournamentId: t.id, divisionId: d.id,
      title: `${t.category} · ${d.title}`, fullTitle: `${t.title} — ${d.title}`,
      category: t.category, ageFrom: t.dateBirthFrom, ageTo: t.dateBirthTo,
      divisionTitle: d.title, lastPlayedTour: d.lastPlayedTour,
    });
  }
  return out;
}

// ─── Игроки тура (общая сборка) ──────────────────────────────────────────────
interface RawPlayer { id?: number; title?: string; dateOfBirth?: number; playerMatchRole?: { title?: string }; team?: { id?: number; title?: string; logoUrl?: string | null }; averageRating?: number }
async function tourPlayers(seasonId: number, t: number, d: number, tour: number): Promise<RawPlayer[]> {
  try {
    const roleArr = (await getPlayersByRole(seasonId, t, d, tour)) as Array<{ topPlayers?: RawPlayer[] }>;
    return roleArr.flatMap((g) => g.topPlayers ?? []);
  } catch { return []; }
}

// ─── Агрегат турнира (для сравнения и обзора) ────────────────────────────────
export interface TournamentAgg {
  ref: TournamentRef;
  teams: number; players: number; matches: number; analyzed: number; goals: number; yellow: number;
  goalsPerMatch: number | null; yellowPerMatch: number | null; avgRating: number | null;
}
export async function tournamentAggregate(seasonId: number, ref: TournamentRef): Promise<TournamentAgg> {
  return cached(`agg:${seasonId}:${ref.key}`, TTL, async () => {
    let teams = 0;
    try { teams = (await getTeamsList(ref.tournamentId, ref.divisionId, 1)).length; } catch { /* */ }
    const tours = Array.from({ length: Math.max(1, ref.lastPlayedTour) }, (_, i) => i + 1);
    let matches = 0, analyzed = 0, goals = 0, yellow = 0;
    const players = new Map<number, number>();
    await pmap(tours, 5, async (tour) => {
      let st;
      try { st = await getTourStatistics(ref.tournamentId, ref.divisionId, tour); } catch { return; }
      matches += st.totalMatches; goals += st.totalGoals; yellow += st.totalYellowCards;
      const ps = await tourPlayers(seasonId, ref.tournamentId, ref.divisionId, tour);
      if (ps.length > 0) analyzed += Math.max(st.analyzedMatches, 1);
      for (const p of ps) if (p.id != null && !players.has(p.id)) players.set(p.id, p.averageRating ?? 0);
    });
    const ratings = [...players.values()].filter((r) => Number.isFinite(r) && r !== 0);
    return {
      ref, teams, players: players.size, matches, analyzed, goals, yellow,
      goalsPerMatch: matches ? Math.round((goals / matches) * 100) / 100 : null,
      yellowPerMatch: matches ? Math.round((yellow / matches) * 100) / 100 : null,
      avgRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
    };
  });
}

export async function compareTournaments(seasonId: number, keys: string[]): Promise<TournamentAgg[]> {
  const refs = await listTournaments(seasonId);
  const picked = keys.map((k) => refs.find((r) => r.key === k)).filter((r): r is TournamentRef => !!r);
  return pmap(picked, 4, (r) => tournamentAggregate(seasonId, r));
}

// ─── Обзор региона ───────────────────────────────────────────────────────────
export interface RegionOverview {
  divisions: string[]; tournaments: number; teams: number; players: number;
  matches: number; analyzed: number; goals: number; byTournament: TournamentAgg[];
}
export async function regionOverview(seasonId: number): Promise<RegionOverview> {
  return cached(`overview:${seasonId}`, TTL, async () => {
    const refs = await listTournaments(seasonId);
    const aggs = await pmap(refs, 4, (r) => tournamentAggregate(seasonId, r));
    const sum = (sel: (a: TournamentAgg) => number) => aggs.reduce((s, a) => s + sel(a), 0);
    return {
      divisions: Array.from(new Set(refs.map((r) => r.divisionTitle))),
      tournaments: new Set(refs.map((r) => r.tournamentId)).size,
      teams: sum((a) => a.teams), players: sum((a) => a.players), matches: sum((a) => a.matches),
      analyzed: sum((a) => a.analyzed), goals: sum((a) => a.goals), byTournament: aggs,
    };
  });
}

// ─── Таблицы и рейтинги клубов (для главного экрана) ─────────────────────────
export interface ClubStandRow { id: number; name: string; logo: string | null; division: string; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number; }
export interface ClubRatingRow { id: number; name: string; logo: string | null; division: string; rating: number; }
export interface DivisionGroup<T> { division: string; rows: T[]; }

export async function regionStandings(seasonId: number): Promise<DivisionGroup<ClubStandRow>[]> {
  return cached(`standings:${seasonId}`, TTL, async () => {
    const teams = await getFfspbStatistics(seasonId);
    return groupByDivision(teams.map((t: AvStatTeam) => ({
      id: t.id, name: t.name, logo: t.logo ?? null, division: t.division?.name ?? 'Лига',
      played: t.stats.matchesPlayed, won: t.stats.matchesWon, drawn: t.stats.draw, lost: t.stats.defeat,
      goalDiff: t.stats.differenceGoals, points: t.stats.points,
    })), (r) => r.points);
  });
}
export async function regionClubRatings(seasonId: number): Promise<DivisionGroup<ClubRatingRow>[]> {
  return cached(`clubratings:${seasonId}`, TTL, async () => {
    const teams = await getClubRatingsOverview(seasonId);
    return groupByDivision(teams.map((t: AvRatingTeam) => ({
      id: t.id, name: t.name, logo: t.logo ?? null, division: t.division?.name ?? 'Лига', rating: t.points,
    })), (r) => r.rating);
  });
}
function groupByDivision<T extends { division: string }>(rows: T[], sortKey: (r: T) => number): DivisionGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) { const k = r.division; (map.get(k) ?? map.set(k, []).get(k)!).push(r); }
  const order = (n: string) => (/Высшая|Боброва/i.test(n) ? 0 : /Первая|Дементьева/i.test(n) ? 1 : 2);
  return [...map.entries()]
    .map(([division, rs]) => ({ division, rows: rs.sort((a, b) => sortKey(b) - sortKey(a)).slice(0, 10) }))
    .sort((a, b) => order(a.division) - order(b.division));
}

// ─── Игроки региона (с разобранных матчей, все туры) ─────────────────────────
export interface RegionPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; rating: number | null; }
export async function regionPlayers(seasonId: number): Promise<RegionPlayer[]> {
  return cached(`players:${seasonId}`, TTL, async () => {
    const refs = await listTournaments(seasonId);
    const byId = new Map<number, RegionPlayer>();
    const jobs: Array<{ t: number; d: number; tour: number }> = [];
    for (const ref of refs) for (let tour = 1; tour <= Math.max(1, ref.lastPlayedTour); tour++) jobs.push({ t: ref.tournamentId, d: ref.divisionId, tour });
    await pmap(jobs, 6, async (job) => {
      const ps = await tourPlayers(seasonId, job.t, job.d, job.tour);
      for (const p of ps) {
        if (p.id == null || byId.has(p.id)) continue;
        byId.set(p.id, {
          id: p.id, name: p.title ?? '—', birthYear: p.dateOfBirth ?? null,
          position: p.playerMatchRole?.title ?? null, club: p.team?.title ?? null,
          clubLogo: p.team?.logoUrl ?? null, rating: p.averageRating ?? null,
        });
      }
    });
    return [...byId.values()].sort((a, b) => (b.rating ?? -1e9) - (a.rating ?? -1e9));
  });
}

// ─── Профиль игрока + «пицца» из событий ─────────────────────────────────────
export interface PlayerMetric { id: string; title: string; short: string; category: string; count: number; points: number; }
export interface PlayerProfile {
  id: number; name: string; club: string | null; clubLogo: string | null; position: string | null;
  birthDate: string | null; birthYear: number | null; rating: number | null;
  matches: number; totalEvents: number; metrics: PlayerMetric[];
}
export async function playerProfile(seasonId: number, playerId: number): Promise<PlayerProfile | null> {
  const [players, detail, events, typesRaw] = await Promise.all([
    regionPlayers(seasonId),
    getPlayerDetail(playerId),
    getPlayerEvents(playerId),
    cached('eventTypes', TTL, getEventTypes),
  ]);
  const id0 = players.find((p) => p.id === playerId);
  const types = new Map((typesRaw as AvEventType[]).map((t) => [t.id, t]));
  const agg = new Map<string, { count: number; points: number }>();
  const matchIds = new Set<number>();
  for (const e of events) {
    matchIds.add(e.matchId);
    const a = agg.get(e.eventTypeId) ?? { count: 0, points: 0 };
    a.count += 1; a.points += e.points ?? 0;
    agg.set(e.eventTypeId, a);
  }
  const metrics: PlayerMetric[] = [...agg.entries()].map(([tid, a]) => {
    const t = types.get(tid);
    return { id: tid, title: t?.title ?? tid, short: t?.shortTitle ?? tid, category: t?.eventTypeCategoryId ?? 'other', count: a.count, points: a.points };
  }).sort((a, b) => b.count - a.count);
  const totalPoints = metrics.reduce((s, m) => s + m.points, 0);
  if (!id0 && !detail && events.length === 0) return null;
  const name = id0?.name ?? (detail ? [detail.lastname, detail.firstname].filter(Boolean).join(' ') : `#${playerId}`);
  return {
    id: playerId, name, club: id0?.club ?? null, clubLogo: id0?.clubLogo ?? null,
    position: id0?.position ?? null,
    birthDate: detail?.dateOfBirth ?? null,
    birthYear: detail?.dateOfBirth ? new Date(detail.dateOfBirth).getUTCFullYear() : (id0?.birthYear ?? null),
    rating: id0?.rating ?? (events.length ? totalPoints : null),
    matches: matchIds.size, totalEvents: events.length, metrics,
  };
}
