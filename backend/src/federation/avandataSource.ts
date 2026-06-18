/**
 * AvandataSource — прокси-слой над «нашей» базой разборов (back.avandata.ru).
 * Кабинет читает РЕАЛЬНОЕ Первенство СПб вживую, без копирования в нашу БД
 * (см. docs/AVANDATA_API_MAP.md). Короткий in-memory кэш. Только чтение по ключу.
 *
 * Детект разобранного: НЕ по сломанному tourStatistics.analyzedMatches (он врёт),
 * а по факту — getPlayersByRole возвращает игроков на разобранных турах.
 */
import {
  isAvandataConfigured, getSeasons, getTeamsList, getTourStatistics, getPlayersByRole, getMatches,
  getFfspbStatistics, getFfspbStatisticsByTournament, getClubRatingsOverview, getClubRatingsByTournament,
  getPlayerDetail, getPlayerEvents, getEventTypes, getAllPlayerSummaries, getMatchDetail, authedGet,
  type AvSeason, type AvStatTeam, type AvRatingTeam, type AvEventType,
} from '../services/avandataApi.js';
import { getMatch as ffspbGetMatch, isFfspbConfigured } from '../services/ffspbApi.js';
import { logger } from '../shared/logger.js';
import { env } from '../env.js';

// ─── Детали матча (для карточки матча по клику) ──────────────────────────────
export interface MatchCard { player: string; minute: string }
export interface MatchSide { id: number | null; name: string; logo: string | null; score: number | null; yellow: MatchCard[]; red: MatchCard[] }
export interface MatchStatRow { eventType: string; title: string; home: number; away: number }
export interface MatchTopEvent { eventType: string; name: string; count: number }
export interface MatchBest { id: number | null; name: string; team: string | null; role: string | null; rating: number | null; topEvents: MatchTopEvent[] }
export interface MatchLeader { id: number | null; name: string; team: string | null; role: string | null; photo: string | null; count: number }
export interface MatchLeaderGroup { eventType: string; title: string; players: MatchLeader[] }
// Протокол FFSPB (голы/карточки/судьи/тренеры) — подтягивается через ffspbMatchId.
export interface MatchGoal { team: 'home' | 'away'; player: string; minute: number | null; assist: string | null; kind: 'goal' | 'own_goal' | 'penalty'; addedTime: boolean }
export interface MatchCardEvent { team: 'home' | 'away'; player: string; minute: number | null; kind: 'yellow' | 'red' | 'yellow_to_red'; reason: string }
export interface MatchPerson { name: string; role: string }
export interface MatchOfficials { referees: MatchPerson[]; homeCoaches: MatchPerson[]; awayCoaches: MatchPerson[] }
export interface MatchDetail {
  id: number; title: string;
  home: MatchSide; away: MatchSide;
  best: MatchBest | null;
  stats: MatchStatRow[];
  leaders: MatchLeaderGroup[];
  goals: MatchGoal[];
  cards: MatchCardEvent[];
  officials: MatchOfficials | null;
  protocolUrl: string | null;
  ffspbDebug?: string; // диагностика источника протокола (временно, для прод-разбора)
}

// Сырые формы ответа /ffspb-portal/matches/{id} (см. inspectMatchDetail.ts).
interface RawCard { playerName?: string; matchTime?: string | number }
interface RawSide { id?: number; teamForTournamentId?: number; title?: string; logoUrl?: string | null; score?: number; yellowCard?: RawCard[]; redCards?: RawCard[] }
interface RawTeamRef { title?: string }
interface RawBest { id?: number; title?: string; team?: RawTeamRef; playerRoleName?: string; rating?: number; topEvents?: Array<{ eventType?: string; eventName?: string; count?: number }> }
interface RawKeyEvent { ownTeam?: { eventsCount?: number }; guestTeam?: { eventsCount?: number }; eventType?: string; title?: string }
interface RawLeaderPlayer { id?: number; title?: string; team?: RawTeamRef; playerRoleName?: string; playerPhotoUrl?: string | null; eventsCount?: number }
interface RawLeaderGroup { eventType?: string; players?: RawLeaderPlayer[] }
interface RawMatch {
  id?: number; domainMatchId?: number; title?: string;
  ownTeam?: RawSide; guestTeam?: RawSide; bestMatchPlayer?: RawBest;
  keyEvents?: RawKeyEvent[]; bestPlayersByEvents?: RawLeaderGroup[];
}

const mapCards = (cs?: RawCard[]): MatchCard[] => (cs ?? []).map((c) => ({ player: c.playerName ?? '—', minute: String(c.matchTime ?? '') }));
const mapSide = (s?: RawSide): MatchSide => ({
  id: s?.id ?? null, name: s?.title ?? '—', logo: s?.logoUrl ?? null, score: s?.score ?? null,
  yellow: mapCards(s?.yellowCard), red: mapCards(s?.redCards),
});

// Карточки прямо из avandata-детали (yellowCard/redCards с игроком+минутой) —
// fallback, когда FFSPB-протокол недоступен (stat.ffspb.org таймаутит с Render).
const avandataCards = (raw: RawMatch): MatchCardEvent[] => {
  const out: MatchCardEvent[] = [];
  const add = (team: 'home' | 'away', arr: RawCard[] | undefined, kind: 'yellow' | 'red') => {
    for (const c of arr ?? []) {
      const t = c.matchTime;
      out.push({ team, player: c.playerName ?? '—', minute: t != null && t !== '' ? Number(t) : null, kind, reason: '' });
    }
  };
  add('home', raw.ownTeam?.yellowCard, 'yellow'); add('home', raw.ownTeam?.redCards, 'red');
  add('away', raw.guestTeam?.yellowCard, 'yellow'); add('away', raw.guestTeam?.redCards, 'red');
  return out.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
};

