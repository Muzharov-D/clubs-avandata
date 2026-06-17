/**
 * AvandataSource — прокси-слой над «нашей» базой разборов (back.avandata.ru).
 * Кабинет федерации читает РЕАЛЬНЫЕ данные Первенства СПб вживую, без копирования
 * в нашу БД (см. docs/AVANDATA_API_MAP.md). Короткий in-memory кэш, чтобы не
 * дёргать API на каждый запрос. Только чтение по API-ключу (X-API-Key).
 */
import {
  isAvandataConfigured, getSeasons, getTeamsList, getTourStatistics,
  getPlayersByRole, type AvSeason,
} from '../services/avandataApi.js';

export { isAvandataConfigured };

// ---- крошечный TTL-кэш ----
const cache = new Map<string, { at: number; val: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.val as T;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}
const TTL = 10 * 60 * 1000;

async function season(seasonId: number): Promise<AvSeason> {
  const seasons = await cached('seasons', TTL, getSeasons);
  const s = seasons.find((x) => x.id === seasonId);
  if (!s) throw new Error(`Сезон ${seasonId} не найден`);
  return s;
}

// ---- Каталог турниров (турнир × дивизион) ----
export interface TournamentRef {
  key: string;            // `${tournamentId}:${divisionId}`
  tournamentId: number;
  divisionId: number;
  title: string;          // короткое: «U15 · Высшая Лига»
  fullTitle: string;
  category: string;       // U13…U18
  ageFrom: number;
  ageTo: number;
  divisionTitle: string;
  lastPlayedTour: number;
}

export async function listTournaments(seasonId: number): Promise<TournamentRef[]> {
  const s = await season(seasonId);
  const out: TournamentRef[] = [];
  for (const t of s.tournaments) {
    for (const d of t.divisions) {
      out.push({
        key: `${t.id}:${d.id}`,
        tournamentId: t.id,
        divisionId: d.id,
        title: `${t.category} · ${d.title}`,
        fullTitle: `${t.title} — ${d.title}`,
        category: t.category,
        ageFrom: t.dateBirthFrom,
        ageTo: t.dateBirthTo,
        divisionTitle: d.title,
        lastPlayedTour: d.lastPlayedTour,
      });
    }
  }
  return out;
}

// ---- Агрегат одного турнира-дивизиона (для сравнения и обзора) ----
export interface TournamentAgg {
  ref: TournamentRef;
  teams: number;
  players: number;        // разобранные игроки (с матчей)
  matches: number;        // всего матчей
  analyzed: number;       // разобрано
  goals: number;
  yellow: number;
  goalsPerMatch: number | null;
  yellowPerMatch: number | null;
  avgRating: number | null; // средний рейтинг разобранных игроков (сырая шкала источника)
}

export async function tournamentAggregate(seasonId: number, ref: TournamentRef): Promise<TournamentAgg> {
  return cached(`agg:${seasonId}:${ref.key}`, TTL, async () => {
    const s = await season(seasonId);
    // команды
    let teams = 0;
    try { teams = (await getTeamsList(ref.tournamentId, ref.divisionId, 1)).length; } catch { /* */ }

    // суммируем по турам: матчи/голы/карточки/разобрано + игроки (с разобранных)
    let matches = 0, analyzed = 0, goals = 0, yellow = 0;
    const players = new Map<number, number>(); // playerId → averageRating
    void s;
    for (let tour = 1; tour <= Math.max(1, ref.lastPlayedTour); tour++) {
      let st;
      try { st = await getTourStatistics(ref.tournamentId, ref.divisionId, tour); } catch { continue; }
      matches += st.totalMatches; analyzed += st.analyzedMatches; goals += st.totalGoals; yellow += st.totalYellowCards;
      if (st.analyzedMatches > 0) {
        try {
          const roleArr = (await getPlayersByRole(seasonId, ref.tournamentId, ref.divisionId, tour)) as Array<{ topPlayers?: Array<{ id?: number; averageRating?: number }> }>;
          for (const g of roleArr) for (const p of g.topPlayers ?? []) if (p.id != null && !players.has(p.id)) players.set(p.id, p.averageRating ?? 0);
        } catch { /* */ }
      }
    }
    const ratings = [...players.values()].filter((r) => Number.isFinite(r));
    const avgRating = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
    return {
      ref, teams, players: players.size, matches, analyzed, goals, yellow,
      goalsPerMatch: matches ? Math.round((goals / matches) * 100) / 100 : null,
      yellowPerMatch: matches ? Math.round((yellow / matches) * 100) / 100 : null,
      avgRating,
    };
  });
}

