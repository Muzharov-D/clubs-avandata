/**
 * Аналитика холдинга ОТНОСИТЕЛЬНО ЛИГИ — то, из чего руководство принимает решения.
 *
 * Каждый игрок холдинга ставится в контекст своего возраста: место среди всех игроков
 * региона и своего дивизиона, отклонение от среднего по амплуа в лиге, тренд последних
 * матчей против сезона, попадание в ротацию. Команда — против дивизиона: средний класс
 * против среднего по лиге, место по рейтингу против места в таблице, линии сильнее/слабее.
 *
 * Из этого собираются решения: кандидаты в молодёжную команду (старшие возраста),
 * кандидаты на повышение в Высшую лигу (внутри холдинга), зона риска, кого теряем,
 * слабые и сильные линии. Пороги — константы ниже, названы словами.
 */
import { regionPlayers, clubName, cached, hasFreshCache, TTL, type RegionPlayer } from './avandataSource.js';
import { cohortForms, type PlayerForm } from './holdingSeason.js';
import { positionGroup, type PositionGroup } from './positionGroups.js';
import { getClubRatingsByTournament, type AvRatingTeam } from '../services/avandataApi.js';
import { normTeam } from './teamName.js';
import { classifyDivision, type DivisionKey } from './division.js';
import { lineOf, holdingProfile, saveHoldingCache, type HoldingConfig, type HoldingProfile, type HoldingTeam, type HoldingXi } from './holdings.js';

type Line = HoldingXi['line'];
const LINE_TITLE: Record<Line, string> = { GK: 'Вратари', DEF: 'Защита', MID: 'Полузащита', FWD: 'Атака' };

// ─── Пороги решений (словами, чтобы менять осознанно) ─────────────────────────
const MIN_MATCHES_RATED = 2;      // рейтинг считается «есть» от 2 разобранных матчей
const MIN_MATCHES_DECISION = 3;   // для решений по игроку — от 3 матчей
const MIN_MATCHES_READY = 4;      // «готов в молодёжку» — от 4 матчей
const YOUTH_READY_PCT = 10;       // топ-10% региона своего возраста
const YOUTH_WATCH_PCT = 25;       // топ-25% — присмотреться
const TREND_LAST_N = 4;           // тренд = средний рейтинг последних 4 матчей против предыдущих
const TREND_MIN_MATCHES = 6;      // тренд считаем от 6 оценённых матчей (иначе шум одного матча)
const LOSING_TREND_REL = -0.25;   // падение на четверть и больше → «теряем» (запасное правило)
const LOSING_FORM_DELTA = -1;     // честный счёт: последние 3 матча ниже сезона на 1+ балл (шкала 5–10)
const ROTATION_GAP_TOURS = 3;     // пропустил 3+ разобранных матча команды подряд → выпал из ротации
const LINE_GAP_REL = 0.12;        // линия слабее/сильнее лиги на 12%+

