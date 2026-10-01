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
  listTournaments, regionStandings, regionPlayers, clubName, cached, pmap, TTL, resolveFfspbTournament,
  type RegionPlayer, type ClubStandRow, type TournamentRef,
} from './avandataSource.js';
import { tournamentMatches, tableFromMatches, findTeam, FfspbWarmingError, type FfMatch } from './ffspbLive.js';
import { getClubRatingsByTournament, getMatches, type AvRatingTeam, type AvMatch } from '../services/avandataApi.js';
import { normTeam } from './teamName.js';
import { classifyDivision, type DivisionKey } from './division.js';
import { logger } from '../shared/logger.js';
import { eq } from 'drizzle-orm';
import { prefetchLogos } from '../public/logos.js';
import { seedAnalytics, type HoldingAnalytics } from './holdingAnalytics.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { holdingProfileCache } from '../db/schema/holding.js';
import { setLeagueMatches } from './holdingIndex.js';

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
export interface HoldingMember { key: string; label: string; /** Логотип школы — в конфиге, чтобы шапка не ждала профиль. */ logo?: string | null }
export interface HoldingConfig {
  slug: string; name: string; short: string; region: string;
  brand: HoldingBrand;
  members: HoldingMember[];
  /** Годы рождения, которые входят в вертикаль (U14–U18 сезона 2026 = 2013–2009). */
  years: number[];
  /** С какого года рождения (и старше) игроков рекомендуют в молодёжную команду. */
  youthFromYear: number;
  /** Сколько мест в молодёжной команде реально закрыть за сезон — столько «готовых» показываем первыми. */
  youthSlots: number;
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
      { key: normTeam('ФК Динамо'), label: 'ФК Динамо', logo: 'https://s3.twcstorage.ru/spa-new-prod/HUYoJ4Vd_1785147263866_iygwvjntx4g.png' },
      { key: normTeam('Царское Село-Динамо'), label: 'Царское Село-Динамо', logo: 'https://s3.twcstorage.ru/spa-new-prod/SKyaiLxw_1785147990906_3x0vdtkfa3v.png' },
    ],
    years: [2009, 2010, 2011, 2012, 2013],
    youthFromYear: 2011,
    youthSlots: 5,
  },
];

export const findHolding = (slug: string): HoldingConfig | undefined => HOLDINGS.find((h) => h.slug === slug);

/** Публичная часть конфига (без служебного) — для списка в навигации и карточки клуба. */
export interface HoldingSummaryInfo { slug: string; name: string; short: string; region: string; brand: HoldingBrand; members: HoldingMember[]; years: number[]; youthFromYear: number }
export const publicHolding = (h: HoldingConfig): HoldingSummaryInfo =>
  ({ slug: h.slug, name: h.name, short: h.short, region: h.region, brand: h.brand, members: h.members, years: h.years, youthFromYear: h.youthFromYear });

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
  /** Ключ строки: id матча AvanData, если есть, иначе id ФФСПб. */
  id: number; date: string; tour: number; age: string; division: string;
  /** id матча в AvanData (есть разбор → открывается карточка матча), null — только протокол. */
  avId: number | null;
  /** id матча в ФФСПб (протокол), null — матч известен только из AvanData. */
  ffId: number | null;
  home: HoldingMatchSide; away: HoldingMatchSide;
  /** Итог для команды холдинга; null — матч не сыгран. */
  outcome: Outcome | null;
  played: boolean;
  technical: boolean;
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
  /** ffspb-live — таблица посчитана из живых протоколов ФФСПб; ffspb — официальная таблица; mirror — зеркало AvanData. */
  standingsSource: 'ffspb-live' | 'ffspb' | 'mirror'; standingsDegraded: boolean;
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
    id: m.id, avId: m.id, ffId: ffIdOf(m), date: m.dateTime, tour, age: ref.category, division: ref.divisionTitle,
    home, away, played, outcome: outcomeFor(us.score, them.score, played), technical: false,
  };
};

/** id матча ФФСПб из ссылки AvanData (`ffspbMatchIdInfo.outter` = «/api/matches/3845578»). */
export const ffIdOf = (m: Pick<AvMatch, 'ffspbMatchIdInfo'>): number | null => {
  const s = m.ffspbMatchIdInfo?.outter;
  const mm = typeof s === 'string' ? s.match(/(\d+)\s*$/) : null;
  return mm ? Number(mm[1]) : null;
};

