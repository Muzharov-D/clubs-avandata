import 'dotenv/config';
import { pool } from '../db/client.js';
import { withBypassRLS } from '../db/tenantContext.js';
import { logger } from '../shared/logger.js';
import { isFfspbConfigured, listMatches, getMatch } from '../services/ffspbApi.js';
import { regionScorers } from '../db/schema/regionScorers.js';
import type { RegionScorerRow, RegionScorersPayload } from '../federation/regionScorers.js';

/**
 * SYNC бомбардиров региона по голам из протоколов FFSPB → ОДИН ряд region_scorers.
 *
 * Запускать ЛОКАЛЬНО / где есть доступ к stat.ffspb.org (с Render IP-блок).
 * Живой обход тяжёлый: детали КАЖДОГО сыгранного матча с events по 8 турнирам
 * Первенства (~594 матча), несколько минут. Делается ~раз в месяц владельцем.
 * Эндпоинт region-scorers ЧИТАЕТ последний снимок мгновенно (живой FFSPB на запрос
 * страницы НИКОГДА не дёргается).
 *
 * Алгоритм (порт из .tmp_ffspb_scorers.mjs, числа подтверждены — ~594 матча:
 * Сазонов А. (Автово, 2009) 28, Силкин Р. (Зенит, 2013) 22, Кафиев М. (Зенит, 2016) 16,
 * Шурыгин К. (Ижорец, 2016) 15):
 *  - сыгранные матчи турнира (done || resultHost != null) → детали с events;
 *  - events[]: гол (eventType 0) + пенальти (eventType 2) кредитуются author
 *    (автогол eventType 1 — мимо); team у события — ОБЪЕКТ (e.team['@id'] против
 *    d.host['@id'] выбирает хозяина/гостя для имени клуба и эмблемы);
 *  - агрегируем голы по (бомбардир, клуб); ассисты в протоколах FFSPB пусты → topAssists [].
 *
 * Запуск (нужен FFSPB_API_KEY + доступ к FFSPB):
 *   cd backend && npm run sync:region-scorers               # федерация ffspb, сезон 2026
 *   cd backend && npm run sync:region-scorers -- --dry-run  # обход+расчёт БЕЗ записи в БД
 *   cd backend && npx tsx src/scripts/syncRegionScorers.ts --slug=ffspb --season=2026
 */

// ---- Турниры Первенства (как в .tmp_ffspb_scorers.mjs / syncRegionMinutes) ----
const SEASON = '2026';
const FEDERATION_DEFAULT = 'ffspb';

interface Cohort { tid: number; year: number }
const COHORTS: Cohort[] = [
  { tid: 44322, year: 2009 },
  { tid: 44323, year: 2010 },
  { tid: 44324, year: 2011 },
  { tid: 44325, year: 2012 },
  { tid: 44327, year: 2013 },
  { tid: 44329, year: 2014 },
  { tid: 44330, year: 2015 },
  { tid: 44331, year: 2016 },
];

// ---- Помощники (порт из .mjs) -------------------------------------------
function idOf(iri: unknown): string | null {
  if (iri == null) return null;
  return String(iri).match(/\d+$/)?.[0] ?? null;
}

/** «Фамилия И.» из author/assist (surname/firstName напрямую или через .member). */
function personName(p: PersonRef | null | undefined): string | null {
  if (!p) return null;
  const last = p.surname ?? p.member?.surname ?? '';
  const first = p.firstName ?? p.member?.firstName ?? '';
  const n = (last + (first ? ` ${first.slice(0, 1)}.` : '')).trim();
  return n || null;
}

/** Нормализует имя клуба: убирает кавычки, хвост-год, префикс «ФК». */
function normClub(n: string | null | undefined): string {
  return (n ?? '')
    .replace(/["']/g, '')
    .replace(/\s*20\d{2}\b.*$/, '')
    .replace(/ФК\s*/i, '')
    .trim();
}

/** Ограниченный параллелизм (как pmap в .mjs): сбои элемента → null, не валят весь обход. */
async function pmap<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try { out[k] = await fn(items[k]!); } catch { out[k] = null; }
      }
    }),
  );
  return out;
}

// ---- Формы FFSPB (минимально-типизированы) -------------------------------
interface PersonRef {
  surname?: string | null;
  firstName?: string | null;
  member?: { surname?: string | null; firstName?: string | null } | null;
}
interface MatchEvent {
  eventType?: number;
  author?: PersonRef | null;
  assist?: PersonRef | null;
  team?: { '@id'?: string } | string | null;
}
interface MatchTeam {
  '@id'?: string;
  name?: string;
  logoSrc?: string | null;
  thumbnails?: { square_xs?: string | null } | null;
}
interface MatchDetail {
  events?: MatchEvent[];
  host?: MatchTeam;
  guest?: MatchTeam;
  hostName?: string;
  guestName?: string;
}
interface MatchListItem { id?: number | string; '@id'?: string; done?: boolean; resultHost?: unknown }