export interface LeaguePlayer {
  id: number; name: string; photo: string | null; position: string | null; line: Line | null;
  /** Группа позиции (с кем сравнивается): ЦЗ, крайние, опорные, атакующие ПЗ, края, ЦН, вратари. */
  group: PositionGroup | null;
  birthYear: number; clubKey: string; clubLabel: string; teamKey: string; team: string;
  division: string; divisionKey: DivisionKey | null;
  rating: number | null; mp: number;
  /** Место среди оценённых игроков своего возраста: в дивизионе и во всём регионе. */
  rankDiv: number | null; sizeDiv: number; rankRegion: number | null; sizeRegion: number;
  /** «Топ N%» региона своего возраста (меньше — лучше). */
  pctRegion: number | null;
  /** Среднее по амплуа (линии) в дивизионе/регионе и отклонение от дивизиона. */
  lineAvgDiv: number | null; lineAvgRegion: number | null; deltaLine: number | null;
  /** Тренд: среднее последних матчей минус сезонный рейтинг; last — сами последние оценки. */
  trend: number | null; last: number[];
  lastTour: number | null; teamLastTour: number | null; inRotation: boolean;
  /**
   * Честный счёт (как в профиле): индекс сезона 0–10 против своей позиции в регионе — за полный
   * матч своего возраста с учётом минут; формa — последние 3 матча против сезона (шкала 0–10).
   * null — показатели когорты ещё считаются.
   */
  index: number | null; indexPct: number | null; minutes: number | null; formDelta: number | null;
}
export interface LineCompare { line: Line; title: string; teamAvg: number | null; divAvg: number | null; n: number; gapRel: number | null; verdict: 'weak' | 'ok' | 'strong' | null }
export interface TeamLeague {
  key: string; clubKey: string; clubLabel: string; name: string; year: number; category: string; ageTitle: string;
  division: string; divisionKey: DivisionKey | null;
  avgRating: number | null; divAvgRating: number | null; divRankByAvg: number | null; divTeams: number;
  place: number | null; placeSize: number | null; ratingRank: number | null; ratingSize: number | null;
  /** > 0 — в таблице выше, чем по рейтингу (перевыполняет); < 0 — ниже (недовыполняет). */
  overperformance: number | null;
  lines: LineCompare[];
  squad: LeaguePlayer[];
  inTop30: number; rated: number;
  /** Все команды дивизиона: место в таблице и средний рейтинг состава — для рассеяния «сила × место». */
  divMap: Array<{ name: string; place: number; strength: number | null; mine: boolean }>;
}
export interface YouthCandidate extends LeaguePlayer { tier: 'ready' | 'watch' | 'rest' }
export interface LosingPlayer extends LeaguePlayer { reason: 'trend' | 'rotation' }
export interface LineIssue { teamKey: string; clubLabel: string; year: number; category: string; line: Line; title: string; teamAvg: number; divAvg: number; gapRel: number }
/** Кандидат селекции — игрок другой школы, без имени (открытые данные — только команда, амплуа, рейтинг). */
export interface SelectionCandidate { id: number; line: Line; position: string | null; club: string; division: string; divisionKey: DivisionKey | null; rating: number; pctRegion: number; rankRegion: number; mp: number; trend: number | null }
export interface SelectionGroup { teamKey: string; clubLabel: string; year: number; category: string; division: string; line: Line; title: string; ourAvg: number | null; ourBest: number | null; ourN: number; candidates: SelectionCandidate[] }
export interface OlderAgeCandidate extends LeaguePlayer { olderTeamKey: string; olderTeamName: string; olderMedian: number; olderRank: number; olderSize: number }
export interface HoldingAnalytics {
  slug: string; season: number; asOf: string;
  /** 0 — текущее состояние; N — реконструкция «N туров назад» (рейтинг = среднее по матчам, отрезаем последние туры). */
  toursBack: number;
  youthFromYear: number; youthSlots: number;
  thresholds: { youthReadyPct: number; youthWatchPct: number; minMatchesReady: number; minMatchesDecision: number; losingTrendRel: number; lineGapRel: number };
  teams: TeamLeague[];
  medians: Array<{ year: number; top: number | null; first: number | null; ratedTop: number; ratedFirst: number }>;
  youth: { ready: YouthCandidate[]; watch: YouthCandidate[]; rest: YouthCandidate[] };
  promote: LeaguePlayer[];
  /** Готовы играть на возраст старше в своей школе: рейтинг не ниже медианы старшей команды. */
  olderAge: OlderAgeCandidate[];
  /** Кого упускает селекция: игроки других школ (слабее нас командой или лигой ниже), которые усилили бы линию. */
  selection: SelectionGroup[];
  risk: LeaguePlayer[];
  losing: LosingPlayer[];
  weakLines: LineIssue[];
  strongLines: LineIssue[];
  /** Все игроки холдинга с рейтингом — единый реестр для поиска/сортировок. */
  players: LeaguePlayer[];
  /**
   * Распределение по индексу всех игроков региона каждого года (45+ минут): свои — с именем
   * и командой, чужие — только значение. Для «роя» на брифинге.
   */
  swarm: Array<{ year: number; points: Array<{ id: number; index: number; mine: boolean; name?: string; teamKey?: string }> }>;
}

