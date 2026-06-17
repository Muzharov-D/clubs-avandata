import { env } from '../env.js';
import { logger } from '../shared/logger.js';

/**
 * Клиент API АванДата-портала (back.avandata.ru) — «моя база» разобранных матчей
 * и игроков. Поток: login (JWT access ~15 мин + refresh ~7 дней) → каталог
 * (сезоны/турниры/дивизионы) → матчи (с привязкой к FFSPB-id) → игроки по матчам.
 *
 * Только ЧТЕНИЕ. Креды — строго server-side в ENV (AVANDATA_EMAIL/PASSWORD).
 * Токен короткий → кэшируем с запасом и форсим перелогин на 401.
 */
const ENDPOINT = env.AVANDATA_ENDPOINT.replace(/\/+$/, '');
const FETCH_TIMEOUT_MS = 30_000;
// access живёт ~15 мин — обновляем с запасом (13 мин) и принудительно на 401.
const TOKEN_TTL_MS = 13 * 60 * 1000;

export function isAvandataConfigured(): boolean {
  return !!(env.AVANDATA_API_KEY || (env.AVANDATA_EMAIL && env.AVANDATA_PASSWORD));
}

const hasKey = (): boolean => !!env.AVANDATA_API_KEY;

let cachedToken: { access: string; expiresAt: number } | null = null;

async function login(force = false): Promise<string> {
  if (!isAvandataConfigured()) throw new Error('AVANDATA_EMAIL/PASSWORD не заданы в env');
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.access;
  const res = await fetch(`${ENDPOINT}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.AVANDATA_EMAIL, password: env.AVANDATA_PASSWORD }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`avandata auth ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) throw new Error('avandata auth: нет accessToken в ответе');
  cachedToken = { access: data.accessToken, expiresAt: Date.now() + TOKEN_TTL_MS };
  return data.accessToken;
}

/** Заголовки авторизации: API-ключ (X-API-Key) приоритетно, иначе Bearer (login). */
async function authHeader(force = false): Promise<Record<string, string>> {
  if (hasKey()) return { 'X-API-Key': env.AVANDATA_API_KEY as string };
  return { Authorization: `Bearer ${await login(force)}` };
}

