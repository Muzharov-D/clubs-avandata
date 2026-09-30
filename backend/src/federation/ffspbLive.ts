/**
 * Живые протоколы ФФСПб по турниру — актуальные результаты и таблицы, посчитанные из них.
 *
 * Почему так: `/api/standings` ФФСПб отвечает по 1–2 минуты (и через Vercel-прокси
 * обычно не доходит), а зеркало AvanData отстаёт на месяцы. Список матчей турнира
 * (`/api/matches?tournament_id=…`) отдаётся страницами по 10 за ~1–2 с — этого хватает,
 * чтобы собрать и результаты, и таблицу дивизиона (очки/разница/голы). Порядок таблицы
 * — очки → личные встречи (по очкам между равными) → разница → забитые → имя.
 *
 * ФФСПб капризен: страницы крупнее 10 и параллельные запросы «зависают» — поэтому все
 * запросы идут через одну очередь, последовательно, с длинным таймаутом и ретраями.
 * Полный список турнира грузим ОДИН раз и храним в БД (ffspb_match_cache), дальше
 * докачиваем только матчи последних недель (date[gte]) и сливаем по id.
 */
import { eq } from 'drizzle-orm';
import { withBypassRLS } from '../db/tenantContext.js';
import { ffspbMatchCache } from '../db/schema/ffspbMatchCache.js';
import { isFfspbConfigured } from '../services/ffspbApi.js';
import { logger } from '../shared/logger.js';
import { normTeam } from './teamName.js';

const FFSPB_API = (process.env.FFSPB_API_BASE ?? 'https://clubs-avandata.vercel.app/ffspb-api').replace(/\/+$/, '');
const FFSPB_KEY = process.env.FFSPB_API_KEY ?? '';
// Поведение ФФСПб (проверено 2026-09-30): ПЕРВЫЙ запрос к турниру «прогревает» его на их
// стороне 1–3 минуты (ответ висит, потом 502/обрыв), зато после прогрева страницы по 10
// матчей отдаются за ~1.4 с (крупные страницы под нагрузкой снова упираются в лимит прокси). Важно: если ОБОРВАТЬ запрос рано
// (20 с), прогрев на их стороне тоже прерывается и никогда не завершается — поэтому держим
// соединение почти до лимита прокси Vercel (~150 с) и сразу переспрашиваем: повтор после
// прогрева отвечает за секунду.
const PAGE = 10;                                  // страницы по 100 ходят нестабильно (обрыв прокси ~150 с), по 10 — надёжно ~1.4 с после прогрева
const FETCH_TIMEOUT_MS = 140_000;                 // чуть меньше лимита прокси; обрыв раньше срывает прогрев
const WARM_ATTEMPTS = 3;                          // 3 × ~140 с ≈ до 7 минут на самый тяжёлый турнир
const WARM_BACKOFF_MS = 3_000;
const REFRESH_TTL_MS = 10 * 60 * 1000;            // как часто докачивать свежие матчи
const REFRESH_WINDOW_DAYS = 21;                   // окно инкремента: результаты + ближайший календарь

export interface FfSide { id: number; name: string; logo: string | null; clubId: number | null }
export interface FfMatch {
  id: number; stageId: number | null; tour: number | null; date: string;
  home: FfSide; away: FfSide;
  hs: number | null; as: number | null;
  /** Результат подтверждён (done=4). */
  done: boolean;
  technical: boolean;
}
export interface FfTableRow {
  teamId: number; name: string; logo: string | null;
  played: number; won: number; drawn: number; lost: number; gf: number; ga: number; goalDiff: number; points: number;
}

// ─── HTTP: одна очередь, длинный таймаут, ретраи ─────────────────────────────
let queue: Promise<unknown> = Promise.resolve();
/** Единая очередь ВСЕХ обращений к ФФСПб (и из avandataSource): параллельные запросы к нему
 *  взаимно «вешают» друг друга, последовательные — проходят. */
