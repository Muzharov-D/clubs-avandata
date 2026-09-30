/**
 * Холдинги — группа школ одного бренда, показываемая как единая вертикаль в кабинете
 * федерации (первый: «Динамо Санкт-Петербург» = ФК Динамо + Царское Село-Динамо).
 *
 * Данные — те же, что у остального кабинета (back.avandata.ru + официальные таблицы
 * ФФСПб через regionStandings), но БЕЗ срезов «топ-10 на дивизион» и «24 последних
 * матча региона»: холдинг должен видеть каждую свою команду целиком, даже если она
 * внизу Первой лиги. Участники сшиваются ТОЛЬКО по имени через normTeam (у источников
 * разные пространства id), поэтому конфиг хранит ключи имён, а не id.
 */
import {
  listTournaments, regionStandings, regionPlayers, clubName, cached, pmap, TTL,
  type RegionPlayer, type ClubStandRow, type TournamentRef,
} from './avandataSource.js';
import { getClubRatingsByTournament, getMatches, type AvRatingTeam, type AvMatch } from '../services/avandataApi.js';
import { normTeam } from './teamName.js';
import { classifyDivision, type DivisionKey } from './division.js';
import { logger } from '../shared/logger.js';

// ─── Конфигурация ────────────────────────────────────────────────────────────
export interface HoldingBrand {
  /** Фирменный цвет (из логотипа) — заливки, рамки. */
  primary: string;
  /** Светлый вариант для текста/чисел на тёмном фоне кабинета. */
  bright: string;
  /** Полупрозрачная заливка карточек. */
  soft: string;
  /** Текст поверх primary. */
  onPrimary: string;
}
export interface HoldingMember { key: string; label: string }
export interface HoldingConfig {
  slug: string; name: string; short: string; region: string;
  brand: HoldingBrand;
  members: HoldingMember[];
  /** Годы рождения, которые входят в вертикаль (U14–U18 сезона 2026 = 2013–2009). */
  years: number[];
}

export const HOLDINGS: HoldingConfig[] = [
  {
    slug: 'dinamo-spb',
    name: 'Динамо Санкт-Петербург',
    short: 'Динамо СПб',
    region: 'Первенство Санкт-Петербурга',
    // Синий взят из логотипа клуба (#004098); bright — тот же тон, читаемый на тёмном фоне.
    brand: { primary: '#004098', bright: '#5d95ff', soft: 'rgba(0, 64, 152, 0.30)', onPrimary: '#ffffff' },
    members: [
      { key: normTeam('ФК Динамо'), label: 'ФК Динамо' },
      { key: normTeam('Царское Село-Динамо'), label: 'Царское Село-Динамо' },
    ],
    years: [2009, 2010, 2011, 2012, 2013],
  },
];

export const findHolding = (slug: string): HoldingConfig | undefined => HOLDINGS.find((h) => h.slug === slug);

/** Публичная часть конфига (без служебного) — для списка в навигации и карточки клуба. */
export interface HoldingSummaryInfo { slug: string; name: string; short: string; brand: HoldingBrand; members: HoldingMember[]; years: number[] }
export const publicHolding = (h: HoldingConfig): HoldingSummaryInfo =>
  ({ slug: h.slug, name: h.name, short: h.short, brand: h.brand, members: h.members, years: h.years });

/** Участник холдинга по названию команды/клуба (в любом написании источников), либо null. */
export const memberOf = (cfg: Pick<HoldingConfig, 'members'>, teamName: string | null | undefined): HoldingMember | null => {
  if (!teamName) return null;
  const key = normTeam(clubName(teamName)) || normTeam(teamName);
  return cfg.members.find((m) => m.key === key) ?? null;
};