/** Авторизованный JSON-GET. На 401 — один перелогин (только для password-режима). */
export async function authedGet<T = unknown>(path: string, retried = false): Promise<T> {
  const res = await fetch(`${ENDPOINT}${path}`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401 && !retried && !hasKey()) {
    await login(true);
    return authedGet<T>(path, true);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`avandata ${res.status} ${path}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ---- Каталог ----
export interface AvDivision { id: number; title: string; toursCount: number; lastPlayedTour: number }
export interface AvTournament {
  id: number; title: string;
  dateBirthFrom: number; dateBirthTo: number; category: string;
  divisions: AvDivision[];
}
export interface AvSeason { id: number; title: string; year: number; tournaments: AvTournament[] }

export async function getSeasons(): Promise<AvSeason[]> {
  const data = await authedGet<{ seasons?: AvSeason[] }>('/ffspb-portal/getSeasonsList');
  return data.seasons ?? [];
}

// ---- Матчи ----
export interface AvMatchTeam { id: number | null; title: string; logoUrl?: string | null; score?: number | null }
export interface AvMatch {
  id: number;
  /** Привязка к FFSPB — ключ дедупа между источниками. */
  ffspbMatchId: number | null;
  ffspbMatchIdInfo?: { inner: number; outter: string } | null;
  title: string;
  ownTeam: AvMatchTeam;
  guestTeam: AvMatchTeam;
  dateTime: string;
  status: string;
}

export interface AvTourStats {
  totalMatches: number; totalGoals: number; averageGoalsPerMatch: number;
  totalYellowCards: number; totalRedCards: number;
  allMatchesAnalyzed: boolean; analyzedMatches: number; totalPlayersPlayed: number;
}

const q = (params: Record<string, string | number>): string =>
  Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export async function getTourStatistics(tournamentId: number, divisionId: number, tour: number): Promise<AvTourStats> {
  return authedGet<AvTourStats>(`/ffspb-portal/matches/getTourStatistics?${q({ tournamentId, divisionId, tour })}`);
}

export async function getMatches(tournamentId: number, divisionId: number, tour: number): Promise<AvMatch[]> {
  const data = await authedGet<{ matches?: AvMatch[] }>(`/ffspb-portal/matches/getListMatches?${q({ tournamentId, divisionId, tour })}`);
  return data.matches ?? [];
}

/** Глубокий матч: счёт, карточки (игрок+минута), лучший игрок (рейтинг+топ-события),
 *  ключевые события (own vs guest). Форма уточняется по живому ответу. */
export async function getMatchDetail(matchId: number): Promise<Record<string, unknown> | null> {
  try {
    return await authedGet<Record<string, unknown>>(`/ffspb-portal/matches/${matchId}`);
  } catch (e) {
    logger.warn({ matchId, err: (e as Error).message }, '[avandata] match detail failed');
    return null;
  }
}

// ---- Клубы и команды ----
export interface AvClub { id: number; title: string; logoUrl?: string | null; tournaments?: Array<{ id: number; title: string; dateBirthFrom?: string | number }> }
export async function getClubList(seasonId: number, divisionId: number): Promise<AvClub[]> {
  const data = await authedGet<{ clubs?: AvClub[] }>(`/ffspb-portal/clubs/${seasonId}/getClubList?${q({ divisionId })}`);
  return data.clubs ?? [];
}

export interface AvTeamForTournament {
  id: number; title: string;
  team?: { id: number; title: string; logoUrl?: string | null; teamForTournamentId?: number };
}
export async function getTeamsList(tournamentId: number, divisionId: number, tour: number): Promise<AvTeamForTournament[]> {
  const data = await authedGet<{ teamsForTournament?: AvTeamForTournament[] }>(`/ffspb-portal/teams/getTeamsList?${q({ tournamentId, divisionId, tour })}`);
  return data.teamsForTournament ?? [];
}

// ---- Игроки (наполняются на разобранных матчах) ----
/** Игроки, сгруппированные по амплуа (форма уточняется на разобранном туре). */
export async function getPlayersByRole(seasonId: number, tournamentId: number, divisionId: number, tour: number): Promise<unknown> {
  return authedGet(`/ffspb-portal/players/by-role?${q({ seasonId, tournamentId, divisionId, tour })}`);
}

/** Лидеры игроков по типам событий (рейтинг + 37 базовых метрик). */
export async function getPlayersByEventType(seasonId: number, tournamentId: number, divisionId: number, tour: number): Promise<unknown> {
  return authedGet(`/ffspb-portal/players/by-event-type?${q({ seasonId, tournamentId, divisionId, tour })}`);
}

// ---- Обзор: статистика (таблица) и рейтинги клубов АванДата ----
export interface AvStatTeam {
  id: number; name: string; logo?: string | null; division?: { id: number; name: string };
  stats: { matchesPlayed: number; matchesWon: number; draw: number; defeat: number; differenceGoals: number; points: number };
}
export async function getFfspbStatistics(seasonId: number): Promise<AvStatTeam[]> {
  const d = await authedGet<{ teams?: AvStatTeam[] }>(`/ffspb-portal/overview/${seasonId}/ffspbStatistics/overview`);
  return d.teams ?? [];
}
export async function getFfspbStatisticsByTournament(seasonId: number, tournamentId: number): Promise<AvStatTeam[]> {
  const d = await authedGet<{ teams?: AvStatTeam[] }>(`/ffspb-portal/overview/${seasonId}/ffspbStatistics/${tournamentId}`);
  return d.teams ?? [];
}
export interface AvRatingTeam { id: number; name: string; logo?: string | null; division?: { id: number; name: string }; points: number }
export async function getClubRatingsOverview(seasonId: number): Promise<AvRatingTeam[]> {
  const d = await authedGet<{ teams?: AvRatingTeam[] }>(`/ffspb-portal/overview/${seasonId}/getTeamsRatings/overview`);
  return d.teams ?? [];
}
export async function getClubRatingsByTournament(seasonId: number, tournamentId: number): Promise<AvRatingTeam[]> {
  const d = await authedGet<{ teams?: AvRatingTeam[] }>(`/ffspb-portal/overview/${seasonId}/getTeamsRatings/${tournamentId}`);
  return d.teams ?? [];
}

// ---- Игрок: деталь (полная дата) + события (37 метрик) + расстановки ----
export interface AvPlayerDetail { id: number; firstname: string; lastname: string; playerName?: string; number?: number; dateOfBirth?: string | null; teamId?: number; linkToProfile?: string | null }
export async function getPlayerDetail(id: number): Promise<AvPlayerDetail | null> {
  try { return await authedGet<AvPlayerDetail>(`/players/${id}`); } catch { return null; }
}
export interface AvEvent { id: number; eventTypeId: string; points: number; mainPlayerId: number | null; matchId: number; date?: string; teamForTournamentId?: number | null }
/** События игрока (пагинация по 100 — limit>100 запрещён API). */
export async function getPlayerEvents(playerId: number): Promise<AvEvent[]> {
  const all: AvEvent[] = [];
  for (let page = 1; page <= 10; page++) {
    const d = await authedGet<{ data?: AvEvent[]; meta?: { totalPages?: number } }>(`/events?mainPlayerId=${playerId}&limit=100&page=${page}`);
    all.push(...(d.data ?? []));
    if (!d.meta?.totalPages || page >= d.meta.totalPages) break;
  }
  return all;
}
export interface AvEventType { id: string; title: string; shortTitle?: string | null; points: number; eventTypeCategoryId?: string | null }
export async function getEventTypes(): Promise<AvEventType[]> {
  const d = await authedGet<{ data?: AvEventType[] }>(`/event-types?limit=80`);
  return d.data ?? [];
}

// ---- Реестр игроков с ПОЛНОЙ датой рождения (для RAE) ----
export interface AvPlayerSummary { id: number; firstname: string; lastname: string; dateOfBirth: string | null }
/** Все мастер-игроки региона с полной датой рождения (пагинация по 100). */
export async function getAllPlayerSummaries(maxPages = 60): Promise<AvPlayerSummary[]> {
  const all: AvPlayerSummary[] = [];
  let totalPages = 1;
  for (let page = 1; page <= Math.min(maxPages, totalPages); page++) {
    const d = await authedGet<{ data?: AvPlayerSummary[]; meta?: { totalPages?: number } }>(`/player-summaries?limit=100&page=${page}`);
    all.push(...(d.data ?? []));
    totalPages = d.meta?.totalPages ?? 1;
  }
  return all;
}

logger.debug({ configured: isAvandataConfigured() }, 'avandataApi loaded');