// ── Протокол FFSPB: голы/карточки с авторами, судьи, тренеры ──────────────────
// Мост: avandata /matches/{id}.linkToProtocol → stat.ffspb.org/.../match/{ffspbId}
// → FFSPB /matches/{ffspbId}. eventType: 0 гол / 1 автогол / 2 пенальти / 4 ЖК /
// 5 КК / 6 2ЖК→удаление. Команда события → home/away по host @id.
interface FfProfile { surname?: string; firstName?: string }
interface FfAuthor { surname?: string; firstName?: string; member?: FfProfile }
interface FfEvent { eventType?: number; minute?: number | null; addedTime?: boolean; comment?: string; team?: { '@id'?: string }; author?: FfAuthor; assist?: FfAuthor | null }
interface FfReferee { refereeTypeName?: string; profile?: FfProfile }
interface FfOfficialReq { positionName?: string; surname?: string; firstName?: string }
interface FfOfficial { request?: FfOfficialReq; team?: { '@id'?: string } }
interface FfMatch { host?: { '@id'?: string }; events?: FfEvent[]; matchReferees?: FfReferee[]; participatedOfficials?: FfOfficial[] }

const personName = (p?: { surname?: string; firstName?: string; member?: FfProfile } | null): string => {
  if (!p) return '—';
  const last = p.surname || p.member?.surname || '';
  const first = p.firstName || p.member?.firstName || '';
  return (last + (first ? ` ${first.slice(0, 1)}.` : '')).trim() || '—';
};
const GOAL_KIND: Record<number, MatchGoal['kind']> = { 0: 'goal', 1: 'own_goal', 2: 'penalty' };
const CARD_KIND: Record<number, MatchCardEvent['kind']> = { 4: 'yellow', 5: 'red', 6: 'yellow_to_red' };

interface FfspbProtocol { goals: MatchGoal[]; cards: MatchCardEvent[]; officials: MatchOfficials }

// Трансформ сырого FFSPB-матча в протокол (голы/карточки/судьи/тренеры).
function transformFfspb(fm: FfMatch): FfspbProtocol {
  const hostId = fm.host?.['@id'];
  const side = (tid?: string): 'home' | 'away' => (tid && tid === hostId ? 'home' : 'away');
  const goals: MatchGoal[] = [];
  const cards: MatchCardEvent[] = [];
  for (const e of fm.events ?? []) {
    if (e.eventType == null) continue;
    const gk = GOAL_KIND[e.eventType];
    const ck = CARD_KIND[e.eventType];
    if (gk) goals.push({ team: side(e.team?.['@id']), player: personName(e.author), minute: e.minute ?? null, assist: e.assist ? personName(e.assist) : null, kind: gk, addedTime: !!e.addedTime });
    else if (ck) cards.push({ team: side(e.team?.['@id']), player: personName(e.author), minute: e.minute ?? null, kind: ck, reason: e.comment ?? '' });
  }
  goals.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  cards.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  const referees: MatchPerson[] = (fm.matchReferees ?? []).map((r) => ({ name: personName(r.profile), role: r.refereeTypeName ?? 'Судья' }));
  const homeCoaches: MatchPerson[] = [];
  const awayCoaches: MatchPerson[] = [];
  for (const o of fm.participatedOfficials ?? []) {
    const person: MatchPerson = { name: personName(o.request), role: (o.request?.positionName ?? 'Тренер').trim() };
    (side(o.team?.['@id']) === 'home' ? homeCoaches : awayCoaches).push(person);
  }
  return { goals, cards, officials: { referees, homeCoaches, awayCoaches } };
}

// avandata /matches/{id}.linkToProtocol → URL протокола FFSPB (кэш 30 мин — стабилен).
async function avMatchLink(matchId: number): Promise<string | null> {
  return cached(`avlink:${matchId}`, 30 * 60 * 1000, async () => {
    try { return String(((await authedGet(`/matches/${matchId}`)) as { linkToProtocol?: string }).linkToProtocol ?? '') || null; }
    catch { return null; }
  });
}

// ─── Пред-синк протоколов FFSPB (решение владельца «B») ───────────────────────
// stat.ffspb.org медленный с Render (живой fetch таймаутит за 45с). Поэтому
// протокол прогревается ФОНОМ с длинным таймаутом в тёплый кэш; модалка отдаёт
// avandata-часть мгновенно, а голы/судьи/тренеры подтягиваются к следующему
// запросу (фронт авто-переспрашивает, пока 'warming'). 6ч TTL.
const ffspbWarm = new Map<number, { at: number; protocol: FfspbProtocol }>();
const ffspbInflight = new Set<number>();
const ffspbFailed = new Map<number, number>(); // matchId → когда прогрев не пробился
const FFSPB_WARM_TTL = 6 * 60 * 60 * 1000;
const FFSPB_FAIL_COOLDOWN = 10 * 60 * 1000; // не долбить FFSPB и не показывать «грузится» 10 мин
const FFSPB_WARM_TIMEOUT = 90_000;