// ─── Ответ ───────────────────────────────────────────────────────────────────
export type Outcome = 'w' | 'd' | 'l';
export interface HoldingMatchSide { name: string; logo: string | null; score: number | null; isMember: boolean }
export interface HoldingMatch {
  id: number; date: string; tour: number; age: string; division: string;
  home: HoldingMatchSide; away: HoldingMatchSide;
  /** Итог для команды холдинга; null — матч не сыгран. */
  outcome: Outcome | null;
  played: boolean;
}
export interface HoldingPlayer {
  id: number; name: string; birthYear: number | null; position: string | null;
  rating: number | null; mp: number; photo: string | null;
  team: string; clubKey: string; clubLabel: string; division: string;
}
export interface HoldingStanding { place: number; size: number; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
export interface HoldingTableRow extends ClubStandRow { isMember: boolean }
export interface HoldingTeam {
  /** `${clubKey}:${year}` — стабильный ключ для фронта. */
  key: string;
  clubKey: string; clubLabel: string;
  name: string; logo: string | null;
  year: number; category: string; ageTitle: string;
  division: string; divisionKey: DivisionKey | null;
  standing: HoldingStanding | null;
  standingsSource: 'ffspb' | 'mirror'; standingsDegraded: boolean;
  table: HoldingTableRow[];
  rating: { value: number; rank: number; size: number } | null;
  squad: { players: number; rated: number; avgRating: number | null; inTop30: number };
  top: HoldingPlayer[];
  form: Outcome[];
  last: HoldingMatch | null;
  next: HoldingMatch | null;
  matches: HoldingMatch[];
}
export interface HoldingXi { line: 'GK' | 'DEF' | 'MID' | 'FWD'; players: HoldingPlayer[] }
export interface HoldingProfile {
  slug: string; name: string; short: string; region: string; brand: HoldingBrand;
  season: number; asOf: string;
  members: Array<HoldingMember & { logo: string | null; teams: number }>;
  years: number[];
  summary: {
    teams: number; byDivision: Array<{ division: string; teams: number }>;
    avgPlace: number | null; sumRating: number;
    players: number; rated: number; inTop30: number;
    won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number;
  };
  teams: HoldingTeam[];
  topPlayers: HoldingPlayer[];
  xi: HoldingXi[];
}

// ─── Чистые помощники (тестируются офлайн) ───────────────────────────────────
/** «Первенство … до 16 лет …» → «до 16 лет»; иначе категория (U16). */
export const ageTitleOf = (fullTitle: string, category: string): string => {
  const m = fullTitle.match(/до (\d+) лет/);
  return m ? `до ${m[1]} лет` : category;
};

/** Итог матча для стороны: null, если счёта нет (не сыгран). */
export const outcomeFor = (gf: number | null | undefined, ga: number | null | undefined, played: boolean): Outcome | null => {
  if (!played || gf == null || ga == null) return null;
  return gf > ga ? 'w' : gf < ga ? 'l' : 'd';
};

/** Форма — итоги последних N сыгранных матчей, от старого к новому. */
export const formOf = (matches: HoldingMatch[], n = 5): Outcome[] =>
  matches.filter((m): m is HoldingMatch & { outcome: Outcome } => m.outcome != null)
    .slice(0, n).reverse().map((m) => m.outcome);

/** Линия амплуа по названию роли (та же логика, что во фронте utils.lineOf). */
export const lineOf = (pos: string | null): HoldingXi['line'] | null => {
  const p = (pos ?? '').toLowerCase();
  if (/врат/.test(p)) return 'GK';
  if ((/защит/.test(p) || /фланг защиты/.test(p) || /фулбек/.test(p)) && !/полуз/.test(p)) return 'DEF';
  if (/полуз|опорн/.test(p)) return 'MID';
  if (/напад|форвард|фланг атаки/.test(p)) return 'FWD';
  return null;
};

/** Сборная холдинга: 1-4-3-3 из игроков с рейтингом (≥2 матчей), лучшие в своей линии. */
export const pickXi = (players: HoldingPlayer[]): HoldingXi[] => {
  const quota: Array<[HoldingXi['line'], number]> = [['GK', 1], ['DEF', 4], ['MID', 3], ['FWD', 3]];
  const rated = players.filter((p) => p.rating != null && p.mp >= 2).sort((a, b) => (b.rating as number) - (a.rating as number));
  return quota.map(([line, n]) => ({ line, players: rated.filter((p) => lineOf(p.position) === line).slice(0, n) }));
};

// ─── Сборка ──────────────────────────────────────────────────────────────────
const toPlayer = (p: RegionPlayer, m: HoldingMember, division: string): HoldingPlayer => ({
  id: p.id, name: p.name, birthYear: p.birthYear, position: p.position, rating: p.rating, mp: p.mp, photo: p.photo,
  team: p.club ?? m.label, clubKey: m.key, clubLabel: m.label, division,
});

const toMatch = (m: AvMatch, ref: TournamentRef, tour: number, cfg: HoldingConfig, memberKey: string): HoldingMatch => {
  const side = (t: AvMatch['ownTeam']): HoldingMatchSide => ({
    name: t.title, logo: t.logoUrl ?? null, score: t.score ?? null, isMember: memberOf(cfg, t.title)?.key === memberKey,
  });
  const home = side(m.ownTeam), away = side(m.guestTeam);
  // status 'ready' = матч сыгран (created/assigned — календарь). Но 'ready' со счётом 0:0 в
  // зеркале — почти всегда незаполненный протокол (проверено по таблицам: у команд с одной
  // ничьей за сезон таких «0:0» несколько), поэтому, как и regionResults, сыгранным считаем
  // только матч с голами. Реальные 0:0 в детском футболе редки — терпимая потеря.
  const played = m.status === 'ready' && (home.score ?? 0) + (away.score ?? 0) > 0;
  const us = home.isMember ? home : away, them = home.isMember ? away : home;
  return {
    id: m.id, date: m.dateTime, tour, age: ref.category, division: ref.divisionTitle,
    home, away, played, outcome: outcomeFor(us.score, them.score, played),
  };
};

// Профиль тяжёлый (туры всех когорт + таблицы ФФСПб с ретраями): холодная сборка занимает
// десятки секунд. Поэтому — stale-while-revalidate: протухший профиль отдаём сразу, а свежий
// собираем фоном; параллельные холодные запросы дедуплицируются одним inflight. Плюс прогрев
// на старте и по расписанию (warmHoldings), чтобы пользователь не ловил холодный старт.
const swrLast = new Map<string, { at: number; val: HoldingProfile }>();
const swrInflight = new Map<string, Promise<HoldingProfile>>();

/** Полный профиль холдинга за сезон (SWR-кэш поверх сборки buildHoldingProfile). */
export async function holdingProfile(seasonId: number, cfg: HoldingConfig): Promise<HoldingProfile> {
  const key = `${cfg.slug}:${seasonId}`;
  const last = swrLast.get(key);
  if (last && Date.now() - last.at < TTL) return last.val;
  let inflight = swrInflight.get(key);
  if (!inflight) {
    inflight = buildHoldingProfile(seasonId, cfg)
      .then((val) => { swrLast.set(key, { at: Date.now(), val }); return val; })
      .finally(() => swrInflight.delete(key));
    swrInflight.set(key, inflight);
    inflight.catch((e: unknown) => logger.warn({ err: String(e), holding: cfg.slug }, '[holding] сборка профиля упала'));
  }
  if (last) return last.val;            // протухший — отдаём сразу, свежий доедет фоном
  return inflight;
}

/** Профиль, если он есть или соберётся за waitMs; иначе — «идёт прогрев», и фронт опрашивает
 *  повторно. Нужно, чтобы холодная сборка (минуты через ретраи ФФСПб) не упиралась в таймаут
 *  HTTP-запроса (у Node — 5 минут) и не роняла клиента в ошибку. */
export async function holdingProfileOrWarming(seasonId: number, cfg: HoldingConfig, waitMs = 25_000): Promise<{ profile: HoldingProfile } | { warming: true }> {
  const guarded = holdingProfile(seasonId, cfg).then((profile) => ({ profile }), (error: unknown) => ({ error }));
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ warming: true }>((resolve) => { timer = setTimeout(() => resolve({ warming: true }), waitMs); });
  const res = await Promise.race([guarded, timeout]);
  if (timer) clearTimeout(timer);
  if ('error' in res) throw res.error;
  return res;
}