export function ffspbSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}
const serialized = ffspbSerialized;
// Отдельная «быстрая» очередь для лёгких запросов (турниры, таблицы): они не должны стоять
// за догрузкой страниц матчей, где каждая страница может висеть минуты. Два параллельных
// соединения ФФСПб переносит; «вешают» друг друга только пачки запросов.
let fastQueue: Promise<unknown> = Promise.resolve();
export function ffspbSerializedFast<T>(fn: () => Promise<T>): Promise<T> {
  const run = fastQueue.then(fn, fn);
  fastQueue = run.catch(() => undefined);
  return run;
}
async function ffGet(path: string, attempts = WARM_ATTEMPTS): Promise<Record<string, unknown>> {
  return serialized(async () => {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      const t0 = Date.now();
      try {
        const res = await fetch(`${FFSPB_API}${path}`, { headers: { Accept: 'application/ld+json', 'X-AUTH-TOKEN': FFSPB_KEY }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`ffspb ${res.status} ${path}`);
        const json = (await res.json()) as Record<string, unknown>;
        logger.debug({ path, ms: Date.now() - t0, attempt: i + 1 }, '[ffspb-live] страница получена');
        return json;
      } catch (e) {
        lastErr = e;
        // 5xx/таймаут = турнир ещё греется на стороне ФФСПб — ждём и переспрашиваем.
        logger.debug({ path, ms: Date.now() - t0, attempt: i + 1, err: String(e) }, '[ffspb-live] не ответил, ждём прогрева');
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, WARM_BACKOFF_MS));
      }
    }
    logger.warn({ path, attempts, err: String(lastErr) }, '[ffspb-live] ФФСПб так и не ответил');
    throw lastErr;
  });
}

// ─── Нормализация ─────────────────────────────────────────────────────────────
interface RawTeam { id?: number; name?: string; logoSrc?: string | null; thumbnails?: { square_sm?: string; square_xs?: string }; parentId?: number | null }
interface RawMatch {
  id?: number; stageId?: number | null; tourId?: number | null; publicDate?: string;
  host?: RawTeam; guest?: RawTeam; resultHost?: number | null; resultGuest?: number | null;
  done?: number; technicalDefeat?: number;
}
const side = (t?: RawTeam): FfSide => ({
  id: Number(t?.id ?? 0), name: (t?.name ?? '').trim(),
  logo: t?.logoSrc ?? t?.thumbnails?.square_sm ?? t?.thumbnails?.square_xs ?? null,
  clubId: t?.parentId ?? null,
});
export const normalizeMatch = (m: RawMatch): FfMatch | null => {
  if (m.id == null || !m.publicDate) return null;
  const done = m.done === 4;
  return {
    id: m.id, stageId: m.stageId ?? null, tour: m.tourId ?? null, date: new Date(m.publicDate).toISOString(),
    home: side(m.host), away: side(m.guest),
    hs: done ? (m.resultHost ?? null) : null, as: done ? (m.resultGuest ?? null) : null,
    done, technical: !!m.technicalDefeat,
  };
};

/** Страницы списка матчей начиная с fromPage; onPage — после каждой страницы (nextPage=null, когда список кончился). */
async function fetchPages(tid: number, extra = '', fromPage = 1, onPage?: (items: FfMatch[], nextPage: number | null) => Promise<void>): Promise<FfMatch[]> {
  const out: FfMatch[] = [];
  for (let page = fromPage; page <= 80; page++) {
    const d = await ffGet(`/matches?tournament_id=${tid}&itemsPerPage=${PAGE}&page=${page}${extra}`);
    const items = ((d['hydra:member'] ?? d.member ?? []) as RawMatch[]).map(normalizeMatch).filter((x): x is FfMatch => !!x);
    out.push(...items);
    const view = (d['hydra:view'] ?? d.view) as { 'hydra:next'?: string; next?: string } | undefined;
    const more = !!(view && (view['hydra:next'] ?? view.next) && items.length > 0);
    if (onPage) await onPage(items, more ? page + 1 : null);
    if (!more) break;
  }
  return out;
}

// ─── Кэш: память → БД → ФФСПб ─────────────────────────────────────────────────
/** nextPage != null — полная загрузка ещё идёт (список неполный, использовать нельзя). */
interface Entry { matches: Map<number, FfMatch>; nextPage: number | null; fullAt: number | null; fetchedAt: number }
const mem = new Map<number, Entry>();
const inflight = new Map<number, Promise<Entry>>();

