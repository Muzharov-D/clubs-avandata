/**
 * Логотипы клубов из нашей базы (drizzle/0028). Внешний адрес → байты в club_logos:
 * первый запрос скачивает и сохраняет, дальше — только из БД, с вечным кэшем браузера.
 * Разрешены только хранилища логотипов AvanData — это не открытый прокси.
 */
import { withBypassRLS } from '../db/tenantContext.js';
import { logger } from '../shared/logger.js';

const ALLOWED_HOSTS = new Set(['s3.twcstorage.ru', 'img.nagradion.ru']);
const MAX_BYTES = 1_500_000;
const mem = new Map<string, { type: string; bytes: Buffer }>();
const inflight = new Map<string, Promise<{ type: string; bytes: Buffer } | null>>();

export function isAllowedLogo(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname); } catch { return false; }
}

async function fromDb(url: string) {
  const r = await withBypassRLS((_tx, conn) => conn.query<{ content_type: string; bytes: Buffer }>('SELECT content_type, bytes FROM club_logos WHERE url = $1', [url]));
  const row = r.rows[0];
  return row ? { type: row.content_type, bytes: row.bytes } : null;
}

async function fetchAndStore(url: string) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/png';
    if (!type.startsWith('image/')) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    await withBypassRLS((_tx, conn) => conn.query('INSERT INTO club_logos (url, content_type, bytes) VALUES ($1, $2, $3) ON CONFLICT (url) DO NOTHING', [url, type, bytes]));
    return { type, bytes };
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e), url }, '[logos] не скачался');
    return null;
  } finally { clearTimeout(timer); }
}

/** Логотип по внешнему адресу: память → БД → скачать и сохранить. null — недоступен. */
export async function getLogo(url: string): Promise<{ type: string; bytes: Buffer } | null> {
  const hit = mem.get(url);
  if (hit) return hit;
  let job = inflight.get(url);
  if (!job) {
    job = (async () => (await fromDb(url)) ?? (await fetchAndStore(url)))().finally(() => inflight.delete(url));
    inflight.set(url, job);
  }
  const res = await job;
  if (res) mem.set(url, res);
  return res;
}

/** Заранее сложить логотипы в базу (фоном, по одному) — чтобы первый показ был из БД. */
export async function prefetchLogos(urls: Iterable<string | null | undefined>): Promise<void> {
  for (const u of new Set([...urls].filter((x): x is string => !!x && isAllowedLogo(x)))) {
    if (!mem.has(u)) await getLogo(u).catch(() => null);
  }
}