/** Прогрев всех холдингов (старт сервера + планировщик). Ошибки глотаем — это фон. */
export async function warmHoldings(seasonId: number): Promise<void> {
  for (const cfg of HOLDINGS) {
    try { await holdingProfile(seasonId, cfg); } catch { /* залогировано в holdingProfile */ }
  }
}

async function buildHoldingProfile(seasonId: number, cfg: HoldingConfig): Promise<HoldingProfile> {
  return cached(`holding:${cfg.slug}:${seasonId}`, TTL, async () => {
    const allRefs = await listTournaments(seasonId);
    const years = cfg.years.filter((y) => allRefs.some((r) => r.ageFrom === y)).sort((a, b) => b - a);
    const teams: HoldingTeam[] = [];
    const allPlayers: HoldingPlayer[] = [];

    // Когорты собираем параллельно (по 3): сборка I/O-bound, узкое место — ретраи таблиц ФФСПб.
    await pmap(years, 3, async (year) => {
      const refs = allRefs.filter((r) => r.ageFrom === year);
      const tid = refs[0]?.tournamentId;
      if (tid == null) return;

      const [standings, ratings, players] = await Promise.all([
        regionStandings(seasonId, year),
        getClubRatingsByTournament(seasonId, tid).catch((e: unknown) => { logger.warn({ err: String(e), year }, '[holding] рейтинг когорты недоступен'); return [] as AvRatingTeam[]; }),
        regionPlayers(seasonId, year),
      ]);

      // Дивизион команды — по рейтингу AvanData (там division у каждой команды), запасной путь — таблица.
      const divisionByKey = new Map<string, string>();
      for (const t of ratings) if (t.division?.name) divisionByKey.set(normTeam(t.name), t.division.name);
      for (const g of standings.groups) for (const r of g.rows) if (!divisionByKey.has(normTeam(r.name))) divisionByKey.set(normTeam(r.name), g.division);

      // Топ-30 когорты по дивизиону — «таланты лиги» (та же методика, что talentConcentration).
      const top30ByDiv = new Map<DivisionKey | null, Set<number>>();
      {
        const byDiv = new Map<DivisionKey | null, RegionPlayer[]>();
        for (const p of players) {
          if (p.rating == null || p.mp < 2) continue;
          const dk = classifyDivision(divisionByKey.get(normTeam(clubName(p.club))) ?? '');
          (byDiv.get(dk) ?? byDiv.set(dk, []).get(dk)!).push(p);
        }
        for (const [dk, arr] of byDiv) {
          arr.sort((a, b) => (b.rating as number) - (a.rating as number));
          top30ByDiv.set(dk, new Set(arr.slice(0, 30).map((p) => p.id)));
        }
      }

      for (const member of cfg.members) {
        // Команда участника в этой когорте: ищем в рейтинге (есть у всех), иначе в таблице.
        const ratingRow = ratings.find((t) => normTeam(t.name) === member.key);
        let standRow: ClubStandRow | undefined; let standGroup: (typeof standings.groups)[number] | undefined;
        for (const g of standings.groups) { const r = g.rows.find((x) => normTeam(x.name) === member.key); if (r) { standRow = r; standGroup = g; break; } }
        if (!ratingRow && !standRow) continue; // в этой когорте у школы команды нет

        const division = ratingRow?.division?.name ?? standGroup?.division ?? 'Лига';
        const divisionKey = classifyDivision(division);
        const ref = refs.find((r) => classifyDivision(r.divisionTitle) === divisionKey) ?? refs[0]!;

        // Рейтинг и место по рейтингу внутри дивизиона когорты (без среза топ-10).
        let rating: HoldingTeam['rating'] = null;
        if (ratingRow) {
          const pool = ratings.filter((t) => t.division?.id === ratingRow.division?.id).sort((a, b) => b.points - a.points);
          rating = { value: ratingRow.points, rank: pool.findIndex((t) => t.id === ratingRow.id) + 1, size: pool.length };
        }

        // Место в турнирной таблице дивизиона (официальный порядок ФФСПб или зеркало).
        let standing: HoldingStanding | null = null;
        const table: HoldingTableRow[] = (standGroup?.rows ?? []).map((r) => ({ ...r, isMember: normTeam(r.name) === member.key }));
        if (standRow && standGroup) {
          const idx = standGroup.rows.indexOf(standRow);
          standing = { place: idx + 1, size: standGroup.rows.length, played: standRow.played, won: standRow.won, drawn: standRow.drawn, lost: standRow.lost, goalDiff: standRow.goalDiff, points: standRow.points };
        }

        // Состав когорты: игроки этой школы с разобранных матчей.
        const mine = players.filter((p) => normTeam(clubName(p.club)) === member.key).map((p) => toPlayer(p, member, division));
        const rated = mine.filter((p) => p.rating != null && p.mp >= 2).sort((a, b) => (b.rating as number) - (a.rating as number));
        const top30 = top30ByDiv.get(divisionKey) ?? new Set<number>();
        const squad = {
          players: mine.length, rated: rated.length,
          avgRating: rated.length ? Math.round(rated.reduce((s, p) => s + (p.rating as number), 0) / rated.length) : null,
          inTop30: rated.filter((p) => top30.has(p.id)).length,
        };
        allPlayers.push(...mine);

        // Матчи команды: все туры дивизиона (+2 вперёд — календарь), фильтр по участнику.
        const tours = Array.from({ length: Math.max(1, ref.lastPlayedTour) + 2 }, (_, i) => i + 1);
        const lists = await pmap(tours, 6, async (tour) => {
          try { return (await getMatches(ref.tournamentId, ref.divisionId, tour)).map((m) => ({ m, tour })); } catch { return []; }
        });
        const matches = lists.flat()
          .filter(({ m }) => memberOf(cfg, m.ownTeam.title)?.key === member.key || memberOf(cfg, m.guestTeam.title)?.key === member.key)
          .map(({ m, tour }) => toMatch(m, ref, tour, cfg, member.key))
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const played = matches.filter((m) => m.played);
        // «Следующий» — ближайший несыгранный не раньше вчера (в источнике встречаются старые
        // незакрытые матчи со статусом assigned — это не календарь).
        const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const upcoming = matches.filter((m) => !m.played && m.date >= yesterday).sort((a, b) => (a.date < b.date ? -1 : 1));

        teams.push({
          key: `${member.key}:${year}`, clubKey: member.key, clubLabel: member.label,
          name: ratingRow?.name ?? standRow?.name ?? `${member.label} ${year}`,
          logo: ratingRow?.logo ?? standRow?.logo ?? null,
          year, category: ref.category, ageTitle: ageTitleOf(ref.fullTitle, ref.category),
          division, divisionKey,
          standing, standingsSource: standings.source, standingsDegraded: standings.degraded, table,
          rating, squad, top: rated.slice(0, 3),
          form: formOf(played), last: played[0] ?? null, next: upcoming[0] ?? null, matches,
        });
      }
    });

    // Порядок: старшие когорты сверху, внутри — по порядку участников в конфиге.
    const memberIdx = new Map(cfg.members.map((m, i) => [m.key, i]));
    teams.sort((a, b) => (b.year - a.year) || ((memberIdx.get(a.clubKey) ?? 0) - (memberIdx.get(b.clubKey) ?? 0)));

    const places = teams.map((t) => t.standing?.place).filter((p): p is number => p != null);
    const wdl = teams.reduce((acc, t) => {
      if (t.standing) { acc.won += t.standing.won; acc.drawn += t.standing.drawn; acc.lost += t.standing.lost; }
      for (const m of t.matches) if (m.played) { const us = m.home.isMember ? m.home : m.away, them = m.home.isMember ? m.away : m.home; acc.gf += us.score ?? 0; acc.ga += them.score ?? 0; }
      return acc;
    }, { won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 });
    const byDivision = new Map<string, number>();
    for (const t of teams) byDivision.set(t.division, (byDivision.get(t.division) ?? 0) + 1);

    const ratedAll = allPlayers.filter((p) => p.rating != null && p.mp >= 2).sort((a, b) => (b.rating as number) - (a.rating as number));
    return {
      slug: cfg.slug, name: cfg.name, short: cfg.short, region: cfg.region, brand: cfg.brand,
      season: seasonId, asOf: new Date().toISOString(),
      members: cfg.members.map((m) => ({ ...m, logo: teams.find((t) => t.clubKey === m.key && t.logo)?.logo ?? null, teams: teams.filter((t) => t.clubKey === m.key).length })),
      years,
      summary: {
        teams: teams.length,
        byDivision: [...byDivision.entries()].map(([division, n]) => ({ division, teams: n })),
        avgPlace: places.length ? Math.round((places.reduce((s, p) => s + p, 0) / places.length) * 10) / 10 : null,
        sumRating: teams.reduce((s, t) => s + (t.rating?.value ?? 0), 0),
        players: allPlayers.length, rated: ratedAll.length,
        inTop30: teams.reduce((s, t) => s + t.squad.inTop30, 0),
        won: wdl.won, drawn: wdl.drawn, lost: wdl.lost, goalsFor: wdl.gf, goalsAgainst: wdl.ga,
      },
      teams,
      topPlayers: ratedAll.slice(0, 10),
      xi: pickXi(allPlayers),
    };
  });
}
