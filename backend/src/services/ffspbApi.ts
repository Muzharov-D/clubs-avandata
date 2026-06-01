import { env } from '../env.js';
import { logger } from '../shared/logger.js';

/**
 * Тонкий клиент для официального API stat.ffspb.org (API Platform / JSON-LD).
 *
 * Authorization: `X-AUTH-TOKEN: <FFSPB_API_KEY>` — платформенный ключ,
 * shared между всеми tenant'ами с data_provider='ffspb'.
 *
 * Особенности:
 * - Auto-pagination через Hydra view (next link) для list-эндпоинтов
 * - Простой retry на 5xx (3 попытки, экспоненциальный backoff)
 * - Все list-методы возвращают plain Array (без @id/@context wrapping)
 */

const ENDPOINT = env.FFSPB_ENDPOINT.replace(/\/+$/, '');

export function isFfspbConfigured(): boolean {
  return !!env.FFSPB_API_KEY;
}

interface HydraView {
  'hydra:next'?: string;
  next?: string;
}
interface HydraResponse<T> {
  'hydra:member'?: T[];
  member?: T[];
  'hydra:view'?: HydraView;
  view?: HydraView;
}

const FETCH_TIMEOUT_MS = 45_000;

async function fetchWithRetry(url: string, opts: RequestInit = {}, attempt = 1): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: 'application/ld+json',
    'X-AUTH-TOKEN': env.FFSPB_API_KEY ?? '',
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  try {
    const res = await fetch(url, { ...opts, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status >= 500 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return fetchWithRetry(url, opts, attempt + 1);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`FFSPB ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // НЕ ретраить таймауты — они персистентные (FFSPB /api/standings >60s).
    // Ретраим только сетевые сбои.
    if (attempt < 2 && /ECONNRESET|fetch failed/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return fetchWithRetry(url, opts, attempt + 1);
    }
    throw e;
  }
}

/**
 * List с авто-пагинацией. Возвращает все элементы со всех страниц.
 */
export async function listAll<T = unknown>(
  path: string,
  params: Record<string, string | number | string[] | null | undefined> = {},
): Promise<T[]> {
  if (!isFfspbConfigured()) throw new Error('FFSPB_API_KEY не задан в env');
  const url = new URL(ENDPOINT + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(`${k}[]`, String(item));
    } else if (v != null) {
      url.searchParams.set(k, String(v));
    }
  }
  if (!url.searchParams.has('itemsPerPage')) url.searchParams.set('itemsPerPage', '100');

  const all: T[] = [];
  let next: string | null = url.toString();
  let safety = 50;
  while (next && safety-- > 0) {
    const data = (await fetchWithRetry(next)) as HydraResponse<T>;
    const items = data['hydra:member'] ?? data.member ?? [];
    for (const item of items) all.push(item);
    const view = data['hydra:view'] ?? data.view;
    const nextRel = view?.['hydra:next'] ?? view?.next;
    next = nextRel ? new URL(nextRel, ENDPOINT).toString() : null;
  }
  return all;
}

export async function getOne<T = unknown>(
  path: string,
  params: Record<string, string | number | null | undefined> = {},
): Promise<T> {
  if (!isFfspbConfigured()) throw new Error('FFSPB_API_KEY не задан в env');
  const url = new URL(ENDPOINT + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  return (await fetchWithRetry(url.toString())) as T;
}

// ============================================================================
// Удобные обёртки (типы вернутся подробнее когда понадобится).
// ============================================================================

export interface FfspbMatchListOpts {
  hasLineups?: boolean;
  dateGte?: string | Date;
  dateLte?: string | Date;
  orderByDate?: 'asc' | 'desc';
}

export async function listMatches(tournamentId: string | number, opts: FfspbMatchListOpts = {}) {
  // Фильтр по турниру — через IRI (как в listStandings/listPlayoffs). Параметр
  // tournament_id FFSPB НЕ распознаёт: отдаёт всю коллекцию матчей платформы, и
  // listAll уходит в пагинацию по тысячам записей (>100с). IRI-форма фильтрует.
  const params: Record<string, string | number> = { tournament: `/api/tournaments/${tournamentId}` };
  if (opts.hasLineups != null) params.has_lineups = opts.hasLineups ? 1 : 0;
  if (opts.dateGte) params['date[gte]'] = Math.floor(new Date(opts.dateGte).getTime() / 1000);
  if (opts.dateLte) params['date[lte]'] = Math.floor(new Date(opts.dateLte).getTime() / 1000);
  // НЕ шлём order[date] по умолчанию: серверная сортировка FFSPB по всей коллекции
  // матчей турнира стабильно >20с (таймаут). Фильтр tournament_id отдаёт данные за
  // ~0.5с без сортировки; порядок не важен — UPSERT идёт по ext_match_id, а UI
  // сортирует по match_date сам. Передаём order только если явно запрошен.
  if (opts.orderByDate) params['order[date]'] = opts.orderByDate;
  return listAll(`/matches`, params);
}

export async function getMatch(matchId: string | number) {
  return getOne(`/matches/${matchId}`);
}

export async function listStandings(tournamentId: string | number) {
  return listAll(`/standings`, { tournament: `/api/tournaments/${tournamentId}` });
}

export async function listPlayoffs(tournamentId: string | number) {
  return listAll(`/playoffs`, { tournament: `/api/tournaments/${tournamentId}` });
}

export async function getTeamWithPlayers(teamId: string | number) {
  return getOne(`/teams/${teamId}`);
}

export async function listTeamPlayers(teamId: string | number) {
  return listAll(`/players`, { 'currentTeam.id': teamId });
}

export async function listMatchEvents(matchId: string | number) {
  return listAll(`/match_events`, { 'match.id': matchId });
}

export async function listTournamentTopPlayers(
  tournamentId: string | number,
  topBy: 'goals' | 'assists' | 'yellow_cards' | 'red_cards' = 'goals',
) {
  return listAll(`/tournament_top_players`, {
    tournament: `/api/tournaments/${tournamentId}`,
    top_by: topBy,
  });
}

logger.debug({ configured: isFfspbConfigured() }, 'ffspbApi loaded');