/** Матч из живого протокола ФФСПб; avId — если AvanData знает этот матч (есть разбор). */
const toLiveMatch = (m: FfMatch, ref: TournamentRef, division: string, cfg: HoldingConfig, memberKey: string, avId: number | null): HoldingMatch => {
  const side = (t: FfMatch['home'], score: number | null): HoldingMatchSide => ({ name: t.name, logo: t.logo, score, isMember: memberOf(cfg, t.name)?.key === memberKey });
  const home = side(m.home, m.hs), away = side(m.away, m.as);
  const us = home.isMember ? home : away, them = home.isMember ? away : home;
  return {
    id: avId ?? m.id, avId, ffId: m.id, date: m.date, tour: m.tour ?? 0, age: ref.category, division,
    home, away, played: m.done, outcome: outcomeFor(us.score, them.score, m.done), technical: m.technical,
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
      .then((val) => {
        swrLast.set(key, { at: Date.now(), val });
        void saveHoldingCache(cfg.slug, seasonId, 'profile', val);
        // Логотипы всех команд профиля — заранее в нашу базу (фоном).
        void prefetchLogos([...val.members.map((m) => m.logo), ...val.teams.flatMap((t) => [t.logo, ...t.table.map((r) => r.logo), ...t.matches.flatMap((m) => [m.home.logo, m.away.logo])])]);
        return val;
      })
      .finally(() => swrInflight.delete(key));
    swrInflight.set(key, inflight);
    inflight.catch((e: unknown) => logger.warn({ err: String(e), holding: cfg.slug }, '[holding] сборка профиля упала'));
  }
  if (last) return last.val;            // протухший — отдаём сразу, свежий доедет фоном
  return inflight;
}

// ─── Сохранённое состояние: брифинг сразу после деплоя ──────────────────────
export async function saveHoldingCache(slug: string, season: number, kind: 'profile' | 'analytics', payload: unknown): Promise<void> {
  try {
    await withBypassRLS((tx) => tx.insert(holdingProfileCache).values({ holdingSlug: slug, season, kind, payload })
      .onConflictDoUpdate({ target: [holdingProfileCache.holdingSlug, holdingProfileCache.season, holdingProfileCache.kind], set: { payload, builtAt: new Date() } }));
  } catch (e) { logger.warn({ err: String(e), slug, kind }, '[holding] сохранённое состояние не записано'); }
}
/**
 * Поднять последние профиль и аналитику из БД на старте: профиль — как протухший (отдаётся
 * сразу, свежий собирается фоном), аналитика — под ключ этого профиля, чтобы не пересчитывать.
 */