async function loadFromDb(tid: number): Promise<Entry | null> {
  try {
    const rows = await withBypassRLS((tx) => tx.select().from(ffspbMatchCache).where(eq(ffspbMatchCache.tournamentId, tid)).limit(1));
    const row = rows[0];
    if (!row) return null;
    const list = row.matches as FfMatch[];
    return { matches: new Map(list.map((m) => [m.id, m])), nextPage: row.nextPage ?? null, fullAt: row.fullAt?.getTime() ?? null, fetchedAt: row.fetchedAt.getTime() };
  } catch (e) { logger.warn({ err: String(e), tid }, '[ffspb-live] чтение кэша из БД не удалось'); return null; }
}
async function saveToDb(tid: number, e: Entry): Promise<void> {
  const matches = [...e.matches.values()];
  const row = { matches, nextPage: e.nextPage, fullAt: e.fullAt != null ? new Date(e.fullAt) : null, fetchedAt: new Date(e.fetchedAt) };
  try {
    await withBypassRLS((tx) => tx.insert(ffspbMatchCache)
      .values({ tournamentId: tid, ...row })
      .onConflictDoUpdate({ target: ffspbMatchCache.tournamentId, set: row }));
  } catch (err) { logger.warn({ err: String(err), tid }, '[ffspb-live] запись кэша в БД не удалась'); }
}

// Полные загрузки — строго по одному турниру (цепочка): так первый турнир становится
// пригодным раньше, чем если бы страницы пяти турниров перемешивались в общей очереди.
let fullLoadChain: Promise<unknown> = Promise.resolve();
const fullLoading = new Set<number>();
function scheduleFullLoad(tid: number, e: Entry | null): void {
  if (fullLoading.has(tid)) return;
  fullLoading.add(tid);
  fullLoadChain = fullLoadChain.then(async () => {
    const entry: Entry = e ?? { matches: new Map(), nextPage: 1, fullAt: null, fetchedAt: Date.now() };
    mem.set(tid, entry);
    const from = entry.nextPage ?? 1;
    try {
      await fetchPages(tid, '', from, async (items, nextPage) => {
        for (const m of items) entry.matches.set(m.id, m);
        entry.nextPage = nextPage; entry.fetchedAt = Date.now();
        if (nextPage == null) entry.fullAt = Date.now();
        await saveToDb(tid, entry);                 // прогресс постранично — переживает рестарт
      });
      logger.info({ tid, matches: entry.matches.size }, '[ffspb-live] полная загрузка турнира завершена');
    } catch (err) {
      logger.warn({ err: String(err), tid, nextPage: entry.nextPage }, '[ffspb-live] полная загрузка прервалась — продолжим со следующей страницы позже');
    } finally { fullLoading.delete(tid); }
  });
}

export class FfspbWarmingError extends Error { constructor(tid: number) { super(`ffspb-live: турнир ${tid} ещё загружается`); } }

/** Матчи турнира ФФСПб: из памяти/БД, при протухании — инкремент по последним неделям
 *  (фоном, протухший кэш отдаём сразу). Если кэша нет вовсе — запускаем полную загрузку
 *  ФОНОМ и бросаем FfspbWarmingError: вызывающий строит ответ по запасному источнику, а
 *  следующая пересборка (через минуты) уже увидит протоколы в БД. Так один медленный турнир
 *  (прогрев ФФСПб — минуты) не держит всю страницу. */
export async function tournamentMatches(tid: number): Promise<FfMatch[]> {
  if (!isFfspbConfigured()) throw new Error('FFSPB_API_KEY не задан');
  let e = mem.get(tid) ?? null;
  if (!e) { e = await loadFromDb(tid); if (e) mem.set(tid, e); }
  if (!e || e.nextPage != null) {                   // кэша нет или он неполный → грузим фоном, сейчас — запасной источник
    scheduleFullLoad(tid, e);
    throw new FfspbWarmingError(tid);
  }
  if (Date.now() - e.fetchedAt < REFRESH_TTL_MS) return [...e.matches.values()];
  const full = e;
  let job = inflight.get(tid);
  if (!job) {
    job = (async (): Promise<Entry> => {
      const now = Date.now();
      const e = full;
      const since = Math.floor((now - REFRESH_WINDOW_DAYS * 86_400_000) / 1000);
      try {
        const list = await fetchPages(tid, `&date[gte]=${since}`);
        for (const m of list) e.matches.set(m.id, m);
        e.fetchedAt = now;
        await saveToDb(tid, e);
        logger.info({ tid, updated: list.length }, '[ffspb-live] инкремент турнира');
      } catch (err) {
        logger.warn({ err: String(err), tid }, '[ffspb-live] инкремент не удался — отдаём кэш');
      }
      return e;
    })().finally(() => inflight.delete(tid));
    inflight.set(tid, job);
  }
  job.catch(() => undefined);                        // инкремент фоном; ошибка залогирована внутри
  return [...e.matches.values()];                    // протухший кэш отдаём сразу, свежий доедет фоном
}

