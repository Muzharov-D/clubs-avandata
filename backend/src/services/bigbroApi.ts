import { env } from '../env.js';
import { logger } from '../shared/logger.js';

/**
 * Клиент API bigbro.ai — заказ обработки видеозаписей матчей (коллеги-аналитики).
 * Поток: auth (JWT, ~10 дней) → user id → камеры (playground) → создать заказ на
 * интервал → получить URL видеоплеера (для iframe).
 *
 * ВАЖНО: createOrder — ИСХОДЯЩЕЕ действие (создаёт реальный заказ на чужой
 * инфраструктуре). Вызывается только по явному действию пользователя, не авто.
 * Креды — строго server-side в ENV (BIGBRO_USERNAME/PASSWORD).
 */

const ENDPOINT = env.BIGBRO_ENDPOINT.replace(/\/+$/, '');
const FETCH_TIMEOUT_MS = 30_000;
// Токен живёт ~10 дней; обновляем с запасом (9 дней) или принудительно на 401.
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

export function isBigbroConfigured(): boolean {
  return !!(env.BIGBRO_USERNAME && env.BIGBRO_PASSWORD);
}

let cachedToken: { access: string; expiresAt: number } | null = null;
let cachedUserId: number | null = null;

async function authToken(force = false): Promise<string> {
  if (!isBigbroConfigured()) throw new Error('BIGBRO_USERNAME/PASSWORD не заданы в env');
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.access;
  const res = await fetch(`${ENDPOINT}/api/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.BIGBRO_USERNAME, password: env.BIGBRO_PASSWORD }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`bigbro auth ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access?: string };
  if (!data.access) throw new Error('bigbro auth: нет access в ответе');
  cachedToken = { access: data.access, expiresAt: Date.now() + TOKEN_TTL_MS };
  return data.access;
}

/** Авторизованный JSON-fetch с одним авто-перелогином на 401. */
async function authed(path: string, opts: RequestInit = {}, retried = false): Promise<unknown> {
  const token = await authToken();
  const res = await fetch(`${ENDPOINT}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...((opts.headers as Record<string, string>) ?? {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401 && !retried) {
    await authToken(true);
    return authed(path, opts, true);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`bigbro ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

export async function getUserId(): Promise<number> {
  if (cachedUserId != null) return cachedUserId;
  const data = (await authed('/api/user/')) as { id?: number };
  if (data.id == null) throw new Error('bigbro: нет id пользователя в ответе');
  cachedUserId = data.id;
  return data.id;
}

export interface BigbroCamera {
  id: number;
  name: string;
  arenaName: string;
}

/** Список камер (площадок) с авто-пагинацией. */
export async function listCameras(): Promise<BigbroCamera[]> {
  const all: BigbroCamera[] = [];
  let page = 1;
  let safety = 50;
  while (safety-- > 0) {
    const data = (await authed(`/panel/playground/?page=${page}`)) as {
      results?: Array<{ id: number; name: string; arena_name: string }>;
      next?: string | null;
    };
    for (const r of data.results ?? []) all.push({ id: r.id, name: r.name, arenaName: r.arena_name });
    if (!data.next) break;
    page += 1;
  }
  return all;
}

export interface CreateOrderInput {
  /** id камеры (playground). */
  playground: number;
  /** ISO 8601, напр. "2026-05-11T12:50". */
  videoStart: string;
  videoEnd: string;
  /** По умолчанию = videoStart. */
  activityDate?: string;
}
export interface CreateOrderResult {
  status: string;
  orderId: number | null;
}

/**
 * Создать заказ на обработку видео. ИСХОДЯЩЕЕ действие на инфраструктуру коллег —
 * вызывать ТОЛЬКО по явному действию пользователя (кнопка), не в фоне/авто.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const uid = await getUserId();
  const body = {
    activity_date: input.activityDate ?? input.videoStart,
    activity_type: 'broadcasting',
    assign_video: 'now',
    camera_position: 'regular',
    link: 'https://bigbro.ai',
    playground: input.playground,
    video_start: input.videoStart,
    video_end: input.videoEnd,
  };
  const data = (await authed(`/panel/order/create/?user_id=${uid}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })) as { status?: string; order_id?: number };
  return { status: data.status ?? 'unknown', orderId: data.order_id ?? null };
}

/** URL web-страницы с видеоплеером заказа (для встраивания в iframe). */
export async function getOrderVideo(orderId: number | string): Promise<{ url: string | null }> {
  const data = (await authed(`/api/order/${orderId}/video`)) as { url?: string };
  return { url: data.url ?? null };
}

logger.debug({ configured: isBigbroConfigured() }, 'bigbroApi loaded');