export async function restoreHoldings(seasonId: number): Promise<void> {
  try {
    const rows = await withBypassRLS((tx) => tx.select().from(holdingProfileCache).where(eq(holdingProfileCache.season, seasonId)));
    for (const cfg of HOLDINGS) {
      const prof = rows.find((r) => r.holdingSlug === cfg.slug && r.kind === 'profile')?.payload as HoldingProfile | undefined;
      const an = rows.find((r) => r.holdingSlug === cfg.slug && r.kind === 'analytics')?.payload as { asOf?: string } | undefined;
      const key = `${cfg.slug}:${seasonId}`;
      if (prof && !swrLast.has(key)) swrLast.set(key, { at: 0, val: prof });
      if (an) seedAnalytics(cfg.slug, seasonId, an as HoldingAnalytics);
    }
    logger.info({ seasonId, rows: rows.length }, '[holding] сохранённое состояние поднято');
  } catch (e) { logger.warn({ err: String(e) }, '[holding] сохранённое состояние недоступно'); }
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

      const [ratings, players] = await Promise.all([
        getClubRatingsByTournament(seasonId, tid).catch((e: unknown) => { logger.warn({ err: String(e), year }, '[holding] рейтинг когорты недоступен'); return [] as AvRatingTeam[]; }),
        regionPlayers(seasonId, year),
      ]);

      // Матчи AvanData по всем дивизионам когорты — для сшивки с протоколами (есть разбор → карточка)
      // и как запасной источник результатов, если ФФСПб недоступен.
      const avLists = await pmap(refs, 2, async (ref) => {
        const tours = Array.from({ length: Math.max(1, ref.lastPlayedTour) + 2 }, (_, i) => i + 1);
        const lists = await pmap(tours, 6, async (tour) => {
          try {
            const ms = await cached(`avmatches:${ref.tournamentId}:${ref.divisionId}:${tour}`, TTL, () => getMatches(ref.tournamentId, ref.divisionId, tour));
            return ms.map((m) => ({ m, tour, ref }));
          } catch { return []; }
        });
        return lists.flat();
      });
      const avMatches = avLists.flat();
      const avByFf = new Map<number, number>();
      for (const { m } of avMatches) { const ff = ffIdOf(m); if (ff != null) avByFf.set(ff, m.id); }
      // Разборы без привязки к протоколу ФФСПб (у свежих туров AvanData её нет): сшиваем по
      // хозяевам и гостям и ближайшей дате (до 7 дней — переносы). Каждый разбор — один раз.
      const sideKey = (home: string, away: string) => `${normTeam(clubName(home))}|${normTeam(clubName(away))}`;
      const unlinked = new Map<string, Array<{ id: number; t: number; tour: number }>>();
      for (const { m, tour } of avMatches) {
        if (ffIdOf(m) != null || m.status !== 'ready') continue;
        const k = sideKey(m.ownTeam.title, m.guestTeam.title);
        (unlinked.get(k) ?? unlinked.set(k, []).get(k)!).push({ id: m.id, t: Date.parse(m.dateTime), tour });
      }
      const usedAv = new Set<number>();
      const linkedFf = new Map<number, number | null>();   // один протокол встречается у обеих команд дерби
      const avOfLive = (m: FfMatch): number | null => {
        const direct = avByFf.get(m.id);
        if (direct != null) return direct;
        if (linkedFf.has(m.id)) return linkedFf.get(m.id) ?? null;
        const found = matchUnlinked(m);
        linkedFf.set(m.id, found);
        return found;
      };
      const matchUnlinked = (m: FfMatch): number | null => {
        const cands = unlinked.get(sideKey(m.home.name, m.away.name)) ?? [];
        const t = Date.parse(m.date);
        // Сначала — ближайшая дата (до 7 дней); иначе — тот же тур (в разметке бывают ошибки в дате).
        const free = cands.filter((c) => !usedAv.has(c.id));
        const best = free.filter((c) => Math.abs(c.t - t) <= 7 * 86_400_000).sort((x, y) => Math.abs(x.t - t) - Math.abs(y.t - t))[0]
          ?? free.find((c) => m.tour != null && c.tour === m.tour && Math.abs(c.t - t) <= 45 * 86_400_000);
        if (!best) return null;
        usedAv.add(best.id);
        return best.id;
      };

      // Живые протоколы ФФСПб: актуальные результаты и таблицы дивизионов, посчитанные из них.
      let live: { matches: FfMatch[]; stages: Map<number, string> } | null = null;
      try {
        const ageM = (refs[0]?.fullTitle ?? '').match(/до (\d+) лет/);
        // Резолв турнира ФФСПб идёт через общую очередь к ФФСПб, где могут висеть догрузки
        // протоколов (минуты) — держим результат сутки, турниры за сезон не меняются.
        const t = await cached(`ffspb-tournament:${year}`, 24 * 60 * 60 * 1000, () => resolveFfspbTournament(year, ageM ? Number(ageM[1]) : null));
        if (t && t.id != null) {
          const stages = new Map(((t.stages ?? []) as Array<{ id?: number; name?: string }>).filter((x) => x.id != null).map((x) => [Number(x.id), String(x.name ?? 'Лига')]));
          const matches = await tournamentMatches(Number(t.id));
          if (matches.length) live = { matches, stages };
          // Протоколы — в расчёт Эло команд для индекса игроков (сила соперника).
          setLeagueMatches(year, matches.filter((m) => m.done && !m.technical && m.hs != null && m.as != null).map((m) => ({
            home: normTeam(clubName(m.home.name)), away: normTeam(clubName(m.away.name)), hs: m.hs as number, as: m.as as number, date: m.date,
            top: /высш/i.test(stages.get(m.stageId ?? -1) ?? ''),
          })));
        }
      } catch (e) {
        if (e instanceof FfspbWarmingError) logger.info({ year }, '[holding] протоколы ФФСПб ещё грузятся фоном → пока зеркало');
        else logger.warn({ err: String(e), year }, '[holding] живые протоколы ФФСПб недоступны → зеркало');
      }

      // Официальная/зеркальная таблица — только если живых протоколов нет (медленный путь с ретраями).
      const standings = live ? null : await regionStandings(seasonId, year, { skipOfficial: true });

      // Дивизион команды: по рейтингу AvanData, по стадии ФФСПб, по таблице.
      const divisionByKey = new Map<string, string>();
      for (const t of ratings) if (t.division?.name) divisionByKey.set(normTeam(t.name), t.division.name);
      if (live) for (const m of live.matches) { const d = live.stages.get(m.stageId ?? -1); if (d) { divisionByKey.set(normTeam(m.home.name), d); divisionByKey.set(normTeam(m.away.name), d); } }
      if (standings) for (const g of standings.groups) for (const r of g.rows) if (!divisionByKey.has(normTeam(r.name))) divisionByKey.set(normTeam(r.name), g.division);

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
        const ratingRow = ratings.find((t) => normTeam(t.name) === member.key);
        const liveTeam = live ? findTeam(live.matches, member.key) : null;
        let standRow: ClubStandRow | undefined; let standGroup: { division: string; rows: ClubStandRow[] } | undefined;
        if (standings) for (const g of standings.groups) { const r = g.rows.find((x) => normTeam(x.name) === member.key); if (r) { standRow = r; standGroup = g; break; } }
        if (!ratingRow && !standRow && !liveTeam) continue; // в этой когорте у школы команды нет

        const division = (liveTeam && live ? live.stages.get(liveTeam.stageId ?? -1) : undefined) ?? ratingRow?.division?.name ?? standGroup?.division ?? 'Лига';
        const divisionKey = classifyDivision(division);
        const ref = refs.find((r) => classifyDivision(r.divisionTitle) === divisionKey) ?? refs[0]!;

        // Рейтинг и место по рейтингу внутри дивизиона когорты (без среза топ-10).
        let rating: HoldingTeam['rating'] = null;
        if (ratingRow) {
          const pool = ratings.filter((t) => t.division?.id === ratingRow.division?.id).sort((a, b) => b.points - a.points);
          rating = { value: ratingRow.points, rank: pool.findIndex((t) => t.id === ratingRow.id) + 1, size: pool.length };
        }

        // Таблица и место: из живых протоколов ФФСПб, иначе официальная/зеркало.
        let standing: HoldingStanding | null = null;
        let table: HoldingTableRow[] = [];
        let standingsSource: HoldingTeam['standingsSource'] = 'mirror';
        let standingsDegraded = false;
        if (liveTeam && live) {
          const rows = tableFromMatches(live.matches, liveTeam.stageId);
          table = rows.map((r) => ({ id: r.teamId, name: r.name, logo: r.logo, division, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, goalDiff: r.goalDiff, points: r.points, isMember: r.teamId === liveTeam.team.id }));
          const idx = rows.findIndex((r) => r.teamId === liveTeam.team.id);
          const r = rows[idx];
          if (r) standing = { place: idx + 1, size: rows.length, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, goalDiff: r.goalDiff, points: r.points };
          standingsSource = 'ffspb-live';
        } else if (standings) {
          table = (standGroup?.rows ?? []).map((r) => ({ ...r, isMember: normTeam(r.name) === member.key }));
          if (standRow && standGroup) {
            const idx = standGroup.rows.indexOf(standRow);
            standing = { place: idx + 1, size: standGroup.rows.length, played: standRow.played, won: standRow.won, drawn: standRow.drawn, lost: standRow.lost, goalDiff: standRow.goalDiff, points: standRow.points };
          }
          standingsSource = standings.source; standingsDegraded = standings.degraded;
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

        // Матчи команды: живые протоколы ФФСПб (счёт актуальный, avId — если есть разбор),
        // иначе — матчи AvanData.
        const matches: HoldingMatch[] = (liveTeam && live
          ? live.matches.filter((m) => m.home.id === liveTeam.team.id || m.away.id === liveTeam.team.id)
            .map((m) => toLiveMatch(m, ref, division, cfg, member.key, avOfLive(m)))
          : avMatches.filter(({ m }) => memberOf(cfg, m.ownTeam.title)?.key === member.key || memberOf(cfg, m.guestTeam.title)?.key === member.key)
            .map(({ m, tour, ref: r }) => toMatch(m, r, tour, cfg, member.key))
        ).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const played = matches.filter((m) => m.played);
        // «Следующий» — ближайший несыгранный не раньше вчера.
        const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const upcoming = matches.filter((m) => !m.played && m.date >= yesterday).sort((a, b) => (a.date < b.date ? -1 : 1));

        teams.push({
          key: `${member.key}:${year}`, clubKey: member.key, clubLabel: member.label,
          name: ratingRow?.name ?? standRow?.name ?? liveTeam?.team.name ?? `${member.label} ${year}`,
          logo: ratingRow?.logo ?? standRow?.logo ?? liveTeam?.team.logo ?? null,
          year, category: ref.category, ageTitle: ageTitleOf(ref.fullTitle, ref.category),
          division, divisionKey,
          standing, standingsSource, standingsDegraded, table,
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
      members: cfg.members.map((m) => ({ ...m, logo: m.logo ?? teams.find((t) => t.clubKey === m.key && t.logo)?.logo ?? null, teams: teams.filter((t) => t.clubKey === m.key).length })),
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