function warmFfspb(matchId: number, ffspbId: string): Promise<void> {
  const hit = ffspbWarm.get(matchId);
  if ((hit && Date.now() - hit.at < FFSPB_WARM_TTL) || ffspbInflight.has(matchId)) return Promise.resolve();
  ffspbInflight.add(matchId);
  return (async () => {
    const fm = (await Promise.race([
      ffspbGetMatch(ffspbId) as Promise<FfMatch>,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${FFSPB_WARM_TIMEOUT / 1000}s`)), FFSPB_WARM_TIMEOUT)),
    ]));
    ffspbWarm.set(matchId, { at: Date.now(), protocol: transformFfspb(fm) });
    ffspbFailed.delete(matchId);
    logger.info({ matchId, ffspbId }, '[av] ffspb protocol warmed');
  })()
    .catch((e) => {
      ffspbFailed.set(matchId, Date.now());
      logger.warn({ matchId, ffspbId, err: (e as Error).message.slice(0, 80) }, '[av] ffspb warm failed (stat.ffspb.org недоступен с Render?)');
    })
    .finally(() => ffspbInflight.delete(matchId));
}

/**
 * Пред-синк протоколов для пачки матчей (фоном, ≤2 параллельно — щадим медленный
 * FFSPB). matchIds — domainMatchId из regionResults. Делает первый клик мгновенным.
 */
export async function warmRegionMatchProtocols(matchIds: number[]): Promise<void> {
  if (!env.FFSPB_MATCH_PROTOCOL || !isFfspbConfigured()) return;
  await pmap(matchIds, 2, async (id) => {
    const link = await avMatchLink(id).catch(() => null);
    const ffspbId = link?.match(/\/match\/(\d+)/)?.[1];
    if (ffspbId) await warmFfspb(id, ffspbId);
  });
}

/** Детали матча: счёт, игрок матча, сравнение команд (avandata, мгновенно) +
 *  голы/карточки/судьи/тренеры (FFSPB, тёплый кэш + фоновый прогрев). */
export async function regionMatchDetail(matchId: number): Promise<MatchDetail | null> {
  const raw = await cached(`avmatch:${matchId}`, 10 * 60 * 1000, () => getMatchDetail(matchId) as Promise<RawMatch | null>);
  if (!raw) return null;

  // Ссылка на протокол FFSPB — из avandata (доступна с Render), нужна всегда (кнопка «Протокол матча»).
  const link = await avMatchLink(matchId);
  // FFSPB-протокол (голы/судьи/тренеры): из тёплого кэша или фоновый прогрев — только если включён флаг
  // FFSPB_MATCH_PROTOCOL (по умолчанию off: stat.ffspb.org недоступен с Render).
  const ffspbId = link?.match(/\/match\/(\d+)/)?.[1] ?? null;
  const warm = ffspbWarm.get(matchId);
  const protocol = warm && Date.now() - warm.at < FFSPB_WARM_TTL ? warm.protocol : null;
  const failedAt = ffspbFailed.get(matchId);
  const recentlyFailed = failedAt != null && Date.now() - failedAt < FFSPB_FAIL_COOLDOWN;
  let ffspbDebug: string;
  if (protocol) ffspbDebug = 'warm';
  else if (!env.FFSPB_MATCH_PROTOCOL) ffspbDebug = 'off'; // протокол выключен — карточка на avandata + ссылка
  else if (!isFfspbConfigured()) ffspbDebug = 'no-ffspb-key';
  else if (!ffspbId) ffspbDebug = link ? 'no-ffspb-id' : 'no-link';
  else if (recentlyFailed) ffspbDebug = 'unavailable'; // прогрев не пробился — не показываем «грузится», не долбим
  else { void warmFfspb(matchId, ffspbId); ffspbDebug = 'warming'; }

  {
    const titleByType = new Map<string, string>();
    for (const k of raw.keyEvents ?? []) if (k.eventType) titleByType.set(k.eventType, k.title ?? k.eventType);
    const best: MatchBest | null = raw.bestMatchPlayer
      ? {
          id: raw.bestMatchPlayer.id ?? null, name: raw.bestMatchPlayer.title ?? '—',
          team: raw.bestMatchPlayer.team?.title ?? null, role: raw.bestMatchPlayer.playerRoleName ?? null,
          rating: raw.bestMatchPlayer.rating ?? null,
          topEvents: (raw.bestMatchPlayer.topEvents ?? []).map((e) => ({ eventType: e.eventType ?? '', name: e.eventName ?? '', count: e.count ?? 0 })),
        }
      : null;
    const stats: MatchStatRow[] = (raw.keyEvents ?? []).map((k) => ({
      eventType: k.eventType ?? '', title: k.title ?? k.eventType ?? '',
      home: k.ownTeam?.eventsCount ?? 0, away: k.guestTeam?.eventsCount ?? 0,
    }));
    const leaders: MatchLeaderGroup[] = (raw.bestPlayersByEvents ?? []).map((g) => ({
      eventType: g.eventType ?? '', title: titleByType.get(g.eventType ?? '') ?? g.eventType ?? '',
      players: (g.players ?? []).map((p) => ({
        id: p.id ?? null, name: p.title ?? '—', team: p.team?.title ?? null,
        role: p.playerRoleName ?? null, photo: p.playerPhotoUrl ?? null, count: p.eventsCount ?? 0,
      })),
    }));
    // Карточки: предпочитаем FFSPB (с причиной), иначе — из avandata (всегда доступна).
    const cards = protocol && protocol.cards.length > 0 ? protocol.cards : avandataCards(raw);
    return {
      id: raw.domainMatchId ?? raw.id ?? matchId, title: raw.title ?? '',
      home: mapSide(raw.ownTeam), away: mapSide(raw.guestTeam), best, stats, leaders,
      goals: protocol?.goals ?? [], cards, officials: protocol?.officials ?? null,
      protocolUrl: link, ffspbDebug,
    };
  }
}

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

/** Года, временно скрытые из фильтра/когорт (мало разбора — позже отдельно). */
const HIDDEN_YEARS = new Set<number>([2014]);

/** Доступные года рождения (для фильтра возрастов), по убыванию. */
export async function availableYears(seasonId: number): Promise<number[]> {
  const s = await season(seasonId);
  return Array.from(new Set(s.tournaments.map((t) => t.dateBirthFrom)))
    .filter((y) => !HIDDEN_YEARS.has(y))
    .sort((a, b) => b - a);
}
/** tournamentId для года рождения (по ageFrom). */
async function tournamentIdForYear(seasonId: number, year: number): Promise<number | undefined> {
  const s = await season(seasonId);
  return s.tournaments.find((t) => t.dateBirthFrom === year)?.id;
}

// ─── Игроки тура (общая сборка) ──────────────────────────────────────────────
interface RawPlayer { id?: number; title?: string; dateOfBirth?: number; playerMatchRole?: { title?: string }; team?: { id?: number; title?: string; logoUrl?: string | null }; averageRating?: number; avatarUrl?: string | null }
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
    const players = new Map<number, { sum: number; n: number }>();
    await pmap(tours, 5, async (tour) => {
      let st;
      try { st = await getTourStatistics(ref.tournamentId, ref.divisionId, tour); } catch { return; }
      matches += st.totalMatches; goals += st.totalGoals; yellow += st.totalYellowCards;
      const ps = await tourPlayers(seasonId, ref.tournamentId, ref.divisionId, tour);
      if (ps.length > 0) analyzed += Math.max(st.analyzedMatches, 1);
      // Рейтинг игрока — СРЕДНЕЕ по его матчам (единая методика с regionPlayers),
      // не первый/пиковый матч. Каждого уникального игрока считаем для players.size.
      for (const p of ps) {
        if (p.id == null) continue;
        const e = players.get(p.id) ?? { sum: 0, n: 0 };
        const r = p.averageRating;
        if (typeof r === 'number' && Number.isFinite(r)) { e.sum += r; e.n += 1; }
        players.set(p.id, e);
      }
    });
    // Средний рейтинг турнира = среднее по игрокам с ≥2 оценёнными матчами (как «лучшие»).
    const ratings = [...players.values()].filter((e) => e.n >= 2).map((e) => e.sum / e.n);
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
// Классификация дивизиона по названию турнира — единый источник истины и для
// группировки (groupByDivision), и для фильтра. 'Высшая'/'Первая' приходят с фронта.
const DIV_RE: Record<string, RegExp> = { 'Высшая': /Высшая|Боброва/i, 'Первая': /Первая|Дементьева/i };
export const matchesDivision = (title: string, division: string): boolean => {
  const re = DIV_RE[division];
  return re ? re.test(title) : title.toLowerCase().includes(division.toLowerCase());
};

export async function regionOverview(seasonId: number, division?: string, year?: number): Promise<RegionOverview> {
  return cached(`overview:${seasonId}:${division ?? ''}:${year ?? 0}`, TTL, async () => {
    let refs = await listTournaments(seasonId);
    if (year != null) refs = refs.filter((r) => r.ageFrom === year);
    if (division) refs = refs.filter((r) => matchesDivision(r.divisionTitle, division));
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

export async function regionStandings(seasonId: number, year?: number): Promise<DivisionGroup<ClubStandRow>[]> {
  return cached(`standings:${seasonId}:${year ?? 0}`, TTL, async () => {
    const tid = year != null ? await tournamentIdForYear(seasonId, year) : undefined;
    const teams = tid ? await getFfspbStatisticsByTournament(seasonId, tid) : await getFfspbStatistics(seasonId);
    return groupByDivision(teams.map((t: AvStatTeam) => ({
      id: t.id, name: t.name, logo: t.logo ?? null, division: t.division?.name ?? 'Лига',
      played: t.stats.matchesPlayed, won: t.stats.matchesWon, drawn: t.stats.draw, lost: t.stats.defeat,
      goalDiff: t.stats.differenceGoals, points: t.stats.points,
    })), (r) => r.points);
  });
}
export async function regionClubRatings(seasonId: number, year?: number): Promise<DivisionGroup<ClubRatingRow>[]> {
  return cached(`clubratings:${seasonId}:${year ?? 0}`, TTL, async () => {
    const tid = year != null ? await tournamentIdForYear(seasonId, year) : undefined;
    const teams = tid ? await getClubRatingsByTournament(seasonId, tid) : await getClubRatingsOverview(seasonId);
    return groupByDivision(teams.map((t: AvRatingTeam) => ({
      id: t.id, name: t.name, logo: t.logo ?? null, division: t.division?.name ?? 'Лига', rating: t.points,
    })), (r) => r.rating);
  });
}

// ─── Сила лиг (дивизионов) — для «силы клубов/лиг» ───────────────────────────
export interface DivisionStrength { division: string; clubs: number; avgRating: number | null; topRating: number | null; topClub: string | null; }
export async function divisionStrength(seasonId: number, year?: number): Promise<DivisionStrength[]> {
  const groups = await regionClubRatings(seasonId, year);
  return groups.map((g) => {
    const ratings = g.rows.map((r) => r.rating).filter((x) => Number.isFinite(x));
    return {
      division: g.division, clubs: g.rows.length,
      avgRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
      topRating: g.rows[0]?.rating ?? null, topClub: g.rows[0]?.name ?? null,
    };
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
export interface RegionPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; photo: string | null; rating: number | null; mp: number; }
export async function regionPlayers(seasonId: number, year?: number, division?: string): Promise<RegionPlayer[]> {
  return cached(`players:${seasonId}:${year ?? 0}:${division ?? ''}`, TTL, async () => {
    let refs = await listTournaments(seasonId);
    if (year != null) refs = refs.filter((r) => r.ageFrom === year);
    if (division) refs = refs.filter((r) => matchesDivision(r.divisionTitle, division));
    // Рейтинг игрока — СРЕДНЕЕ по всем его матчам. by-role на туре отдаёт рейтинг
    // ЗА ЭТОТ МАТЧ (поле averageRating меняется от тура к туру), поэтому копим
    // сумму+счётчик по всем турам, а не берём первый/пиковый матч. mp — число
    // оценённых матчей (на скольких турах игрок попал в рейтинг по роли).
    const acc = new Map<number, { p: RegionPlayer; sum: number; n: number }>();
    const jobs: Array<{ t: number; d: number; tour: number }> = [];
    for (const ref of refs) for (let tour = 1; tour <= Math.max(1, ref.lastPlayedTour); tour++) jobs.push({ t: ref.tournamentId, d: ref.divisionId, tour });
    await pmap(jobs, 6, async (job) => {
      const ps = await tourPlayers(seasonId, job.t, job.d, job.tour);
      for (const p of ps) {
        if (p.id == null) continue;
        let e = acc.get(p.id);
        if (!e) {
          e = { p: { id: p.id, name: p.title ?? '—', birthYear: p.dateOfBirth ?? null,
            position: p.playerMatchRole?.title ?? null, club: p.team?.title ?? null,
            clubLogo: p.team?.logoUrl ?? null, photo: p.avatarUrl ?? null, rating: null, mp: 0 }, sum: 0, n: 0 };
          acc.set(p.id, e);
        }
        const r = p.averageRating;
        if (typeof r === 'number' && Number.isFinite(r)) { e.sum += r; e.n += 1; }
      }
    });
    const out = [...acc.values()].map(({ p, sum, n }) => ({ ...p, mp: n, rating: n > 0 ? Math.round(sum / n) : null }));
    return out.sort((a, b) => (b.rating ?? -1e9) - (a.rating ?? -1e9));
  });
}

// ─── ВЫВОДЫ: возрастная утечка (RAE) ────────────────────────────────────────
export interface AgeEffect {
  total: number;
  quarters: Array<{ q: number; n: number; pct: number }>;
  q1pct: number; q4pct: number;
  /** Перекос Q1→Q4: во сколько раз больше рождённых в начале года. */
  skew: number | null;
}
// Нормализация ФИО для матчинга summaries↔division-игроков (порядок Имя/Фамилия
// неважен, ё=е). Полные даты только в summaries (без дивизиона), дивизион только
// в analyzed-игроках (без полной даты) — мост по имени.
const normName = (s: string): string => s.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean).sort().join(' ');

export async function ageEffect(seasonId: number, year?: number, division?: string): Promise<AgeEffect> {
  return cached(`age:${seasonId}:${year ?? 0}:${division ?? ''}`, TTL, async () => {
    const all = await cached('summaries', TTL, () => getAllPlayerSummaries());
    // ТОЛЬКО разобранные игроки лиг (не весь реестр 4628 — там много несыгравших).
    // Без дивизиона = обе лиги вместе; с дивизионом = одна лига. Полные даты берём
    // из summaries по ФИО (мост: дивизион только у analyzed, даты только в summaries).
    const dps = await regionPlayers(seasonId, undefined, division);
    const names = new Set(dps.map((p) => normName(p.name)));
    const counts = [0, 0, 0, 0];
    let total = 0;
    for (const p of all) {
      if (!p.dateOfBirth) continue;
      if (!names.has(normName(`${p.lastname ?? ''} ${p.firstname ?? ''}`))) continue;
      const d = new Date(p.dateOfBirth);
      const y = d.getUTCFullYear();
      if (year != null && y !== year) continue;
      const q = Math.floor(d.getUTCMonth() / 3); // 0..3
      counts[q] = (counts[q] ?? 0) + 1; total += 1;
    }
    const quarters = counts.map((n, i) => ({ q: i + 1, n, pct: total ? Math.round((n / total) * 1000) / 10 : 0 }));
    const q1 = quarters[0]?.pct ?? 0, q4 = quarters[3]?.pct ?? 0;
    return { total, quarters, q1pct: q1, q4pct: q4, skew: q4 > 0 ? Math.round((q1 / q4) * 100) / 100 : null };
  });
}

// ─── ВЫВОДЫ: монополия / концентрация таланта ────────────────────────────────
export interface TalentConcentration {
  topPool: number;        // размер «топ-пула» (рассмотренных талантов)
  totalClubs: number;
  top3Share: number;      // % топ-талантов в 3 сильнейших клубах
  top5Share: number;
  clubs: Array<{ club: string; logo: string | null; n: number; share: number }>;
}
/** Имя реального клуба из названия команды-с-годом: «ФК Зенит 2012» → «ФК Зенит». */
export const clubName = (team: string | null): string => (team ?? '').replace(/\s*20\d{2}\b.*$/, '').trim();

export async function talentConcentration(seasonId: number, year?: number, division?: string): Promise<TalentConcentration> {
  const players = await regionPlayers(seasonId, year, division);
  // Пул таланта = топ-30 по КАЖДОМУ возрасту (честно между когортами), объединяем.
  const byYear = new Map<number, RegionPlayer[]>();
  for (const p of players) {
    if (p.rating == null) continue;
    const y = p.birthYear ?? 0;
    const arr = byYear.get(y) ?? [];
    arr.push(p); byYear.set(y, arr);
  }
  const pool: RegionPlayer[] = [];
  for (const arr of byYear.values()) {
    arr.sort((a, b) => (b.rating as number) - (a.rating as number));
    pool.push(...arr.slice(0, 30));
  }
  // Группируем по РЕАЛЬНОМУ клубу. Ключ — нормализованное имя (регистр/дефис/«ФК»),
  // иначе «ФК Зенит»≠«Фк Зенит», «Кировец Восхождение»≠«Кировец-Восхождение» —
  // один клуб двоился, % размазывался. normTeam различает СШ/СШОР (не схлопывает).
  const byClub = new Map<string, { club: string; logo: string | null; n: number }>();
  for (const p of pool) {
    const display = clubName(p.club);
    if (!display) continue;
    const key = normTeam(display);
    const e = byClub.get(key) ?? { club: display, logo: p.clubLogo, n: 0 };
    e.n += 1; byClub.set(key, e);
  }
  const ranked = [...byClub.values()].sort((a, b) => b.n - a.n);
  const sum = (arr: typeof ranked) => arr.reduce((s, c) => s + c.n, 0);
  const total = sum(ranked) || 1;
  return {
    topPool: pool.length, totalClubs: ranked.length,
    top3Share: Math.round((sum(ranked.slice(0, 3)) / total) * 100),
    top5Share: Math.round((sum(ranked.slice(0, 5)) / total) * 100),
    clubs: ranked.slice(0, 10).map((c) => ({ club: c.club, logo: c.logo, n: c.n, share: Math.round((c.n / total) * 100) })),
  };
}

// ─── Состояние региона: последние результаты ────────────────────────────────
export interface ResultTeam { name: string; logo: string | null; score: number | null; rating: number | null; rank: number | null; }
export interface ResultMatch {
  id: number; age: string; division: string; date: string; divTeams: number;
  home: ResultTeam; away: ResultTeam;
}
// «ФК Зенит 2013» / «Алмаз-Антей» → ключ для матчинга команды результата к рейтингу
const normTeam = (s: string): string => s.toLowerCase()
  .replace(/[«»"']/g, '').replace(/^фк\s+/, '').replace(/\s*\d{4}\s*$/, '').replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();

export async function regionResults(seasonId: number, year?: number, division?: string): Promise<ResultMatch[]> {
  return cached(`results:${seasonId}:${year ?? 0}:${division ?? ''}`, 5 * 60 * 1000, async () => {
    let refs = await listTournaments(seasonId);
    if (year != null) refs = refs.filter((r) => r.ageFrom === year);
    if (division) refs = refs.filter((r) => matchesDivision(r.divisionTitle, division));
    // Рейтинги команд по возрасту (per tournamentId) — значимость на УРОВНЕ КОМАНДЫ, не клуба.
    const tids = [...new Set(refs.map((r) => r.tournamentId))];
    const ratingsByTid = new Map<number, AvRatingTeam[]>();
    await pmap(tids, 6, async (tid) => { ratingsByTid.set(tid, await getClubRatingsByTournament(seasonId, tid).catch(() => [])); });
    // status==='ready' = сыгранный матч (created/assigned — будущие). lastPlayedTour
    // ненадёжен, поэтому сканируем все туры и фильтруем по статусу.
    const jobs = refs.flatMap((ref) => Array.from({ length: Math.max(1, ref.lastPlayedTour) }, (_, i) => ({ ref, tour: i + 1 })));
    const lists = await pmap(jobs, 8, async ({ ref, tour }) => {
      try {
        const ms = await getMatches(ref.tournamentId, ref.divisionId, tour);
        // ранг в ДИВИЗИОНЕ этого возраста (соперники из одного дивизиона — сравнение честное)
        const all = ratingsByTid.get(ref.tournamentId) ?? [];
        const inDiv = all.filter((t) => t.division?.id === ref.divisionId);
        const pool = [...(inDiv.length ? inDiv : all)].sort((a, b) => b.points - a.points);
        const byId = new Map<number, { rating: number; rank: number }>();
        const byName = new Map<string, { rating: number; rank: number }>();
        pool.forEach((t, i) => { const info = { rating: t.points, rank: i + 1 }; byId.set(t.id, info); byName.set(normTeam(t.name), info); });
        const divTeams = pool.length;
        const look = (tm: { id: number | null; title: string }) => (tm.id != null ? byId.get(tm.id) : undefined) ?? byName.get(normTeam(tm.title)) ?? null;
        return ms.filter((m) => m.status === 'ready' && ((m.ownTeam.score ?? 0) + (m.guestTeam.score ?? 0)) > 0).map((m) => {
          const H = look(m.ownTeam), A = look(m.guestTeam);
          return {
            id: m.id, age: ref.category, division: ref.divisionTitle, date: m.dateTime, divTeams,
            home: { name: m.ownTeam.title, logo: m.ownTeam.logoUrl ?? null, score: m.ownTeam.score ?? null, rating: H?.rating ?? null, rank: H?.rank ?? null },
            away: { name: m.guestTeam.title, logo: m.guestTeam.logoUrl ?? null, score: m.guestTeam.score ?? null, rating: A?.rating ?? null, rank: A?.rank ?? null },
          };
        });
      } catch { return []; }
    });
    return lists.flat().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 24);
  });
}

// ─── Профиль клуба (карточка клуба по клику) ─────────────────────────────────
export interface ClubProfilePlayer { id: number; name: string; birthYear: number | null; position: string | null; rating: number | null; photo: string | null }
export interface ClubProfileMatch { id: number; age: string; date: string; opponent: string; opponentLogo: string | null; gf: number | null; ga: number | null; outcome: 'w' | 'd' | 'l' }
export interface ClubProfile {
  id: number; name: string; logo: string | null; division: string;
  rating: number; rank: number; divisionSize: number;
  teams: number; ageMin: number | null; ageMax: number | null;
  squad: number; avgRating: number | null;
  topPlayers: ClubProfilePlayer[];
  talentShare: number | null; talentRank: number | null; talentClubs: number;
  recentMatches: ClubProfileMatch[];
}

/** Карточка клуба: место в рейтинге лиги, команды/возрасты, лучшие игроки,
 *  производство таланта (доля топ-пула лиги), последние матчи. Всё из avandata. */
export async function regionClubProfile(seasonId: number, clubId: number): Promise<ClubProfile | null> {
  const ratingGroups = await regionClubRatings(seasonId);
  let found: { row: ClubRatingRow; rank: number; division: string; size: number } | null = null;
  for (const g of ratingGroups) {
    const idx = g.rows.findIndex((r) => r.id === clubId);
    if (idx >= 0) { found = { row: g.rows[idx]!, rank: idx + 1, division: g.division, size: g.rows.length }; break; }
  }
  if (!found) return null;
  const key = normTeam(found.row.name);
  const divToken = /Высшая|Боброва/i.test(found.division) ? 'Высшая' : /Первая|Дементьева/i.test(found.division) ? 'Первая' : undefined;

  const [players, conc, results] = await Promise.all([
    regionPlayers(seasonId, undefined, divToken),
    talentConcentration(seasonId, undefined, divToken),
    regionResults(seasonId, undefined, divToken),
  ]);

  const mine = players.filter((p) => normTeam(clubName(p.club)) === key);
  // С рейтингом = среднее по ≥2 матчам (без one-match-wonder) — и в топ-5, и в avgRating.
  const rated = mine.filter((p) => p.rating != null && p.mp >= 2).sort((a, b) => (b.rating as number) - (a.rating as number));
  const years = mine.map((p) => p.birthYear).filter((y): y is number => y != null);
  const ratings = rated.map((p) => p.rating as number);
  const avgRating = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;

  const concIdx = conc.clubs.findIndex((c) => normTeam(c.club) === key);
  const concEntry = concIdx >= 0 ? conc.clubs[concIdx]! : null;

  const recentMatches: ClubProfileMatch[] = [];
  for (const m of results) {
    const homeIs = normTeam(clubName(m.home.name)) === key;
    const awayIs = normTeam(clubName(m.away.name)) === key;
    if (!homeIs && !awayIs) continue;
    const us = homeIs ? m.home : m.away, them = homeIs ? m.away : m.home;
    const gf = us.score, ga = them.score;
    const outcome: 'w' | 'd' | 'l' = gf == null || ga == null || gf === ga ? 'd' : gf > ga ? 'w' : 'l';
    recentMatches.push({ id: m.id, age: m.age, date: m.date, opponent: them.name, opponentLogo: them.logo, gf, ga, outcome });
    if (recentMatches.length >= 6) break;
  }

  return {
    id: found.row.id, name: found.row.name, logo: found.row.logo, division: found.division,
    rating: found.row.rating, rank: found.rank, divisionSize: found.size,
    teams: new Set(years).size, ageMin: years.length ? Math.min(...years) : null, ageMax: years.length ? Math.max(...years) : null,
    squad: mine.length, avgRating,
    topPlayers: rated.slice(0, 5).map((p) => ({ id: p.id, name: p.name, birthYear: p.birthYear, position: p.position, rating: p.rating, photo: p.photo })),
    talentShare: concEntry?.share ?? null, talentRank: concIdx >= 0 ? concIdx + 1 : null, talentClubs: conc.clubs.length,
    recentMatches,
  };
}

// ─── ТЕЛЕСКОП: матрица когорт (год рождения × сигналы) ───────────────────────
export interface Cohort {
  year: number;
  registry: number;       // в реестре региона (полная база)
  analyzed: number;       // разобрано (с рейтингом)
  raeSkew: number | null; // перекос Q1/Q4
  q1pct: number; q4pct: number;
  avgRating: number | null;
  top: { id: number; name: string; club: string | null; clubLogo: string | null; rating: number | null } | null;
}
export async function cohortMatrix(seasonId: number): Promise<Cohort[]> {
  return cached(`cohorts:${seasonId}`, TTL, async () => {
    const [summaries, players, years] = await Promise.all([
      cached('summaries', TTL, () => getAllPlayerSummaries()),
      regionPlayers(seasonId),
      availableYears(seasonId),
    ]);
    const byYearQ = new Map<number, number[]>();
    for (const s of summaries) {
      if (!s.dateOfBirth) continue;
      const d = new Date(s.dateOfBirth);
      const y = d.getUTCFullYear();
      const q = Math.floor(d.getUTCMonth() / 3);
      const arr = byYearQ.get(y) ?? [0, 0, 0, 0];
      arr[q] = (arr[q] ?? 0) + 1;
      byYearQ.set(y, arr);
    }
    const byYearP = new Map<number, RegionPlayer[]>();
    for (const p of players) {
      if (p.birthYear == null) continue;
      const arr = byYearP.get(p.birthYear) ?? [];
      arr.push(p);
      byYearP.set(p.birthYear, arr);
    }
    return years.map((y) => {
      const qs = byYearQ.get(y) ?? [0, 0, 0, 0];
      const reg = qs.reduce((a, b) => a + b, 0);
      const q1 = reg ? ((qs[0] ?? 0) / reg) * 100 : 0;
      const q4 = reg ? ((qs[3] ?? 0) / reg) * 100 : 0;
      const ps = (byYearP.get(y) ?? []).filter((p) => p.rating != null && p.mp >= 2).sort((a, b) => (b.rating as number) - (a.rating as number));
      const ratings = ps.map((p) => p.rating as number);
      const t = ps[0];
      return {
        year: y, registry: reg, analyzed: ps.length,
        raeSkew: q4 > 0 ? Math.round((q1 / q4) * 100) / 100 : null,
        q1pct: Math.round(q1 * 10) / 10, q4pct: Math.round(q4 * 10) / 10,
        avgRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
        top: t ? { id: t.id, name: t.name, club: t.club, clubLogo: t.clubLogo, rating: t.rating } : null,
      };
      // Когорты с почти пустым разбором (напр. 2014) прячем — мало инфы, позже отдельно.
    }).filter((c) => c.analyzed >= 10);
  });
}

// ─── Профиль игрока + «пицца» из событий ─────────────────────────────────────
export interface PlayerMetric { id: string; title: string; short: string; category: string; count: number; points: number; }
export interface PlayerMatch {
  id: number; date: string | null;
  home: { name: string; logo: string | null; score: number | null };
  away: { name: string; logo: string | null; score: number | null };
  playerSide: 'home' | 'away' | null; rating: number | null;
}
export interface PlayerProfile {
  id: number; name: string; club: string | null; clubLogo: string | null; photo: string | null; position: string | null;
  birthDate: string | null; birthYear: number | null; rating: number | null;
  matches: number; totalEvents: number; metrics: PlayerMetric[];
  recentMatches: PlayerMatch[];
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

  // История матчей: группируем события по матчу (рейтинг в матче = сумма очков),
  // сторону определяем по teamForTournamentId, соперника/счёт — из getMatchDetail.
  const byMatch = new Map<number, { points: number; tft: number | null; date: string | null }>();
  for (const e of events) {
    const m = byMatch.get(e.matchId) ?? { points: 0, tft: e.teamForTournamentId ?? null, date: e.date ?? null };
    m.points += e.points ?? 0;
    if (e.teamForTournamentId != null) m.tft = e.teamForTournamentId;
    if (e.date && (!m.date || e.date > m.date)) m.date = e.date;
    byMatch.set(e.matchId, m);
  }
  const recentIds = [...byMatch.entries()].sort((a, b) => ((a[1].date ?? '') < (b[1].date ?? '') ? 1 : -1)).slice(0, 6);
  const recentMatches = (await pmap(recentIds, 4, async ([mid, info]): Promise<PlayerMatch | null> => {
    const md = (await cached(`avmatch:${mid}`, 10 * 60 * 1000, () => getMatchDetail(mid))) as RawMatch | null;
    if (!md) return null;
    const own = md.ownTeam, guest = md.guestTeam;
    const side: 'home' | 'away' | null = info.tft != null && own?.teamForTournamentId === info.tft ? 'home'
      : info.tft != null && guest?.teamForTournamentId === info.tft ? 'away' : null;
    return {
      id: md.domainMatchId ?? mid, date: info.date,
      home: { name: own?.title ?? '—', logo: own?.logoUrl ?? null, score: own?.score ?? null },
      away: { name: guest?.title ?? '—', logo: guest?.logoUrl ?? null, score: guest?.score ?? null },
      playerSide: side, rating: Math.round(info.points),
    };
  })).filter((x): x is PlayerMatch => x != null);

  return {
    id: playerId, name, club: id0?.club ?? null, clubLogo: id0?.clubLogo ?? null,
    photo: id0?.photo ?? null, position: id0?.position ?? null,
    birthDate: detail?.dateOfBirth ?? null,
    birthYear: detail?.dateOfBirth ? new Date(detail.dateOfBirth).getUTCFullYear() : (id0?.birthYear ?? null),
    rating: id0?.rating ?? (events.length ? totalPoints : null),
    matches: matchIds.size, totalEvents: events.length, metrics, recentMatches,
  };
}