/** URL эмблемы клуба из объекта команды матча (logoSrc приоритетнее square_xs). */
function teamLogo(t: MatchTeam | undefined): string | null {
  return t?.logoSrc ?? t?.thumbnails?.square_xs ?? null;
}

interface GoalAgg { name: string; club: string; logo: string | null; cohort: number; goals: number }

// ---- Главный обход -------------------------------------------------------
async function buildPayload(): Promise<RegionScorersPayload> {
  const goals = new Map<string, GoalAgg>(); // key name|club
  let matchesScanned = 0;
  let withEvents = 0;

  for (const c of COHORTS) {
    const t0 = Date.now();
    let matchList: MatchListItem[] = [];
    try {
      matchList = (await listMatches(c.tid)) as MatchListItem[];
    } catch (e) {
      logger.error({ year: c.year, err: e instanceof Error ? e.message : String(e) }, 'matches ERR');
    }
    const played = matchList.filter((m) => m.done === true || m.resultHost != null);
    const details = await pmap(played, 6, async (m) => {
      const id = m.id ?? idOf(m['@id']);
      try { return (await getMatch(id!)) as MatchDetail; } catch { return null; }
    });

    for (const d of details) {
      if (!d) continue;
      matchesScanned++;
      const evs = d.events ?? [];
      if (!evs.length) continue;
      withEvents++;
      const hostIri = d.host?.['@id'];
      const hostName = d.host?.name ?? d.hostName ?? '';
      const guestName = d.guest?.name ?? d.guestName ?? '';
      for (const e of evs) {
        const t = e.eventType;
        if (t !== 0 && t !== 2) continue; // только гол / пенальти (1 = автогол — мимо)
        const scorer = personName(e.author);
        if (!scorer) continue;
        // team у события — ОБЪЕКТ: e.team['@id'] против host['@id'] выбирает хозяина/гостя.
        const teamIri = typeof e.team === 'object' && e.team != null ? e.team['@id'] : e.team;
        const isHost = teamIri === hostIri;
        const club = normClub(isHost ? hostName : guestName);
        const logo = teamLogo(isHost ? d.host : d.guest);
        const k = `${scorer}|${club}`;
        const r = goals.get(k) ?? { name: scorer, club, logo, cohort: c.year, goals: 0 };
        r.goals++;
        // Эмблема — best-effort: запоминаем первую непустую (могла отсутствовать в одном матче).
        if (r.logo == null && logo != null) r.logo = logo;
        goals.set(k, r);
      }
    }

    logger.info(
      { year: c.year, played: played.length, matchesScanned, withEvents },
      `[${c.year}] матчей ${played.length} · с событиями ${withEvents}/${matchesScanned} (накопл., ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }

  const topGoals: RegionScorerRow[] = [...goals.values()]
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 15)
    .map((r) => ({ name: r.name, club: r.club, logo: r.logo, cohort: r.cohort, goals: r.goals }));

  return { season: SEASON, matchesScanned, topGoals, topAssists: [] };
}

// ---- CLI -----------------------------------------------------------------
function arg(name: string): string | undefined {
  const pre = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pre));
  return hit ? hit.slice(pre.length) : undefined;
}

async function main() {
  if (!isFfspbConfigured()) { logger.error('FFSPB_API_KEY не задан в .env'); process.exit(1); }
  const federationSlug = arg('slug') ?? FEDERATION_DEFAULT;
  const season = Number(arg('season')) || Number(SEASON);

  logger.info({ federationSlug, season }, '=== бомбардиры региона по голам FFSPB ===');

  const dryRun = process.argv.includes('--dry-run');
  const payload = await buildPayload();

  // INSERT-only история — один ряд на запуск (region_scorers, bypass-RLS).
  // --dry-run: полный обход FFSPB + расчёт, но БЕЗ записи в БД (БД не трогается).
  if (dryRun) {
    logger.warn('DRY-RUN: запись в region_scorers пропущена');
  } else {
    await withBypassRLS((tx) =>
      tx.insert(regionScorers).values({ federationSlug, season, payload }),
    );
  }

  // Концизная сводка топа.
  logger.info({ matchesScanned: payload.matchesScanned, top: payload.topGoals.length }, `СКАНИРОВАНО матчей ${payload.matchesScanned} · бомбардиров в топе ${payload.topGoals.length}`);
  for (const r of payload.topGoals.slice(0, 12)) {
    logger.info({ goals: r.goals, name: r.name, club: r.club, cohort: r.cohort }, `  ${r.goals} — ${r.name} (${r.club}, ${r.cohort})`);
  }
  logger.info({ federationSlug, season, dryRun }, dryRun ? '✓ DRY-RUN завершён (без записи)' : '✓ снимок region_scorers записан');

  await pool.end();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'syncRegionScorers упал');
  process.exit(1);
});