const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};
const rated = (p: RegionPlayer) => p.rating != null && p.mp >= MIN_MATCHES_RATED;

/**
 * Пул когорты «N туров назад»: у каждого турнира отрезаем последние N разобранных туров.
 * Рейтинг игрока — среднее по его матчам, поэтому срез восстанавливается точно.
 */
export function poolToursBack(pool: RegionPlayer[], toursBack: number): RegionPlayer[] {
  if (toursBack <= 0) return pool;
  const maxTour = new Map<number, number>();
  for (const p of pool) for (const s of p.series ?? []) maxTour.set(s.tid, Math.max(maxTour.get(s.tid) ?? 0, s.tour));
  return pool.map((p) => {
    const series = (p.series ?? []).filter((s) => s.tour <= (maxTour.get(s.tid) ?? 0) - toursBack);
    const rating = series.length ? Math.round(series.reduce((a, s) => a + s.rating, 0) / series.length) : null;
    return { ...p, series, mp: series.length, rating };
  });
}

/** Аналитика по профилю холдинга (профиль уже собран — таблицы/дивизионы берём из него). */
// Последняя посчитанная аналитика холдинга (в т.ч. поднятая из БД на старте): пока свежая
// считается, отдаём её — кабинет не ждёт минуту после деплоя. Пересчёт — один на холдинг.
const lastAnalytics = new Map<string, HoldingAnalytics>();
const analyticsInflight = new Map<string, Promise<HoldingAnalytics>>();
export function seedAnalytics(slug: string, seasonId: number, a: HoldingAnalytics): void { lastAnalytics.set(`${slug}:${seasonId}`, a); }

export async function holdingAnalytics(seasonId: number, cfg: HoldingConfig, profile: HoldingProfile, toursBack = 0): Promise<HoldingAnalytics> {
  // Формы когорт (минуты, индекс) — в ключ кэша: аналитика пересчитается, когда они досчитаются.
  const formsByYear = new Map<number, Map<number, PlayerForm>>();
  if (toursBack === 0) for (const y of profile.years) { const f = await cohortForms(seasonId, y); if (f) formsByYear.set(y, f.forms); }
  const stamp = toursBack === 0 ? profile.years.map((y) => (formsByYear.has(y) ? 1 : 0)).join('') : '';
  const key = `holding-analytics:${cfg.slug}:${seasonId}:${profile.asOf}:${toursBack}${stamp ? ':' + stamp : ''}`;
  if (toursBack === 0) {
    const lastKey = `${cfg.slug}:${seasonId}`;
    const stale = lastAnalytics.get(lastKey);
    if (stale && !hasFreshCache(key, TTL)) {
      if (!analyticsInflight.has(key)) {
        const job = computeAnalytics(seasonId, cfg, profile, toursBack, formsByYear, key).finally(() => analyticsInflight.delete(key));
        analyticsInflight.set(key, job);
        job.catch(() => undefined);
      }
      return stale;
    }
  }
  return computeAnalytics(seasonId, cfg, profile, toursBack, formsByYear, key);
}