/** Есть ли уже кэш протоколов турнира (память или БД) — без обращения к ФФСПб. */
export async function hasTournamentCache(tid: number): Promise<boolean> {
  let e = mem.get(tid) ?? null;
  if (!e) { e = await loadFromDb(tid); if (e) mem.set(tid, e); }
  return !!e && e.nextPage == null;
}

// ─── Таблица дивизиона из протоколов ──────────────────────────────────────────
/** Таблица стадии (дивизиона): очки 3/1/0, порядок — очки, личные встречи среди равных
 *  по очкам, разница, забитые, имя. Технические поражения учитываются по счёту протокола. */
export function tableFromMatches(matches: FfMatch[], stageId: number | null): FfTableRow[] {
  const rows = new Map<number, FfTableRow>();
  const ensure = (s: FfSide) => rows.get(s.id) ?? rows.set(s.id, { teamId: s.id, name: s.name, logo: s.logo, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, goalDiff: 0, points: 0 }).get(s.id)!;
  const inStage = matches.filter((m) => (stageId == null || m.stageId === stageId));
  for (const m of inStage) { ensure(m.home); ensure(m.away); }
  const played = inStage.filter((m) => m.done && m.hs != null && m.as != null);
  for (const m of played) {
    const h = ensure(m.home), a = ensure(m.away);
    const hs = m.hs as number, as = m.as as number;
    h.played++; a.played++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) { h.won++; a.lost++; h.points += 3; } else if (hs < as) { a.won++; h.lost++; a.points += 3; } else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  for (const r of rows.values()) r.goalDiff = r.gf - r.ga;
  // Личные встречи: очки в матчах между командами с одинаковой суммой очков.
  const h2h = (ids: Set<number>): Map<number, number> => {
    const pts = new Map<number, number>();
    for (const m of played) {
      if (!ids.has(m.home.id) || !ids.has(m.away.id)) continue;
      const hs = m.hs as number, as = m.as as number;
      pts.set(m.home.id, (pts.get(m.home.id) ?? 0) + (hs > as ? 3 : hs === as ? 1 : 0));
      pts.set(m.away.id, (pts.get(m.away.id) ?? 0) + (as > hs ? 3 : hs === as ? 1 : 0));
    }
    return pts;
  };
  const list = [...rows.values()];
  const byPts = new Map<number, Set<number>>();
  for (const r of list) (byPts.get(r.points) ?? byPts.set(r.points, new Set()).get(r.points)!).add(r.teamId);
  const h2hByPts = new Map<number, Map<number, number>>();
  for (const [p, ids] of byPts) if (ids.size > 1) h2hByPts.set(p, h2h(ids));
  return list.sort((a, b) =>
    (b.points - a.points)
    || ((h2hByPts.get(a.points)?.get(b.teamId) ?? 0) - (h2hByPts.get(a.points)?.get(a.teamId) ?? 0))
    || (b.goalDiff - a.goalDiff) || (b.gf - a.gf) || a.name.localeCompare(b.name, 'ru'));
}

/** Команда ФФСПб в турнире по ключу имени (normTeam), вместе с её стадией. */
export function findTeam(matches: FfMatch[], key: string): { team: FfSide; stageId: number | null } | null {
  for (const m of matches) {
    if (normTeam(m.home.name) === key) return { team: m.home, stageId: m.stageId };
    if (normTeam(m.away.name) === key) return { team: m.away, stageId: m.stageId };
  }
  return null;
}