// ---- Сравнение нескольких турниров ----
export async function compareTournaments(seasonId: number, keys: string[]): Promise<TournamentAgg[]> {
  const refs = await listTournaments(seasonId);
  const picked = keys.map((k) => refs.find((r) => r.key === k)).filter((r): r is TournamentRef => !!r);
  return Promise.all(picked.map((r) => tournamentAggregate(seasonId, r)));
}

// ---- Обзор региона (вся Первенство = сумма по всем турнирам-дивизионам) ----
export interface RegionOverview {
  divisions: string[];
  tournaments: number;
  teams: number;
  players: number;
  matches: number;
  analyzed: number;
  goals: number;
  byTournament: TournamentAgg[];
}

export async function regionOverview(seasonId: number): Promise<RegionOverview> {
  const refs = await listTournaments(seasonId);
  const aggs = await Promise.all(refs.map((r) => tournamentAggregate(seasonId, r)));
  const sum = (sel: (a: TournamentAgg) => number) => aggs.reduce((s, a) => s + sel(a), 0);
  const players = new Set<number>(); // не дедупим точно (агрегат), показываем сумму разобранных
  void players;
  return {
    divisions: Array.from(new Set(refs.map((r) => r.divisionTitle))),
    tournaments: new Set(refs.map((r) => r.tournamentId)).size,
    teams: sum((a) => a.teams),
    players: sum((a) => a.players),
    matches: sum((a) => a.matches),
    analyzed: sum((a) => a.analyzed),
    goals: sum((a) => a.goals),
    byTournament: aggs,
  };
}

// ---- Игроки региона (с разобранных матчей) ----
export interface RegionPlayer {
  id: number;
  name: string;
  birthYear: number | null;
  position: string | null;
  club: string | null;
  rating: number | null;
}

export async function regionPlayers(seasonId: number): Promise<RegionPlayer[]> {
  return cached(`players:${seasonId}`, TTL, async () => {
    const refs = await listTournaments(seasonId);
    const byId = new Map<number, RegionPlayer>();
    for (const ref of refs) {
      for (let tour = 1; tour <= Math.max(1, ref.lastPlayedTour); tour++) {
        let st;
        try { st = await getTourStatistics(ref.tournamentId, ref.divisionId, tour); } catch { continue; }
        if (st.analyzedMatches === 0) continue;
        try {
          const roleArr = (await getPlayersByRole(seasonId, ref.tournamentId, ref.divisionId, tour)) as Array<{
            topPlayers?: Array<{ id?: number; title?: string; dateOfBirth?: number; playerMatchRole?: { title?: string }; team?: { title?: string }; averageRating?: number }>;
          }>;
          for (const g of roleArr) for (const p of g.topPlayers ?? []) {
            if (p.id == null || byId.has(p.id)) continue;
            byId.set(p.id, {
              id: p.id,
              name: p.title ?? '—',
              birthYear: p.dateOfBirth ?? null,
              position: p.playerMatchRole?.title ?? null,
              club: p.team?.title ?? null,
              rating: p.averageRating ?? null,
            });
          }
        } catch { /* */ }
      }
    }
    return [...byId.values()].sort((a, b) => (b.rating ?? -1e9) - (a.rating ?? -1e9));
  });
}