async function computeAnalytics(seasonId: number, cfg: HoldingConfig, profile: HoldingProfile, toursBack: number, formsByYear: Map<number, Map<number, PlayerForm>>, key: string): Promise<HoldingAnalytics> {
  return cached(key, TTL, async () => {
    const teamsOut: TeamLeague[] = [];
    const allPlayers: LeaguePlayer[] = [];
    const medians: HoldingAnalytics['medians'] = [];
    // Чужие игроки когорты (для селекции) и средний класс чужих команд.
    const othersByYear = new Map<number, Array<{ p: RegionPlayer; clubKey: string; club: string; div: DivisionKey | null; divName: string; teamAvg: number | null; rankRegion: number; pctRegion: number }>>();

    for (const year of profile.years) {
      const teamsOfYear = profile.teams.filter((t) => t.year === year);
      if (!teamsOfYear.length) continue;
      const pool = poolToursBack(await regionPlayers(seasonId, year), toursBack);
      // Дивизион команды игрока: рейтинг AvanData знает дивизион каждой команды когорты.
      const tid = await tournamentIdOfYear(seasonId, year);
      const ratings: AvRatingTeam[] = tid != null ? await getClubRatingsByTournament(seasonId, tid).catch(() => []) : [];
      const divByKey = new Map<string, string>();
      for (const r of ratings) if (r.division?.name) divByKey.set(normTeam(r.name), r.division.name);
      for (const t of teamsOfYear) divByKey.set(t.clubKey, t.division);
      const divKeyOf = (p: RegionPlayer): DivisionKey | null => classifyDivision(divByKey.get(normTeam(clubName(p.club))) ?? '');

      // Пулы: регион и дивизионы; ранги; средние по линиям.
      const ratedPool = pool.filter(rated).sort((a, b) => (b.rating as number) - (a.rating as number));
      const rankRegion = new Map<number, number>(); ratedPool.forEach((p, i) => rankRegion.set(p.id, i + 1));
      const byDiv = new Map<DivisionKey | null, RegionPlayer[]>();
      for (const p of ratedPool) { const k = divKeyOf(p); (byDiv.get(k) ?? byDiv.set(k, []).get(k)!).push(p); }
      const rankDiv = new Map<number, number>(); for (const arr of byDiv.values()) arr.forEach((p, i) => rankDiv.set(p.id, i + 1));
      const lineAvg = (arr: RegionPlayer[]) => { const m = new Map<Line, number[]>(); for (const p of arr) { const l = lineOf(p.position); if (l) (m.get(l) ?? m.set(l, []).get(l)!).push(p.rating as number); } return m; };
      const lineRegion = lineAvg(ratedPool);
      // Средние по группе позиций (опорный — среди опорных): для «к амплуа лиги».
      const groupAvg = (arr: RegionPlayer[]) => { const m = new Map<PositionGroup, number[]>(); for (const p of arr) { const g = positionGroup(p.position); if (g) (m.get(g) ?? m.set(g, []).get(g)!).push(p.rating as number); } return m; };
      const groupRegion = groupAvg(ratedPool);
      const groupByDiv = new Map<DivisionKey | null, Map<PositionGroup, number[]>>(); for (const [k, arr] of byDiv) groupByDiv.set(k, groupAvg(arr));
      const lineByDiv = new Map<DivisionKey | null, Map<Line, number[]>>(); for (const [k, arr] of byDiv) lineByDiv.set(k, lineAvg(arr));
      const topRated = (byDiv.get('Высшая') ?? []).map((p) => p.rating as number);
      const firstRated = (byDiv.get('Первая') ?? []).map((p) => p.rating as number);
      medians.push({ year, top: median(topRated), first: median(firstRated), ratedTop: topRated.length, ratedFirst: firstRated.length });

      // Средний класс команд дивизиона (по командам, а не по игрокам) — для ранга команды.
      const teamAvgByKey = new Map<string, { avg: number; div: DivisionKey | null }>();
      {
        const acc = new Map<string, { xs: number[]; div: DivisionKey | null }>();
        for (const p of ratedPool) { const k = normTeam(clubName(p.club)); (acc.get(k) ?? acc.set(k, { xs: [], div: divKeyOf(p) }).get(k)!).xs.push(p.rating as number); }
        for (const [k, v] of acc) if (v.xs.length >= 3) teamAvgByKey.set(k, { avg: avg(v.xs) as number, div: v.div });
      }
      {
        const memberKeys = new Set(teamsOfYear.map((t) => t.clubKey));
        const others = ratedPool.filter((p) => !memberKeys.has(normTeam(clubName(p.club)))).map((p) => {
          const ck = normTeam(clubName(p.club));
          const rr = rankRegion.get(p.id) as number;
          return { p, clubKey: ck, club: clubName(p.club), div: divKeyOf(p), divName: divByKey.get(ck) ?? 'Лига', teamAvg: teamAvgByKey.get(ck)?.avg ?? null, rankRegion: rr, pctRegion: Math.max(1, Math.round((rr / ratedPool.length) * 100)) };
        });
        othersByYear.set(year, others);
      }
      // Разобранные туры команды (туры, где хоть один её игрок получил оценку) — для «выпал из
      // ротации»: считаем, сколько разобранных матчей команды прошло ПОСЛЕ последней оценки игрока.
      const teamToursByKey = new Map<string, Set<number>>();
      for (const p of pool) { const k = normTeam(clubName(p.club)); const set = teamToursByKey.get(k) ?? teamToursByKey.set(k, new Set()).get(k)!; for (const s of p.series ?? []) set.add(s.tour); }
      const teamLastTourByKey = new Map<string, number>();
      for (const [k, set] of teamToursByKey) teamLastTourByKey.set(k, Math.max(...set));

      for (const t of teamsOfYear) {
        const mine = pool.filter((p) => normTeam(clubName(p.club)) === t.clubKey);
        const dk = t.divisionKey;
        const lineDiv = lineByDiv.get(dk) ?? new Map<Line, number[]>();
        const groupDiv = groupByDiv.get(dk) ?? new Map<PositionGroup, number[]>();
        const squad: LeaguePlayer[] = mine.map((p) => {
          const line = lineOf(p.position);
          const group = positionGroup(p.position);
          const isRated = rated(p);
          const series = p.series ?? [];
          const lastN = series.slice(-TREND_LAST_N).map((s) => Math.round(s.rating));
          // Рейтинг за матч сильно шумит (замена = 15 очков, полный матч = 1000), поэтому тренд —
          // средние по окнам: последние N матчей против всех предыдущих, и только от 6 матчей.
          const prev = series.slice(0, -TREND_LAST_N).map((s) => s.rating);
          const trend = isRated && series.length >= TREND_MIN_MATCHES && prev.length >= 2 ? Math.round(lastN.reduce((a, b) => a + b, 0) / lastN.length - prev.reduce((a, b) => a + b, 0) / prev.length) : null;
          const lastTour = series.length ? series[series.length - 1]!.tour : null;
          const teamLastTour = teamLastTourByKey.get(t.clubKey) ?? null;
          const missedAfter = lastTour == null ? 0 : [...(teamToursByKey.get(t.clubKey) ?? [])].filter((x) => x > lastTour).length;
          const inRotation = lastTour == null || missedAfter < ROTATION_GAP_TOURS;
          // «Амплуа» — группа позиции; если в группе мало игроков дивизиона — линия.
          const gDiv = group ? groupDiv.get(group) ?? [] : [];
          const lineAvgDiv = gDiv.length >= 5 ? avg(gDiv) : line ? avg(lineDiv.get(line) ?? []) : null;
          const gReg = group ? groupRegion.get(group) ?? [] : [];
          const lineAvgRegion = gReg.length >= 5 ? avg(gReg) : line ? avg(lineRegion.get(line) ?? []) : null;
          const rr = isRated ? rankRegion.get(p.id) ?? null : null;
          const fm = formsByYear.get(year)?.get(p.id);
          return {
            id: p.id, name: p.name, photo: p.photo, position: p.position, line, group,
            birthYear: p.birthYear ?? year, clubKey: t.clubKey, clubLabel: t.clubLabel, teamKey: t.key, team: p.club ?? t.name,
            division: t.division, divisionKey: dk,
            rating: isRated ? p.rating : null, mp: p.mp,
            rankDiv: isRated ? rankDiv.get(p.id) ?? null : null, sizeDiv: (byDiv.get(dk) ?? []).length,
            rankRegion: rr, sizeRegion: ratedPool.length,
            pctRegion: rr != null && ratedPool.length ? Math.max(1, Math.round((rr / ratedPool.length) * 100)) : null,
            lineAvgDiv, lineAvgRegion, deltaLine: isRated && lineAvgDiv != null ? (p.rating as number) - lineAvgDiv : null,
            trend, last: lastN, lastTour, teamLastTour, inRotation,
            index: fm?.index ?? null, indexPct: fm?.indexPct ?? null, minutes: fm ? Math.round(fm.minutes) : null, formDelta: fm?.formDelta ?? null,
          };
        }).sort((a, b) => ((b.rating ?? -1) - (a.rating ?? -1)) || (b.mp - a.mp));
        allPlayers.push(...squad);

        const squadRated = squad.filter((p) => p.rating != null);
        const teamAvg = avg(squadRated.map((p) => p.rating as number));
        const divTeams = [...teamAvgByKey.entries()].filter(([, v]) => v.div === dk).sort((a, b) => b[1].avg - a[1].avg);
        const divRank = divTeams.findIndex(([k]) => k === t.clubKey);
        const lines: LineCompare[] = (['GK', 'DEF', 'MID', 'FWD'] as Line[]).map((line) => {
          const xs = squadRated.filter((p) => p.line === line).map((p) => p.rating as number);
          const teamL = avg(xs), divL = avg(lineDiv.get(line) ?? []);
          const gapRel = teamL != null && divL ? Math.round(((teamL - divL) / divL) * 100) / 100 : null;
          const verdict: LineCompare['verdict'] = gapRel == null || xs.length < 2 ? null : gapRel <= -LINE_GAP_REL ? 'weak' : gapRel >= LINE_GAP_REL ? 'strong' : 'ok';
          return { line, title: LINE_TITLE[line], teamAvg: teamL, divAvg: divL, n: xs.length, gapRel, verdict };
        });
        teamsOut.push({
          key: t.key, clubKey: t.clubKey, clubLabel: t.clubLabel, name: t.name, year, category: t.category, ageTitle: t.ageTitle,
          division: t.division, divisionKey: dk,
          avgRating: teamAvg, divAvgRating: avg(divTeams.map(([, v]) => v.avg)), divRankByAvg: divRank >= 0 ? divRank + 1 : null, divTeams: divTeams.length,
          place: t.standing?.place ?? null, placeSize: t.standing?.size ?? null,
          ratingRank: t.rating?.rank ?? null, ratingSize: t.rating?.size ?? null,
          // Одна мера «силы» по всему кабинету — средний рейтинг состава среди команд дивизиона
          // (то, что показано на плитке и рассеянии); командный рейтинг AvanData — запасной.
          overperformance: t.standing && divRank >= 0 ? divRank + 1 - t.standing.place : t.standing && t.rating ? t.rating.rank - t.standing.place : null,
          lines, squad, inTop30: t.squad.inTop30, rated: squadRated.length,
          divMap: t.table.map((row, i) => ({ name: row.name.replace(/\s*20\d{2}(-20\d{2})?\s*$/, ''), place: i + 1, strength: teamAvgByKey.get(normTeam(clubName(row.name)))?.avg ?? null, mine: row.isMember && normTeam(clubName(row.name)) === t.clubKey })),
        });
      }
    }

    // ─── Решения ────────────────────────────────────────────────────────────
    const decisionReady = (p: LeaguePlayer) => p.rating != null && p.mp >= MIN_MATCHES_DECISION;
    const youthPool = allPlayers.filter((p) => p.birthYear <= cfg.youthFromYear && p.rating != null && p.pctRegion != null);
    const youth = { ready: [] as YouthCandidate[], watch: [] as YouthCandidate[], rest: [] as YouthCandidate[] };
    for (const p of youthPool.sort((a, b) => (b.rating as number) - (a.rating as number))) {
      const tier: YouthCandidate['tier'] = (p.pctRegion as number) <= YOUTH_READY_PCT && p.mp >= MIN_MATCHES_READY ? 'ready'
        : (p.pctRegion as number) <= YOUTH_WATCH_PCT && p.mp >= MIN_MATCHES_DECISION ? 'watch' : 'rest';
      youth[tier].push({ ...p, tier });
    }
    const medByYear = new Map(medians.map((m) => [m.year, m]));
    const promote = allPlayers.filter((p) => p.divisionKey === 'Первая' && decisionReady(p) && (medByYear.get(p.birthYear)?.top ?? Infinity) <= (p.rating as number))
      .sort((a, b) => (b.rating as number) - (a.rating as number));
    const risk = allPlayers.filter((p) => p.divisionKey === 'Высшая' && decisionReady(p) && (p.rating as number) < (medByYear.get(p.birthYear)?.first ?? -Infinity))
      .sort((a, b) => (a.rating as number) - (b.rating as number));
    const losing: LosingPlayer[] = [];
    for (const p of allPlayers) {
      if (p.rating == null || p.mp < MIN_MATCHES_DECISION) continue;
      // Падение формы — по честному счёту (минуты, свой возраст, своя позиция), если он готов:
      // последние 3 матча ниже своего сезона на 1+ балл (шкала 5–10). Иначе — старое правило.
      const fallen = p.formDelta != null ? p.formDelta <= LOSING_FORM_DELTA : (p.trend != null && p.trend / (p.rating as number) <= LOSING_TREND_REL);
      if (fallen) losing.push({ ...p, reason: 'trend' });
      else if (!p.inRotation) losing.push({ ...p, reason: 'rotation' });
    }
    losing.sort((a, b) => (b.rating as number) - (a.rating as number));
    const weakLines: LineIssue[] = [], strongLines: LineIssue[] = [];
    for (const t of teamsOut) for (const l of t.lines) {
      if (l.verdict === 'weak' || l.verdict === 'strong') {
        const issue: LineIssue = { teamKey: t.key, clubLabel: t.clubLabel, year: t.year, category: t.category, line: l.line, title: l.title, teamAvg: l.teamAvg as number, divAvg: l.divAvg as number, gapRel: l.gapRel as number };
        (l.verdict === 'weak' ? weakLines : strongLines).push(issue);
      }
    }
    weakLines.sort((a, b) => a.gapRel - b.gapRel); strongLines.sort((a, b) => b.gapRel - a.gapRel);

    // На возраст старше внутри школы: рейтинг не ниже медианы оценённых игроков старшей команды той же школы.
    const olderAge: OlderAgeCandidate[] = [];
    for (const t of teamsOut) {
      const older = teamsOut.find((o) => o.clubKey === t.clubKey && o.year === t.year - 1);
      if (!older) continue;
      const olderRated = older.squad.filter((p) => p.rating != null).map((p) => p.rating as number).sort((a, b) => b - a);
      const med = median(olderRated);
      if (med == null || olderRated.length < 5) continue;
      for (const p of t.squad) {
        if (!decisionReady(p) || (p.rating as number) < med) continue;
        const olderRank = olderRated.filter((r) => r > (p.rating as number)).length + 1;
        olderAge.push({ ...p, olderTeamKey: older.key, olderTeamName: older.name, olderMedian: med, olderRank, olderSize: olderRated.length });
      }
    }
    olderAge.sort((a, b) => (b.rating as number) - (a.rating as number));

    // Селекция: чужие игроки, которые усилили бы линию нашей команды. Берём только тех, кто
    // играет в команде слабее нашей (средний класс ниже) или лигой ниже — «незамеченные»,
    // а не звёзды лидеров. Без имён: команда, амплуа, рейтинг, место в регионе.
    const SELECTION_TOP_PCT = 35; const SELECTION_PER_LINE = 5;
    const selection: SelectionGroup[] = [];
    for (const t of teamsOut) {
      const others = othersByYear.get(t.year) ?? [];
      const weaker = others.filter((o) => (o.div === 'Первая' && t.divisionKey === 'Высшая') || (o.teamAvg != null && t.avgRating != null && o.teamAvg < t.avgRating));
      for (const line of ['GK', 'DEF', 'MID', 'FWD'] as Line[]) {
        const ours = t.squad.filter((p) => p.line === line && p.rating != null).map((p) => p.rating as number);
        const ourAvg = avg(ours), ourBest = ours.length ? Math.max(...ours) : null;
        const bar = ourAvg == null ? null : Math.round(ourAvg * 1.1);
        const cands = weaker
          .filter((o) => lineOf(o.p.position) === line && o.p.mp >= MIN_MATCHES_DECISION && o.pctRegion <= SELECTION_TOP_PCT && (bar == null || (o.p.rating as number) >= bar))
          .sort((a, b) => (b.p.rating as number) - (a.p.rating as number)).slice(0, SELECTION_PER_LINE)
          .map((o): SelectionCandidate => {
            const series = o.p.series ?? []; const lastN = series.slice(-TREND_LAST_N).map((x) => x.rating);
            return { id: o.p.id, line, position: o.p.position, club: o.club, division: o.divName, divisionKey: o.div, rating: o.p.rating as number, pctRegion: o.pctRegion, rankRegion: o.rankRegion, mp: o.p.mp, trend: lastN.length >= 2 ? Math.round(lastN.reduce((x, y) => x + y, 0) / lastN.length - (o.p.rating as number)) : null };
          });
        if (cands.length) selection.push({ teamKey: t.key, clubLabel: t.clubLabel, year: t.year, category: t.category, division: t.division, line, title: LINE_TITLE[line], ourAvg, ourBest, ourN: ours.length, candidates: cands });
      }
    }

    const mineById = new Map(allPlayers.map((p) => [p.id, p]));
    const swarm: HoldingAnalytics['swarm'] = [...formsByYear.entries()].sort((x, y) => y[0] - x[0]).map(([year, forms]) => ({
      year,
      points: [...forms.entries()].filter(([, f]) => f.index != null).map(([id, f]) => {
        const m = mineById.get(id);
        return m ? { id, index: f.index as number, mine: true, name: m.name, teamKey: m.teamKey } : { id, index: f.index as number, mine: false };
      }),
    }));
    const result: HoldingAnalytics = {
      slug: cfg.slug, season: seasonId, asOf: new Date().toISOString(), toursBack,
      youthFromYear: cfg.youthFromYear, youthSlots: cfg.youthSlots,
      thresholds: { youthReadyPct: YOUTH_READY_PCT, youthWatchPct: YOUTH_WATCH_PCT, minMatchesReady: MIN_MATCHES_READY, minMatchesDecision: MIN_MATCHES_DECISION, losingTrendRel: LOSING_TREND_REL, lineGapRel: LINE_GAP_REL },
      teams: teamsOut, medians, youth, promote, olderAge, selection, risk, losing, weakLines, strongLines,
      players: allPlayers.filter((p) => p.rating != null).sort((a, b) => (b.rating as number) - (a.rating as number)),
      swarm,
    };
    if (toursBack === 0) { lastAnalytics.set(`${cfg.slug}:${seasonId}`, result); void saveHoldingCache(cfg.slug, seasonId, 'analytics', result); }
    return result;
  });
}

async function tournamentIdOfYear(seasonId: number, year: number): Promise<number | undefined> {
  const { listTournaments } = await import('./avandataSource.js');
  return (await listTournaments(seasonId)).find((r) => r.ageFrom === year)?.tournamentId;
}

export { holdingProfile, type HoldingTeam };
